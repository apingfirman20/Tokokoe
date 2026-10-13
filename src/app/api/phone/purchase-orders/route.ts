import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { PurchaseOrder } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const poItemSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  storage: z.string().min(1),
  color: z.string().min(1),
  condition: z.enum(['new', 'second_grade_a', 'second_grade_b']),
  costPrice: z.number().int().positive(),
  expectedSellingPrice: z.number().int().positive(),
  quantityOrdered: z.number().int().positive(),
});

const createPoSchema = z.object({
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  supplierName: z.string().min(2),
  items: z.array(poItemSchema).min(1),
});

export async function POST(request: Request) {
  try {
    // 1. Enforce verified caller session
    const authUser = await requireAuthenticatedUser(request);

    const body = await request.json();
    const parsed = createPoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Data Purchase Order tidak valid", errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { businessId, branchId, supplierName, items } = parsed.data;

    // 2. Authoritative RBAC & branch authorization
    const membership = await requireBusinessPermission(businessId, authUser.uid, 'inventory.receive');
    await requireBranchAccess(businessId, authUser.uid, branchId);

    const now = Date.now();
    const poId = `po_${now}_${Math.random().toString(36).substring(2, 6)}`;
    const poNumber = `PO-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;

    const poItems = items.map((item, idx) => ({
      id: `poi_${now}_${idx}`,
      brand: item.brand,
      model: item.model,
      storage: item.storage,
      color: item.color,
      condition: item.condition,
      costPrice: item.costPrice,
      expectedSellingPrice: item.expectedSellingPrice,
      quantityOrdered: item.quantityOrdered,
      quantityReceived: 0,
      receivedImeis: [],
    }));

    const totalCost = poItems.reduce((sum, item) => sum + (item.costPrice * item.quantityOrdered), 0);

    const newPO: PurchaseOrder = {
      id: poId,
      poNumber,
      businessId,
      branchId,
      supplierName,
      items: poItems,
      totalCost,
      status: 'ordered',
      // Authoritative creator identity from verified server token
      createdBy: authUser.uid,
      createdByName: membership.displayName,
      createdAt: now,
      updatedAt: now,
    };

    // Save to Firestore
    await adminDb.doc(`businesses/${businessId}/purchaseOrders/${poId}`).set(newPO);

    return NextResponse.json({
      success: true,
      purchaseOrder: newPO,
      message: `Purchase Order ${poNumber} berhasil diterbitkan.`
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

