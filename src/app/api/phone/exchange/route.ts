import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { ImeiHistory } from "@/types";
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
  reason: z.string().min(3),
  differenceFee: z.number().int().default(0),
});

export async function POST(request: Request) {
  try {
    // 1. Enforce verified caller session
    const authUser = await requireAuthenticatedUser(request);

    const body = await request.json();
    const parsed = exchangeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data penukaran IMEI tidak valid" },
        { status: 400 }
      );
    }

    const { businessId, branchId, oldImei, newImei, reason, differenceFee } = parsed.data;

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

    // 4. Perform atomic transaction: Updates both units and writes immutable audit histories
    await adminDb.runTransaction(async (transaction) => {
      // ----------------------------------------------------
      // READS FIRST
      // ----------------------------------------------------
      // 1. Resolve and read old IMEI unit doc
      const oldRegRef = adminDb.doc(`businesses/${businessId}/registeredImeis/${cleanOldImei}`);
      const oldRegDoc = await transaction.get(oldRegRef);

      const oldUnitDocRef = oldRegDoc.exists && oldRegDoc.data()?.unitId
        ? adminDb.doc(`businesses/${businessId}/imeiUnits/${oldRegDoc.data()!.unitId}`)
        : adminDb.doc(`businesses/${businessId}/imeiUnits/${cleanOldImei}`);
      const oldUnitDoc = await transaction.get(oldUnitDocRef);

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

      const newUnitData = newUnitDoc.data();
      if (newUnitData?.status !== 'available') {
        throw new Error(`Unit IMEI pengganti ${cleanNewImei} sudah tidak tersedia (status: ${newUnitData?.status}).`);
      }

      // ----------------------------------------------------
      // WRITES SECOND
      // ----------------------------------------------------
      // Update old unit to quarantined (never directly available for sale)
      if (oldUnitDoc.exists) {
        transaction.update(oldUnitDocRef, {
          status: 'quarantined',
          notes: `Unit bermasalah ditukar: ${reason} (Ref: ${exchangeId})`,
          updatedAt: now,
        });
      }

      // Update replacement unit to sold
      transaction.update(newUnitDocRef, {
        status: 'sold',
        soldAtSaleId: exchangeId,
        notes: `Unit diserahkan menggantikan IMEI ${cleanOldImei} (Ref: ${exchangeId})`,
        updatedAt: now,
      });

      // Write IMEI history for old unit (exchanged_in / quarantined)
      const histOldRef = adminDb.collection(`businesses/${businessId}/imeiHistory`).doc();
      const histOldData: ImeiHistory = {
        id: histOldRef.id,
        businessId,
        imei: cleanOldImei,
        unitId: oldUnitDoc.exists ? oldUnitDoc.id : `unit_${cleanOldImei}`,
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

      // Write permanent immutable audit log
      const auditRef = adminDb.collection(`businesses/${businessId}/auditLogs`).doc();
      transaction.set(auditRef, {
        id: auditRef.id,
        action: 'imei_exchange',
        businessId,
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
    if (error.message?.includes('tidak tersedia') || error.message?.includes('tidak ditemukan')) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 409 }
      );
    }
    return handleAuthApiError(error);
  }
}
