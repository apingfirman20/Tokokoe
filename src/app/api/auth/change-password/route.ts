import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireAuthenticatedUser, requireBusinessPermission, handleAuthApiError } from "@/lib/server/auth-guard";

const changePasswordSchema = z.object({
  uid: z.string().min(1),
  username: z.string().min(1),
  newPassword: z.string().min(6, "Kata sandi baru minimal 6 karakter."),
  businessId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    // 1. Enforce session verification
    const authUser = await requireAuthenticatedUser(request);

    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data tidak valid" },
        { status: 400 }
      );
    }

    const { uid, username, newPassword, businessId } = parsed.data;
    const normalizedUsername = username.trim().toLowerCase();

    // 2. Authorization check: Users can only change their own password,
    // or an authorized manager/owner with 'employees.manage' permission can reset staff password.
    if (authUser.uid !== uid) {
      if (!businessId) {
        return NextResponse.json(
          { success: false, message: "Akses ditolak: businessId diperlukan untuk mereset kata sandi akun lain." },
          { status: 403 }
        );
      }
      await requireBusinessPermission(businessId, authUser.uid, "employees.manage");
    }

    // 3. Update password in Firebase Authentication exclusively
    await adminAuth.updateUser(uid, {
      password: newPassword,
    });

    // 4. Update mustChangePassword flag in Firestore mapping (NEVER store password or password hash)
    await adminDb.doc(`staffLogins/${normalizedUsername}`).set({
      mustChangePassword: false,
      updatedAt: Date.now(),
    }, { merge: true });

    return NextResponse.json({
      success: true,
      message: "Kata sandi berhasil diperbarui. Silakan gunakan kata sandi baru untuk masuk selanjutnya."
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

