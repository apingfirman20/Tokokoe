import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireAuthenticatedUser, requireBusinessPermission, handleAuthApiError, AuthError } from "@/lib/server/auth-guard";

const changePasswordSchema = z.object({
  uid: z.string().min(1, "UID pengguna target wajib diisi."),
  username: z.string().min(1, "Username wajib diisi."),
  newPassword: z.string().min(6, "Kata sandi baru minimal 6 karakter."),
  businessId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    // 1. Enforce verified caller session
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

    // 2. Resolve UID and username server-side against authoritative staffLogins
    const staffDoc = await adminDb.doc(`staffLogins/${normalizedUsername}`).get();

    if (authUser.uid === uid) {
      // ----------------------------------------------------------------------
      // SCENARIO 1: Self-Service Password Change
      // User can ONLY change their own password and modify their own mapping.
      // ----------------------------------------------------------------------
      if (staffDoc.exists) {
        const staffData = staffDoc.data();
        if (staffData?.uid !== authUser.uid) {
          throw new AuthError(403, "Akses ditolak: Username ini bukan milik akun Anda.");
        }
      }
    } else {
      // ----------------------------------------------------------------------
      // SCENARIO 2: Administrative Reset by Manager/Owner
      // Requires verified businessId, tenant membership, and role hierarchy limits.
      // ----------------------------------------------------------------------
      if (!businessId) {
        return NextResponse.json(
          { success: false, message: "Akses ditolak: businessId wajib disertakan untuk mereset kata sandi akun lain." },
          { status: 400 }
        );
      }

      // Check caller's permission in the specified business
      const callerMembership = await requireBusinessPermission(businessId, authUser.uid, "employees.manage");

      // Verify server-side staff mapping consistency
      if (staffDoc.exists) {
        const staffData = staffDoc.data();
        if (staffData?.uid !== uid) {
          return NextResponse.json(
            { success: false, message: "Inkonsistensi data: Username tidak cocok dengan UID target." },
            { status: 400 }
          );
        }
        if (staffData?.businessId !== businessId) {
          return NextResponse.json(
            { success: false, message: "Akses ditolak: Akun target tidak terdaftar pada unit bisnis ini (Cross-tenant reset blocked)." },
            { status: 403 }
          );
        }
      }

      // Verify target's membership in the target business
      const targetMemberDoc = await adminDb.doc(`businesses/${businessId}/members/${uid}`).get();
      if (!targetMemberDoc.exists) {
        return NextResponse.json(
          { success: false, message: "Akses ditolak: Akun target bukan merupakan anggota dari bisnis ini (Cross-tenant reset blocked)." },
          { status: 403 }
        );
      }

      const targetMemberData = targetMemberDoc.data();
      const targetRole = targetMemberData?.role;

      // Role boundary & escalation checks:
      // - No one can reset an owner's password via employee reset
      if (targetRole === 'owner') {
        return NextResponse.json(
          { success: false, message: "Akses ditolak: Kata sandi pemilik (owner) tidak dapat direset melalui jalur manajemen karyawan." },
          { status: 403 }
        );
      }

      // - A manager cannot reset another manager's password
      if (callerMembership.role === 'manager' && targetRole === 'manager') {
        return NextResponse.json(
          { success: false, message: "Akses ditolak: Manajer tidak berwenang mereset kata sandi sesama manajer." },
          { status: 403 }
        );
      }
    }

    // 3. Update password in Firebase Authentication exclusively
    await adminAuth.updateUser(uid, {
      password: newPassword,
    });

    // 4. Revoke active refresh tokens immediately to terminate existing stolen/stale sessions
    try {
      await adminAuth.revokeRefreshTokens(uid);
    } catch (revokeErr: any) {
      console.warn("Session revocation notice:", revokeErr?.message);
    }

    // 5. Update mustChangePassword flag in Firestore mapping (NEVER store password or hash)
    if (staffDoc.exists) {
      await adminDb.doc(`staffLogins/${normalizedUsername}`).set({
        mustChangePassword: false,
        updatedAt: Date.now(),
      }, { merge: true });
    }

    return NextResponse.json({
      success: true,
      message: "Kata sandi berhasil diperbarui dan sesi lama telah dicabut. Silakan masuk kembali."
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

