import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { TableItem, Sale } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const createTableSchema = z.object({
  action: z.literal('create'),
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  tableNumber: z.string().min(1, "Nomor meja wajib diisi."),
  capacity: z.number().int().positive().default(4),
});

const updateStatusSchema = z.object({
  action: z.literal('update_status'),
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  tableId: z.string().min(1),
  status: z.enum(['available', 'occupied', 'reserved']),
  customerName: z.string().optional(),
  activeSaleId: z.string().optional(),
});

const moveTableSchema = z.object({
  action: z.literal('move_table'),
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  fromTableId: z.string().min(1),
  toTableId: z.string().min(1),
});

const mergeTablesSchema = z.object({
  action: z.literal('merge_tables'),
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  fromTableId: z.string().min(1),
  targetTableId: z.string().min(1),
});

const deleteTableSchema = z.object({
  action: z.literal('delete'),
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  tableId: z.string().min(1),
});

const tableActionSchema = z.discriminatedUnion('action', [
  createTableSchema,
  updateStatusSchema,
  moveTableSchema,
  mergeTablesSchema,
  deleteTableSchema,
]);

export async function GET(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const branchId = searchParams.get('branchId');

    if (!businessId || !branchId) {
      return NextResponse.json(
        { success: false, message: "Parameter businessId dan branchId wajib diisi." },
        { status: 400 }
      );
    }

    await requireBusinessPermission(businessId, authUser.uid, 'sales.read');
    await requireBranchAccess(businessId, authUser.uid, branchId);

    const snapshot = await adminDb
      .collection(`businesses/${businessId}/tables`)
      .where('branchId', '==', branchId)
      .get();

    const tables: TableItem[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as Omit<TableItem, 'id'>)
    }));

    // Natural sort by table number
    tables.sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true }));

    return NextResponse.json({
      success: true,
      tables,
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const parsed = tableActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Payload aksi meja tidak valid." },
        { status: 400 }
      );
    }

    const { action, businessId, branchId } = parsed.data;

    // Permissions: sales.create for managing tables/order assignment
    const membership = await requireBusinessPermission(businessId, authUser.uid, 'sales.create');
    await requireBranchAccess(businessId, authUser.uid, branchId);

    const now = Date.now();

    if (action === 'create') {
      const { tableNumber, capacity } = parsed.data;
      // Check duplicate table number in branch
      const existing = await adminDb
        .collection(`businesses/${businessId}/tables`)
        .where('branchId', '==', branchId)
        .where('tableNumber', '==', tableNumber.trim())
        .get();

      if (!existing.empty) {
        return NextResponse.json(
          { success: false, message: `Meja dengan nomor "${tableNumber}" sudah ada di cabang ini.` },
          { status: 409 }
        );
      }

      const tableRef = adminDb.collection(`businesses/${businessId}/tables`).doc();
      const newTable: TableItem = {
        id: tableRef.id,
        businessId,
        branchId,
        tableNumber: tableNumber.trim(),
        capacity,
        status: 'available',
      };
      await tableRef.set(newTable);

      return NextResponse.json({
        success: true,
        table: newTable,
        message: `Meja ${newTable.tableNumber} berhasil didaftarkan.`,
      });
    }

    if (action === 'update_status') {
      const { tableId, status, customerName, activeSaleId } = parsed.data;
      const tableRef = adminDb.doc(`businesses/${businessId}/tables/${tableId}`);

      await adminDb.runTransaction(async (transaction) => {
        const doc = await transaction.get(tableRef);
        if (!doc.exists) {
          throw new Error("Meja tidak ditemukan di sistem.");
        }
        const currentData = doc.data() as TableItem;

        // Prevent overwriting occupied table active order without explicit action
        if (status === 'occupied' && currentData.status === 'occupied' && currentData.activeSaleId && currentData.activeSaleId !== activeSaleId) {
          throw new Error(`Meja ${currentData.tableNumber} sedang terisi oleh transaksi lain (${currentData.activeSaleId}). Selesaikan atau pindahkan meja terlebih dahulu.`);
        }

        const updateData: Record<string, any> = {
          status,
          updatedAt: now,
        };
        if (customerName !== undefined) updateData.customerName = customerName;
        if (activeSaleId !== undefined) updateData.activeSaleId = activeSaleId;
        if (status === 'available') {
          updateData.customerName = '';
          updateData.activeSaleId = '';
        }

        transaction.update(tableRef, updateData);
      });

      return NextResponse.json({
        success: true,
        message: `Status meja berhasil diperbarui menjadi ${status}.`,
      });
    }

    if (action === 'move_table') {
      const { fromTableId, toTableId } = parsed.data;
      if (fromTableId === toTableId) {
        return NextResponse.json(
          { success: false, message: "Meja asal dan meja tujuan tidak boleh sama." },
          { status: 400 }
        );
      }

      const fromRef = adminDb.doc(`businesses/${businessId}/tables/${fromTableId}`);
      const toRef = adminDb.doc(`businesses/${businessId}/tables/${toTableId}`);

      await adminDb.runTransaction(async (transaction) => {
        const fromDoc = await transaction.get(fromRef);
        const toDoc = await transaction.get(toRef);

        if (!fromDoc.exists || !toDoc.exists) {
          throw new Error("Satu atau kedua meja tidak ditemukan.");
        }

        const fromData = fromDoc.data() as TableItem;
        const toData = toDoc.data() as TableItem;

        if (toData.status === 'occupied') {
          throw new Error(`Meja tujuan (${toData.tableNumber}) sedang terisi pelanggan lain.`);
        }

        const activeSaleId = fromData.activeSaleId;
        const customerName = fromData.customerName || '';

        // Transfer order to new table
        transaction.update(toRef, {
          status: 'occupied',
          activeSaleId: activeSaleId || '',
          customerName,
          updatedAt: now,
        });

        // Release old table
        transaction.update(fromRef, {
          status: 'available',
          activeSaleId: '',
          customerName: '',
          updatedAt: now,
        });

        // Update Sale document table reference if sale exists
        if (activeSaleId) {
          const saleRef = adminDb.doc(`businesses/${businessId}/sales/${activeSaleId}`);
          transaction.update(saleRef, {
            tableNumber: toData.tableNumber,
            tableId: toTableId,
            updatedAt: now,
          });
        }
      });

      return NextResponse.json({
        success: true,
        message: `Pesanan berhasil dipindahkan ke meja tujuan.`,
      });
    }

    if (action === 'merge_tables') {
      const { fromTableId, targetTableId } = parsed.data;
      if (fromTableId === targetTableId) {
        return NextResponse.json(
          { success: false, message: "Meja yang digabungkan tidak boleh sama." },
          { status: 400 }
        );
      }

      const fromRef = adminDb.doc(`businesses/${businessId}/tables/${fromTableId}`);
      const targetRef = adminDb.doc(`businesses/${businessId}/tables/${targetTableId}`);

      await adminDb.runTransaction(async (transaction) => {
        const fromDoc = await transaction.get(fromRef);
        const targetDoc = await transaction.get(targetRef);

        if (!fromDoc.exists || !targetDoc.exists) {
          throw new Error("Satu atau kedua meja tidak ditemukan.");
        }

        const fromData = fromDoc.data() as TableItem;
        const targetData = targetDoc.data() as TableItem;

        // If fromTable has active sale, merge line items into targetTable sale
        if (fromData.activeSaleId && targetData.activeSaleId && fromData.activeSaleId !== targetData.activeSaleId) {
          const fromSaleRef = adminDb.doc(`businesses/${businessId}/sales/${fromData.activeSaleId}`);
          const targetSaleRef = adminDb.doc(`businesses/${businessId}/sales/${targetData.activeSaleId}`);

          const fromSaleDoc = await transaction.get(fromSaleRef);
          const targetSaleDoc = await transaction.get(targetSaleRef);

          if (fromSaleDoc.exists && targetSaleDoc.exists) {
            const fromSale = fromSaleDoc.data() as Sale;
            const targetSale = targetSaleDoc.data() as Sale;

            const mergedLineItems = [...targetSale.lineItems, ...fromSale.lineItems];
            const mergedSubtotal = mergedLineItems.reduce((acc, item) => acc + item.subtotal, 0);
            const mergedGrandTotal = mergedSubtotal + targetSale.tax + targetSale.serviceCharge;

            transaction.update(targetSaleRef, {
              lineItems: mergedLineItems,
              subtotal: mergedSubtotal,
              grandTotal: mergedGrandTotal,
              notes: `${targetSale.customerName || ''} [Gabungan dari ${fromData.tableNumber}]`,
              updatedAt: now,
            });

            // Mark fromSale as cancelled / merged
            transaction.update(fromSaleRef, {
              orderStatus: 'completed',
              paymentStatus: 'failed',
              notes: `Digabungkan ke meja ${targetData.tableNumber} (Ref: ${targetSale.saleNumber})`,
              updatedAt: now,
            });
          }
        }

        // Release fromTable
        transaction.update(fromRef, {
          status: 'available',
          activeSaleId: '',
          customerName: '',
          updatedAt: now,
        });

        // Ensure targetTable is occupied
        transaction.update(targetRef, {
          status: 'occupied',
          updatedAt: now,
        });
      });

      return NextResponse.json({
        success: true,
        message: `Meja berhasil digabungkan.`,
      });
    }

    if (action === 'delete') {
      const { tableId } = parsed.data;
      const tableRef = adminDb.doc(`businesses/${businessId}/tables/${tableId}`);

      const doc = await tableRef.get();
      if (!doc.exists) {
        return NextResponse.json(
          { success: false, message: "Meja tidak ditemukan." },
          { status: 404 }
        );
      }

      if (doc.data()?.status === 'occupied') {
        return NextResponse.json(
          { success: false, message: "Meja yang sedang terisi tidak dapat dihapus." },
          { status: 400 }
        );
      }

      await tableRef.delete();
      return NextResponse.json({
        success: true,
        message: "Meja berhasil dihapus.",
      });
    }

    return NextResponse.json({ success: false, message: "Aksi tidak dikenal." }, { status: 400 });
  } catch (error: any) {
    if (error.message?.includes('terisi') || error.message?.includes('tidak ditemukan')) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return handleAuthApiError(error);
  }
}
