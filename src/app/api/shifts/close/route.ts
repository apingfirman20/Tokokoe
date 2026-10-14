import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { CashSession } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const closeShiftSchema = z.object({
  businessId: z.string().min(1, "businessId wajib diisi"),
  cashSessionId: z.string().min(1, "cashSessionId wajib diisi"),
  actualClosingCash: z.number().int("Uang kas aktual harus berupa bilangan bulat").nonnegative("Uang kas aktual tidak boleh negatif"),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const parsed = closeShiftSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data penutupan shift tidak valid" },
        { status: 400 }
      );
    }

    const { businessId, cashSessionId, actualClosingCash, notes } = parsed.data;

    // RBAC: Requires 'shift.manage'
    const membership = await requireBusinessPermission(businessId, authUser.uid, "shift.manage");

    const shiftRef = adminDb.doc(`businesses/${businessId}/cashSessions/${cashSessionId}`);
    const shiftSnap = await shiftRef.get();

    if (!shiftSnap.exists) {
      return NextResponse.json(
        { success: false, message: "Sesi kasir (shift) tidak ditemukan." },
        { status: 404 }
      );
    }

    const shiftData = shiftSnap.data() as CashSession;

    if (shiftData.status !== "open") {
      return NextResponse.json(
        { success: false, message: `Sesi kasir ini sudah ditutup sebelumnya pada ${new Date(shiftData.closedAt || 0).toLocaleString("id-ID")}.` },
        { status: 400 }
      );
    }

    // Cashier ownership policy: Only the cashier who opened or manager/owner can close the shift
    if (shiftData.cashierId !== authUser.uid && membership.role !== "owner" && membership.role !== "manager") {
      return NextResponse.json(
        { success: false, message: "Akses ditolak: Hanya kasir yang bersangkutan atau Manajer/Owner yang dapat menutup shift ini." },
        { status: 403 }
      );
    }

    const now = Date.now();
    const discrepancy = actualClosingCash - (shiftData.expectedClosingCash ?? 0);

    const closedUpdates = {
      status: "closed" as const,
      actualClosingCash,
      discrepancy,
      closedAt: now,
      closedBy: authUser.uid,
      closedByName: membership.displayName,
      notes: notes || shiftData.notes || "Shift Selesai Ditutup",
      updatedAt: now,
    };

    await shiftRef.update(closedUpdates);

    const closedShift: CashSession = {
      ...shiftData,
      ...closedUpdates,
    };

    // Record audit log
    const auditRef = adminDb.collection(`businesses/${businessId}/auditLogs`).doc();
    await auditRef.set({
      id: auditRef.id,
      action: "shift_closed",
      businessId,
      branchId: shiftData.branchId,
      shiftId: cashSessionId,
      openingCash: shiftData.openingCash,
      cashSalesTotal: shiftData.cashSalesTotal,
      expectedClosingCash: shiftData.expectedClosingCash,
      actualClosingCash,
      discrepancy,
      operatorId: authUser.uid,
      operatorName: membership.displayName,
      timestamp: now,
    });

    return NextResponse.json({
      success: true,
      shift: closedShift,
      reconciliation: {
        openingCash: shiftData.openingCash,
        cashSalesTotal: shiftData.cashSalesTotal,
        cashInTotal: shiftData.cashInTotal,
        cashOutTotal: shiftData.cashOutTotal,
        expectedClosingCash: shiftData.expectedClosingCash,
        actualClosingCash,
        discrepancy,
        isBalanced: discrepancy === 0,
      },
      message: `Shift kasir berhasil ditutup.${discrepancy !== 0 ? ` Terjadi selisih kas: Rp ${discrepancy.toLocaleString("id-ID")}.` : " Kas laci seimbang (0 selisih)."}`
    }, { status: 200 });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
