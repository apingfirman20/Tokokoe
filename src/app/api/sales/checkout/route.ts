import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { generateSaleReference, cleanUndefined } from "@/lib/utils";
import { Sale, CartLineItem, StockMovement, Business, TableItem, ImeiHistory, ImeiUnit, PaymentStatus } from "@/types";
import { normalizeImei, validateImei, validateDualSimDevice } from "@/lib/validation/imei";
import { midtransAdapter } from "@/lib/payments/midtrans-adapter";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const lineItemSchema = z.object({
  productId: z.string().min(1, "productId wajib diisi"),
  productName: z.string().optional(),
  quantity: z.number().int("Kuantitas harus berupa bilangan bulat").positive("Kuantitas harus lebih dari 0"),
  unitPrice: z.number().int().nonnegative().optional(),
  subtotal: z.number().int().nonnegative().optional(),
  imei: z.string().optional(),
  selectedImei: z.string().optional(),
  notes: z.string().optional(),
  selectedOptions: z.record(z.string(), z.string()).optional(),
  selectedModifiers: z.array(z.string()).optional(),
});

const tradeInSchema = z.object({
  deviceModel: z.string().min(1, "Model HP tukar tambah wajib diisi"),
  imei: z.string().min(14, "IMEI HP tukar tambah wajib minimal 14 digit"),
  imei2: z.string().optional(),
  condition: z.string().optional(),
  estimatedValue: z.number().int("Nilai taksir harus bilangan bulat").positive("Nilai taksir harus lebih dari 0"),
  customerName: z.string().optional(),
});

