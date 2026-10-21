import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { ImeiUnit, ImeiHistory, StockMovement } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";
import { validateImei } from "@/lib/validation/imei";

const exchangeSchema = z.object({
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  oldImei: z.string().min(1),
  newImei: z.string().min(1),
  reason: z.string().min(3, "Alasan penukaran unit wajib diisi minimal 3 karakter."),
  differenceFee: z.number().int().default(0),
  cashSessionId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    // 1. Enforce verified caller session
    const authUser = await requireAuthenticatedUser(request);

    const body = await request.json();
    const parsed = exchangeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data penukaran IMEI tidak valid." },
        { status: 400 }
      );
    }

    const { businessId, branchId, oldImei, newImei, reason, differenceFee, cashSessionId } = parsed.data;

    // 2. Validate both IMEIs with authoritative Luhn checksum algorithm
    const oldVal = validateImei(oldImei, { fieldLabel: 'IMEI unit lama' });
    if (!oldVal.valid) {
      return NextResponse.json(
        { success: false, message: oldVal.error || "Format IMEI unit lama tidak valid." },
        { status: 400 }
      );
    }

    const newVal = validateImei(newImei, { fieldLabel: 'IMEI unit pengganti' });
    if (!newVal.valid) {
      return NextResponse.json(
        { success: false, message: newVal.error || "Format IMEI unit pengganti tidak valid." },
        { status: 400 }
      );
    }

    if (oldVal.normalized === newVal.normalized) {
      return NextResponse.json(
        { success: false, message: "IMEI unit lama dan unit pengganti tidak boleh sama." },
        { status: 400 }
      );
    }

    const cleanOldImei = oldVal.normalized;
    const cleanNewImei = newVal.normalized;

    // 3. Authoritative RBAC check & branch access
    const membership = await requireBusinessPermission(businessId, authUser.uid, 'inventory.adjust');
    await requireBranchAccess(businessId, authUser.uid, branchId);

    const now = Date.now();
    const exchangeId = `EXC-${now}-${Math.random().toString(36).substring(2, 6)}`;

    // 4. Perform atomic transaction: Updates both units, stock ledger, cash drawer, and audit logs
    await adminDb.runTransaction(async (transaction) => {
      // ----------------------------------------------------
      // PHASE A: ALL READS FIRST
      // ----------------------------------------------------

      // 1. Resolve and read old IMEI unit doc
      const oldRegRef = adminDb.doc(`businesses/${businessId}/registeredImeis/${cleanOldImei}`);
      const oldRegDoc = await transaction.get(oldRegRef);

      const oldUnitDocRef = oldRegDoc.exists && oldRegDoc.data()?.unitId
        ? adminDb.doc(`businesses/${businessId}/imeiUnits/${oldRegDoc.data()!.unitId}`)
        : adminDb.doc(`businesses/${businessId}/imeiUnits/${cleanOldImei}`);
      const oldUnitDoc = await transaction.get(oldUnitDocRef);

      if (!oldUnitDoc.exists) {
        throw new Error(`Unit lama dengan IMEI ${cleanOldImei} tidak ditemukan dalam sistem inventaris.`);
      }

      const oldUnitData = oldUnitDoc.data() as ImeiUnit;

      // Invariant: Old unit must be sold
      if (oldUnitData.status !== 'sold') {
        throw new Error(`Unit lama tidak memenuhi syarat klaim garansi karena belum pernah terjual (status saat ini: ${oldUnitData.status}).`);
      }

      // Invariant: Warranty must be active
      if (!oldUnitData.warrantyUntil || now > oldUnitData.warrantyUntil) {
        const expiredDate = oldUnitData.warrantyUntil ? new Date(oldUnitData.warrantyUntil).toLocaleDateString('id-ID') : 'tidak terdaftar';
        throw new Error(`Masa garansi unit telah berakhir pada ${expiredDate}. Klaim tukar unit garansi ditolak.`);
      }

      // 2. Resolve and read new replacement IMEI unit doc
      const newRegRef = adminDb.doc(`businesses/${businessId}/registeredImeis/${cleanNewImei}`);
      const newRegDoc = await transaction.get(newRegRef);

      const newUnitDocRef = newRegDoc.exists && newRegDoc.data()?.unitId
        ? adminDb.doc(`businesses/${businessId}/imeiUnits/${newRegDoc.data()!.unitId}`)
        : adminDb.doc(`businesses/${businessId}/imeiUnits/${cleanNewImei}`);
      const newUnitDoc = await transaction.get(newUnitDocRef);

      if (!newUnitDoc.exists) {
        throw new Error(`Unit pengganti dengan IMEI ${cleanNewImei} tidak ditemukan di sistem.`);
      }

      const newUnitData = newUnitDoc.data() as ImeiUnit;

      // Invariant: Prevent self-exchange through Dual-SIM alias or same physical unit
      if (
        oldUnitDoc.id === newUnitDoc.id ||
        cleanOldImei === cleanNewImei ||
        (oldUnitData.imei2 && oldUnitData.imei2 === cleanNewImei) ||
        (newUnitData.imei2 && newUnitData.imei2 === cleanOldImei) ||
        (oldUnitData.imei2 && newUnitData.imei2 && oldUnitData.imei2 === newUnitData.imei2)
      ) {
        throw new Error("Unit lama dan unit pengganti terdeteksi sebagai perangkat fisik yang sama melalui alias Dual-SIM. Exchange ditolak.");
      }

      // Invariant: Replacement unit must be available in the SAME branch
      if (newUnitData.status !== 'available') {
        throw new Error(`Unit IMEI pengganti ${cleanNewImei} sudah tidak tersedia (status: ${newUnitData.status}).`);
      }

      if (newUnitData.branchId !== branchId) {
        throw new Error(`Unit pengganti berada di cabang lain (${newUnitData.branchId}). Penukaran unit wajib menggunakan unit di cabang transaksi (${branchId}).`);
      }

      // 3. Read active cash session if difference fee exists
      let sessionRef: any = null;
      let sessionDoc: any = null;
      if (cashSessionId && differenceFee !== 0) {
        sessionRef = adminDb.doc(`businesses/${businessId}/cashSessions/${cashSessionId}`);
        sessionDoc = await transaction.get(sessionRef);
      }

      // ----------------------------------------------------
      // PHASE B: ALL WRITES SECOND
      // ----------------------------------------------------

      // Update old unit to quarantined disposition
      transaction.update(oldUnitDocRef, {
        status: 'quarantined',
        notes: `Unit bermasalah ditukar: ${reason} (Ref: ${exchangeId})`,
        updatedAt: now,
      });

      // Update replacement unit to sold, start warranty
      transaction.update(newUnitDocRef, {
        status: 'sold',
        soldAtSaleId: exchangeId,
        warrantyUntil: now + 90 * 86400000, // 90 days replacement warranty
        notes: `Unit diserahkan menggantikan IMEI ${cleanOldImei} (Ref: ${exchangeId})`,
        updatedAt: now,
      });

      // Write IMEI history for old unit (exchanged_in / quarantined)
      const histOldRef = adminDb.collection(`businesses/${businessId}/imeiHistory`).doc();
      const histOldData: ImeiHistory = {
        id: histOldRef.id,
        businessId,
        imei: cleanOldImei,
        unitId: oldUnitDoc.id,
        action: 'exchanged_in',
        referenceId: exchangeId,
        branchId,
        operatorId: authUser.uid,
        operatorName: membership.displayName,
        notes: `Unit lama diterima kembali (Alasan: ${reason}). Digantikan dengan IMEI ${cleanNewImei}`,
        timestamp: now,
      };
      transaction.set(histOldRef, histOldData);

      // Write IMEI history for replacement unit (exchanged_out / sold)
      const histNewRef = adminDb.collection(`businesses/${businessId}/imeiHistory`).doc();
      const histNewData: ImeiHistory = {
        id: histNewRef.id,
        businessId,
        imei: cleanNewImei,
        unitId: newUnitDoc.id,
        action: 'exchanged_out',
        referenceId: exchangeId,
        branchId,
        operatorId: authUser.uid,
        operatorName: membership.displayName,
        notes: `Unit pengganti diserahkan ke pelanggan (Tukar unit dari IMEI ${cleanOldImei})`,
        timestamp: now,
      };
      transaction.set(histNewRef, histNewData);

      // Synchronize with stock ledger:
      // Inbound quarantine return movement
      const movInRef = adminDb.collection(`businesses/${businessId}/stockMovements`).doc();
      const movInData: StockMovement = {
        id: movInRef.id,
        businessId,
        branchId,
        productId: oldUnitData.productId,
        productName: oldUnitData.productName,
        type: 'exchange',
        quantityDelta: 1,
        previousQty: 0,
        newQty: 1,
        referenceId: exchangeId,
        operatorId: authUser.uid,
        operatorName: membership.displayName,
        notes: `Unit lama IMEI ${cleanOldImei} masuk karantina (Ref: ${exchangeId})`,
        timestamp: now,
      };
      transaction.set(movInRef, movInData);

      // Outbound replacement movement
      const movOutRef = adminDb.collection(`businesses/${businessId}/stockMovements`).doc();
      const movOutData: StockMovement = {
        id: movOutRef.id,
        businessId,
        branchId,
        productId: newUnitData.productId,
        productName: newUnitData.productName,
        type: 'exchange',
        quantityDelta: -1,
        previousQty: 1,
        newQty: 0,
        referenceId: exchangeId,
        operatorId: authUser.uid,
        operatorName: membership.displayName,
        notes: `Unit pengganti IMEI ${cleanNewImei} diserahkan ke pelanggan (Ref: ${exchangeId})`,
        timestamp: now,
      };
      transaction.set(movOutRef, movOutData);

      // Update cash drawer if difference fee paid/refunded
      if (sessionDoc && sessionDoc.exists && sessionDoc.data()?.status === 'open') {
        const sData = sessionDoc.data();
        if (differenceFee > 0) {
          // Customer paid difference
          const currentCashSales = sData.cashSalesTotal || 0;
          const currentExpected = sData.expectedClosingCash || 0;
          transaction.update(sessionRef, {
            cashSalesTotal: currentCashSales + differenceFee,
            expectedClosingCash: currentExpected + differenceFee,
            updatedAt: now,
          });
        } else if (differenceFee < 0) {
          // Store refunded difference
          const refundAmt = Math.abs(differenceFee);
          const currentCashOut = sData.cashOutTotal || 0;
          const currentExpected = sData.expectedClosingCash || 0;
          transaction.update(sessionRef, {
            cashOutTotal: currentCashOut + refundAmt,
            expectedClosingCash: Math.max(0, currentExpected - refundAmt),
            updatedAt: now,
          });
        }
      }

      // Write permanent immutable audit log
      const auditRef = adminDb.collection(`businesses/${businessId}/auditLogs`).doc();
      transaction.set(auditRef, {
        id: auditRef.id,
        action: 'imei_exchange',
        businessId,
        branchId,
        referenceId: exchangeId,
        oldImei: cleanOldImei,
        newImei: cleanNewImei,
        reason,
        differenceFee,
        operatorId: authUser.uid,
        operatorName: membership.displayName,
        timestamp: now,
      });
    });

    return NextResponse.json({
      success: true,
      exchangeId,
      message: `Tukar unit berhasil diproses secara atomik di Cloud Firestore. (Ref: ${exchangeId})`
    });
  } catch (error: any) {
    if (error.message?.includes('tidak tersedia') || error.message?.includes('berakhir') || error.message?.includes('tidak memenuhi') || error.message?.includes('Dual-SIM') || error.message?.includes('cabang lain')) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }
    if (error.message?.includes('tidak ditemukan')) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 404 }
      );
    }
    return handleAuthApiError(error);
  }
}
