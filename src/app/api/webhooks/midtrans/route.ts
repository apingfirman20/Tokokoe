import { NextResponse } from "next/server";
import { midtransAdapter, MidtransNotificationPayload } from "@/lib/payments/midtrans-adapter";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(request: Request) {
  try {
    const payload: MidtransNotificationPayload = await request.json();

    if (!payload.order_id || !payload.signature_key) {
      return NextResponse.json(
        { success: false, message: "Payload webhook Midtrans tidak lengkap" },
        { status: 400 }
      );
    }

    // 1. Verify Midtrans SHA-512 Signature
    if (!midtransAdapter.isConfigured()) {
      return NextResponse.json(
        { success: false, message: "Midtrans adapter belum dikonfigurasi pada server ini." },
        { status: 503 }
      );
    }

    const isValidSignature = midtransAdapter.verifySignature(payload);
    if (!isValidSignature) {
      return NextResponse.json(
        { success: false, message: "Tanda tangan digital (signature) webhook Midtrans tidak valid." },
        { status: 401 }
      );
    }

    // 2. Parse status and determine payment state
    const orderId = payload.order_id;
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

    // 3. Atomically update Sale in Firestore with Idempotency Protection
    try {
      // Find sale by saleId or saleNumber
      const salesQuery = await adminDb
        .collectionGroup('sales')
        .where('saleNumber', '==', orderId)
        .limit(1)
        .get();

      if (!salesQuery.empty) {
        const saleDoc = salesQuery.docs[0];
        const currentData = saleDoc.data();

        // Validate gross amount against authoritative sale grandTotal
        const webhookAmount = Math.round(parseFloat(payload.gross_amount));
        if (webhookAmount !== currentData.grandTotal) {
          console.warn(`Midtrans amount mismatch: expected ${currentData.grandTotal}, received ${webhookAmount}`);
          return NextResponse.json(
            { success: false, message: `Gross amount ${webhookAmount} tidak cocok dengan total pesanan ${currentData.grandTotal}.` },
            { status: 400 }
          );
        }

        // Idempotency: if already paid, do not duplicate actions
        if (currentData.paymentStatus === 'paid' && targetPaymentStatus === 'paid') {
          return NextResponse.json({
            success: true,
            status: "OK",
            message: "Notifikasi duplikat: transaksi sudah dalam status lunas (idempotent)."
          });
        }

        await saleDoc.ref.update({
          paymentStatus: targetPaymentStatus,
          midtransTransactionId: payload.transaction_id,
          midtransPaymentType: payload.payment_type,
          updatedAt: Date.now(),
        });
      } else {
        return NextResponse.json(
          { success: false, message: `Pesanan dengan referensi ${orderId} tidak ditemukan di database.` },
          { status: 404 }
        );
      }
    } catch (dbErr: any) {
      console.error("Firestore webhook update error:", dbErr.message);
      // Return 500 so Midtrans retries delivery
      return NextResponse.json(
        { success: false, message: "Database failure during webhook processing. Retriable." },
        { status: 500 }
      );
    }


    return NextResponse.json({
      success: true,
      status: "OK",
      orderId,
      paymentStatus: targetPaymentStatus,
      message: `Status pembayaran order ${orderId} berhasil disinkronkan ke '${targetPaymentStatus}'.`
    });
  } catch (error) {
    console.error("Midtrans webhook error:", error);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan internal saat memproses webhook pembayaran." },
      { status: 500 }
    );
  }
}
