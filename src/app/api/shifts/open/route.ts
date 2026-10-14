import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { cleanUndefined } from "@/lib/utils";
import { CashSession } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const openShiftSchema = z.object({
  businessId: z.string().min(1, "businessId wajib diisi"),
  branchId: z.string().min(1, "branchId wajib diisi"),
  openingCash: z.number().int("Modal kas awal harus berupa bilangan bulat").nonnegative("Modal kas awal tidak boleh negatif"),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const parsed = openShiftSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data pembukaan shift tidak valid" },
        { status: 400 }
      );
    }

    const { businessId, branchId, openingCash, notes } = parsed.data;

    // RBAC: Requires 'shift.manage'
    const membership = await requireBusinessPermission(businessId, authUser.uid, "shift.manage");
    await requireBranchAccess(businessId, authUser.uid, branchId);

    // Policy Check: Cashier cannot have two open cash sessions simultaneously in this branch
    const existingOpenSnap = await adminDb
      .collection(`businesses/${businessId}/cashSessions`)
      .where("cashierId", "==", authUser.uid)
      .where("branchId", "==", branchId)
      .where("status", "==", "open")
      .limit(1)
      .get();

    if (!existingOpenSnap.empty) {
      const existing = existingOpenSnap.docs[0].data();
      return NextResponse.json(
        { 
          success: false, 
          message: `Kasir "${membership.displayName}" sudah memiliki sesi shift aktif (${existing.id}) di cabang ini. Tutup sesi sebelumnya sebelum membuka shift baru.` 
        },
        { status: 409 }
      );
    }

    const now = Date.now();
    const shiftId = `shift_${now}_${Math.random().toString(36).substring(2, 7)}`;

    const newShift: CashSession = {
      id: shiftId,
      businessId,
      branchId,
      cashierId: authUser.uid,
      cashierName: membership.displayName,
      openedAt: now,
      openingCash,
      cashSalesTotal: 0,
      cashInTotal: 0,
      cashOutTotal: 0,
      expectedClosingCash: openingCash,
      status: "open",
      notes: notes || "Shift Kasir Aktif",
    };

    await adminDb.doc(`businesses/${businessId}/cashSessions/${shiftId}`).set(cleanUndefined(newShift));

    // Record audit log
    const auditRef = adminDb.collection(`businesses/${businessId}/auditLogs`).doc();
    await auditRef.set({
      id: auditRef.id,
      action: "shift_opened",
      businessId,
      branchId,
      shiftId,
      openingCash,
      operatorId: authUser.uid,
      operatorName: membership.displayName,
      timestamp: now,
    });

    return NextResponse.json({
      success: true,
      shift: newShift,
      message: `Sesi kasir berhasil dibuka dengan modal awal Rp ${openingCash.toLocaleString("id-ID")}.`
    }, { status: 201 });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
