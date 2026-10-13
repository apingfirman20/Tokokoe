import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { cleanUndefined } from "@/lib/utils";
import { StockAdjustment } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const requestAdjustmentSchema = z.object({
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string().min(1),
  imei: z.string().optional(),
  previousQty: z.number().int(),
  adjustedQty: z.number().int().nonnegative(),
  reason: z.string().min(3),
});

export async function POST(request: Request) {
  try {
    // 1. Enforce verified caller session
    const authUser = await requireAuthenticatedUser(request);

    const body = await request.json();
    const parsed = requestAdjustmentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Data penyesuaian stok tidak valid", errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // 2. Enforce verified permissions & branch access on the server
    const membership = await requireBusinessPermission(data.businessId, authUser.uid, 'inventory.adjust');
    await requireBranchAccess(data.businessId, authUser.uid, data.branchId);

    const now = Date.now();
    const adjustmentId = `adj_${now}_${Math.random().toString(36).substring(2, 6)}`;
    const diff = data.adjustedQty - data.previousQty;

    const adjustment: StockAdjustment = {
      id: adjustmentId,
      businessId: data.businessId,
      branchId: data.branchId,
      productId: data.productId,
      productName: data.productName,
      imei: data.imei,
      previousQty: data.previousQty,
      adjustedQty: data.adjustedQty,
      diff,
      reason: data.reason,
      // Authoritative identity from verified server token
      requestedBy: authUser.uid,
      requestedByName: membership.displayName,
      status: 'pending',
      createdAt: now,
    };

    // Save to Firestore
    await adminDb.doc(`businesses/${data.businessId}/stockAdjustments/${adjustmentId}`).set(cleanUndefined(adjustment));

    return NextResponse.json({
      success: true,
      adjustment,
      message: "Permintaan penyesuaian stok berhasil diajukan dan menunggu persetujuan Pemilik (Owner)."
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

