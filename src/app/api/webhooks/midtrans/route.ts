import { NextResponse } from "next/server";
import { midtransAdapter, MidtransNotificationPayload } from "@/lib/payments/midtrans-adapter";
import { adminDb } from "@/lib/firebase/admin";
import { Sale, StockMovement, ImeiHistory, ImeiUnit } from "@/types";

export async function POST(request: Request) {
  try {
    const payload: MidtransNotificationPayload = await request.json();

    if (!payload.order_id || !payload.signature_key) {
      return NextResponse.json(
        { success: false, message: "Payload webhook Midtrans tidak lengkap (order_id dan signature_key wajib)." },
        { status: 400 }
      );
    }

    // 1. Resolve target Sale Document & merchant keys
    // Format standar: ${businessId}__${saleId} untuk mencegah tabrakan ID antar tenant
    const orderId = payload.order_id;
    let businessId: string = "";
    let saleId: string = "";
    let saleRef: FirebaseFirestore.DocumentReference | null = null;
    let merchantServerKey: string | undefined = undefined;

    if (orderId.includes('__')) {
      const parts = orderId.split('__');
      businessId = parts[0];
      saleId = parts[1];
      saleRef = adminDb.doc(`businesses/${businessId}/sales/${saleId}`);

      try {
        const bizSnap = await adminDb.doc(`businesses/${businessId}`).get();
        if (bizSnap.exists) {
          const bizData = bizSnap.data() as any;
          if (bizData?.midtransSettings?.serverKey) {
            merchantServerKey = bizData.midtransSettings.serverKey;
          }
        }
      } catch (e) {
        // fallback to server key
      }
    } else {
      // Fallback untuk referensi saleNumber (collectionGroup query)
      const salesQuery = await adminDb
        .collectionGroup('sales')
        .where('saleNumber', '==', orderId)
        .limit(1)
        .get();

      if (!salesQuery.empty) {
        saleRef = salesQuery.docs[0].ref;
        businessId = salesQuery.docs[0].data().businessId;
        saleId = salesQuery.docs[0].id;
        if (businessId) {
          try {
            const bizSnap = await adminDb.doc(`businesses/${businessId}`).get();
            if (bizSnap.exists) {
              const bizData = bizSnap.data() as any;
              if (bizData?.midtransSettings?.serverKey) {
                merchantServerKey = bizData.midtransSettings.serverKey;
              }
            }
          } catch (e) {
            // fallback
          }
        }
      }
    }

    // 2. Verify Midtrans SHA-512 Signature (using merchant's key or fallback)
    if (!midtransAdapter.isConfigured(merchantServerKey)) {
      return NextResponse.json(
        { success: false, message: "Midtrans adapter belum dikonfigurasi pada server ini." },
        { status: 503 }
      );
    }

    const isValidSignature = midtransAdapter.verifySignature(payload, merchantServerKey);
    if (!isValidSignature) {
      return NextResponse.json(
        { success: false, message: "Tanda tangan digital (signature) webhook Midtrans tidak valid." },
        { status: 401 }
      );
    }

    // 3. Parse status and determine payment state
    const trxStatus = payload.transaction_status;
    const fraudStatus = payload.fraud_status;

    let targetPaymentStatus: 'paid' | 'pending' | 'failed' = 'pending';

    if (trxStatus === 'capture') {
      targetPaymentStatus = fraudStatus === 'accept' ? 'paid' : 'failed';
    } else if (trxStatus === 'settlement') {
      targetPaymentStatus = 'paid';
    } else if (trxStatus === 'cancel' || trxStatus === 'deny' || trxStatus === 'expire') {
      targetPaymentStatus = 'failed';
    } else if (trxStatus === 'pending') {
      targetPaymentStatus = 'pending';
    }

    if (!saleRef || !businessId) {
      return NextResponse.json(
        { success: false, message: `Pesanan dengan referensi ${orderId} tidak ditemukan di database.` },
        { status: 404 }
      );
    }

    // 4. Atomically update Sale in Firestore with Idempotency Protection & State Transitions
    try {
      const result = await adminDb.runTransaction(async (transaction) => {
        const now = Date.now();

        // ----------------------------------------------------
        // PHASE A: ALL READS FIRST
        // ----------------------------------------------------
        const saleDoc = await transaction.get(saleRef!);
        if (!saleDoc.exists) {
          throw new Error("NOT_FOUND");
        }

        const saleData = saleDoc.data() as Sale;

        // Validasi kesesuaian nilai transaksi (gross amount)
        const webhookAmount = Math.round(parseFloat(payload.gross_amount));
        if (webhookAmount !== saleData.grandTotal) {
          throw new Error(`AMOUNT_MISMATCH:${webhookAmount}:${saleData.grandTotal}`);
        }

        // ATURAN 1: Settlement kemudian pending/expiry tetap paid ("Settlement kemudian pending/expiry tetap paid")
        if (saleData.paymentStatus === 'paid') {
          if (targetPaymentStatus === 'paid') {
            return {
              status: "IDEMPOTENT_ALREADY_PAID",
              message: "Notifikasi duplikat: transaksi sudah dalam status lunas (idempotent)."
            };
          } else {
            // Notifikasi keterlambatan pending / expire / cancel TIDAK BOLEH menurunkan status paid
            return {
              status: "LATE_NOTIFICATION_IGNORED",
              message: `Transaksi telah lunas (settled). Notifikasi terlambat (${trxStatus}) diabaikan demi integritas settlement.`
            };
          }
        }

        // ATURAN 2: Idempotent jika sudah failed
        if (saleData.paymentStatus === 'failed' && targetPaymentStatus === 'failed') {
          return {
            status: "IDEMPOTENT_ALREADY_FAILED",
            message: "Transaksi sudah dalam status gagal / kedaluwarsa sebelumnya (idempotent)."
          };
        }

        // ATURAN 3: Pending notification saat masih pending
        if (saleData.paymentStatus === 'pending' && targetPaymentStatus === 'pending') {
          return {
            status: "STILL_PENDING",
            message: "Transaksi masih menunggu pembayaran (pending)."
          };
        }

        // Baca entity pelengkap sesuai transisi
        const productDocsMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();
        const imeiUnitDocsMap = new Map<string, { ref: FirebaseFirestore.DocumentReference; doc: FirebaseFirestore.DocumentSnapshot }>();
        let tableDoc: FirebaseFirestore.DocumentSnapshot | null = null;
        let tableRef: FirebaseFirestore.DocumentReference | null = null;

        // Baca produk jika gagal (untuk pengembalian stok)
        if (targetPaymentStatus === 'failed') {
          for (const item of saleData.lineItems) {
            if (!productDocsMap.has(item.productId)) {
              const pRef = adminDb.doc(`businesses/${businessId}/products/${item.productId}`);
              const pDoc = await transaction.get(pRef);
              productDocsMap.set(item.productId, pDoc);
            }
          }
        }

        // Baca IMEI units jika ada unit serial
        for (const item of saleData.lineItems) {
          if (item.imei) {
            const regRef = adminDb.doc(`businesses/${businessId}/registeredImeis/${item.imei}`);
            const regDoc = await transaction.get(regRef);
            const unitId = regDoc.exists && regDoc.data()?.unitId ? regDoc.data()!.unitId : item.imei;
            const uRef = adminDb.doc(`businesses/${businessId}/imeiUnits/${unitId}`);
            const uDoc = await transaction.get(uRef);
            imeiUnitDocsMap.set(item.imei, { ref: uRef, doc: uDoc });
          }
        }

        // Baca meja jika dine-in
        if (saleData.tableId) {
          tableRef = adminDb.doc(`businesses/${businessId}/tables/${saleData.tableId}`);
          tableDoc = await transaction.get(tableRef);
        }

        // ----------------------------------------------------
        // PHASE B: ALL WRITES SECOND
        // ----------------------------------------------------
        if (targetPaymentStatus === 'paid') {
          // SETTLED: Update status penjualan menjadi paid
          const updateFields: Record<string, any> = {
            paymentStatus: 'paid',
            paidAmount: saleData.grandTotal,
            settledAt: now,
            midtransTransactionId: payload.transaction_id,
            midtransPaymentType: payload.payment_type,
            updatedAt: now,
          };

          // If this was an F&B self-order waiting for cashier confirmation, automatically forward to kitchen
          if (saleData.orderStatus === 'waiting_cashier') {
            updateFields.orderStatus = 'new';
          }

          transaction.update(saleRef!, updateFields);

          // Finalisasi status unit IMEI: reserved -> sold & aktifkan garansi
          for (const [imei, { ref: uRef, doc: uDoc }] of imeiUnitDocsMap.entries()) {
            if (uDoc.exists) {
              const uData = uDoc.data() as ImeiUnit;
              const warrantyPeriod = uData?.condition === 'new' ? 365 * 86400000 : 90 * 86400000;
              transaction.update(uRef, {
                status: 'sold',
                soldAtSaleId: saleData.id,
                warrantyUntil: now + warrantyPeriod,
                updatedAt: now,
              });

              const histRef = adminDb.collection(`businesses/${businessId}/imeiHistory`).doc();
              transaction.set(histRef, {
                id: histRef.id,
                businessId,
                imei,
                unitId: uDoc.id,
                action: 'sold',
                referenceId: saleData.saleNumber,
                branchId: saleData.branchId,
                operatorId: 'system_webhook',
                operatorName: 'Midtrans Webhook',
                notes: `Pembayaran ${payload.payment_type} settled. Garansi aktif s/d ${new Date(now + warrantyPeriod).toLocaleDateString('id-ID')}`,
                timestamp: now,
              });
            }
          }

          // Lepas meja jika dine-in
          if (tableRef && tableDoc && tableDoc.exists) {
            if (tableDoc.data()?.activeSaleId === saleData.id) {
              transaction.update(tableRef, {
                status: 'available',
                activeSaleId: '',
                customerName: '',
                updatedAt: now,
              });
            }
          }

          return {
            status: "SETTLED_SUCCESS",
            message: `Pembayaran pesanan ${saleData.saleNumber} telah lunas terverifikasi.`
          };
        } else if (targetPaymentStatus === 'failed') {
          // FAILED / EXPIRED / CANCELLED:
          // Pelepasan reservasi stok katalog, pelepasan IMEI reserved, dan pelepasan meja
          transaction.update(saleRef!, {
            paymentStatus: 'failed',
            cancelledAt: now,
            cancellationReason: `Pembayaran Midtrans ${trxStatus} (gagal / kedaluwarsa)`,
            midtransTransactionId: payload.transaction_id,
            midtransPaymentType: payload.payment_type,
            updatedAt: now,
          });

          // Pulihkan stok katalog yang sempat di-reserve
          for (const item of saleData.lineItems) {
            const pDoc = productDocsMap.get(item.productId);
            if (pDoc && pDoc.exists) {
              const pData = pDoc.data();
              if (pData?.trackStock) {
                const currentQty = pData.stockQty || 0;
                const restoredQty = currentQty + item.quantity;
                transaction.update(pDoc.ref, {
                  stockQty: restoredQty,
                  updatedAt: now,
                });

                const movRef = adminDb.collection(`businesses/${businessId}/stockMovements`).doc();
                const movData: StockMovement = {
                  id: movRef.id,
                  businessId,
                  branchId: saleData.branchId,
                  productId: item.productId,
                  productName: item.productName,
                  type: 'adjustment',
                  quantityDelta: item.quantity,
                  previousQty: currentQty,
                  newQty: restoredQty,
                  referenceId: saleData.saleNumber,
                  operatorId: 'system_webhook',
                  operatorName: 'Midtrans Webhook',
                  notes: `Pelepasan reservasi stok akibat pembayaran Midtrans ${trxStatus} (${saleData.saleNumber})`,
                  timestamp: now,
                };
                transaction.set(movRef, movData);
              }
            }
          }

          // Pulihkan IMEI dari 'reserved' kembali ke 'available'
          for (const [imei, { ref: uRef, doc: uDoc }] of imeiUnitDocsMap.entries()) {
            if (uDoc.exists && uDoc.data()?.status === 'reserved') {
              transaction.update(uRef, {
                status: 'available',
                soldAtSaleId: '',
                updatedAt: now,
              });

              const histRef = adminDb.collection(`businesses/${businessId}/imeiHistory`).doc();
              transaction.set(histRef, {
                id: histRef.id,
                businessId,
                imei,
                unitId: uDoc.id,
                action: 'status_change',
                referenceId: saleData.saleNumber,
                branchId: saleData.branchId,
                operatorId: 'system_webhook',
                operatorName: 'Midtrans Webhook',
                notes: `Reservasi unit IMEI dibatalkan karena pembayaran Midtrans ${trxStatus}`,
                timestamp: now,
              });
            }
          }

          // Lepas meja jika dine-in
          if (tableRef && tableDoc && tableDoc.exists) {
            if (tableDoc.data()?.activeSaleId === saleData.id) {
              transaction.update(tableRef, {
                status: 'available',
                activeSaleId: '',
                customerName: '',
                updatedAt: now,
              });
            }
          }

          return {
            status: "RESERVATION_RELEASED",
            message: `Pembayaran ${orderId} kedaluwarsa/gagal. Seluruh reservasi stok dan unit telah dilepaskan.`
          };
        }

        return {
          status: "NOOP",
          message: "Tidak ada perubahan status."
        };
      });

      return NextResponse.json({
        success: true,
        status: "OK",
        orderId,
        paymentStatus: targetPaymentStatus,
        details: result,
      });
    } catch (dbErr: any) {
      if (dbErr.message === "NOT_FOUND") {
        return NextResponse.json(
          { success: false, message: `Pesanan ${orderId} tidak ditemukan.` },
          { status: 404 }
        );
      }
      if (dbErr.message?.startsWith("AMOUNT_MISMATCH")) {
        const [, received, expected] = dbErr.message.split(":");
        return NextResponse.json(
          { success: false, message: `Gross amount ${received} tidak cocok dengan grand total ${expected}.` },
          { status: 400 }
        );
      }

      console.error("Firestore webhook transaction error:", dbErr.message);
      // Return 500 so payment gateway retries delivery
      return NextResponse.json(
        { success: false, message: "Database failure during webhook processing. Retriable." },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Midtrans webhook error:", error);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan internal saat memproses webhook pembayaran." },
      { status: 500 }
    );
  }
}
