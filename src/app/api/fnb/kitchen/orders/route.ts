import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { Sale, KitchenOrderStatus } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const updateKdsStatusSchema = z.object({
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  saleId: z.string().min(1),
  orderStatus: z.enum(['waiting_cashier', 'new', 'preparing', 'ready', 'served', 'completed']),
  paymentStatus: z.enum(['paid', 'pending', 'failed', 'cancelled', 'refunded']).optional(),
  paidAmount: z.number().optional(),
  changeAmount: z.number().optional(),
});

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

    // Fetch all active orders for the kitchen (no artificial 50 limit)
    // Active orders are in status 'new', 'preparing', 'ready', or 'served'
    const snapshot = await adminDb
      .collection(`businesses/${businessId}/sales`)
      .where('branchId', '==', branchId)
      .where('orderStatus', 'in', ['new', 'preparing', 'ready', 'served'])
      .get();

    const activeTickets: Sale[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data() as Omit<Sale, 'id'> & { paymentStatus?: string };
      if (data.paymentStatus !== 'refunded') {
        activeTickets.push({
          id: doc.id,
          ...data,
        } as Sale);
      }
    }

    // Sort by createdAt ascending (FIFO: older orders first)
    activeTickets.sort((a, b) => a.createdAt - b.createdAt);

    return NextResponse.json({
      success: true,
      count: activeTickets.length,
      orders: activeTickets,
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const parsed = updateKdsStatusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Payload status KDS tidak valid." },
        { status: 400 }
      );
    }

    const { businessId, branchId, saleId, orderStatus } = parsed.data;

    // Kitchen or cashier roles can update kitchen ticket status
    const membership = await requireBusinessPermission(businessId, authUser.uid, 'sales.read');
    await requireBranchAccess(businessId, authUser.uid, branchId);

    const saleRef = adminDb.doc(`businesses/${businessId}/sales/${saleId}`);
    const saleDoc = await saleRef.get();

    if (!saleDoc.exists) {
      return NextResponse.json(
        { success: false, message: "Tiket pesanan tidak ditemukan di sistem." },
        { status: 404 }
      );
    }

    const currentSale = saleDoc.data() as Sale;
    if (currentSale.businessId !== businessId || currentSale.branchId !== branchId) {
      return NextResponse.json(
        { success: false, message: "Tiket tidak cocok dengan tenant atau cabang yang diakses." },
        { status: 403 }
      );
    }

    const now = Date.now();

    const updateData: Record<string, any> = {
      orderStatus,
      updatedAt: now,
    };

    if (parsed.data.paymentStatus) {
      updateData.paymentStatus = parsed.data.paymentStatus;
      if (parsed.data.paidAmount !== undefined) {
        updateData.paidAmount = parsed.data.paidAmount;
        updateData.changeAmount = parsed.data.changeAmount !== undefined
          ? parsed.data.changeAmount
          : Math.max(0, parsed.data.paidAmount - currentSale.grandTotal);
      }
    }

    await saleRef.update(updateData);

    return NextResponse.json({
      success: true,
      saleId,
      orderStatus,
      message: `Status dapur untuk tiket ${currentSale.saleNumber} berhasil diubah menjadi "${orderStatus}".`,
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
