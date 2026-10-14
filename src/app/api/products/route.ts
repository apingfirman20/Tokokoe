import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Product } from "@/types";
import { requireAuthenticatedUser, requireBusinessPermission, handleAuthApiError } from "@/lib/server/auth-guard";
import { canReadCostPrice, sanitizeProductDtos } from "@/lib/server/cost-protection";

export const dynamic = "force-dynamic";

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

    // Require authoritative business membership and products.read permission
    const membership = await requireBusinessPermission(businessId, authUser.uid, "products.read");

    const productsSnap = await adminDb
      .collection(`businesses/${businessId}/products`)
      .get();

    const rawProducts = productsSnap.docs.map(
      doc => ({ id: doc.id, ...doc.data() } as Product)
    );

    // Authoritative Server-side HPP DTO protection:
    // Unauthorized roles (cashiers, waiters, kitchen) NEVER receive raw cost prices across the network.
    const allowedCost = canReadCostPrice(membership.role, membership.permissions);
    const sanitized = sanitizeProductDtos(rawProducts, allowedCost);

    return NextResponse.json({
      success: true,
      products: sanitized,
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
