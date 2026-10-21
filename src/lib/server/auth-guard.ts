import { adminAuth, adminDb } from "../firebase/admin";
import { PermissionKey, UserRole, BusinessMember } from "../../types";
import { hasPermission, DEFAULT_ROLE_PERMISSIONS } from "../permissions";
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
      const raw = token.startsWith("test_token__") ? token.slice("test_token__".length) : token.slice("test_token_".length);
      const delimiter = token.startsWith("test_token__") ? "__" : "_";
      const parts = raw.split(delimiter);
      const uid = parts[0] || "usr_test";
      const role = parts[1] || "owner";
      const businessId = parts[2] || "biz_test";
      return {
        uid,
        email: `${uid}@test.local`,
        role,
        businessId,
        token: { uid, role, businessId },
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

  // 1. Authoritative check: Business MUST already exist
  const bizDoc = await adminDb.doc(`businesses/${businessId}`).get();
  if (!bizDoc.exists) {
    // Pure authorization guard: NEVER create business documents or grant ownership on missing businesses!
    throw new AuthError(404, `Akses ditolak: Unit bisnis '${businessId}' tidak ditemukan.`);
  }

  const bizData = bizDoc.data();
  if (bizData?.status === 'inactive' || bizData?.status === 'suspended') {
    throw new AuthError(403, "Akses ditolak: Unit bisnis ini sedang dinonaktifkan.");
  }

  // Check if caller is the authoritative direct owner of this business
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
      branchIds: ['*'], // Owner explicitly has access to all branches
      displayName: bizData.ownerName || 'Pemilik Usaha',
    };
  }

  // 2. Check if user is an active registered member in businesses/{businessId}/members/{userId}
  const memberDoc = await adminDb.doc(`businesses/${businessId}/members/${userId}`).get();
  if (!memberDoc.exists) {
    throw new AuthError(403, "Akses ditolak: Anda bukan anggota resmi dari unit bisnis ini (Cross-tenant access blocked).");
  }

  const memberData = memberDoc.data() as BusinessMember;
  if (memberData.status !== 'active') {
    throw new AuthError(403, "Akses ditolak: Status keanggotaan Anda dalam bisnis ini telah dinonaktifkan.");
  }

  return {
    isOwner: memberData.role === 'owner',
    role: memberData.role,
    permissions: (memberData.permissions && memberData.permissions.length > 0)
      ? memberData.permissions
      : (DEFAULT_ROLE_PERMISSIONS[memberData.role] || []),
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
 * Validates that the targeted branch exists, is active, and the user is authorized for it
 */
export async function requireBranchAccess(
  businessId: string,
  userId: string,
  branchId: string
): Promise<BusinessMembershipResult> {
  const membership = await requireBusinessMembership(businessId, userId);

  // 1. Authoritative Branch Existence and Status Check
  const branchDoc = await adminDb.doc(`businesses/${businessId}/branches/${branchId}`).get();
  if (!branchDoc.exists) {
    throw new AuthError(404, `Akses ditolak: Cabang '${branchId}' tidak ditemukan pada unit bisnis ini.`);
  }

  const branchData = branchDoc.data();
  if (branchData?.active === false) {
    throw new AuthError(403, `Akses ditolak: Cabang '${branchData?.name || branchId}' sedang dinonaktifkan.`);
  }

  // 2. Authoritative Branch Authorization Check
  if (membership.isOwner) {
    return membership;
  }

  const hasExplicitAllBranches = 
    membership.branchIds.includes('*') || 
    membership.branchIds.includes('all');

  if (hasExplicitAllBranches) {
    return membership;
  }

  if (!membership.branchIds.includes(branchId)) {
    throw new AuthError(403, `Akses ditolak: Anda tidak memiliki akses ke cabang '${branchData?.name || branchId}'.`);
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
