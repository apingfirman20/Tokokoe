import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { Branch } from "@/types";
import { requireAuthenticatedUser, requireBusinessPermission, handleAuthApiError } from "@/lib/server/auth-guard";

const createBranchSchema = z.object({
  businessId: z.string().min(1, "businessId wajib diisi"),
  name: z.string().trim().min(1, "Nama cabang wajib diisi").max(100),
  address: z.string().trim().default(""),
  phone: z.string().trim().optional(),
});

const updateBranchSchema = z.object({
  businessId: z.string().min(1, "businessId wajib diisi"),
  branchId: z.string().min(1, "branchId wajib diisi"),
  name: z.string().trim().min(1, "Nama cabang wajib diisi").max(100).optional(),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  active: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId");

    if (!businessId) {
      return NextResponse.json({ success: false, message: "Parameter businessId wajib diisi." }, { status: 400 });
    }

    await requireBusinessPermission(businessId, authUser.uid, "products.read");

    const branchesSnap = await adminDb.collection(`businesses/${businessId}/branches`).get();
    const branches = branchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Branch));

    return NextResponse.json({ success: true, branches });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const parsed = createBranchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data cabang tidak valid", errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { businessId, name, address, phone } = parsed.data;

    // Only owners or managers with business.settings.manage permission can create branches
    await requireBusinessPermission(businessId, authUser.uid, "business.settings.manage");

    // Fetch existing branches to generate next branch code
    const existingSnap = await adminDb.collection(`businesses/${businessId}/branches`).get();
    const branchCount = existingSnap.size + 1;
    const branchCode = `CAB-${String(branchCount).padStart(2, '0')}`;
    const branchId = `br_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const newBranch: Branch = {
      id: branchId,
      businessId,
      name,
      code: branchCode,
      address,
      phone,
      isMainBranch: existingSnap.empty, // First branch is main branch
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const branchData: Record<string, any> = {};
    for (const [k, v] of Object.entries(newBranch)) {
      if (v !== undefined) branchData[k] = v;
    }

    await adminDb.doc(`businesses/${businessId}/branches/${branchId}`).set(branchData);

    return NextResponse.json({
      success: true,
      branch: newBranch,
      message: `Cabang "${name}" (${branchCode}) berhasil ditambahkan.`,
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const parsed = updateBranchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data cabang tidak valid", errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { businessId, branchId, name, address, phone, active } = parsed.data;
    await requireBusinessPermission(businessId, authUser.uid, "business.settings.manage");

    const branchRef = adminDb.doc(`businesses/${businessId}/branches/${branchId}`);
    const branchSnap = await branchRef.get();

    if (!branchSnap.exists) {
      return NextResponse.json({ success: false, message: "Cabang tidak ditemukan." }, { status: 404 });
    }

    const branchData = branchSnap.data() as Branch;

    // Safety policy: Cannot deactivate the main branch!
    if (active === false && branchData.isMainBranch) {
      return NextResponse.json(
        { success: false, message: "Cabang utama tidak boleh dinonaktifkan." },
        { status: 400 }
      );
    }

    // Safety policy: Cannot deactivate if branch has open active cash sessions!
    if (active === false) {
      const openSessionQuery = await adminDb
        .collection(`businesses/${businessId}/cashSessions`)
        .where("branchId", "==", branchId)
        .where("status", "==", "open")
        .limit(1)
        .get();

      if (!openSessionQuery.empty) {
        return NextResponse.json(
          { 
            success: false, 
            message: "Cabang tidak dapat dinonaktifkan karena masih memiliki shift kasir yang aktif/terbuka. Tutup shift terlebih dahulu." 
          },
          { status: 400 }
        );
      }
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };
    if (name !== undefined) updates.name = name;
    if (address !== undefined) updates.address = address;
    if (phone !== undefined) updates.phone = phone;
    if (active !== undefined) updates.active = active;

    await branchRef.update(updates);

    const updatedSnap = await branchRef.get();
    return NextResponse.json({
      success: true,
      branch: { id: updatedSnap.id, ...updatedSnap.data() },
      message: "Data cabang berhasil diperbarui.",
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const { businessId, branchId } = body || {};

    if (!businessId || !branchId) {
      return NextResponse.json({ success: false, message: "businessId dan branchId wajib diisi." }, { status: 400 });
    }

    await requireBusinessPermission(businessId, authUser.uid, "business.settings.manage");

    const branchRef = adminDb.doc(`businesses/${businessId}/branches/${branchId}`);
    const branchSnap = await branchRef.get();

    if (!branchSnap.exists) {
      return NextResponse.json({ success: false, message: "Cabang tidak ditemukan." }, { status: 404 });
    }

    const branchData = branchSnap.data() as Branch;

    // Safety Policy: Cannot deactivate main branch
    if (branchData.isMainBranch || (branchData as any).isMain || branchData.code === 'CAB-01' || branchId === 'br_main') {
      return NextResponse.json(
        { success: false, message: "Cabang utama tidak dapat dinonaktifkan atau dihapus." },
        { status: 400 }
      );
    }

    // Safety Policy: Check open cash sessions
    const openSessionQuery = await adminDb
      .collection(`businesses/${businessId}/cashSessions`)
      .where("branchId", "==", branchId)
      .where("status", "==", "open")
      .limit(1)
      .get();

    if (!openSessionQuery.empty) {
      return NextResponse.json(
        { success: false, message: "Cabang tidak dapat dinonaktifkan karena terdapat shift kasir yang sedang aktif." },
        { status: 400 }
      );
    }

    // Safe soft-deactivate (NEVER hard-delete to preserve sales history and stock movement audit trails)
    await branchRef.update({
      active: false,
      updatedAt: Date.now(),
    });

    return NextResponse.json({
      success: true,
      message: `Cabang "${branchData.name}" berhasil dinonaktifkan secara aman. Histori penjualan tetap terjaga.`,
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
