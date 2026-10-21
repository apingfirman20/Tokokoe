import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { Sale, CartLineItem, TableItem, Business } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const cartItemSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  subtotal: z.number().int().nonnegative(),
  notes: z.string().optional(),
  selectedOptions: z.record(z.string(), z.string()).optional(),
  selectedModifiers: z.array(z.string()).optional(),
});

const openOrderSchema = z.object({
  action: z.literal('open'),
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  orderType: z.enum(['dine_in', 'takeaway']),
  tableId: z.string().optional(),
  tableNumber: z.string().optional(),
  customerName: z.string().optional(),
  lineItems: z.array(cartItemSchema).min(1, "Minimal 1 menu harus dipilih."),
  notes: z.string().optional(),
});

const addItemsSchema = z.object({
  action: z.literal('add_items'),
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  saleId: z.string().min(1),
  lineItems: z.array(cartItemSchema).min(1, "Daftar menu tambahan tidak boleh kosong."),
});

const cancelOrderSchema = z.object({
  action: z.literal('cancel'),
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  saleId: z.string().min(1),
  reason: z.string().min(3, "Alasan pembatalan pesanan wajib diisi minimal 3 karakter."),
});

const fnbOrderSchema = z.discriminatedUnion('action', [
  openOrderSchema,
  addItemsSchema,
  cancelOrderSchema,
]);

