import { adminAuth, adminDb } from "../firebase/admin";
import { PermissionKey, UserRole, BusinessMember } from "../../types";
import { hasPermission } from "../permissions";
import { NextResponse } from "next/server";

export class AuthError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  role?: string;
  businessId?: string;
  token: any;
}

/**
 * Validates the caller's Firebase ID token from Authorization header
 */
export async function requireAuthenticatedUser(request: Request): Promise<AuthenticatedUser> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AuthError(401, "Akses ditolak: Header Authorization Bearer token tidak ditemukan.");
  }

  const token = authHeader.split("Bearer ")[1].trim();
  if (!token) {
    throw new AuthError(401, "Akses ditolak: Token autentikasi kosong.");
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: (decodedToken.role as string) || undefined,
      businessId: (decodedToken.businessId as string) || undefined,
      token: decodedToken,
    };
  } catch (error: any) {
    // In test environment, support deterministic test tokens
    if (process.env.NODE_ENV === "test" && token.startsWith("test_token_")) {
      const parts = token.split("_");
      return {
        uid: parts[2] || "usr_test",
        email: `${parts[2] || "usr_test"}@test.local`,
        role: parts[3] || "owner",
        businessId: parts[4] || "biz_test",
        token: { uid: parts[2] || "usr_test" },
      };
    }
    throw new AuthError(401, `Akses ditolak: Sesi autentikasi tidak valid atau telah kedaluwarsa (${error.message || 'Token verification failed'}).`);
  }
}

export interface BusinessMembershipResult {
  isOwner: boolean;
  role: UserRole;
  permissions: PermissionKey[];
  branchIds: string[];
  displayName: string;
}

/**
 * Validates that the user is a registered member or owner of the business
 */
export async function requireBusinessMembership(businessId: string, userId: string): Promise<BusinessMembershipResult> {
  if (!businessId || !userId) {
    throw new AuthError(400, "Parameter businessId dan userId wajib diisi.");
  }

  // 1. Check if user is the direct owner of the business
  const bizDoc = await adminDb.doc(`businesses/${businessId}`).get();
  if (!bizDoc.exists) {
    // If the business was initialized prior to server credential deployment,
    // sync and initialize the business document so the authenticated owner is not blocked
    const now = Date.now();
    await adminDb.doc(`businesses/${businessId}`).set({
      id: businessId,
      name: "Usaha Saya",
      businessType: "fnb",
      ownerId: userId,
      currency: "IDR",
      timezone: "Asia/Jakarta",
      status: "active",
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    await adminDb.doc(`businesses/${businessId}/members/${userId}`).set({
      id: `mem_${userId}`,
      userId,
      businessId,
      displayName: 'Pemilik Usaha',
      role: 'owner',
      branchIds: ['CAB-01'],
      permissions: [
        'products.read', 'products.cost.read', 'products.create', 'products.update', 'products.delete',
        'sales.create', 'sales.read', 'sales.refund', 'inventory.read', 'inventory.receive', 'inventory.adjust',
        'approvals.manage', 'employees.create', 'employees.manage', 'finance.read', 'reports.read',
        'business.settings.manage', 'shift.manage'
      ],
      status: 'active',
      joinedAt: now,
    }, { merge: true });

    return {
      isOwner: true,
      role: 'owner',
      permissions: [
        'products.read', 'products.cost.read', 'products.create', 'products.update', 'products.delete',
        'sales.create', 'sales.read', 'sales.refund', 'inventory.read', 'inventory.receive', 'inventory.adjust',
        'approvals.manage', 'employees.create', 'employees.manage', 'finance.read', 'reports.read',
        'business.settings.manage', 'shift.manage'
      ],
      branchIds: ['CAB-01'],
      displayName: 'Pemilik Usaha',
    };
  }

  const bizData = bizDoc.data();
  if (bizData?.ownerId === userId) {
    return {
      isOwner: true,
      role: 'owner',
      permissions: [
        'products.read', 'products.cost.read', 'products.create', 'products.update', 'products.delete',
        'sales.create', 'sales.read', 'sales.refund', 'inventory.read', 'inventory.receive', 'inventory.adjust',
        'approvals.manage', 'employees.create', 'employees.manage', 'finance.read', 'reports.read',
        'business.settings.manage', 'shift.manage'
      ],
      branchIds: [],
      displayName: bizData.ownerName || 'Pemilik Usaha',
    };
  }

  // 2. Check if user is an authorized member in businesses/{businessId}/members/{userId}
  const memberDoc = await adminDb.doc(`businesses/${businessId}/members/${userId}`).get();
  if (!memberDoc.exists) {
    throw new AuthError(403, "Akses ditolak: Anda bukan anggota resmi dari bisnis ini (Cross-tenant access blocked).");
  }

  const memberData = memberDoc.data() as BusinessMember;
  if (memberData.status !== 'active') {
    throw new AuthError(403, "Akses ditolak: Status keanggotaan Anda dalam bisnis ini telah dinonaktifkan.");
  }

  return {
    isOwner: memberData.role === 'owner',
    role: memberData.role,
    permissions: memberData.permissions || [],
    branchIds: memberData.branchIds || [],
    displayName: memberData.displayName || memberData.username,
  };
}

/**
 * Validates that the user has a specific permission in the business
 */
export async function requireBusinessPermission(
  businessId: string, 
  userId: string, 
  permission: PermissionKey
): Promise<BusinessMembershipResult> {
  const membership = await requireBusinessMembership(businessId, userId);
  
  if (membership.isOwner) {
    return membership;
  }

  const hasAccess = hasPermission(membership.role, permission, membership.permissions);
  if (!hasAccess) {
    throw new AuthError(403, `Akses ditolak: Peran '${membership.role}' tidak memiliki izin operasi '${permission}'.`);
  }

  return membership;
}

/**
 * Validates that the user has access to a specific branch
 */
export async function requireBranchAccess(
  businessId: string,
  userId: string,
  branchId: string
): Promise<BusinessMembershipResult> {
  const membership = await requireBusinessMembership(businessId, userId);

  if (membership.isOwner) {
    return membership;
  }

  if (membership.branchIds.length > 0 && !membership.branchIds.includes(branchId)) {
    throw new AuthError(403, `Akses ditolak: Anda tidak memiliki akses ke cabang '${branchId}'.`);
  }

  return membership;
}

/**
 * Helper to transform AuthError into clean HTTP response
 */
export function handleAuthApiError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.statusCode }
    );
  }
  console.error("Unhandled API Server Error:", error);
  return NextResponse.json(
    { success: false, message: (error as Error).message || "Terjadi kesalahan internal server." },
    { status: 500 }
  );
}
