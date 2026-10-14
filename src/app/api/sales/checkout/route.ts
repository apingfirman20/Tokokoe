import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { generateSaleReference, cleanUndefined } from "@/lib/utils";
import { Sale, CartLineItem, StockMovement } from "@/types";
import { normalizeImei } from "@/lib/validation/imei";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const lineItemSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative().optional(),
  subtotal: z.number().int().nonnegative().optional(),
  imei: z.string().optional(),
  selectedImei: z.string().optional(),
  notes: z.string().optional(),
});

const checkoutSchema = z.object({
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  customerName: z.string().optional(),
  orderType: z.enum(['dine_in', 'takeaway', 'delivery', 'retail_pos', 'phone_pos']),
  tableNumber: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1),
  discount: z.number().int().nonnegative().default(0),
  tax: z.number().int().nonnegative().default(0),
  serviceCharge: z.number().int().nonnegative().default(0),
  paidAmount: z.number().int().nonnegative(),
  paymentMethod: z.enum(['cash', 'transfer', 'midtrans_qris']),
  cashSessionId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    // 1. Enforce verified caller session
    const authUser = await requireAuthenticatedUser(request);

    const body = await request.json();
    const parsed = checkoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Data transaksi tidak valid", errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const payload = parsed.data;

    // 2. Authoritative RBAC check: Caller must have 'sales.create' in this business
    const membership = await requireBusinessPermission(payload.businessId, authUser.uid, 'sales.create');
    await requireBranchAccess(payload.businessId, authUser.uid, payload.branchId);

    const now = Date.now();
    const saleId = `sale_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const saleNumber = generateSaleReference();

    // 3. Compute Effective Idempotency Key (Explicit or Automatic 5-second anti-spam window)
    const itemsFingerprint = payload.lineItems
      .map(i => `${i.productId}:${i.quantity}:${i.imei || ''}`)
      .sort()
      .join('|');
    const timeBucket = Math.floor(now / 5000);
    const effectiveIdempotencyKey = payload.idempotencyKey || 
      `idem_auto_${payload.businessId}_${payload.branchId}_${authUser.uid}_${itemsFingerprint}_${payload.paidAmount}_${timeBucket}`;

    const idemRef = adminDb.doc(`businesses/${payload.businessId}/idempotencyKeys/${effectiveIdempotencyKey}`);
    const idemDoc = await idemRef.get();
    if (idemDoc.exists) {
      const idemData = idemDoc.data();
      if (idemData?.saleId) {
        const existingSaleDoc = await adminDb.doc(`businesses/${payload.businessId}/sales/${idemData.saleId}`).get();
        if (existingSaleDoc.exists) {
          return NextResponse.json({
            success: true,
            sale: existingSaleDoc.data() as Sale,
            persistedToFirestore: true,
            idempotentDuplicate: true,
            message: "Transaksi telah berhasil diproses sebelumnya (duplikasi transaksi dicegah secara otomatis)."
          });
        }
      }
    }

    // 4. Determine authoritative payment status
    // midtrans_qris MUST start as pending until verified by webhook signature
    const paymentStatus: 'paid' | 'pending' = payload.paymentMethod === 'midtrans_qris' ? 'pending' : 'paid';

    let newSale: Sale | null = null;

    // 5. Atomic Firestore Transaction (Strict: ALL READS BEFORE ALL WRITES)
    await adminDb.runTransaction(async (transaction) => {
      // ----------------------------------------------------
      // PHASE A: ALL READS FIRST
      // ----------------------------------------------------

      // 0. Atomic check for idempotency lock inside transaction
      const idemTxDoc = await transaction.get(idemRef);
      if (idemTxDoc.exists && idemTxDoc.data()?.saleId) {
        const existingSaleRef = adminDb.doc(`businesses/${payload.businessId}/sales/${idemTxDoc.data()!.saleId}`);
        const existingSaleTxDoc = await transaction.get(existingSaleRef);
        if (existingSaleTxDoc.exists) {
          newSale = existingSaleTxDoc.data() as Sale;
          return;
        }
      }

      // 1. Read and validate products for authoritative price and stock
      const productDocsMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      const productQtyMap = new Map<string, number>();

      for (const item of payload.lineItems) {
        const currentQty = productQtyMap.get(item.productId) || 0;
        productQtyMap.set(item.productId, currentQty + item.quantity);

        if (!productDocsMap.has(item.productId)) {
          const prodRef = adminDb.doc(`businesses/${payload.businessId}/products/${item.productId}`);
          const prodDoc = await transaction.get(prodRef);
          productDocsMap.set(item.productId, prodDoc);
        }
      }

      // Validate stock for all products
      for (const [productId, requestedQty] of productQtyMap.entries()) {
        const prodDoc = productDocsMap.get(productId)!;
        if (!prodDoc.exists) {
          const hasCoveringImei = payload.lineItems.some(i => (i.imei || i.selectedImei) && i.productId === productId);
          if (!hasCoveringImei) {
            throw new Error(`Produk dengan ID "${productId}" tidak ditemukan dalam katalog bisnis ini.`);
          }
        } else {
          const prodData = prodDoc.data();
          if (prodData?.isActive === false || prodData?.available === false) {
            throw new Error(`Produk "${prodData.name || productId}" berstatus tidak aktif atau diarsipkan sehingga tidak dapat dijual.`);
          }
          if (prodData?.trackStock) {
            const currentStock = prodData.stockQty ?? 0;
            if (currentStock < requestedQty) {
              throw new Error(`Stok produk "${prodData.name || productId}" tidak mencukupi (tersisa ${currentStock}, diminta ${requestedQty}).`);
            }
          }
        }
      }

      // 2. Read and validate IMEI units (if serialized)
      const imeiDocsMap = new Map<string, { unitRef: FirebaseFirestore.DocumentReference; unitDoc: FirebaseFirestore.DocumentSnapshot }>();

      for (const item of payload.lineItems) {
        const rawImei = item.imei || item.selectedImei;
        if (rawImei) {
          const imei = normalizeImei(rawImei);
          // Check registered IMEI doc
          const regRef = adminDb.doc(`businesses/${payload.businessId}/registeredImeis/${imei}`);
          const regDoc = await transaction.get(regRef);

          let unitRef: FirebaseFirestore.DocumentReference;
          if (regDoc.exists && regDoc.data()?.unitId) {
            unitRef = adminDb.doc(`businesses/${payload.businessId}/imeiUnits/${regDoc.data()!.unitId}`);
          } else {
            // Direct query fallback for existing units
            unitRef = adminDb.doc(`businesses/${payload.businessId}/imeiUnits/${imei}`);
          }

          const unitDoc = await transaction.get(unitRef);
          if (!unitDoc.exists) {
            throw new Error(`Unit IMEI ${imei} tidak ditemukan di sistem.`);
          }
          const unitData = unitDoc.data();
          if (unitData?.status !== 'available') {
            throw new Error(`Unit IMEI ${imei} sudah tidak tersedia untuk dijual (status: ${unitData?.status}).`);
          }
          imeiDocsMap.set(imei, { unitRef, unitDoc });
        }
      }

      // 3. Read Cash Session if cash payment
      let shiftDoc: FirebaseFirestore.DocumentSnapshot | null = null;
      let shiftRef: FirebaseFirestore.DocumentReference | null = null;
      if (payload.paymentMethod === 'cash' && payload.cashSessionId) {
        shiftRef = adminDb.doc(`businesses/${payload.businessId}/cashSessions/${payload.cashSessionId}`);
        shiftDoc = await transaction.get(shiftRef);
      }

      // ----------------------------------------------------
      // AUTHORITATIVE PRICE CALCULATION & VERIFICATION
      // ----------------------------------------------------
      let authoritativeSubtotal = 0;
      const verifiedLineItems: CartLineItem[] = [];

      for (const item of payload.lineItems) {
        const prodDoc = productDocsMap.get(item.productId);
        const prodData = prodDoc?.exists ? prodDoc.data() : null;

        const imei = item.imei || item.selectedImei;
        const imeiEntry = imei ? imeiDocsMap.get(imei) : null;
        const imeiData = imeiEntry?.unitDoc.exists ? imeiEntry.unitDoc.data() : null;

        // Authoritative price: prioritize imei unit price if serialized, else product price
        const authoritativeUnitPrice = imeiData?.sellingPrice ?? prodData?.sellingPrice ?? item.unitPrice ?? 0;
        const lineSubtotal = authoritativeUnitPrice * item.quantity;
        authoritativeSubtotal += lineSubtotal;

        verifiedLineItems.push({
          productId: item.productId,
          productName: prodData?.name || imeiData?.productName || item.productName || "Produk",
          quantity: item.quantity,
          unitPrice: authoritativeUnitPrice,
          subtotal: lineSubtotal,
          imei: imei,
          notes: item.notes,
        });
      }

      const authoritativeGrandTotal = Math.max(
        0, 
        authoritativeSubtotal - payload.discount + payload.tax + payload.serviceCharge
      );

      // Validate payment amount for cash sales
      if (payload.paymentMethod === 'cash' && payload.paidAmount < authoritativeGrandTotal) {
        throw new Error(`Jumlah bayar tunai (Rp ${payload.paidAmount.toLocaleString()}) kurang dari total tagihan (Rp ${authoritativeGrandTotal.toLocaleString()}).`);
      }

      const changeAmount = payload.paymentMethod === 'cash' 
        ? Math.max(0, payload.paidAmount - authoritativeGrandTotal) 
        : 0;

      // Construct final authoritative Sale entity
      newSale = {
        id: saleId,
        saleNumber,
        businessId: payload.businessId,
        branchId: payload.branchId,
        // Authoritative Cashier identity from verified server session
        cashierId: authUser.uid,
        cashierName: membership.displayName,
        customerName: payload.customerName,
        orderType: payload.orderType,
        tableNumber: payload.tableNumber,
        lineItems: verifiedLineItems,
        subtotal: authoritativeSubtotal,
        discount: payload.discount,
        tax: payload.tax,
        serviceCharge: payload.serviceCharge,
        grandTotal: authoritativeGrandTotal,
        paidAmount: payload.paymentMethod === 'cash' ? payload.paidAmount : authoritativeGrandTotal,
        changeAmount,
        paymentMethod: payload.paymentMethod,
        paymentStatus,
        orderStatus: (payload.orderType === 'retail_pos' || payload.orderType === 'phone_pos') ? 'served' : 'new',
        cashSessionId: payload.cashSessionId,
        idempotencyKey: payload.idempotencyKey,
        createdAt: now,
        updatedAt: now,
      };

      // ----------------------------------------------------
      // PHASE B: ALL WRITES SECOND
      // ----------------------------------------------------

      // 1. Update product stock and record immutable StockMovement
      for (const [productId, requestedQty] of productQtyMap.entries()) {
        const prodDoc = productDocsMap.get(productId)!;
        if (prodDoc.exists) {
          const prodData = prodDoc.data();
          if (prodData?.trackStock) {
            const currentStock = prodData.stockQty ?? 0;
            transaction.update(prodDoc.ref, {
              stockQty: currentStock - requestedQty,
              updatedAt: now,
            });

            const movRef = adminDb.collection(`businesses/${payload.businessId}/stockMovements`).doc();
            const movData: StockMovement = {
              id: movRef.id,
              businessId: payload.businessId,
              branchId: payload.branchId,
              productId,
              productName: prodData?.name || productId,
              type: 'sale',
              quantityDelta: -requestedQty,
              previousQty: currentStock,
              newQty: currentStock - requestedQty,
              referenceId: saleNumber,
              operatorId: authUser.uid,
              operatorName: membership.displayName,
              notes: `Penjualan kasir pada transaksi ${saleNumber}`,
              timestamp: now,
            };
            transaction.set(movRef, movData);
          }
        }
      }

      // 2. Update IMEI units to 'sold' and record history
      for (const [imei, { unitRef, unitDoc }] of imeiDocsMap.entries()) {
        transaction.update(unitRef, {
          status: 'sold',
          soldAtSaleId: saleId,
          updatedAt: now,
        });

        const histRef = adminDb.collection(`businesses/${payload.businessId}/imeiHistory`).doc();
        transaction.set(histRef, {
          id: histRef.id,
          businessId: payload.businessId,
          imei,
          unitId: unitDoc.id,
          action: 'sold',
          referenceId: saleNumber,
          branchId: payload.branchId,
          operatorId: authUser.uid,
          operatorName: membership.displayName,
          notes: `Terjual pada transaksi ${saleNumber}`,
          timestamp: now,
        });
      }

      // 3. Save authoritative Sale document
      const saleRef = adminDb.doc(`businesses/${payload.businessId}/sales/${saleId}`);
      transaction.set(saleRef, cleanUndefined(newSale));

      // 4. Update Cash Session if active
      if (payload.paymentMethod === 'cash' && shiftDoc && shiftDoc.exists && shiftRef) {
        const shiftData = shiftDoc.data();
        const currentSales = shiftData?.cashSalesTotal ?? 0;
        const currentExpected = shiftData?.expectedClosingCash ?? 0;
        transaction.update(shiftRef, {
          cashSalesTotal: currentSales + authoritativeGrandTotal,
          expectedClosingCash: currentExpected + authoritativeGrandTotal,
          updatedAt: now,
        });
      }

      // 5. Store Idempotency Key mapping to prevent subsequent duplicate requests
      transaction.set(idemRef, cleanUndefined({
        idempotencyKey: effectiveIdempotencyKey,
        saleId,
        businessId: payload.businessId,
        grandTotal: authoritativeGrandTotal,
        createdAt: now,
      }));
    });

    return NextResponse.json({
      success: true,
      sale: newSale,
      persistedToFirestore: true,
      message: "Transaksi penjualan berhasil diselesaikan dan dicatat secara atomik di Cloud Firestore."
    });
  } catch (error: any) {
    if (
      error.message?.includes('tidak mencukupi') || 
      error.message?.includes('sudah tidak tersedia') ||
      error.message?.includes('tidak aktif') ||
      error.message?.includes('diarsipkan')
    ) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }
    return handleAuthApiError(error);
  }
}
