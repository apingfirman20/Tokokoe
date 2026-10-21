import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { ServiceTicket, ServiceTicketStatus, StockMovement } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const createTicketSchema = z.object({
  action: z.literal('create'),
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  customerName: z.string().min(2, "Nama pelanggan servis wajib diisi."),
  customerPhone: z.string().min(5, "Nomor telepon pelanggan wajib diisi."),
  deviceModel: z.string().min(1, "Model perangkat wajib diisi."),
  imei: z.string().optional(),
  issueDescription: z.string().min(3, "Deskripsi kerusakan wajib diisi."),
  technicianId: z.string().optional(),
  technicianName: z.string().optional(),
  notes: z.string().optional(),
});

const updateStatusSchema = z.object({
  action: z.literal('update_status'),
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  ticketId: z.string().min(1),
  status: z.enum(['received', 'diagnosing', 'in_progress', 'ready', 'delivered', 'cancelled']),
  notes: z.string().optional(),
});

const addSparepartsSchema = z.object({
  action: z.literal('add_spareparts'),
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  ticketId: z.string().min(1),
  spareparts: z.array(z.object({
    productId: z.string().min(1),
    productName: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPrice: z.number().int().nonnegative(),
  })).min(1, "Minimal 1 sparepart harus disertakan."),
});

const settlePaymentSchema = z.object({
  action: z.literal('settle_payment'),
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  ticketId: z.string().min(1),
  laborFee: z.number().int().nonnegative(),
  paymentMethod: z.enum(['cash', 'transfer', 'midtrans_qris', 'qris']),
  cashSessionId: z.string().optional(),
});

