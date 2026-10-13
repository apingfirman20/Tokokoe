import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const reviewSchema = z.object({
  businessId: z.string().min(1),
  adjustmentId: z.string().min(1),
  action: z.enum(['approved', 'rejected']),
});

export async function POST(request: Request) {
  try {
    // 1. Enforce verified caller session
    const authUser = await requireAuthenticatedUser(request);

    const body = await request.json();
    const parsed = reviewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Parameter persetujuan tidak valid" },
        { status: 400 }
      );
    }

    const { businessId, adjustmentId, action } = parsed.data;

    // 2. Authoritative RBAC check: Caller must have 'approvals.manage' permission
    const membership = await requireBusinessPermission(businessId, authUser.uid, 'approvals.manage');

    const now = Date.now();
    let updatedProductStock = null;

    await adminDb.runTransaction(async (transaction) => {
      // 1. All reads first
      const adjRef = adminDb.doc(`businesses/${businessId}/stockAdjustments/${adjustmentId}`);
      const adjDoc = await transaction.get(adjRef);

      if (!adjDoc.exists) {
        throw new Error("Permintaan penyesuaian stok tidak ditemukan.");
      }

      const adjData = adjDoc.data();
      if (adjData?.status !== 'pending') {
        throw new Error(`Permintaan ini sudah diproses sebelumnya dengan status: ${adjData?.status}.`);
      }

      const prodRef = adminDb.doc(`businesses/${businessId}/products/${adjData.productId}`);
      const prodDoc = await transaction.get(prodRef);

      // Verify whether stock changed since the request was initiated
      if (prodDoc.exists) {
        const prodData = prodDoc.data();
        const currentStock = prodData?.stockQty ?? 0;
        if (currentStock !== adjData.previousQty) {
          throw new Error(`Stok fisik di sistem (${currentStock}) telah berubah dari nilai saat diajukan (${adjData.previousQty}). Silakan lakukan opname ulang.`);
        }
      }

      // 2. Writes
      if (action === 'approved') {
        if (prodDoc.exists) {
          transaction.update(prodRef, {
            stockQty: adjData.adjustedQty,
            updatedAt: now,
          });
          updatedProductStock = adjData.adjustedQty;
        }

        // Update adjustment document with authoritative reviewer identity
        transaction.update(adjRef, {
          status: 'approved',
          reviewedBy: authUser.uid,
          reviewedByName: membership.displayName,
          reviewedAt: now,
        });

        // Write permanent immutable audit log
        const auditRef = adminDb.collection(`businesses/${businessId}/auditLogs`).doc();
        transaction.set(auditRef, {
          id: auditRef.id,
          action: 'stock_adjustment_approved',
          businessId,
          targetId: adjData.productId,
          diff: adjData.diff,
          previousQty: adjData.previousQty,
          newQty: adjData.adjustedQty,
          reason: adjData.reason,
          operatorId: authUser.uid,
          operatorName: membership.displayName,
          timestamp: now,
        });

        // Write authoritative StockMovement record
        const movRef = adminDb.collection(`businesses/${businessId}/stockMovements`).doc();
        transaction.set(movRef, {
          id: movRef.id,
          businessId,
          branchId: adjData.branchId || 'br_main',
          productId: adjData.productId,
          productName: prodDoc.exists ? prodDoc.data()?.name : adjData.productId,
          type: 'adjustment',
          quantityDelta: adjData.diff,
          previousQty: adjData.previousQty,
          newQty: adjData.adjustedQty,
          referenceId: adjustmentId,
          operatorId: authUser.uid,
          operatorName: membership.displayName,
          notes: `Penyesuaian stok opname disetujui (Alasan: ${adjData.reason})`,
          timestamp: now,
        });
      } else {
        // Mark rejected
        transaction.update(adjRef, {
          status: 'rejected',
          reviewedBy: authUser.uid,
          reviewedByName: membership.displayName,
          reviewedAt: now,
        });

        // Write rejection audit log
        const auditRef = adminDb.collection(`businesses/${businessId}/auditLogs`).doc();
        transaction.set(auditRef, {
          id: auditRef.id,
          action: 'stock_adjustment_rejected',
          businessId,
          targetId: adjData.productId,
          reason: adjData.reason,
          operatorId: authUser.uid,
          operatorName: membership.displayName,
          timestamp: now,
        });
      }
    });

    return NextResponse.json({
      success: true,
      action,
      updatedProductStock,
      message: action === 'approved' 
        ? "Penyesuaian stok disetujui. Jumlah stok produk telah diperbarui secara otomatis."
        : "Permintaan penyesuaian stok ditolak."
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

