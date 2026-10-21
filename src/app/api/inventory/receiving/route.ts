import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { StockMovement } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const receivingItemSchema = z.object({
  productId: z.string().min(1, "Product ID wajib diisi."),
  quantity: z.number().int().positive("Jumlah penerimaan harus bilangan bulat positif."),
  costPrice: z.number().int().nonnegative().optional(),
});

const receivingSchema = z.object({
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  supplierName: z.string().min(2, "Nama supplier wajib diisi minimal 2 karakter."),
  referenceNo: z.string().optional(),
  items: z.array(receivingItemSchema).min(1, "Daftar barang penerimaan tidak boleh kosong."),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const parsed = receivingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data penerimaan barang tidak valid." },
        { status: 400 }
      );
    }

    const { businessId, branchId, supplierName, referenceNo, items, notes } = parsed.data;

    // RBAC: require inventory.receive permission
    const membership = await requireBusinessPermission(businessId, authUser.uid, 'inventory.receive');
    await requireBranchAccess(businessId, authUser.uid, branchId);

    const now = Date.now();
    const docRefNo = referenceNo?.trim() || `RCV-${now}-${Math.floor(100 + Math.random() * 900)}`;

    const movementsCreated: StockMovement[] = [];

    await adminDb.runTransaction(async (transaction) => {
      movementsCreated.length = 0; // Prevent duplication on transaction retry

      // Read all product docs first
      const productDocs: Array<{ ref: any; data: any; item: typeof items[0] }> = [];
      for (const item of items) {
        const prodRef = adminDb.doc(`businesses/${businessId}/products/${item.productId}`);
        const prodDoc = await transaction.get(prodRef);

        if (!prodDoc.exists) {
          throw new Error(`Produk dengan ID "${item.productId}" tidak ditemukan di sistem.`);
        }

        const pData = prodDoc.data();
        if (pData?.businessId !== businessId) {
          throw new Error(`Produk "${item.productId}" bukan milik bisnis yang diakses.`);
        }

        productDocs.push({ ref: prodRef, data: pData, item });
      }

      // Write updates and stock ledger movements second
      for (const entry of productDocs) {
        const currentQty = entry.data.stockQty || 0;
        const newQty = currentQty + entry.item.quantity;

        const updatePayload: Record<string, any> = {
          stockQty: newQty,
          updatedAt: now,
        };
        if (entry.item.costPrice !== undefined && entry.item.costPrice >= 0) {
          updatePayload.costPrice = entry.item.costPrice;
        }

        transaction.update(entry.ref, updatePayload);

        const movRef = adminDb.collection(`businesses/${businessId}/stockMovements`).doc();
        const movData: StockMovement = {
          id: movRef.id,
          businessId,
          branchId,
          productId: entry.item.productId,
          productName: entry.data.name || 'Produk',
          type: 'purchase_order',
          quantityDelta: entry.item.quantity,
          previousQty: currentQty,
          newQty,
          referenceId: docRefNo,
          operatorId: authUser.uid,
          operatorName: membership.displayName,
          notes: `Penerimaan supplier ${supplierName}${notes ? ` - ${notes}` : ''}`,
          timestamp: now,
        };
        transaction.set(movRef, movData);
        movementsCreated.push(movData);
      }

      // Audit Log
      const auditRef = adminDb.collection(`businesses/${businessId}/auditLogs`).doc();
      transaction.set(auditRef, {
        id: auditRef.id,
        action: 'goods_receiving',
        businessId,
        branchId,
        referenceId: docRefNo,
        supplierName,
        itemCount: items.length,
        operatorId: authUser.uid,
        operatorName: membership.displayName,
        timestamp: now,
      });
    });

    return NextResponse.json({
      success: true,
      referenceNo: docRefNo,
      receivedCount: items.length,
      totalItemsReceived: items.reduce((sum, item) => sum + item.quantity, 0),
      movements: movementsCreated,
      message: `Penerimaan barang dari ${supplierName} (Ref: ${docRefNo}) berhasil dibukukan ke stock ledger.`,
    });
  } catch (error: any) {
    if (error.message?.includes('tidak ditemukan') || error.message?.includes('bukan milik')) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return handleAuthApiError(error);
  }
}