const ticketActionSchema = z.discriminatedUnion('action', [
  createTicketSchema,
  updateStatusSchema,
  addSparepartsSchema,
  settlePaymentSchema,
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
      .collection(`businesses/${businessId}/serviceTickets`)
      .where('branchId', '==', branchId)
      .get();

    const tickets: ServiceTicket[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as Omit<ServiceTicket, 'id'>)
    }));

    tickets.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({
      success: true,
      count: tickets.length,
      tickets,
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const parsed = ticketActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Payload servis tidak valid." },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const { action, businessId, branchId } = data;

    const membership = await requireBusinessPermission(businessId, authUser.uid, 'sales.create');
    await requireBranchAccess(businessId, authUser.uid, branchId);

    const now = Date.now();

    if (action === 'create') {
      const ticketRef = adminDb.collection(`businesses/${businessId}/serviceTickets`).doc();
      const ticketNumber = `SRV-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const newTicket: ServiceTicket = {
        id: ticketRef.id,
        ticketNumber,
        businessId,
        branchId,
        customerName: data.customerName.trim(),
        customerPhone: data.customerPhone.trim(),
        deviceModel: data.deviceModel.trim(),
        imei: data.imei?.trim() || undefined,
        issueDescription: data.issueDescription.trim(),
        technicianId: data.technicianId || authUser.uid,
        technicianName: data.technicianName || membership.displayName,
        status: 'received',
        laborFee: 0,
        spareparts: [],
        totalFee: 0,
        isPaid: false,
        notes: data.notes,
        createdAt: now,
        updatedAt: now,
      };

      await ticketRef.set(newTicket);

      return NextResponse.json({
        success: true,
        ticket: newTicket,
        message: `Tiket servis ${ticketNumber} berhasil didaftarkan.`,
      });
    }

    if (action === 'update_status') {
      const ticketRef = adminDb.doc(`businesses/${businessId}/serviceTickets/${data.ticketId}`);
      await ticketRef.update({
        status: data.status,
        notes: data.notes || undefined,
        updatedAt: now,
      });

      return NextResponse.json({
        success: true,
        message: `Status tiket servis berhasil diubah menjadi "${data.status}".`,
      });
    }

    if (action === 'add_spareparts') {
      const ticketRef = adminDb.doc(`businesses/${businessId}/serviceTickets/${data.ticketId}`);
      let updatedTicket: ServiceTicket | null = null;

      await adminDb.runTransaction(async (transaction) => {
        const doc = await transaction.get(ticketRef);
        if (!doc.exists) {
          throw new Error("Tiket servis tidak ditemukan.");
        }
        const currentTicket = doc.data() as ServiceTicket;

        // Deduct stock for each sparepart product
        for (const sp of data.spareparts) {
          const prodRef = adminDb.doc(`businesses/${businessId}/products/${sp.productId}`);
          const prodDoc = await transaction.get(prodRef);
          if (prodDoc.exists && prodDoc.data()?.trackStock) {
            const currentStock = prodDoc.data()?.stockQty || 0;
            if (currentStock < sp.quantity) {
              throw new Error(`Stok sparepart "${sp.productName}" tidak mencukupi (tersisa ${currentStock}).`);
            }
            transaction.update(prodRef, {
              stockQty: currentStock - sp.quantity,
              updatedAt: now,
            });

            // Ledger movement
            const movRef = adminDb.collection(`businesses/${businessId}/stockMovements`).doc();
            transaction.set(movRef, {
              id: movRef.id,
              businessId,
              branchId,
              productId: sp.productId,
              productName: sp.productName,
              type: 'sale',
              quantityDelta: -sp.quantity,
              previousQty: currentStock,
              newQty: currentStock - sp.quantity,
              referenceId: currentTicket.ticketNumber,
              operatorId: authUser.uid,
              operatorName: membership.displayName,
              notes: `Penggunaan sparepart untuk tiket servis ${currentTicket.ticketNumber}`,
              timestamp: now,
            });
          }
        }

        const mergedSpareparts = [...currentTicket.spareparts, ...data.spareparts];
        const sparepartsTotal = mergedSpareparts.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        const totalFee = (currentTicket.laborFee || 0) + sparepartsTotal;

        transaction.update(ticketRef, {
          spareparts: mergedSpareparts,
          totalFee,
          updatedAt: now,
        });

        updatedTicket = { ...currentTicket, spareparts: mergedSpareparts, totalFee };
      });

      return NextResponse.json({
        success: true,
        ticket: updatedTicket,
        message: `Sparepart berhasil ditambahkan ke tiket servis.`,
      });
    }

    if (action === 'settle_payment') {
      const ticketRef = adminDb.doc(`businesses/${businessId}/serviceTickets/${data.ticketId}`);
      let settledTicket: ServiceTicket | null = null;

      await adminDb.runTransaction(async (transaction) => {
        const doc = await transaction.get(ticketRef);
        if (!doc.exists) {
          throw new Error("Tiket servis tidak ditemukan.");
        }
        const currentTicket = doc.data() as ServiceTicket;
        if (currentTicket.isPaid) {
          throw new Error("Tiket servis ini sudah dibayar lunas.");
        }

        const sparepartsTotal = currentTicket.spareparts.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        const totalFee = data.laborFee + sparepartsTotal;

        // If cash, update cash session
        if (data.paymentMethod === 'cash' && data.cashSessionId) {
          const sessionRef = adminDb.doc(`businesses/${businessId}/cashSessions/${data.cashSessionId}`);
          const sessionDoc = await transaction.get(sessionRef);
          if (sessionDoc.exists && sessionDoc.data()?.status === 'open') {
            const sData = sessionDoc.data();
            const currentDrawer = typeof sData?.currentCashDrawer === 'number' ? sData.currentCashDrawer : (sData?.expectedClosingCash || 0);
            transaction.update(sessionRef, {
              cashSalesTotal: ((sData?.cashSalesTotal as number) || 0) + totalFee,
              expectedClosingCash: ((sData?.expectedClosingCash as number) || 0) + totalFee,
              currentCashDrawer: currentDrawer + totalFee,
              updatedAt: now,
            });
          }
        }

        transaction.update(ticketRef, {
          laborFee: data.laborFee,
          totalFee,
          isPaid: true,
          paidAt: now,
          status: 'delivered',
          paymentMethod: data.paymentMethod,
          updatedAt: now,
        });

        settledTicket = {
          ...currentTicket,
          laborFee: data.laborFee,
          totalFee,
          isPaid: true,
          paidAt: now,
          status: 'delivered',
          paymentMethod: data.paymentMethod,
        };
      });

      return NextResponse.json({
        success: true,
        ticket: settledTicket,
        message: `Pembayaran servis ${(settledTicket as ServiceTicket | null)?.ticketNumber} sebesar Rp ${(settledTicket as ServiceTicket | null)?.totalFee?.toLocaleString('id-ID')} berhasil diselesaikan.`,
      });
    }

    return NextResponse.json({ success: false, message: "Aksi tidak dikenal." }, { status: 400 });
  } catch (error: any) {
    if (error.message?.includes('tidak mencukupi') || error.message?.includes('sudah dibayar')) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return handleAuthApiError(error);
  }
}
