import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";
import { Sale } from "@/types";

export async function GET(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);

    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json(
        { success: false, message: "Parameter businessId wajib disertakan." },
        { status: 400 }
      );
    }

    // RBAC: Requires 'sales.read' permission
    const membership = await requireBusinessPermission(businessId, authUser.uid, "sales.read");

    const branchId = searchParams.get("branchId") || undefined;
    const cashierId = searchParams.get("cashierId") || undefined;
    const paymentMethod = searchParams.get("paymentMethod") || undefined;
    const paymentStatus = searchParams.get("paymentStatus") || undefined;
    const startDate = searchParams.get("startDate") ? Number(searchParams.get("startDate")) : undefined;
    const endDate = searchParams.get("endDate") ? Number(searchParams.get("endDate")) : undefined;
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const isCsvExport = searchParams.get("export") === "csv";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    // Fetch sales from Firestore
    let salesQuery = adminDb
      .collection(`businesses/${businessId}/sales`)
      .orderBy("createdAt", "desc");

    if (branchId) {
      salesQuery = salesQuery.where("branchId", "==", branchId);
    } else if (membership.branchIds && membership.branchIds.length > 0 && !membership.branchIds.includes("*") && membership.role !== "owner" && membership.role !== "manager") {
      // Scoping branch access for restricted staff
      if (membership.branchIds.length === 1) {
        salesQuery = salesQuery.where("branchId", "==", membership.branchIds[0]);
      }
    }

    if (paymentMethod) {
      salesQuery = salesQuery.where("paymentMethod", "==", paymentMethod);
    }

    if (paymentStatus) {
      salesQuery = salesQuery.where("paymentStatus", "==", paymentStatus);
    }

    if (cashierId) {
      salesQuery = salesQuery.where("cashierId", "==", cashierId);
    }

    if (startDate && !isNaN(startDate)) {
      salesQuery = salesQuery.where("createdAt", ">=", startDate);
    }
    if (endDate && !isNaN(endDate)) {
      salesQuery = salesQuery.where("createdAt", "<=", endDate);
    }

    const snapshot = await salesQuery.limit(1000).get();
    let allSales: Sale[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Sale));

    // In-memory text search filter for flexible multi-field queries
    if (search) {
      allSales = allSales.filter(s =>
        s.saleNumber?.toLowerCase().includes(search) ||
        s.cashierName?.toLowerCase().includes(search) ||
        s.customerName?.toLowerCase().includes(search)
      );
    }

    // Comprehensive financial breakdown separating payment lifecycles
    let paidRevenue = 0;
    let pendingRevenue = 0;
    let failedRevenue = 0;
    let cancelledRevenue = 0;
    let refundedTotal = 0;
    let totalCogs = 0;
    let cashSales = 0;
    let nonCashSales = 0;

    for (const s of allSales) {
      const gTotal = s.grandTotal || 0;
      // Protected historical cost price snapshot: ensures past profit never changes when catalog HPP updates
      const saleCogs = typeof s.cogsSnapshot === 'number'
        ? s.cogsSnapshot
        : (s.lineItems || []).reduce((acc, item) => acc + (item.costPriceSnapshot || 0) * item.quantity, 0);

      const status = s.paymentStatus || 'paid'; // legacy fallback

      if (status === 'paid') {
        paidRevenue += gTotal;
        totalCogs += saleCogs;
        if (s.paymentMethod === 'cash') {
          cashSales += gTotal;
        } else {
          nonCashSales += gTotal;
        }
      } else if (status === 'pending') {
        pendingRevenue += gTotal;
      } else if (status === 'failed') {
        failedRevenue += gTotal;
      } else if (status === 'cancelled') {
        cancelledRevenue += gTotal;
      } else if (status === 'refunded') {
        refundedTotal += gTotal;
      }
    }

    const grossRevenue = paidRevenue + refundedTotal;
    const netRevenue = paidRevenue; // Net settled revenue after refunds
    const grossProfit = netRevenue - totalCogs;
    const profitMarginPercent = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 100) : 0;

    // Reconciliation of actual cash drawer:
    // ATURAN LAPORAN: Hanya menjumlahkan sesi kasir yang SEDANG TERBUKA (status == 'open')
    // Jangan pernah menjumlahkan seluruh riwayat shift historis yang sudah ditutup!
    let openShiftsQuery = adminDb
      .collection(`businesses/${businessId}/cashSessions`)
      .where("status", "==", "open");

    if (branchId) {
      openShiftsQuery = openShiftsQuery.where("branchId", "==", branchId);
    }

    const openShiftsSnap = await openShiftsQuery.get();
    const currentCashDrawer = openShiftsSnap.docs.reduce((sum, doc) => {
      const d = doc.data();
      const drawer = typeof d.currentCashDrawer === 'number'
        ? d.currentCashDrawer
        : (d.expectedClosingCash ?? d.openingCash ?? 0);
      return sum + drawer;
    }, 0);

    // CSV Export Mode
    if (isCsvExport) {
      const headers = [
        "Nomor Transaksi",
        "Waktu Transaksi",
        "Cabang ID",
        "Nama Kasir",
        "Pelanggan",
        "Tipe Pesanan",
        "Metode Pembayaran",
        "Status Pembayaran",
        "Subtotal (Rp)",
        "Diskon (Rp)",
        "Pajak (Rp)",
        "Service (Rp)",
        "Grand Total (Rp)",
        "HPP Historis (Rp)",
        "Laba Kotor (Rp)",
      ];

      const csvRows = [headers.join(",")];

      for (const s of allSales) {
        const saleCogs = typeof s.cogsSnapshot === 'number'
          ? s.cogsSnapshot
          : (s.lineItems || []).reduce((acc, item) => acc + (item.costPriceSnapshot || 0) * item.quantity, 0);
        const saleProfit = (s.grandTotal || 0) - saleCogs;
        const row = [
          `"${s.saleNumber}"`,
          `"${new Date(s.createdAt).toISOString()}"`,
          `"${s.branchId}"`,
          `"${s.cashierName || ''}"`,
          `"${s.customerName || 'Umum'}"`,
          `"${s.orderType}"`,
          `"${s.paymentMethod}"`,
          `"${s.paymentStatus || 'paid'}"`,
          s.subtotal,
          s.discount || 0,
          s.tax || 0,
          s.serviceCharge || 0,
          s.grandTotal,
          saleCogs,
          saleProfit,
        ];
        csvRows.push(row.join(","));
      }

      const csvContent = "\uFEFF" + csvRows.join("\r\n");
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="laporan-penjualan-${businessId}-${Date.now()}.csv"`,
        },
      });
    }

    // Paginated JSON response
    const total = allSales.length;
    const startIndex = (page - 1) * limit;
    const paginatedSales = allSales.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      success: true,
      sales: paginatedSales,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      summary: {
        // Omset & Revenue separation
        grossRevenue,
        paidRevenue,
        pendingRevenue,
        failedRevenue,
        cancelledRevenue,
        refundedTotal,
        netRevenue,
        totalRevenue: netRevenue, // alias for backwards compatibility
        // Protected Cost & Profit
        totalCogs,
        grossProfit,
        profitMarginPercent,
        // Payment breakdown
        cashSales,
        nonCashSales,
        currentCashDrawer,
        totalSalesCount: total,
        paidCount: allSales.filter(s => (s.paymentStatus || 'paid') === 'paid').length,
        pendingCount: allSales.filter(s => s.paymentStatus === 'pending').length,
        refundedCount: allSales.filter(s => s.paymentStatus === 'refunded').length,
      },
    });
  } catch (error: any) {
    return handleAuthApiError(error);
  }
}
