import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { Ingredient } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const createIngredientSchema = z.object({
  action: z.literal('create').optional().default('create'),
  businessId: z.string().min(1),
  branchId: z.string().optional(),
  name: z.string().min(2, "Nama bahan baku wajib diisi minimal 2 karakter."),
  uom: z.string().min(1, "Satuan ukuran (UOM) wajib diisi (e.g. gram, ml, shot, pcs)."),
  costPerUnit: z.number().int().nonnegative().default(0),
  stockQty: z.number().nonnegative().default(0),
  minStockAlert: z.number().nonnegative().optional(),
});

const intakeIngredientSchema = z.object({
  action: z.literal('intake'),
  businessId: z.string().min(1),
  branchId: z.string().optional(),
  ingredientId: z.string().min(1),
  quantity: z.number().positive("Jumlah penerimaan harus lebih dari 0."),
  costPerUnit: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});

const wasteIngredientSchema = z.object({
  action: z.literal('waste'),
  businessId: z.string().min(1),
  branchId: z.string().optional(),
  ingredientId: z.string().min(1),
  quantity: z.number().positive("Jumlah terbuang (waste) harus lebih dari 0."),
  reason: z.string().min(3, "Alasan waste wajib diisi minimal 3 karakter."),
});

const ingredientActionSchema = z.discriminatedUnion('action', [
  createIngredientSchema,
  intakeIngredientSchema,
  wasteIngredientSchema,
]);

export async function GET(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json(
        { success: false, message: "Parameter businessId wajib diisi." },
        { status: 400 }
      );
    }

    await requireBusinessPermission(businessId, authUser.uid, 'inventory.read');

    const snapshot = await adminDb
      .collection(`businesses/${businessId}/ingredients`)
      .get();

    const ingredients: Ingredient[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as Omit<Ingredient, 'id'>)
    }));

    ingredients.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      success: true,
      count: ingredients.length,
      ingredients,
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const action = body.action || 'create';
    const parsed = ingredientActionSchema.safeParse({ ...body, action });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Payload bahan baku tidak valid." },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const businessId = data.businessId;

    const membership = await requireBusinessPermission(businessId, authUser.uid, 'inventory.receive');
    if (data.branchId) {
      await requireBranchAccess(businessId, authUser.uid, data.branchId);
    }

    const now = Date.now();

    if (data.action === 'create') {
      const ingRef = adminDb.collection(`businesses/${businessId}/ingredients`).doc();
      const newIng: Ingredient = {
        id: ingRef.id,
        businessId,
        branchId: data.branchId,
        name: data.name.trim(),
        uom: data.uom.trim(),
        costPerUnit: data.costPerUnit,
        stockQty: data.stockQty,
        minStockAlert: data.minStockAlert,
        createdAt: now,
        updatedAt: now,
      };

      await ingRef.set(newIng);

      return NextResponse.json({
        success: true,
        ingredient: newIng,
        message: `Bahan baku "${newIng.name}" berhasil didaftarkan.`,
      });
    }

    if (data.action === 'intake') {
      const ingRef = adminDb.doc(`businesses/${businessId}/ingredients/${data.ingredientId}`);
      let updatedResult: Ingredient | null = null;

      await adminDb.runTransaction(async (transaction) => {
        const doc = await transaction.get(ingRef);
        if (!doc.exists) {
          throw new Error("Bahan baku tidak ditemukan.");
        }
        const currentData = doc.data() as Ingredient;
        const currentQty = currentData.stockQty || 0;
        const newQty = currentQty + data.quantity;

        const updatePayload: Record<string, any> = {
          stockQty: newQty,
          updatedAt: now,
        };
        if (data.costPerUnit !== undefined && data.costPerUnit >= 0) {
          updatePayload.costPerUnit = data.costPerUnit;
        }

        transaction.update(ingRef, updatePayload);
        updatedResult = { ...currentData, ...updatePayload };

        // Log intake
        const logRef = adminDb.collection(`businesses/${businessId}/ingredientLogs`).doc();
        transaction.set(logRef, {
          id: logRef.id,
          ingredientId: data.ingredientId,
          ingredientName: currentData.name,
          type: 'intake',
          quantityDelta: data.quantity,
          previousQty: currentQty,
          newQty,
          notes: data.notes || 'Penerimaan stok bahan baku',
          operatorId: authUser.uid,
          operatorName: membership.displayName,
          timestamp: now,
        });
      });

      return NextResponse.json({
        success: true,
        ingredient: updatedResult,
        message: `Berhasil menambahkan ${data.quantity} ${(updatedResult as Ingredient | null)?.uom || 'unit'} ke stok bahan baku.`,
      });
    }

    if (data.action === 'waste') {
      const ingRef = adminDb.doc(`businesses/${businessId}/ingredients/${data.ingredientId}`);
      let updatedResult: Ingredient | null = null;

      await adminDb.runTransaction(async (transaction) => {
        const doc = await transaction.get(ingRef);
        if (!doc.exists) {
          throw new Error("Bahan baku tidak ditemukan.");
        }
        const currentData = doc.data() as Ingredient;
        const currentQty = currentData.stockQty || 0;
        const newQty = Math.max(0, currentQty - data.quantity);

        transaction.update(ingRef, {
          stockQty: newQty,
          updatedAt: now,
        });
        updatedResult = { ...currentData, stockQty: newQty, updatedAt: now };

        // Log waste
        const logRef = adminDb.collection(`businesses/${businessId}/ingredientLogs`).doc();
        transaction.set(logRef, {
          id: logRef.id,
          ingredientId: data.ingredientId,
          ingredientName: currentData.name,
          type: 'waste',
          quantityDelta: -data.quantity,
          previousQty: currentQty,
          newQty,
          reason: data.reason,
          operatorId: authUser.uid,
          operatorName: membership.displayName,
          timestamp: now,
        });
      });

      return NextResponse.json({
        success: true,
        ingredient: updatedResult,
        message: `Pencatatan waste ${data.quantity} ${(updatedResult as Ingredient | null)?.uom || 'unit'} (${data.reason}) berhasil dibukukan.`,
      });
    }

    return NextResponse.json({ success: false, message: "Aksi tidak dikenal." }, { status: 400 });
  } catch (error: any) {
    if (error.message?.includes('tidak ditemukan')) {
      return NextResponse.json({ success: false, message: error.message }, { status: 404 });
    }
    return handleAuthApiError(error);
  }
}
