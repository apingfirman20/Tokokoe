import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { BusinessMember, PermissionKey } from "@/types";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import { requireAuthenticatedUser, requireBusinessPermission, handleAuthApiError } from "@/lib/server/auth-guard";

const allowedEmployeeRoles = ['manager', 'cashier', 'kitchen', 'waiter', 'warehouse', 'accountant', 'technician', 'courier'] as const;

const updateEmployeeSchema = z.object({
  businessId: z.string().min(1, "businessId wajib diisi"),
  memberId: z.string().min(1, "memberId wajib diisi"),
  displayName: z.string().trim().min(1).max(100).optional(),
  role: z.enum(allowedEmployeeRoles).optional(),
  branchIds: z.array(z.string().min(1)).min(1, "Minimal pilih satu cabang penugasan").optional(),
  permissions: z.array(z.string()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export async function PUT(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const parsed = updateEmployeeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data karyawan tidak valid", errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { businessId, memberId, displayName, role, branchIds, permissions, status } = parsed.data;

    // Caller must have employees.manage (or employees.create)
    const callerMember = await requireBusinessPermission(businessId, authUser.uid, "employees.manage");
    const isOwner = callerMember.role === "owner";

    // Fetch target member document
    const memberRef = adminDb.doc(`businesses/${businessId}/members/${memberId}`);
    const memberSnap = await memberRef.get();

    if (!memberSnap.exists) {
      return NextResponse.json({ success: false, message: "Karyawan tidak ditemukan dalam bisnis ini." }, { status: 404 });
    }

    const targetMember = memberSnap.data() as BusinessMember;

    // Protection: NEVER allow modifying or deactivating the business owner!
    if (targetMember.role === "owner") {
      return NextResponse.json(
        { success: false, message: "Data atau status pemilik bisnis (Owner) tidak dapat diubah melalui menu staf." },
        { status: 403 }
      );
    }

    // Role Escalation Protection:
    // If caller is a manager:
    // 1. Manager CANNOT edit another manager
    // 2. Manager CANNOT promote anyone to manager or owner
    if (!isOwner) {
      if (targetMember.role === "manager" && targetMember.userId !== authUser.uid) {
        return NextResponse.json(
          { success: false, message: "Akses ditolak: Manajer tidak diizinkan mengubah akun sesama manajer." },
          { status: 403 }
        );
      }
      if (role === "manager") {
        return NextResponse.json(
          { success: false, message: "Akses ditolak: Hanya pemilik bisnis (Owner) yang dapat menetapkan role Manajer." },
          { status: 403 }
        );
      }
    }

    // Validate assigned branches if provided
    if (branchIds && branchIds.length > 0) {
      for (const bId of branchIds) {
        if (bId === "*" || bId === "all") continue;
        const branchSnap = await adminDb.doc(`businesses/${businessId}/branches/${bId}`).get();
        if (!branchSnap.exists) {
          return NextResponse.json(
            { success: false, message: `Cabang dengan ID "${bId}" tidak ditemukan dalam bisnis ini.` },
            { status: 400 }
          );
        }
        if (branchSnap.data()?.active === false) {
          return NextResponse.json(
            { success: false, message: `Cabang "${branchSnap.data()?.name || bId}" sedang dinonaktifkan.` },
            { status: 400 }
          );
        }
      }
    }

    // Build update object
    const memberUpdates: Record<string, any> = {
      updatedAt: Date.now(),
    };

    if (displayName !== undefined) memberUpdates.displayName = displayName;
    if (role !== undefined) memberUpdates.role = role;
    if (branchIds !== undefined) memberUpdates.branchIds = branchIds;
    if (status !== undefined) memberUpdates.status = status;

    // Compute permissions if role or permissions changed
    if (permissions !== undefined) {
      if (isOwner) {
        memberUpdates.permissions = permissions as PermissionKey[];
      } else {
        // Manager cannot grant permissions higher than their own
        const callerPermissions = callerMember.permissions || DEFAULT_ROLE_PERMISSIONS[callerMember.role] || [];
        memberUpdates.permissions = (permissions as PermissionKey[]).filter(p => callerPermissions.includes(p));
      }
    } else if (role !== undefined && role !== targetMember.role) {
      // Re-apply default permissions for new role
      memberUpdates.permissions = DEFAULT_ROLE_PERMISSIONS[role] || [];
    }

    // Update member document in Firestore
    await memberRef.update(memberUpdates);

    // If username is present, synchronize staffLogins document
    if (targetMember.username) {
      const normalizedUsername = targetMember.username.toLowerCase().trim();
      const staffLoginRef = adminDb.doc(`staffLogins/${normalizedUsername}`);
      const staffLoginSnap = await staffLoginRef.get();

      if (staffLoginSnap.exists) {
        const staffUpdates: Record<string, any> = {
          updatedAt: Date.now(),
        };
        if (status !== undefined) staffUpdates.status = status;
        if (displayName !== undefined) staffUpdates.displayName = displayName;
        if (branchIds !== undefined && branchIds.length > 0) {
          staffUpdates.branchId = branchIds[0];
        }
        await staffLoginRef.update(staffUpdates);
      }
    }

    // If deactivated, revoke all active sessions immediately!
    if (status === "inactive") {
      try {
        await adminAuth.revokeRefreshTokens(targetMember.userId);
      } catch (err) {
        console.warn("Notice: could not revoke refresh tokens:", err);
      }
    }

    const updatedSnap = await memberRef.get();
    return NextResponse.json({
      success: true,
      member: { id: updatedSnap.id, ...updatedSnap.data() },
      message: `Data karyawan "${displayName || targetMember.displayName}" berhasil diperbarui.`,
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
