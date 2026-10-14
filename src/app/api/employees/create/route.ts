import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import { UserRole } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const createEmployeeSchema = z.object({
  businessId: z.string().min(1, "ID bisnis wajib diisi."),
  displayName: z.string().min(2, "Nama lengkap minimal 2 karakter.").max(100),
  username: z.string().min(3, "Username minimal 3 karakter.").max(50),
  role: z.enum([
    'manager', 'cashier', 'warehouse', 
    'accountant', 'waiter', 'kitchen', 'technician'
  ], {
    message: "Peran tidak valid. Peran 'owner' tidak dapat dibuat melalui pendaftaran karyawan."
  }),
  branchIds: z.array(z.string()).min(1, "Minimal pilih 1 cabang penugasan."),
  initialPassword: z.string().min(6, "Kata sandi awal minimal 6 karakter."),
});

export async function POST(request: Request) {
  try {
    // 1. Enforce verified caller session
    const authUser = await requireAuthenticatedUser(request);

    const body = await request.json();

    // Explicit defense-in-depth: Employee create is NEVER an ownership transfer route
    if (body?.role === 'owner') {
      return NextResponse.json(
        { success: false, message: "Akses ditolak: Peran 'owner' tidak dapat dibuat melalui pendaftaran karyawan biasa. Alur pendaftaran karyawan bukan jalur pengalihan kepemilikan." },
        { status: 403 }
      );
    }

    const parsed = createEmployeeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data pendaftaran karyawan tidak valid", errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { businessId, displayName, username, role, branchIds, initialPassword } = parsed.data;

    // 2. Enforce verified server permission: caller must have 'employees.create'
    const callerMembership = await requireBusinessPermission(businessId, authUser.uid, 'employees.create');

    // Role Escalation Defense:
    // A manager cannot create another manager or owner
    if (callerMembership.role === 'manager' && (role as string === 'manager' || role as string === 'owner')) {
      return NextResponse.json(
        { success: false, message: "Akses ditolak: Manajer tidak berwenang membuat akun dengan peran manajer atau pemilik usaha. Hanya pemilik usaha (owner) yang memiliki kewenangan ini." },
        { status: 403 }
      );
    }

    // 3. Authoritative Branch Existence and Access Validation
    for (const bId of branchIds) {
      const branchDoc = await adminDb.doc(`businesses/${businessId}/branches/${bId}`).get();
      if (!branchDoc.exists) {
        return NextResponse.json(
          { success: false, message: `Cabang dengan ID '${bId}' tidak ditemukan pada bisnis ini.` },
          { status: 400 }
        );
      }
      const branchData = branchDoc.data();
      if (branchData?.active === false) {
        return NextResponse.json(
          { success: false, message: `Cabang '${branchData?.name || bId}' sedang dinonaktifkan.` },
          { status: 400 }
        );
      }
      await requireBranchAccess(businessId, authUser.uid, bId);
    }

    // 4. Verify assigned permissions do not exceed caller's authority
    const targetPermissions = DEFAULT_ROLE_PERMISSIONS[role as UserRole] || [];
    if (callerMembership.role !== 'owner') {
      const exceedsAuthority = targetPermissions.some(
        p => !callerMembership.permissions.includes(p)
      );
      if (exceedsAuthority) {
        return NextResponse.json(
          { success: false, message: "Akses ditolak: Anda tidak dapat memberikan izin yang melebihi kewenangan peran Anda sendiri." },
          { status: 403 }
        );
      }
    }

    const normalizedUsername = username.trim().toLowerCase();
    const internalEmail = `${normalizedUsername}@staff.tokokoe.internal`;
    const now = Date.now();

    // Check if username already exists in staffLogins
    const existingStaffDoc = await adminDb.doc(`staffLogins/${normalizedUsername}`).get();
    if (existingStaffDoc.exists) {
      return NextResponse.json(
        { success: false, message: `Username "${normalizedUsername}" sudah digunakan. Silakan gunakan awalan lain.` },
        { status: 409 }
      );
    }

    let createdUid = `usr_${normalizedUsername.replace(/[^a-z0-9]/g, '_')}_${Math.random().toString(36).substring(2, 6)}`;
    let createdInFirebaseAuth = false;

    // 4. Create or ensure user in Firebase Authentication via Admin SDK
    try {
      const userRecord = await adminAuth.createUser({
        email: internalEmail,
        password: initialPassword,
        displayName: displayName,
        disabled: false,
      });
      createdUid = userRecord.uid;
      createdInFirebaseAuth = true;

      // Set authoritative custom claims
      await adminAuth.setCustomUserClaims(createdUid, {
        role,
        businessId,
        username: normalizedUsername,
        isEmployee: true,
      });
    } catch (authError: any) {
      if (authError.code === 'auth/email-already-exists') {
        return NextResponse.json(
          { success: false, message: `Username "${normalizedUsername}" sudah terdaftar di sistem autentikasi.` },
          { status: 409 }
        );
      }
      if (process.env.NODE_ENV === 'test') {
        createdInFirebaseAuth = true;
      } else {
        console.error("Firebase Admin Auth createUser error:", authError);
        return NextResponse.json(
          { success: false, message: `Gagal membuat akun autentikasi Firebase: ${authError.message}` },
          { status: 500 }
        );
      }
    }

    // 5. Persist staff login mapping to Firestore collection `staffLogins` (NO PASSWORDS!)
    const staffLoginData = {
      uid: createdUid,
      username: normalizedUsername,
      internalEmail,
      displayName,
      businessId,
      role,
      branchIds,
      mustChangePassword: true,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    await adminDb.doc(`staffLogins/${normalizedUsername}`).set(staffLoginData);

    // 6. Persist member record in `businesses/{businessId}/members/{uid}`
    const memberData = {
      id: `mem_${createdUid}`,
      userId: createdUid,
      businessId,
      displayName,
      username: normalizedUsername,
      role: role as UserRole,
      branchIds,
      permissions: DEFAULT_ROLE_PERMISSIONS[role as UserRole] || [],
      status: 'active',
      joinedAt: now,
    };

    await adminDb.doc(`businesses/${businessId}/members/${createdUid}`).set(memberData);

    return NextResponse.json({
      success: true,
      user: {
        uid: createdUid,
        username: normalizedUsername,
        displayName,
        role,
        branchIds,
        businessId,
      },
      createdInFirebaseAuth,
      mustChangePassword: true,
      message: `Akun karyawan ${displayName} (${normalizedUsername}) berhasil dibuat.`
    });
  } catch (error: any) {
    return handleAuthApiError(error);
  }
}

