import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { BusinessMember } from "@/types";
import { requireAuthenticatedUser, requireBusinessPermission, handleAuthApiError } from "@/lib/server/auth-guard";

export async function GET(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId");

    if (!businessId) {
      return NextResponse.json({ success: false, message: "Parameter businessId wajib diisi." }, { status: 400 });
    }

    // Require products.read or employees.create or basic membership
    await requireBusinessPermission(businessId, authUser.uid, "products.read");

    const membersSnap = await adminDb
      .collection(`businesses/${businessId}/members`)
      .get();

    const members = membersSnap.docs.map(
      d => ({ id: d.id, ...d.data() } as BusinessMember)
    );

    return NextResponse.json({
      success: true,
      members,
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
