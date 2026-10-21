import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { ImeiUnit, ImeiHistory, Product, StockMovement } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";
import { validateDualSimDevice } from "@/lib/validation/imei";

const sellInSchema = z.object({
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  imei: z.string().min(14),
  imei2: z.string().optional(),
  serialNumber: z.string().optional(),
  brand: z.string().min(1),
  model: z.string().min(1),
  storage: z.string().min(1),
  color: z.string().min(1),
  condition: z.enum(['new', 'second_grade_a', 'second_grade_b']),
  costPrice: z.number().int().nonnegative(),
  sellingPrice: z.number().int().positive(),
  customerName: z.string().min(2, "Nama pelanggan / penjual wajib diisi."),
  cashSessionId: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const parsed = sellInSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data Sell-In tidak valid." },
        { status: 400 }
      );
    }

    const {
      businessId,
      branchId,
      imei,
      imei2,
      serialNumber,
      brand,
      model,
      storage,
      color,
      condition,
      costPrice,
      sellingPrice,
      customerName,
      cashSessionId,
      notes,
    } = parsed.data;

    // RBAC: inventory.receive permission
    const membership = await requireBusinessPermission(businessId, authUser.uid, 'inventory.receive');
    await requireBranchAccess(businessId, authUser.uid, branchId);

    // Authoritative Luhn checksum & Dual SIM check
    const imeiCheck = validateDualSimDevice({
      imei1: imei,
      imei2,
      serialNumber,
    });

    if (!imeiCheck.valid) {
      return NextResponse.json(
        { success: false, message: imeiCheck.error || "Nomor IMEI tidak valid (gagal validasi algoritma Luhn)." },
        { status: 400 }
      );
    }

    const cleanImei = imeiCheck.imei1;
    const cleanImei2 = imeiCheck.imei2;
    const cleanSn = imeiCheck.serialNumber;

    const now = Date.now();
    const unitId = `imei_${now}_${Math.random().toString(36).substring(2, 6)}`;
    const intakeRefNo = `IN-${now}-${Math.floor(100 + Math.random() * 900)}`;

    let createdUnit: ImeiUnit | null = null;
    let createdHistory: ImeiHistory | null = null;

    await adminDb.runTransaction(async (transaction) => {
      // ----------------------------------------------------
      // PHASE A: ALL READS FIRST
      // ----------------------------------------------------

      // 1. Concurrency lock on primary IMEI
      const regRef1 = adminDb.doc(`businesses/${businessId}/registeredImeis/${cleanImei}`);
      const regDoc1 = await transaction.get(regRef1);
      if (regDoc1.exists) {
        throw new Error(`IMEI 1 (${cleanImei}) sudah terdaftar dalam sistem inventaris.`);
      }

      // 2. Concurrency lock on secondary IMEI if present
      let regRef2: FirebaseFirestore.DocumentReference | null = null;
      if (cleanImei2) {
        regRef2 = adminDb.doc(`businesses/${businessId}/registeredImeis/${cleanImei2}`);
        const regDoc2 = (await transaction.get(regRef2)) as FirebaseFirestore.DocumentSnapshot;
        if (regDoc2.exists) {
          throw new Error(`IMEI 2 (${cleanImei2}) sudah terdaftar dalam sistem inventaris.`);
        }
      }

      // 3. Find or resolve parent Product to prevent dangling productId
      const targetProductId = `prod_ph_${brand.toLowerCase().replace(/\s+/g, '_')}_${model.toLowerCase().replace(/\s+/g, '_')}_${storage.toLowerCase()}_${condition}`;
      const prodRef = adminDb.doc(`businesses/${businessId}/products/${targetProductId}`);
      const prodDoc = await transaction.get(prodRef);

      // 4. Read active cash session if cash intake payout
      let sessionRef: any = null;
      let sessionDoc: any = null;
      if (cashSessionId && costPrice > 0) {
        sessionRef = adminDb.doc(`businesses/${businessId}/cashSessions/${cashSessionId}`);
        sessionDoc = await transaction.get(sessionRef);
      }

      // ----------------------------------------------------
      // PHASE B: ALL WRITES SECOND
      // ----------------------------------------------------

      // Lock IMEI 1
      transaction.set(regRef1, {
        imei: cleanImei,
        unitId,
        businessId,
        branchId,
        isPrimary: true,
        source: 'direct_sell_in',
        registeredAt: now,
        registeredBy: authUser.uid,
      });

      // Lock IMEI 2
      if (cleanImei2 && regRef2) {
        transaction.set(regRef2, {
          imei: cleanImei2,
          unitId,
          businessId,
          branchId,
          isSecondary: true,
          source: 'direct_sell_in',
          registeredAt: now,
          registeredBy: authUser.uid,
        });
      }

      // Create or update parent Product (prevents dangling productId)
      const productName = `${brand} ${model} ${storage} (${condition === 'new' ? 'Baru' : 'Second'})`;
      let currentStock = 0;

      if (!prodDoc.exists) {
        const newProduct: Product = {
          id: targetProductId,
          businessId,
          name: productName,
          category: 'Smartphone',
          sellingPrice,
          costPrice,
          available: true,
          trackStock: true,
          stockQty: 1,
          brand,
          model,
          storage,
          color,
          condition,
          createdAt: now,
          updatedAt: now,
        };
        transaction.set(prodRef, newProduct);
        currentStock = 0;
      } else {
        currentStock = prodDoc.data()?.stockQty || 0;
        transaction.update(prodRef, {
          stockQty: currentStock + 1,
          costPrice, // Update latest intake HPP
          sellingPrice,
          available: true,
          updatedAt: now,
        });
      }

      // Create ImeiUnit (warranty starts upon customer sale, NOT at intake!)
      const unitDocRef = adminDb.doc(`businesses/${businessId}/imeiUnits/${unitId}`);
      const unitData: ImeiUnit = {
        id: unitId,
        businessId,
        branchId,
        imei: cleanImei,
        imei2: cleanImei2,
        serialNumber: cleanSn,
        productId: targetProductId,
        productName,
        brand,
        model,
        storage,
        color,
        condition,
        costPrice,
        sellingPrice,
        status: 'available',
        source: 'direct_sell_in',
        supplierOrCustomerName: customerName,
        notes: notes || `Direct Sell In dari ${customerName}`,
        createdAt: now,
        updatedAt: now,
      };
      transaction.set(unitDocRef, unitData);
      createdUnit = unitData;

      // Create immutable ImeiHistory
      const histRef = adminDb.collection(`businesses/${businessId}/imeiHistory`).doc();
      const histData: ImeiHistory = {
        id: histRef.id,
        businessId,
        imei: cleanImei,
        imei2: cleanImei2,
        serialNumber: cleanSn,
        unitId,
        action: 'received',
        referenceId: intakeRefNo,
        branchId,
        operatorId: authUser.uid,
        operatorName: membership.displayName,
        notes: `Direct Sell In dari ${customerName}${cleanImei2 ? ` [Dual SIM: ${cleanImei2}]` : ''}`,
        timestamp: now,
      };
      transaction.set(histRef, histData);
      createdHistory = histData;

      // Create Stock Movement in authoritative ledger
      const movRef = adminDb.collection(`businesses/${businessId}/stockMovements`).doc();
      const movData: StockMovement = {
        id: movRef.id,
        businessId,
        branchId,
        productId: targetProductId,
        productName,
        type: 'purchase_order',
        quantityDelta: 1,
        previousQty: currentStock,
        newQty: currentStock + 1,
        referenceId: intakeRefNo,
        operatorId: authUser.uid,
        operatorName: membership.displayName,
        notes: `Direct Sell In unit IMEI ${cleanImei} dari ${customerName}`,
        timestamp: now,
      };
      transaction.set(movRef, movData);

      // Record cash drawer payout (cash-out) in active session if requested
      if (sessionDoc && sessionDoc.exists && sessionDoc.data()?.status === 'open') {
        const sData = sessionDoc.data();
        const currentCashOut = sData.cashOutTotal || 0;
        const currentExpected = sData.expectedClosingCash || 0;
        const currentDrawer = typeof sData.currentCashDrawer === 'number' ? sData.currentCashDrawer : currentExpected;

        transaction.update(sessionRef, {
          cashOutTotal: currentCashOut + costPrice,
          expectedClosingCash: currentExpected - costPrice,
          currentCashDrawer: currentDrawer - costPrice,
          updatedAt: now,
        });
      }

      // Audit Log
      const auditRef = adminDb.collection(`businesses/${businessId}/auditLogs`).doc();
      transaction.set(auditRef, {
        id: auditRef.id,
        action: 'phone_direct_sell_in',
        businessId,
        branchId,
        unitId,
        imei: cleanImei,
        imei2: cleanImei2,
        customerName,
        costPrice,
        sellingPrice,
        referenceId: intakeRefNo,
        operatorId: authUser.uid,
        operatorName: membership.displayName,
        timestamp: now,
      });
    });

    return NextResponse.json({
      success: true,
      unit: createdUnit,
      history: createdHistory,
      message: `Unit ${brand} ${model} dengan IMEI ${cleanImei} berhasil diterima ke inventaris secara atomik. (Ref: ${intakeRefNo})`,
    });
  } catch (error: any) {
    if (error.message?.includes('sudah terdaftar')) {
      return NextResponse.json({ success: false, message: error.message }, { status: 409 });
    }
    return handleAuthApiError(error);
  }
}