export async function POST(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const parsed = fnbOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Payload pesanan F&B tidak valid." },
        { status: 400 }
      );
    }

    const { action, businessId, branchId } = parsed.data;

    const membership = await requireBusinessPermission(businessId, authUser.uid, 'sales.create');
    await requireBranchAccess(businessId, authUser.uid, branchId);

    const now = Date.now();

    // 1. OPEN ORDER (DINE-IN / TAKEAWAY UNPAID OPEN BILL)
    if (action === 'open') {
      const { orderType, tableId, tableNumber, customerName, lineItems, notes } = parsed.data;

      // Fetch business profile to derive configurable tax & service charge
      const bizDoc = await adminDb.doc(`businesses/${businessId}`).get();
      const bizData = bizDoc.data() as Business | undefined;
      const taxRate = bizData?.taxRate !== undefined ? bizData.taxRate : 10; // PB1 default 10%
      const serviceRate = bizData?.serviceChargeRate !== undefined ? bizData.serviceChargeRate : 0;

      let createdSale: Sale | null = null;

      await adminDb.runTransaction(async (transaction) => {
        let resolvedTableNumber = tableNumber || '';
        let tableRef: FirebaseFirestore.DocumentReference | null = null;

        if (orderType === 'dine_in' && tableId) {
          tableRef = adminDb.doc(`businesses/${businessId}/tables/${tableId}`);
          const tblDoc = (await transaction.get(tableRef)) as FirebaseFirestore.DocumentSnapshot;

          if (!tblDoc.exists) {
            throw new Error("Meja tidak ditemukan di sistem.");
          }

          const tblData = tblDoc.data() as TableItem;
          if (tblData.status === 'occupied' && tblData.activeSaleId) {
            throw new Error(`Meja ${tblData.tableNumber} sedang terisi oleh pesanan lain (${tblData.activeSaleId}).`);
          }
          resolvedTableNumber = tblData.tableNumber;
        }

        const subtotal = lineItems.reduce((acc, item) => acc + item.subtotal, 0);
        const tax = Math.round((subtotal * taxRate) / 100);
        const serviceCharge = Math.round((subtotal * serviceRate) / 100);
        const grandTotal = subtotal + tax + serviceCharge;

        const saleRef = adminDb.collection(`businesses/${businessId}/sales`).doc();
        const saleNumber = `FNB-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

        const newSale: Sale = {
          id: saleRef.id,
          saleNumber,
          businessId,
          branchId,
          cashierId: authUser.uid,
          cashierName: membership.displayName,
          customerName: customerName?.trim() || undefined,
          orderType,
          tableId,
          tableNumber: resolvedTableNumber || undefined,
          lineItems,
          subtotal,
          discount: 0,
          tax,
          serviceCharge,
          grandTotal,
          paidAmount: 0,
          changeAmount: 0,
          paymentMethod: 'cash',
          paymentStatus: 'pending', // Open order is unpaid
          orderStatus: 'new', // Sent immediately to KDS
          createdAt: now,
          updatedAt: now,
        };

        transaction.set(saleRef, newSale);
        createdSale = newSale;

        // Occupy table if dine-in
        if (tableRef) {
          transaction.update(tableRef, {
            status: 'occupied',
            activeSaleId: saleRef.id,
            customerName: customerName?.trim() || '',
            updatedAt: now,
          });
        }
      });

      return NextResponse.json({
        success: true,
        sale: createdSale,
        message: `Pesanan meja ${(createdSale as Sale | null)?.tableNumber || 'Takeaway'} (Ref: ${(createdSale as Sale | null)?.saleNumber}) berhasil dibuka dan diteruskan ke dapur.`,
      });
    }

    // 2. ADD ITEMS TO EXISTING OPEN ORDER
    if (action === 'add_items') {
      const { saleId, lineItems: newItems } = parsed.data;
      const saleRef = adminDb.doc(`businesses/${businessId}/sales/${saleId}`);

      const bizDoc = await adminDb.doc(`businesses/${businessId}`).get();
      const bizData = bizDoc.data() as Business | undefined;
      const taxRate = bizData?.taxRate !== undefined ? bizData.taxRate : 10;
      const serviceRate = bizData?.serviceChargeRate !== undefined ? bizData.serviceChargeRate : 0;

      let updatedSaleResult: Sale | null = null;

      await adminDb.runTransaction(async (transaction) => {
        const doc = await transaction.get(saleRef);
        if (!doc.exists) {
          throw new Error("Tiket pesanan tidak ditemukan.");
        }
        const currentSale = doc.data() as Sale;

        if (currentSale.paymentStatus === 'paid') {
          throw new Error("Pesanan ini sudah dibayar lunas. Silakan buat pesanan baru untuk item tambahan.");
        }
        if (currentSale.paymentStatus === 'refunded') {
          throw new Error("Pesanan ini telah dibatalkan / direfund.");
        }

        // Merge line items preserving option/modifier uniqueness
        const mergedItems = [...currentSale.lineItems];
        for (const incoming of newItems) {
          const matchIdx = mergedItems.findIndex(existing => {
            const sameProduct = existing.productId === incoming.productId;
            const sameNotes = (existing.notes || '') === (incoming.notes || '');
            const sameOptions = JSON.stringify(existing.selectedOptions || {}) === JSON.stringify(incoming.selectedOptions || {});
            const sameModifiers = JSON.stringify(existing.selectedModifiers || []) === JSON.stringify(incoming.selectedModifiers || []);
            return sameProduct && sameNotes && sameOptions && sameModifiers;
          });

          if (matchIdx !== -1) {
            mergedItems[matchIdx].quantity += incoming.quantity;
            mergedItems[matchIdx].subtotal = mergedItems[matchIdx].quantity * mergedItems[matchIdx].unitPrice;
          } else {
            mergedItems.push(incoming);
          }
        }

        const subtotal = mergedItems.reduce((acc, item) => acc + item.subtotal, 0);
        const tax = Math.round((subtotal * taxRate) / 100);
        const serviceCharge = Math.round((subtotal * serviceRate) / 100);
        const grandTotal = subtotal + tax + serviceCharge;

        const updatedData: Partial<Sale> = {
          lineItems: mergedItems,
          subtotal,
          tax,
          serviceCharge,
          grandTotal,
          orderStatus: 'new', // Notify KDS of new additional items
          updatedAt: now,
        };

        transaction.update(saleRef, updatedData);
        updatedSaleResult = { ...currentSale, ...updatedData };
      });

      return NextResponse.json({
        success: true,
        sale: updatedSaleResult,
        message: `Berhasil menambahkan ${newItems.length} menu tambahan ke tiket ${(updatedSaleResult as Sale | null)?.saleNumber}.`,
      });
    }

    // 3. CANCEL UNPAID ORDER
    if (action === 'cancel') {
      const { saleId, reason } = parsed.data;
      const saleRef = adminDb.doc(`businesses/${businessId}/sales/${saleId}`);

      await adminDb.runTransaction(async (transaction) => {
        const doc = await transaction.get(saleRef);
        if (!doc.exists) {
          throw new Error("Tiket pesanan tidak ditemukan.");
        }
        const currentSale = doc.data() as Sale;

        if (currentSale.paymentStatus === 'paid') {
          throw new Error("Pesanan yang sudah dibayar lunas tidak dapat dibatalkan melalui cancel open order. Gunakan alur retur/refund.");
        }

        transaction.update(saleRef, {
          paymentStatus: 'failed',
          orderStatus: 'completed',
          refundReason: reason,
          updatedAt: now,
        });

        // Release table if dine-in
        if (currentSale.tableId) {
          const tblRef = adminDb.doc(`businesses/${businessId}/tables/${currentSale.tableId}`);
          const tblDoc = await transaction.get(tblRef);
          if (tblDoc.exists && tblDoc.data()?.activeSaleId === saleId) {
            transaction.update(tblRef, {
              status: 'available',
              activeSaleId: '',
              customerName: '',
              updatedAt: now,
            });
          }
        }

        // Audit log
        const auditRef = adminDb.collection(`businesses/${businessId}/auditLogs`).doc();
        transaction.set(auditRef, {
          id: auditRef.id,
          action: 'order_cancellation',
          businessId,
          branchId,
          referenceId: currentSale.saleNumber,
          saleId,
          reason,
          operatorId: authUser.uid,
          operatorName: membership.displayName,
          timestamp: now,
        });
      });

      return NextResponse.json({
        success: true,
        message: `Pesanan berhasil dibatalkan dan meja telah dikosongkan.`,
      });
    }

    return NextResponse.json({ success: false, message: "Aksi tidak dikenal." }, { status: 400 });
  } catch (error: any) {
    if (error.message?.includes('terisi') || error.message?.includes('tidak ditemukan') || error.message?.includes('sudah dibayar')) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return handleAuthApiError(error);
  }
}
