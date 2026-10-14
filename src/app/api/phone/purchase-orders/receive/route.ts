import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { ImeiUnit, ImeiHistory, PurchaseOrder, StockMovement } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";
import { canReadCostPrice, sanitizeImeiUnitDtos } from "@/lib/server/cost-protection";
import { validateImei, normalizeImei, validateDualSimDevice } from "@/lib/validation/imei";

const imeiDetailSchema = z.object({
  imei: z.string(),
  imei2: z.string().optional(),
  serialNumber: z.string().optional(),
});

const receiveSchema = z.object({
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  poId: z.string().min(1),
  poItemId: z.string().min(1),
  scannedImeis: z.array(z.string()).optional(),
  imeiDetails: z.array(imeiDetailSchema).optional(),
});

export async function POST(request: Request) {
  try {
    // 1. Enforce verified caller session
    const authUser = await requireAuthenticatedUser(request);

    const body = await request.json();
    const parsed = receiveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data penerimaan IMEI tidak valid" },
        { status: 400 }
      );
    }

    const { businessId, branchId, poId, poItemId } = parsed.data;

    // Harmonize single or dual-sim details
    const itemsToProcess: Array<{ imei: string; imei2?: string; serialNumber?: string }> = [];
    if (parsed.data.imeiDetails && parsed.data.imeiDetails.length > 0) {
      itemsToProcess.push(...parsed.data.imeiDetails);
    } else if (parsed.data.scannedImeis && parsed.data.scannedImeis.length > 0) {
      for (const s of parsed.data.scannedImeis) {
        itemsToProcess.push({ imei: s });
      }
    } else {
      return NextResponse.json(
        { success: false, message: "Daftar IMEI yang discan tidak boleh kosong." },
        { status: 400 }
      );
    }

    // 2. Validate all IMEIs using authoritative Luhn algorithm
    const cleanUnits: Array<{ imei: string; imei2?: string; serialNumber?: string }> = [];
    const allImeisToLock = new Set<string>();

    for (const item of itemsToProcess) {
      const dualCheck = validateDualSimDevice({
        imei1: item.imei,
        imei2: item.imei2,
        serialNumber: item.serialNumber,
      });

      if (!dualCheck.valid) {
        return NextResponse.json(
          { success: false, message: dualCheck.error || "Format IMEI tidak valid." },
          { status: 400 }
        );
      }

      // Check within-batch duplication
      if (allImeisToLock.has(dualCheck.imei1)) {
        return NextResponse.json(
          { success: false, message: `Terdapat duplikasi IMEI ${dualCheck.imei1} dalam daftar yang discan pada permintaan ini.` },
          { status: 400 }
        );
      }
      allImeisToLock.add(dualCheck.imei1);

      if (dualCheck.imei2) {
        if (allImeisToLock.has(dualCheck.imei2)) {
          return NextResponse.json(
            { success: false, message: `Terdapat duplikasi IMEI 2 ${dualCheck.imei2} dalam daftar yang discan.` },
            { status: 400 }
          );
        }
        allImeisToLock.add(dualCheck.imei2);
      }

      cleanUnits.push({
        imei: dualCheck.imei1,
        imei2: dualCheck.imei2,
        serialNumber: dualCheck.serialNumber,
      });
    }

    // 3. Authoritative permissions and branch validation
    const membership = await requireBusinessPermission(businessId, authUser.uid, 'inventory.receive');
    await requireBranchAccess(businessId, authUser.uid, branchId);

    const now = Date.now();
    const createdUnits: ImeiUnit[] = [];
    const createdHistories: ImeiHistory[] = [];

    // 4. Atomic transaction with concurrency locking on deterministic IMEI registry docs
    await adminDb.runTransaction(async (transaction) => {
      // ----------------------------------------------------
      // PHASE A: ALL READS FIRST
      // ----------------------------------------------------
      const poRef = adminDb.doc(`businesses/${businessId}/purchaseOrders/${poId}`);
      const poDoc = await transaction.get(poRef);

      if (!poDoc.exists) {
        throw new Error("Purchase Order tidak ditemukan di sistem.");
      }

      const poData = poDoc.data() as PurchaseOrder;
      if (!poData || !poData.items) {
        throw new Error("Data Purchase Order tidak valid.");
      }

      if (poData.status === 'received') {
        throw new Error(`Purchase Order ${poData.poNumber} sudah selesai diproses (seluruh unit telah diterima).`);
      }
      if (poData.status === 'cancelled') {
        throw new Error(`Purchase Order ${poData.poNumber} telah dibatalkan.`);
      }

      const itemIndex = poData.items.findIndex((i: any) => i.id === poItemId);
      if (itemIndex === -1) {
        throw new Error("Item produk dalam Purchase Order tidak ditemukan.");
      }

      const targetItem = poData.items[itemIndex];
      const remainingToReceive = targetItem.quantityOrdered - targetItem.quantityReceived;

      if (cleanUnits.length > remainingToReceive) {
        throw new Error(`Jumlah IMEI yang discan (${cleanUnits.length}) melebihi sisa pesanan (${remainingToReceive}).`);
      }

      // Concurrency lock: read all deterministic registered IMEI docs
      for (const imei of Array.from(allImeisToLock)) {
        const regRef = adminDb.doc(`businesses/${businessId}/registeredImeis/${imei}`);
        const regDoc = await transaction.get(regRef);
        if (regDoc.exists) {
          throw new Error(`IMEI ${imei} sudah pernah didaftarkan pada inventaris bisnis ini (terkunci secara atomik).`);
        }
      }

      // Read target product if available
      const targetProductId = targetItem.productId || `prod_${targetItem.brand.toLowerCase()}`;
      const prodRef = adminDb.doc(`businesses/${businessId}/products/${targetProductId}`);
      const prodDoc = await transaction.get(prodRef);

      // ----------------------------------------------------
      // PHASE B: ALL WRITES SECOND
      // ----------------------------------------------------
      for (const u of cleanUnits) {
        const unitId = `imei_${now}_${Math.random().toString(36).substring(2, 6)}`;
        const unitDocRef = adminDb.doc(`businesses/${businessId}/imeiUnits/${unitId}`);

        // Lock registered primary IMEI
        const regRef1 = adminDb.doc(`businesses/${businessId}/registeredImeis/${u.imei}`);
        transaction.set(regRef1, {
          imei: u.imei,
          unitId,
          businessId,
          branchId,
          poId,
          isPrimary: true,
          registeredAt: now,
          registeredBy: authUser.uid,
        });

        // Lock secondary IMEI if dual-sim
        if (u.imei2) {
          const regRef2 = adminDb.doc(`businesses/${businessId}/registeredImeis/${u.imei2}`);
          transaction.set(regRef2, {
            imei: u.imei2,
            unitId,
            businessId,
            branchId,
            poId,
            isSecondary: true,
            registeredAt: now,
            registeredBy: authUser.uid,
          });
        }

        const unitData: ImeiUnit = {
          id: unitId,
          businessId,
          branchId,
          imei: u.imei,
          imei2: u.imei2,
          serialNumber: u.serialNumber,
          productId: targetProductId,
          productName: `${targetItem.brand} ${targetItem.model} ${targetItem.storage}`,
          brand: targetItem.brand,
          model: targetItem.model,
          storage: targetItem.storage,
          color: targetItem.color,
          condition: targetItem.condition,
          costPrice: targetItem.costPrice,
          sellingPrice: targetItem.expectedSellingPrice,
          status: 'available',
          warrantyUntil: now + 365 * 86400000,
          source: 'purchase_order',
          createdAt: now,
          updatedAt: now,
        };

        transaction.set(unitDocRef, unitData);
        createdUnits.push(unitData);

        // Add IMEI history with verified server operator identity
        const histRef = adminDb.collection(`businesses/${businessId}/imeiHistory`).doc();
        const histData: ImeiHistory = {
          id: histRef.id,
          businessId,
          imei: u.imei,
          imei2: u.imei2,
          serialNumber: u.serialNumber,
          unitId,
          action: 'received',
          referenceId: poData.poNumber,
          branchId,
          operatorId: authUser.uid,
          operatorName: membership.displayName,
          notes: `Penerimaan barang dari PO ${poData.poNumber} (${poData.supplierName})${u.imei2 ? ` [Dual-SIM IMEI 2: ${u.imei2}]` : ''}`,
          timestamp: now,
        };

        transaction.set(histRef, histData);
        createdHistories.push(histData);
      }

      // Update Product Physical Stock & Write Authoritative Stock Movement
      if (prodDoc.exists) {
        const currentStock = prodDoc.data()?.stockQty || 0;
        transaction.update(prodRef, {
          stockQty: currentStock + cleanUnits.length,
          updatedAt: now,
        });

        const movRef = adminDb.collection(`businesses/${businessId}/stockMovements`).doc();
        const movData: StockMovement = {
          id: movRef.id,
          businessId,
          branchId,
          productId: targetProductId,
          productName: `${targetItem.brand} ${targetItem.model} ${targetItem.storage}`,
          type: 'purchase_order',
          quantityDelta: cleanUnits.length,
          previousQty: currentStock,
          newQty: currentStock + cleanUnits.length,
          referenceId: poData.poNumber,
          operatorId: authUser.uid,
          operatorName: membership.displayName,
          notes: `Penerimaan ${cleanUnits.length} unit IMEI dari PO ${poData.poNumber}`,
          timestamp: now,
        };
        transaction.set(movRef, movData);
      }

      // Update PO item
      targetItem.quantityReceived += cleanUnits.length;
      targetItem.receivedImeis = [...(targetItem.receivedImeis || []), ...cleanUnits.map(u => u.imei)];
      poData.items[itemIndex] = targetItem;

      // Check overall PO status: partial vs received
      const allReceived = poData.items.every((i: any) => i.quantityReceived >= i.quantityOrdered);
      poData.status = allReceived ? 'received' : 'partially_received';
      poData.updatedAt = now;

      transaction.update(poRef, {
        items: poData.items,
        status: poData.status,
        updatedAt: now,
      });
    });

    const allowedCost = canReadCostPrice(membership.role, membership.permissions);
    const sanitizedUnits = sanitizeImeiUnitDtos(createdUnits, allowedCost);

    return NextResponse.json({
      success: true,
      receivedCount: cleanUnits.length,
      createdUnits: sanitizedUnits,
      createdHistories,
      message: `Berhasil menerima ${cleanUnits.length} unit IMEI ke inventaris toko.`
    });
  } catch (error: any) {
    if (error.message?.includes('sudah pernah didaftarkan') || error.message?.includes('melebihi sisa') || error.message?.includes('sudah selesai')) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 409 }
      );
    }
    return handleAuthApiError(error);
  }
}
