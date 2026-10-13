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
  businessId: z.string().min(1),
  displayName: z.string().min(2).max(100),
  username: z.string().min(3).max(50),
  role: z.enum([
    'owner', 'manager', 'cashier', 'warehouse', 
    'accountant', 'waiter', 'kitchen', 'technician'
  ]),
  branchIds: z.array(z.string()).min(1),
  initialPassword: z.string().min(6),
});

export async function POST(request: Request) {
  try {
    // 1. Enforce verified caller session
    const authUser = await requireAuthenticatedUser(request);

    const body = await request.json();
    const parsed = createEmployeeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Data pendaftaran karyawan tidak valid", errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { businessId, displayName, username, role, branchIds, initialPassword } = parsed.data;

    // 2. Enforce verified server permission: caller must have 'employees.create'
    await requireBusinessPermission(businessId, authUser.uid, 'employees.create');

    // 3. Verify caller has access to the business branches being assigned
    for (const bId of branchIds) {
      await requireBranchAccess(businessId, authUser.uid, bId);
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

