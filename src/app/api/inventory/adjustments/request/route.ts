import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { cleanUndefined } from "@/lib/utils";
import { StockAdjustment, Product } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const requestAdjustmentSchema = z.object({
  businessId: z.string().min(1, "businessId wajib diisi"),
  branchId: z.string().min(1, "branchId wajib diisi"),
  productId: z.string().min(1, "productId wajib diisi"),
  productName: z.string().optional(),
  imei: z.string().optional(),
  previousQty: z.number().int("Stok sebelumnya harus berupa bilangan bulat"),
  adjustedQty: z.number().int("Stok penyesuaian harus berupa bilangan bulat").nonnegative("Stok penyesuaian tidak boleh negatif"),
  reason: z.string().trim().min(3, "Alasan penyesuaian minimal 3 karakter"),
});

export async function POST(request: Request) {
  try {
    // 1. Enforce verified caller session
    const authUser = await requireAuthenticatedUser(request);

    const body = await request.json();
    const parsed = requestAdjustmentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data penyesuaian stok tidak valid", errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // 2. Enforce verified permissions & branch access on the server
    const membership = await requireBusinessPermission(data.businessId, authUser.uid, "inventory.adjust");
    await requireBranchAccess(data.businessId, authUser.uid, data.branchId);

    // 3. Authoritative verification of product existence and current stock
    const prodRef = adminDb.doc(`businesses/${data.businessId}/products/${data.productId}`);
    const prodDoc = await prodRef.get();

    if (!prodDoc.exists) {
      return NextResponse.json(
        { success: false, message: `Produk dengan ID "${data.productId}" tidak ditemukan dalam sistem.` },
        { status: 404 }
      );
    }

    const prodData = prodDoc.data() as Product;
    if (prodData.isActive === false || prodData.available === false) {
      return NextResponse.json(
        { success: false, message: `Produk "${prodData.name}" sedang nonaktif atau diarsipkan.` },
        { status: 400 }
      );
    }

    // Check for stock discrepancy conflict (stale request prevention at inception)
    const currentStock = prodData.stockQty ?? 0;
    if (data.previousQty !== currentStock) {
      return NextResponse.json(
        { 
          success: false, 
          message: `Stok awal pada form penyesuaian (${data.previousQty}) tidak sesuai dengan stok sistem saat ini (${currentStock}). Silakan muat ulang data terbaru sebelum mengajukan opname.` 
        },
        { status: 409 }
      );
    }

    const now = Date.now();
    // Authoritative Server-Generated Request ID
    const adjustmentId = `adj_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const diff = data.adjustedQty - data.previousQty;

    const adjustment: StockAdjustment = {
      id: adjustmentId,
      businessId: data.businessId,
      branchId: data.branchId,
      productId: data.productId,
      productName: prodData.name || data.productName || "Produk",
      imei: data.imei,
      previousQty: data.previousQty,
      adjustedQty: data.adjustedQty,
      diff,
      reason: data.reason,
      // Authoritative identity from verified server token
      requestedBy: authUser.uid,
      requestedByName: membership.displayName,
      status: "pending",
      createdAt: now,
    };

    // Save pending request to Firestore without modifying product stock
    await adminDb.doc(`businesses/${data.businessId}/stockAdjustments/${adjustmentId}`).set(cleanUndefined(adjustment));

    return NextResponse.json({
      success: true,
      adjustment,
      message: "Permintaan penyesuaian stok berhasil diajukan dan menunggu persetujuan Manajer/Owner."
    }, { status: 201 });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
