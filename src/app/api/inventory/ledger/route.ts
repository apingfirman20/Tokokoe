import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { StockMovement } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

export async function GET(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);

    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json(
        { success: false, message: "Parameter businessId wajib diisi." },
        { status: 400 }
      );
    }

    // RBAC: Requires 'inventory.read' permission
    const membership = await requireBusinessPermission(businessId, authUser.uid, "inventory.read");

    const branchId = searchParams.get("branchId") || undefined;
    const productId = searchParams.get("productId") || undefined;
    const type = searchParams.get("type") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));

    let query = adminDb
      .collection(`businesses/${businessId}/stockMovements`)
      .orderBy("timestamp", "desc");

    if (branchId) {
      query = query.where("branchId", "==", branchId);
    }
    if (productId) {
      query = query.where("productId", "==", productId);
    }
    if (type) {
      query = query.where("type", "==", type);
    }

    const snapshot = await query.limit(500).get();
    let allMovements: StockMovement[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as StockMovement));

    // Branch scoping for staff restricted to specific branches
    if (membership.branchIds && membership.branchIds.length > 0 && !membership.branchIds.includes("*") && membership.role !== "owner" && membership.role !== "manager") {
      allMovements = allMovements.filter(m => membership.branchIds.includes(m.branchId));
    }

    const total = allMovements.length;
    let totalIn = 0;
    let totalOut = 0;
    let openingBalance = 0;

    for (const m of allMovements) {
      if (m.type === "opening_balance") {
        openingBalance += m.quantityDelta;
      } else if (m.quantityDelta > 0) {
        totalIn += m.quantityDelta;
      } else {
        totalOut += Math.abs(m.quantityDelta);
      }
    }

    const startIndex = (page - 1) * limit;
    const paginated = allMovements.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      success: true,
      movements: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      summary: {
        openingBalance,
        totalInbound: totalIn,
        totalOutbound: totalOut,
        netDelta: openingBalance + totalIn - totalOut,
        movementCount: total,
      },
      reconciliation: {
        openingBalance,
        totalInbound: totalIn,
        totalOutbound: totalOut,
        netDelta: openingBalance + totalIn - totalOut,
        movementCount: total,
      },
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
