import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { DEFAULT_MODULES_BY_TYPE } from "@/lib/modules/registry";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import { Business, Branch, BusinessMember, BusinessType } from "@/types";
import { requireAuthenticatedUser, handleAuthApiError } from "@/lib/server/auth-guard";

const createBusinessSchema = z.object({
  name: z.string().min(2, "Nama bisnis minimal 2 karakter.").max(100),
  businessType: z.enum(['fnb', 'phone', 'retail']),
  address: z.string().optional().default(""),
  phone: z.string().optional().default(""),
});

export async function POST(request: Request) {
  try {
    // 1. Authoritative caller authentication via Firebase ID Token
    const authUser = await requireAuthenticatedUser(request);

    const body = await request.json();
    const parsed = createBusinessSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data bisnis tidak valid" },
        { status: 400 }
      );
    }

    const { name, businessType, address, phone } = parsed.data;
    const now = Date.now();
    const businessId = `biz_${now}_${Math.random().toString(36).substring(2, 6)}`;
    const mainBranchId = `br_${now}_main`;

    // 2. Authoritative business entity
    const newBusiness: Business = {
      id: businessId,
      name,
      businessType,
      ownerId: authUser.uid,
      currency: 'IDR',
      timezone: 'Asia/Jakarta',
      address,
      phone,
      enabledModules: DEFAULT_MODULES_BY_TYPE[businessType] || DEFAULT_MODULES_BY_TYPE.fnb,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // 3. Default main branch
    const mainBranch: Branch = {
      id: mainBranchId,
      businessId,
      name: 'Cabang Utama',
      code: 'CAB-01',
      address: address || 'Pusat Operasional',
      isMainBranch: true,
      active: true,
    };

    // 4. Owner membership in the business
    const ownerMember: BusinessMember = {
      id: `mem_${authUser.uid}_${businessId.substring(4, 10)}`,
      userId: authUser.uid,
      businessId,
      displayName: authUser.token?.name || authUser.email?.split('@')[0] || 'Pemilik Usaha',
      username: authUser.email ? authUser.email.split('@')[0] : 'owner',
      role: 'owner',
      branchIds: [mainBranchId],
      permissions: DEFAULT_ROLE_PERMISSIONS.owner,
      status: 'active',
      joinedAt: now,
    };

    // 5. Persist to Cloud Firestore:
    // IMPORTANT: DO NOT automatically create sample products, customers, employees, or transactions!
    await adminDb.doc(`businesses/${businessId}`).set(newBusiness);
    await adminDb.doc(`businesses/${businessId}/branches/${mainBranchId}`).set(mainBranch);
    await adminDb.doc(`businesses/${businessId}/members/${authUser.uid}`).set(ownerMember);

    // Optional: write audit log
    try {
      const auditRef = adminDb.collection(`businesses/${businessId}/auditLogs`).doc();
      await auditRef.set({
        id: auditRef.id,
        action: 'business_created',
        businessId,
        operatorId: authUser.uid,
        operatorName: ownerMember.displayName,
        timestamp: now,
      });
    } catch (auditErr) {
      console.warn("Audit log creation notice:", auditErr);
    }

    return NextResponse.json({
      success: true,
      business: newBusiness,
      branch: mainBranch,
      message: `Bisnis ${name} berhasil dibuat.`
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
