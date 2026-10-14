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
    const paymentMethod = searchParams.get("paymentMethod") || undefined;
    const startDate = searchParams.get("startDate") ? Number(searchParams.get("startDate")) : undefined;
    const endDate = searchParams.get("endDate") ? Number(searchParams.get("endDate")) : undefined;
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    // Fetch sales from Firestore
    let salesQuery = adminDb
      .collection(`businesses/${businessId}/sales`)
      .orderBy("createdAt", "desc");

    if (branchId) {
      salesQuery = salesQuery.where("branchId", "==", branchId);
    } else if (membership.branchIds && membership.branchIds.length > 0 && !membership.branchIds.includes("*") && membership.role !== "owner" && membership.role !== "manager") {
      // Branch scoping for restricted staff
      if (membership.branchIds.length === 1) {
        salesQuery = salesQuery.where("branchId", "==", membership.branchIds[0]);
      }
    }

    if (paymentMethod) {
      salesQuery = salesQuery.where("paymentMethod", "==", paymentMethod);
    }

    if (startDate && !isNaN(startDate)) {
      salesQuery = salesQuery.where("createdAt", ">=", startDate);
    }
    if (endDate && !isNaN(endDate)) {
      salesQuery = salesQuery.where("createdAt", "<=", endDate);
    }

    const snapshot = await salesQuery.limit(500).get();
    let allSales: Sale[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Sale));

    // Optional text search filter
    if (search) {
      allSales = allSales.filter(s =>
        s.saleNumber?.toLowerCase().includes(search) ||
        s.cashierName?.toLowerCase().includes(search) ||
        s.customerName?.toLowerCase().includes(search)
      );
    }

    const total = allSales.length;
    const totalRevenue = allSales.reduce((acc, s) => acc + (s.grandTotal || 0), 0);
    const cashSales = allSales
      .filter(s => s.paymentMethod === "cash")
      .reduce((acc, s) => acc + (s.grandTotal || 0), 0);

    // Apply pagination
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
        totalRevenue,
        cashSales,
        totalSalesCount: total,
      },
    });
  } catch (error: any) {
    return handleAuthApiError(error);
  }
}