const checkoutSchema = z.object({
  businessId: z.string().min(1, "businessId wajib diisi"),
  branchId: z.string().min(1, "branchId wajib diisi"),
  customerName: z.string().optional(),
  orderType: z.enum(['dine_in', 'takeaway', 'delivery', 'retail_pos', 'phone_pos']),
  tableNumber: z.string().optional(),
  tableId: z.string().optional(),
  openSaleId: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, "Keranjang belanja tidak boleh kosong"),
  discount: z.number().int("Diskon harus berupa bilangan bulat").nonnegative("Diskon tidak boleh negatif").default(0),
  tax: z.number().int("Pajak harus berupa bilangan bulat").nonnegative("Pajak tidak boleh negatif").default(0),
  serviceCharge: z.number().int("Service charge harus berupa bilangan bulat").nonnegative("Service charge tidak boleh negatif").default(0),
  paidAmount: z.number().int("Jumlah pembayaran harus berupa bilangan bulat").nonnegative("Jumlah pembayaran tidak boleh negatif").default(0),
  paymentMethod: z.enum(['cash', 'transfer', 'midtrans_qris']),
  cashSessionId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  tradeIn: tradeInSchema.optional(),
  transferReferenceNumber: z.string().optional(),
  isTransferVerified: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    // 1. Enforce verified caller session
    const authUser = await requireAuthenticatedUser(request);

    const body = await request.json();
    const parsed = checkoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data transaksi tidak valid", errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const payload = parsed.data;

    // 2. Authoritative RBAC check: Caller must have 'sales.create' in this business
    const membership = await requireBusinessPermission(payload.businessId, authUser.uid, 'sales.create');
    await requireBranchAccess(payload.businessId, authUser.uid, payload.branchId);

    const now = Date.now();
    const saleId = payload.openSaleId || `sale_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const saleNumber = generateSaleReference();

    // 3. Compute Canonical Request Fingerprint & Idempotency Key
    const normalizedItemsFingerprint = payload.lineItems
      .map(i => {
        const rawImei = i.imei || i.selectedImei;
        const cleanImei = rawImei ? normalizeImei(rawImei) : '';
        const opts = JSON.stringify(i.selectedOptions || {});
        const mods = (i.selectedModifiers || []).sort().join(',');
        return `${i.productId}:${i.quantity}:${cleanImei}:${opts}:${mods}`;
      })
      .sort()
      .join('|');

    const tradeInFingerprint = payload.tradeIn ? `${payload.tradeIn.imei}:${payload.tradeIn.estimatedValue}` : 'none';

    const requestFingerprint = [
      payload.businessId,
      payload.branchId,
      authUser.uid,
      normalizedItemsFingerprint,
      tradeInFingerprint,
      payload.discount,
      payload.tax,
      payload.serviceCharge,
      payload.paidAmount,
      payload.paymentMethod,
    ].join('__');

    const effectiveIdempotencyKey = payload.idempotencyKey?.trim() || `idem_${requestFingerprint}`;

    // 4. Pre-transaction Idempotency Check
    const idemRef = adminDb.doc(`businesses/${payload.businessId}/idempotencyKeys/${effectiveIdempotencyKey}`);
    const idemDoc = await idemRef.get();

    if (idemDoc.exists) {
      const idemData = idemDoc.data();
      if (idemData?.requestFingerprint && idemData.requestFingerprint !== requestFingerprint) {
        return NextResponse.json(
          { 
            success: false, 
            message: `Idempotency key "${effectiveIdempotencyKey}" telah digunakan untuk transaksi yang berbeda. Gunakan key baru untuk pesanan baru.` 
          },
          { status: 409 }
        );
      }

      if (idemData?.saleId) {
        const existingSaleDoc = await adminDb.doc(`businesses/${payload.businessId}/sales/${idemData.saleId}`).get();
        if (existingSaleDoc.exists) {
          return NextResponse.json({
            success: true,
            sale: existingSaleDoc.data() as Sale,
            persistedToFirestore: true,
            idempotentDuplicate: true,
            idempotentReplay: true,
            message: "Transaksi telah berhasil diproses sebelumnya (Idempotent Replay). Tidak ada mutasi stok ganda."
          });
        }
      }
    }

    // 5. Determine Authoritative Payment Lifecycle Status
    let paymentStatus: PaymentStatus = 'paid';
    let settledAt: number | undefined = now;
    let midtransOrderId: string | undefined = undefined;

    if (payload.paymentMethod === 'midtrans_qris') {
      paymentStatus = 'pending';
      settledAt = undefined;
      midtransOrderId = `${payload.businessId}__${saleId}`;
    } else if (payload.paymentMethod === 'transfer') {
      // Policy: Bank Transfer is strictly pending unless explicitly verified with transfer reference
      if (payload.isTransferVerified && payload.transferReferenceNumber) {
        paymentStatus = 'paid';
        settledAt = now;
      } else {
        paymentStatus = 'pending';
        settledAt = undefined;
      }
    } else {
      // Cash payment
      paymentStatus = 'paid';
      settledAt = now;
    }

    let newSale: Sale | null = null;

    await adminDb.runTransaction(async (transaction) => {
      // ----------------------------------------------------
      // PHASE A: ALL READS FIRST
      // ----------------------------------------------------

      // Check idempotency again inside transaction
      const idemTxDoc = await transaction.get(idemRef);
      if (idemTxDoc.exists && idemTxDoc.data()?.saleId) {
        const existingSaleRef = adminDb.doc(`businesses/${payload.businessId}/sales/${idemTxDoc.data()!.saleId}`);
        const existingSaleTxDoc = await transaction.get(existingSaleRef);
        if (existingSaleTxDoc.exists) {
          newSale = existingSaleTxDoc.data() as Sale;
          return;
        }
      }

      // 1. Read business document for tax / vertical rules
      const bizRef = adminDb.doc(`businesses/${payload.businessId}`);
      const bizDoc = await transaction.get(bizRef);
      const bizData = bizDoc.exists ? (bizDoc.data() as Business) : null;

      // 2. Read and validate products for authoritative price, options, modifiers, and stock
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

      // 3. Read and validate Serialized IMEI units with strict invariants
      const imeiDocsMap = new Map<string, { unitRef: FirebaseFirestore.DocumentReference; unitDoc: FirebaseFirestore.DocumentSnapshot }>();
      const seenUnitIds = new Set<string>();

      for (const item of payload.lineItems) {
        const rawImei = item.imei || item.selectedImei;
        if (rawImei) {
          if (item.quantity !== 1) {
            throw new Error(`Kuantitas untuk produk bernomor IMEI (${item.productName || item.productId}) harus tepat 1 per perangkat.`);
          }

          const imei = normalizeImei(rawImei);
          const regRef = adminDb.doc(`businesses/${payload.businessId}/registeredImeis/${imei}`);
          const regDoc = await transaction.get(regRef);

          let unitRef: FirebaseFirestore.DocumentReference;
          if (regDoc.exists && regDoc.data()?.unitId) {
            unitRef = adminDb.doc(`businesses/${payload.businessId}/imeiUnits/${regDoc.data()!.unitId}`);
          } else {
            unitRef = adminDb.doc(`businesses/${payload.businessId}/imeiUnits/${imei}`);
          }

          const unitDoc = await transaction.get(unitRef);

          if (!unitDoc.exists) {
            throw new Error(`Unit dengan nomor IMEI ${imei} tidak ditemukan di sistem inventaris.`);
          }

          const unitData = unitDoc.data() as ImeiUnit;

          if (seenUnitIds.has(unitDoc.id)) {
            throw new Error(`Terjadi duplikasi unit IMEI dalam keranjang: perangkat fisik yang sama (${imei}) dimasukkan lebih dari sekali (termasuk deteksi alias Dual-SIM).`);
          }
          seenUnitIds.add(unitDoc.id);

          if (unitData.status !== 'available') {
            throw new Error(`Unit bernomor IMEI ${imei} sudah tidak tersedia untuk dijual (status saat ini: ${unitData.status}).`);
          }

          if (unitData.branchId !== payload.branchId) {
            throw new Error(`Unit IMEI ${imei} berada di cabang ${unitData.branchId}, tidak dapat dijual di cabang transaksi ${payload.branchId}.`);
          }

          if (unitData.productId !== item.productId) {
            throw new Error(`Unit IMEI ${imei} terdaftar untuk produk "${unitData.productName || unitData.productId}", bukan untuk "${item.productName || item.productId}".`);
          }

          imeiDocsMap.set(imei, { unitRef, unitDoc });
        }
      }

      // 4. Read Recipe/BOM Ingredients consumption
      const ingredientConsumptions = new Map<string, number>();
      for (const item of payload.lineItems) {
        const prodDoc = productDocsMap.get(item.productId);
        const prodData = prodDoc?.exists ? prodDoc.data() : null;

        // Finished product recipe
        if (prodData?.recipe && Array.isArray(prodData.recipe)) {
          for (const r of prodData.recipe) {
            if (r.ingredientId && r.quantityRequired > 0) {
              const current = ingredientConsumptions.get(r.ingredientId) || 0;
              ingredientConsumptions.set(r.ingredientId, current + (r.quantityRequired * item.quantity));
            }
          }
        }

        // Selected Modifiers recipe
        if (item.selectedModifiers && Array.isArray(item.selectedModifiers) && prodData?.modifiers) {
          for (const modName of item.selectedModifiers) {
            const modObj = prodData.modifiers.find((m: any) => m.name === modName);
            if (modObj?.recipe && Array.isArray(modObj.recipe)) {
              for (const mr of modObj.recipe) {
                if (mr.ingredientId && mr.quantityRequired > 0) {
                  const current = ingredientConsumptions.get(mr.ingredientId) || 0;
                  ingredientConsumptions.set(mr.ingredientId, current + (mr.quantityRequired * item.quantity));
                }
              }
            }
          }
        }
      }

      // Read all required ingredient docs
      const ingredientDocsMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      for (const ingId of ingredientConsumptions.keys()) {
        const ingRef = adminDb.doc(`businesses/${payload.businessId}/ingredients/${ingId}`);
        const ingDoc = await transaction.get(ingRef);
        ingredientDocsMap.set(ingId, ingDoc);
      }

      // 5. Read Trade-In device if provided
      let tradeInRegDoc: any = null;
      let cleanTradeInImei = '';
      let cleanTradeInImei2 = '';
      if (payload.tradeIn) {
        const tVal = validateDualSimDevice({
          imei1: payload.tradeIn.imei,
          imei2: payload.tradeIn.imei2,
        });
        if (!tVal.valid) {
          throw new Error(tVal.error || "Format IMEI unit tukar tambah tidak valid.");
        }
        cleanTradeInImei = tVal.imei1;
        cleanTradeInImei2 = tVal.imei2 || '';

        const tRegRef = adminDb.doc(`businesses/${payload.businessId}/registeredImeis/${cleanTradeInImei}`);
        tradeInRegDoc = await transaction.get(tRegRef);
        if (tradeInRegDoc.exists) {
          throw new Error(`IMEI tukar tambah ${cleanTradeInImei} sudah terdaftar pada inventaris bisnis.`);
        }
      }

      // 6. Read table if dine-in
      let tableRef: any = null;
      let tableDoc: any = null;
      if (payload.tableId) {
        tableRef = adminDb.doc(`businesses/${payload.businessId}/tables/${payload.tableId}`);
        tableDoc = await transaction.get(tableRef);
      }

      // 7. Read Cash Session if cash sale
      let shiftDoc: FirebaseFirestore.DocumentSnapshot | null = null;
      let shiftRef: FirebaseFirestore.DocumentReference | null = null;

      if (payload.paymentMethod === 'cash') {
        if (payload.cashSessionId) {
          shiftRef = adminDb.doc(`businesses/${payload.businessId}/cashSessions/${payload.cashSessionId}`);
          shiftDoc = await transaction.get(shiftRef);

          if (!shiftDoc.exists) {
            throw new Error("Sesi kasir (shift) tidak ditemukan di sistem.");
          }
          const shiftData = shiftDoc.data();
          if (shiftData?.status !== 'open') {
            throw new Error("Sesi kasir (shift) telah ditutup. Tidak dapat memproses transaksi tunai pada shift tertutup.");
          }
          if (shiftData?.branchId && shiftData.branchId !== payload.branchId) {
            throw new Error(`Sesi kasir terdaftar untuk cabang ${shiftData.branchId}, bukan cabang transaksi ${payload.branchId}.`);
          }
        }
      }

      // ----------------------------------------------------
      // AUTHORITATIVE PRICE CALCULATION & VERIFICATION
      // ----------------------------------------------------
      let authoritativeSubtotal = 0;
      let totalCogs = 0;
      const verifiedLineItems: CartLineItem[] = [];

      for (const item of payload.lineItems) {
        const prodDoc = productDocsMap.get(item.productId);
        const prodData = prodDoc?.exists ? prodDoc.data() : null;

        const imei = item.imei || item.selectedImei;
        const cleanImei = imei ? normalizeImei(imei) : undefined;
        const imeiEntry = cleanImei ? imeiDocsMap.get(cleanImei) : null;
        const imeiData = imeiEntry?.unitDoc.exists ? imeiEntry.unitDoc.data() : null;

        // Base price
        const baseUnitPrice = imeiData?.sellingPrice ?? prodData?.sellingPrice ?? 0;

        // Authoritative options surcharge
        let optionsExtra = 0;
        if (item.selectedOptions && prodData?.options) {
          for (const [optName, choiceLabel] of Object.entries(item.selectedOptions)) {
            const optObj = prodData.options.find((o: any) => o.name === optName);
            if (optObj?.choices) {
              const choice = optObj.choices.find((c: any) => c.label === choiceLabel);
              if (choice?.extraPrice) optionsExtra += choice.extraPrice;
            }
          }
        }

        // Authoritative modifiers surcharge
        let modifiersExtra = 0;
        if (item.selectedModifiers && prodData?.modifiers) {
          for (const modName of item.selectedModifiers) {
            const modObj = prodData.modifiers.find((m: any) => m.name === modName);
            if (modObj?.price) modifiersExtra += modObj.price;
          }
        }

        const authoritativeUnitPrice = baseUnitPrice + optionsExtra + modifiersExtra;
        const lineSubtotal = authoritativeUnitPrice * item.quantity;
        authoritativeSubtotal += lineSubtotal;

        // Historical protected cost price snapshot
        const costSnapshot = typeof imeiData?.costPrice === 'number' 
          ? imeiData.costPrice 
          : (typeof prodData?.costPrice === 'number' ? prodData.costPrice : 0);
        totalCogs += costSnapshot * item.quantity;

        verifiedLineItems.push({
          productId: item.productId,
          productName: prodData?.name || imeiData?.productName || item.productName || "Produk",
          quantity: item.quantity,
          unitPrice: authoritativeUnitPrice,
          subtotal: lineSubtotal,
          costPriceSnapshot: costSnapshot,
          imei: cleanImei,
          notes: item.notes,
          selectedOptions: item.selectedOptions,
          selectedModifiers: item.selectedModifiers,
        });
      }

      // Discount Cap and Authority Check
      if (payload.discount > 0) {
        if (payload.discount > authoritativeSubtotal) {
          throw new Error("Diskon tidak boleh melebihi subtotal transaksi.");
        }
        const discountPercent = (payload.discount / authoritativeSubtotal) * 100;
        if (discountPercent > 10) {
          const canAuthorizeDiscount = membership.role === 'owner' || 
            membership.role === 'manager' || 
            membership.permissions.includes('approvals.manage');
          if (!canAuthorizeDiscount) {
            throw new Error("Diskon melebihi batas kewenangan kasir (maksimal 10%). Diperlukan persetujuan Manajer atau Owner.");
          }
        }
      }

      // Validate cashier discount authorization
      // Cashier max 10% discount, Owner/Manager unlimited
      if (membership.role === 'cashier' && payload.discount > 0) {
        const maxAllowedDiscount = Math.floor(authoritativeSubtotal * 0.10);
        if (payload.discount > maxAllowedDiscount) {
          throw new Error(`Diskon (${payload.discount.toLocaleString('id-ID')}) melebihi batas kewenangan kasir (maksimal 10% atau Rp ${maxAllowedDiscount.toLocaleString('id-ID')}). Butuh persetujuan Manajer/Owner.`);
        }
      }

      // Derive configurable Tax and Service Charge from business profile
      let effectiveTax = payload.tax;
      let effectiveServiceCharge = payload.serviceCharge;

      if (bizData?.businessType === 'fnb') {
        const taxRate = bizData.taxRate !== undefined ? bizData.taxRate : 10;
        const serviceRate = bizData.serviceChargeRate !== undefined ? bizData.serviceChargeRate : 0;
        const taxableBase = Math.max(0, authoritativeSubtotal - payload.discount);
        effectiveTax = Math.round((taxableBase * taxRate) / 100);
        effectiveServiceCharge = Math.round((taxableBase * serviceRate) / 100);
      }

      // Trade-In settlement discount
      const tradeInCredit = payload.tradeIn?.estimatedValue || 0;

      const authoritativeGrandTotal = Math.max(
        0, 
        authoritativeSubtotal - payload.discount + effectiveTax + effectiveServiceCharge - tradeInCredit
      );

      // Validate payment amount for cash sales
      if (payload.paymentMethod === 'cash' && payload.paidAmount < authoritativeGrandTotal) {
        throw new Error(`Jumlah bayar tunai (Rp ${payload.paidAmount.toLocaleString("id-ID")}) kurang dari total tagihan (Rp ${authoritativeGrandTotal.toLocaleString("id-ID")}).`);
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
        cashierId: authUser.uid,
        cashierName: membership.displayName,
        customerName: payload.customerName,
        orderType: payload.orderType,
        tableId: payload.tableId,
        tableNumber: payload.tableNumber,
        lineItems: verifiedLineItems,
        subtotal: authoritativeSubtotal,
        discount: payload.discount,
        tax: effectiveTax,
        serviceCharge: effectiveServiceCharge,
        grandTotal: authoritativeGrandTotal,
        paidAmount: payload.paymentMethod === 'cash' ? payload.paidAmount : (paymentStatus === 'paid' ? authoritativeGrandTotal : 0),
        changeAmount,
        paymentMethod: payload.paymentMethod,
        paymentStatus,
        orderStatus: (payload.orderType === 'retail_pos' || payload.orderType === 'phone_pos') ? 'served' : 'new',
        cashSessionId: payload.cashSessionId,
        idempotencyKey: effectiveIdempotencyKey,
        cogsSnapshot: totalCogs,
        grossProfit: authoritativeGrandTotal - totalCogs,
        midtransOrderId,
        transferReferenceNumber: payload.transferReferenceNumber,
        settledAt,
        tradeIn: payload.tradeIn,
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
              notes: paymentStatus === 'paid' 
                ? `Penjualan kasir pada transaksi ${saleNumber}`
                : `Reservasi stok penjualan pesanan pending ${saleNumber}`,
              timestamp: now,
            };
            transaction.set(movRef, movData);
          }
        }
      }

      // 2. Deduct ingredient stock according to recipe / BOM
      for (const [ingId, qtyConsumed] of ingredientConsumptions.entries()) {
        const ingDoc = ingredientDocsMap.get(ingId);
        if (ingDoc && ingDoc.exists) {
          const ingData = ingDoc.data();
          const currentStock = ingData?.stockQty || 0;
          const newQty = Math.max(0, currentStock - qtyConsumed);

          transaction.update(ingDoc.ref, {
            stockQty: newQty,
            updatedAt: now,
          });

          const logRef = adminDb.collection(`businesses/${payload.businessId}/ingredientLogs`).doc();
          transaction.set(logRef, {
            id: logRef.id,
            ingredientId: ingId,
            ingredientName: ingData?.name || ingId,
            type: 'consumption',
            quantityDelta: -qtyConsumed,
            previousQty: currentStock,
            newQty,
            referenceId: saleNumber,
            operatorId: authUser.uid,
            operatorName: membership.displayName,
            timestamp: now,
          });
        }
      }

      // 3. Update IMEI units (Sold if paid, Reserved if pending payment)
      for (const [imei, { unitRef, unitDoc }] of imeiDocsMap.entries()) {
        const unitData = unitDoc.data() as ImeiUnit;
        const warrantyPeriod = unitData?.condition === 'new' ? 365 * 86400000 : 90 * 86400000;

        if (paymentStatus === 'paid') {
          transaction.update(unitRef, {
            status: 'sold',
            soldAtSaleId: saleId,
            warrantyUntil: now + warrantyPeriod,
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
            notes: `Terjual pada transaksi ${saleNumber} (Garansi aktif s/d ${new Date(now + warrantyPeriod).toLocaleDateString('id-ID')})`,
            timestamp: now,
          });
        } else {
          transaction.update(unitRef, {
            status: 'reserved',
            soldAtSaleId: saleId,
            updatedAt: now,
          });

          const histRef = adminDb.collection(`businesses/${payload.businessId}/imeiHistory`).doc();
          transaction.set(histRef, {
            id: histRef.id,
            businessId: payload.businessId,
            imei,
            unitId: unitDoc.id,
            action: 'reserved',
            referenceId: saleNumber,
            branchId: payload.branchId,
            operatorId: authUser.uid,
            operatorName: membership.displayName,
            notes: `Unit di-reserve untuk pesanan ${saleNumber} (Menunggu pembayaran ${payload.paymentMethod})`,
            timestamp: now,
          });
        }
      }

      // 4. Record Trade-In intake if applicable
      if (payload.tradeIn && cleanTradeInImei) {
        const tradeInUnitId = `imei_tradein_${now}_${Math.random().toString(36).substring(2, 6)}`;
        const tRegRef1 = adminDb.doc(`businesses/${payload.businessId}/registeredImeis/${cleanTradeInImei}`);
        transaction.set(tRegRef1, {
          imei: cleanTradeInImei,
          unitId: tradeInUnitId,
          businessId: payload.businessId,
          branchId: payload.branchId,
          isPrimary: true,
          source: 'direct_sell_in',
          registeredAt: now,
          registeredBy: authUser.uid,
        });

        const tUnitRef = adminDb.doc(`businesses/${payload.businessId}/imeiUnits/${tradeInUnitId}`);
        const tUnitData: ImeiUnit = {
          id: tradeInUnitId,
          businessId: payload.businessId,
          branchId: payload.branchId,
          imei: cleanTradeInImei,
          imei2: cleanTradeInImei2 || undefined,
          productId: `prod_tradein_${cleanTradeInImei.substring(0, 8)}`,
          productName: `Trade-In: ${payload.tradeIn.deviceModel}`,
          brand: 'Trade-In',
          model: payload.tradeIn.deviceModel,
          storage: 'N/A',
          color: 'N/A',
          condition: (payload.tradeIn.condition as any) || 'second_grade_a',
          costPrice: payload.tradeIn.estimatedValue,
          sellingPrice: payload.tradeIn.estimatedValue,
          status: 'available',
          source: 'direct_sell_in',
          supplierOrCustomerName: payload.tradeIn.customerName || payload.customerName || 'Pelanggan POS',
          notes: `Unit tukar tambah pada transaksi ${saleNumber}`,
          createdAt: now,
          updatedAt: now,
        };
        transaction.set(tUnitRef, tUnitData);

        const tHistRef = adminDb.collection(`businesses/${payload.businessId}/imeiHistory`).doc();
        transaction.set(tHistRef, {
          id: tHistRef.id,
          businessId: payload.businessId,
          imei: cleanTradeInImei,
          unitId: tradeInUnitId,
          action: 'received',
          referenceId: saleNumber,
          branchId: payload.branchId,
          operatorId: authUser.uid,
          operatorName: membership.displayName,
          notes: `Diterima melalui tukar tambah transaksi ${saleNumber}`,
          timestamp: now,
        });
      }

      // 5. Update table occupancy: release if paid, maintain if pending
      if (tableRef && tableDoc && tableDoc.exists) {
        if (paymentStatus === 'paid') {
          transaction.update(tableRef, {
            status: 'available',
            activeSaleId: '',
            customerName: '',
            updatedAt: now,
          });
        } else {
          transaction.update(tableRef, {
            status: 'occupied',
            activeSaleId: saleId,
            customerName: payload.customerName || 'Pelanggan Dine-In',
            updatedAt: now,
          });
        }
      }

      // 6. Save authoritative Sale document
      const saleRef = adminDb.doc(`businesses/${payload.businessId}/sales/${saleId}`);
      transaction.set(saleRef, cleanUndefined(newSale));

      // 7. Update Cash Session if active cash sale and settled
      if (payload.paymentMethod === 'cash' && paymentStatus === 'paid' && shiftDoc && shiftDoc.exists && shiftRef) {
        const shiftData = shiftDoc.data();
        const currentSales = shiftData?.cashSalesTotal ?? 0;
        const currentExpected = shiftData?.expectedClosingCash ?? 0;
        const currentDrawer = typeof shiftData?.currentCashDrawer === 'number' ? shiftData.currentCashDrawer : currentExpected;
        transaction.update(shiftRef, {
          cashSalesTotal: currentSales + authoritativeGrandTotal,
          expectedClosingCash: currentExpected + authoritativeGrandTotal,
          currentCashDrawer: currentDrawer + authoritativeGrandTotal,
          updatedAt: now,
        });
      }

      // 8. Store Idempotency Key mapping with canonical request fingerprint
      transaction.set(idemRef, cleanUndefined({
        idempotencyKey: effectiveIdempotencyKey,
        saleId,
        businessId: payload.businessId,
        branchId: payload.branchId,
        operatorId: authUser.uid,
        requestFingerprint,
        grandTotal: authoritativeGrandTotal,
        createdAt: now,
      }));
    });

    // 9. Generate actual Midtrans Snap intent / token if QRIS / Midtrans
    if (payload.paymentMethod === 'midtrans_qris' && newSale) {
      let snapToken = `snap_sim_${saleId}`;
      let snapRedirectUrl = `https://app.sandbox.midtrans.com/snap/v2/vtweb/${snapToken}`;
      
      let bizMidtransServerKey: string | undefined;
      let bizIsProd: boolean | undefined;

      try {
        const bizSnap = await adminDb.doc(`businesses/${payload.businessId}`).get();
        if (bizSnap.exists) {
          const bizData = bizSnap.data() as any;
          if (bizData?.midtransSettings?.serverKey) {
            bizMidtransServerKey = bizData.midtransSettings.serverKey;
            bizIsProd = bizData.midtransSettings.isProduction;
          }
        }
      } catch (e) {
        // fallback
      }

      if (midtransAdapter.isConfigured(bizMidtransServerKey)) {
        try {
          const snapRes = await midtransAdapter.createSnapTransaction({
            orderId: midtransOrderId!,
            grossAmount: (newSale as Sale).grandTotal,
            businessId: payload.businessId,
            customerName: payload.customerName || "Pelanggan POS",
            serverKey: bizMidtransServerKey,
            isProduction: bizIsProd,
          });
          if (snapRes.token) {
            snapToken = snapRes.token;
            snapRedirectUrl = snapRes.redirectUrl || snapRedirectUrl;
          }
        } catch (e: any) {
          console.warn("Midtrans snap creation warning:", e.message);
        }
      }

      await adminDb.doc(`businesses/${payload.businessId}/sales/${saleId}`).update({
        snapToken,
        snapRedirectUrl,
      });

      (newSale as Sale).snapToken = snapToken;
      (newSale as Sale).snapRedirectUrl = snapRedirectUrl;
    }

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
      error.message?.includes('diarsipkan') ||
      error.message?.includes('Kuantitas untuk produk bernomor IMEI') ||
      error.message?.includes('duplikasi unit IMEI') ||
      error.message?.includes('berada di cabang') ||
      error.message?.includes('tidak cocok dengan') ||
      error.message?.includes('terdaftar untuk produk') ||
      error.message?.includes('kurang dari total tagihan') ||
      error.message?.includes('tukar tambah') ||
      error.message?.includes('Sesi kasir')
    ) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    if (error.message?.includes('kewenangan kasir') || error.message?.includes('persetujuan Manajer')) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 403 }
      );
    }

    return handleAuthApiError(error);
  }
}
