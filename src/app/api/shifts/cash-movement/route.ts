import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { CashSession } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const cashMovementSchema = z.object({
  businessId: z.string().min(1, "businessId wajib diisi"),
  cashSessionId: z.string().min(1, "cashSessionId wajib diisi"),
  type: z.enum(["cash_in", "cash_out"]),
  amount: z.number().int("Nominal uang harus berupa bilangan bulat").positive("Nominal uang harus lebih dari 0"),
  reason: z.string().trim().min(3, "Alasan mutasi kas kasir minimal 3 karakter"),
});

export async function POST(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const parsed = cashMovementSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data mutasi kas laci tidak valid" },
        { status: 400 }
      );
    }

    const { businessId, cashSessionId, type, amount, reason } = parsed.data;

    // RBAC: Requires 'shift.manage'
    const membership = await requireBusinessPermission(businessId, authUser.uid, "shift.manage");

    const now = Date.now();
    const movementId = `mov_${now}_${Math.random().toString(36).substring(2, 6)}`;
    let updatedSession: CashSession | null = null;
    let notFound = false;
    let notOpen = false;

    await adminDb.runTransaction(async (transaction) => {
      const shiftRef = adminDb.doc(`businesses/${businessId}/cashSessions/${cashSessionId}`);
      const shiftDoc = await transaction.get(shiftRef);

      if (!shiftDoc.exists) {
        notFound = true;
        return;
      }

      const shiftData = shiftDoc.data() as CashSession;
      if (shiftData.status !== "open") {
        notOpen = true;
        return;
      }

      const newCashInTotal = type === "cash_in" 
        ? (shiftData.cashInTotal || 0) + amount 
        : (shiftData.cashInTotal || 0);

      const newCashOutTotal = type === "cash_out" 
        ? (shiftData.cashOutTotal || 0) + amount 
        : (shiftData.cashOutTotal || 0);

      const newExpectedClosingCash = type === "cash_in"
        ? shiftData.expectedClosingCash + amount
        : shiftData.expectedClosingCash - amount;

      const movementRecord = {
        id: movementId,
        type,
        amount,
        reason,
        operatorId: authUser.uid,
        operatorName: membership.displayName,
        timestamp: now,
      };

      const existingMovements = (shiftData as any).movements || [];
      const updatedMovements = [...existingMovements, movementRecord];

      transaction.update(shiftRef, {
        cashInTotal: newCashInTotal,
        cashOutTotal: newCashOutTotal,
        expectedClosingCash: newExpectedClosingCash,
        movements: updatedMovements,
        updatedAt: now,
      });

      updatedSession = {
        ...shiftData,
        cashInTotal: newCashInTotal,
        cashOutTotal: newCashOutTotal,
        expectedClosingCash: newExpectedClosingCash,
      };

      // Record immutable audit log
      const auditRef = adminDb.collection(`businesses/${businessId}/auditLogs`).doc();
      transaction.set(auditRef, {
        id: auditRef.id,
        action: type === "cash_in" ? "shift_cash_in" : "shift_cash_out",
        businessId,
        branchId: shiftData.branchId,
        shiftId: cashSessionId,
        amount,
        reason,
        operatorId: authUser.uid,
        operatorName: membership.displayName,
        timestamp: now,
      });
    });

    if (notFound) {
      return NextResponse.json(
        { success: false, message: "Sesi kasir (shift) tidak ditemukan." },
        { status: 404 }
      );
    }

    if (notOpen) {
      return NextResponse.json(
        { success: false, message: "Tidak dapat melakukan mutasi kas pada sesi shift yang sudah ditutup." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      shift: updatedSession,
      movementId,
      message: `Mutasi ${type === "cash_in" ? "Kas Masuk" : "Kas Keluar"} sebesar Rp ${amount.toLocaleString("id-ID")} berhasil dicatat.`
    }, { status: 200 });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
