import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { StockMovement } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const reviewSchema = z.object({
  businessId: z.string().min(1, "businessId wajib diisi"),
  adjustmentId: z.string().min(1, "adjustmentId wajib diisi"),
  action: z.enum(["approved", "rejected"]),
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

    // 2. Authoritative RBAC check: Caller must have 'approvals.manage' permission (Owner/Manager)
    const membership = await requireBusinessPermission(businessId, authUser.uid, "approvals.manage");

    const now = Date.now();
    let updatedProductStock: number | null = null;
    let conflictErrorMsg: string | null = null;
    let notFound = false;
    let alreadyProcessed = false;
    let currentStatus = "";

    await adminDb.runTransaction(async (transaction) => {
      // 1. All reads first
      const adjRef = adminDb.doc(`businesses/${businessId}/stockAdjustments/${adjustmentId}`);
      const adjDoc = await transaction.get(adjRef);

      if (!adjDoc.exists) {
        notFound = true;
        return;
      }

      const adjData = adjDoc.data();
      if (adjData?.status !== "pending") {
        alreadyProcessed = true;
        currentStatus = adjData?.status || "unknown";
        return;
      }

      const prodRef = adminDb.doc(`businesses/${businessId}/products/${adjData.productId}`);
      const prodDoc = await transaction.get(prodRef);

      // Verify whether stock changed since the request was initiated (Stale Request Detection)
      if (action === "approved" && prodDoc.exists) {
        const prodData = prodDoc.data();
        const currentStock = prodData?.stockQty ?? 0;
        if (currentStock !== adjData.previousQty) {
          conflictErrorMsg = `Stok sistem produk (${currentStock}) telah berubah dari nilai saat diajukan (${adjData.previousQty}) karena adanya penjualan atau pergerakan stok lainnya. Permintaan ini sudah kedaluwarsa (stale) dan tidak dapat disetujui. Silakan tolak atau lakukan opname ulang.`;
          return;
        }
      }

      // 2. Writes second
      if (action === "approved") {
        if (prodDoc.exists) {
          transaction.update(prodRef, {
            stockQty: adjData.adjustedQty,
            updatedAt: now,
          });
          updatedProductStock = adjData.adjustedQty;
        }

        // Update adjustment document with authoritative reviewer identity
        transaction.update(adjRef, {
          status: "approved",
          reviewedBy: authUser.uid,
          reviewedByName: membership.displayName,
          reviewedAt: now,
        });

        // Write permanent immutable audit log
        const auditRef = adminDb.collection(`businesses/${businessId}/auditLogs`).doc();
        transaction.set(auditRef, {
          id: auditRef.id,
          action: "stock_adjustment_approved",
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

        // Write authoritative StockMovement record in stock ledger
        const movRef = adminDb.collection(`businesses/${businessId}/stockMovements`).doc();
        const movData: StockMovement = {
          id: movRef.id,
          businessId,
          branchId: adjData.branchId || "br_main",
          productId: adjData.productId,
          productName: prodDoc.exists ? (prodDoc.data()?.name || adjData.productId) : adjData.productId,
          type: "adjustment",
          quantityDelta: adjData.diff,
          previousQty: adjData.previousQty,
          newQty: adjData.adjustedQty,
          referenceId: adjustmentId,
          operatorId: authUser.uid,
          operatorName: membership.displayName,
          notes: `Penyesuaian stok opname disetujui (Alasan: ${adjData.reason})`,
          timestamp: now,
        };
        transaction.set(movRef, movData);
      } else {
        // Rejection: Can reject even if stale without altering product stock!
        transaction.update(adjRef, {
          status: "rejected",
          reviewedBy: authUser.uid,
          reviewedByName: membership.displayName,
          reviewedAt: now,
        });

        // Write rejection audit log
        const auditRef = adminDb.collection(`businesses/${businessId}/auditLogs`).doc();
        transaction.set(auditRef, {
          id: auditRef.id,
          action: "stock_adjustment_rejected",
          businessId,
          targetId: adjData.productId,
          reason: adjData.reason,
          operatorId: authUser.uid,
          operatorName: membership.displayName,
          timestamp: now,
        });
      }
    });

    if (notFound) {
      return NextResponse.json(
        { success: false, message: "Permintaan penyesuaian stok tidak ditemukan." },
        { status: 404 }
      );
    }

    if (alreadyProcessed) {
      return NextResponse.json(
        { success: false, message: `Permintaan ini sudah diproses sebelumnya dengan status: ${currentStatus}.` },
        { status: 400 }
      );
    }

    if (conflictErrorMsg) {
      return NextResponse.json(
        { success: false, message: conflictErrorMsg },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      action,
      adjustment: {
        id: adjustmentId,
        status: action,
        reviewedBy: authUser.uid,
        reviewedByName: membership.displayName,
        reviewedAt: now,
      },
      updatedProductStock,
      message: action === "approved" 
        ? "Penyesuaian stok disetujui. Jumlah stok produk telah diperbarui secara otomatis di stock ledger."
        : "Permintaan penyesuaian stok ditolak."
    }, { status: 200 });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
