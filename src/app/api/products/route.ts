import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { Product } from "@/types";
import { requireAuthenticatedUser, requireBusinessPermission, handleAuthApiError } from "@/lib/server/auth-guard";
import { canReadCostPrice, sanitizeProductDto, sanitizeProductDtos } from "@/lib/server/cost-protection";
import { detectBarcodeType, normalizeBarcode } from "@/lib/validation/barcode";

const createProductSchema = z.object({
  businessId: z.string().min(1, "businessId wajib diisi"),
  name: z.string().trim().min(1, "Nama produk wajib diisi").max(100, "Nama produk maksimal 100 karakter"),
  category: z.string().trim().min(1, "Kategori wajib diisi").default("Umum"),
  sellingPrice: z.number().int("Harga jual harus berupa bilangan bulat (Rupiah)").nonnegative("Harga jual tidak boleh negatif"),
  costPrice: z.number().int("HPP harus berupa bilangan bulat (Rupiah)").nonnegative("HPP tidak boleh negatif").default(0),
  stockQty: z.number().int("Jumlah stok harus berupa bilangan bulat").nonnegative("Stok tidak boleh negatif").default(0),
  trackStock: z.boolean().default(true),
  available: z.boolean().default(true),
  barcode: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  imageUrl: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  model: z.string().trim().optional(),
  storage: z.string().trim().optional(),
  color: z.string().trim().optional(),
  condition: z.enum(["new", "second_grade_a", "second_grade_b"]).optional(),
});

const updateProductSchema = z.object({
  businessId: z.string().min(1, "businessId wajib diisi"),
  productId: z.string().min(1, "productId wajib diisi"),
  name: z.string().trim().min(1, "Nama produk wajib diisi").max(100).optional(),
  category: z.string().trim().min(1).optional(),
  sellingPrice: z.number().int("Harga jual harus berupa bilangan bulat (Rupiah)").nonnegative("Harga jual tidak boleh negatif").optional(),
  costPrice: z.number().int("HPP harus berupa bilangan bulat (Rupiah)").nonnegative("HPP tidak boleh negatif").optional(),
  stockQty: z.number().int("Jumlah stok harus berupa bilangan bulat").nonnegative("Stok tidak boleh negatif").optional(),
  trackStock: z.boolean().optional(),
  available: z.boolean().optional(),
  isActive: z.boolean().optional(),
  barcode: z.string().trim().nullable().optional(),
  sku: z.string().trim().nullable().optional(),
  imageUrl: z.string().trim().nullable().optional(),
  brand: z.string().trim().optional(),
  model: z.string().trim().optional(),
  storage: z.string().trim().optional(),
  color: z.string().trim().optional(),
  condition: z.enum(["new", "second_grade_a", "second_grade_b"]).optional(),
});

export async function GET(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId");

    if (!businessId) {
      return NextResponse.json(
        { success: false, message: "Parameter businessId wajib diisi." },
        { status: 400 }
      );
    }

    // Require authoritative business membership and products.read permission
    const membership = await requireBusinessPermission(businessId, authUser.uid, "products.read");

    const productsSnap = await adminDb
      .collection(`businesses/${businessId}/products`)
      .get();

    const rawProducts = productsSnap.docs.map(
      doc => ({ id: doc.id, ...doc.data() } as Product)
    );

    // Authoritative Server-side HPP DTO protection:
    // Unauthorized roles (cashiers, waiters, kitchen) NEVER receive raw cost prices across the network.
    const allowedCost = canReadCostPrice(membership.role, membership.permissions);
    const sanitized = sanitizeProductDtos(rawProducts, allowedCost);

    return NextResponse.json({
      success: true,
      products: sanitized,
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const parsed = createProductSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data produk tidak valid", errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const payload = parsed.data;

    // Check permission products.create
    const membership = await requireBusinessPermission(payload.businessId, authUser.uid, "products.create");
    const allowedCost = canReadCostPrice(membership.role, membership.permissions);

    // If caller cannot view cost price, force costPrice to 0
    const finalCostPrice = allowedCost ? payload.costPrice : 0;

    // Check Barcode Uniqueness within this business scope
    const cleanBarcode = payload.barcode ? normalizeBarcode(payload.barcode) : undefined;
    if (cleanBarcode) {
      const dupQuery = await adminDb
        .collection(`businesses/${payload.businessId}/products`)
        .where("barcode", "==", cleanBarcode)
        .limit(1)
        .get();

      if (!dupQuery.empty) {
        const dupDoc = dupQuery.docs[0].data();
        return NextResponse.json(
          { 
            success: false, 
            message: `Barcode "${cleanBarcode}" sudah digunakan oleh produk lain ("${dupDoc.name || 'Produk Lain'}").` 
          },
          { status: 400 }
        );
      }
    }

    // Check SKU Uniqueness within this business scope
    const cleanSku = payload.sku ? payload.sku.trim() : undefined;
    if (cleanSku) {
      const dupQuery = await adminDb
        .collection(`businesses/${payload.businessId}/products`)
        .where("sku", "==", cleanSku)
        .limit(1)
        .get();

      if (!dupQuery.empty) {
        return NextResponse.json(
          { success: false, message: `SKU "${cleanSku}" sudah digunakan oleh produk lain.` },
          { status: 400 }
        );
      }
    }

    const productId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const detectedBarcodeType = cleanBarcode ? detectBarcodeType(cleanBarcode) : undefined;

    const newProduct: Product = {
      id: productId,
      businessId: payload.businessId,
      name: payload.name,
      category: payload.category,
      sellingPrice: payload.sellingPrice,
      costPrice: finalCostPrice,
      stockQty: payload.stockQty,
      trackStock: payload.trackStock,
      available: payload.available,
      isActive: true,
      barcode: cleanBarcode,
      barcodeType: detectedBarcodeType,
      sku: cleanSku,
      imageUrl: payload.imageUrl,
      brand: payload.brand,
      model: payload.model,
      storage: payload.storage,
      color: payload.color,
      condition: payload.condition,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Filter undefined values before storing in Firestore
    const dataToWrite: Record<string, any> = {};
    for (const [k, v] of Object.entries(newProduct)) {
      if (v !== undefined) dataToWrite[k] = v;
    }

    await adminDb.doc(`businesses/${payload.businessId}/products/${productId}`).set(dataToWrite);

    // Record authoritative initial StockMovement (opening balance) in ledger
    if (newProduct.trackStock && newProduct.stockQty > 0) {
      const movRef = adminDb.collection(`businesses/${payload.businessId}/stockMovements`).doc();
      await movRef.set({
        id: movRef.id,
        businessId: payload.businessId,
        branchId: 'br_main',
        productId,
        productName: newProduct.name,
        type: 'opening_balance',
        quantityDelta: newProduct.stockQty,
        previousQty: 0,
        newQty: newProduct.stockQty,
        referenceId: productId,
        operatorId: authUser.uid,
        operatorName: membership.displayName,
        notes: `Saldo awal (opening balance) saat pembuatan produk ${newProduct.name}`,
        timestamp: Date.now(),
      });
    }

    return NextResponse.json({
      success: true,
      product: sanitizeProductDto(newProduct, allowedCost),
      message: "Produk berhasil ditambahkan ke katalog.",
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const parsed = updateProductSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data produk tidak valid", errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const payload = parsed.data;

    // Check permission products.update
    const membership = await requireBusinessPermission(payload.businessId, authUser.uid, "products.update");
    const allowedCost = canReadCostPrice(membership.role, membership.permissions);

    const prodRef = adminDb.doc(`businesses/${payload.businessId}/products/${payload.productId}`);
    const existingSnap = await prodRef.get();

    if (!existingSnap.exists) {
      return NextResponse.json(
        { success: false, message: "Produk tidak ditemukan di katalog bisnis ini." },
        { status: 404 }
      );
    }

    const existingData = existingSnap.data() as Product;

    // Check Barcode Uniqueness if changed
    const updates: Record<string, any> = {
      updatedAt: Date.now(),
    };

    if (payload.barcode !== undefined) {
      if (payload.barcode === null || payload.barcode === "") {
        // Explicitly clear/delete barcode field
        updates.barcode = FieldValue.delete();
        updates.barcodeType = FieldValue.delete();
      } else {
        const cleanBarcode = normalizeBarcode(payload.barcode);
        const dupQuery = await adminDb
          .collection(`businesses/${payload.businessId}/products`)
          .where("barcode", "==", cleanBarcode)
          .get();

        const conflictingDoc = dupQuery.docs.find(d => d.id !== payload.productId);
        if (conflictingDoc) {
          const conflictingName = conflictingDoc.data()?.name || "Produk Lain";
          return NextResponse.json(
            { success: false, message: `Barcode "${cleanBarcode}" sudah digunakan oleh produk lain ("${conflictingName}").` },
            { status: 400 }
          );
        }
        updates.barcode = cleanBarcode;
        updates.barcodeType = detectBarcodeType(cleanBarcode);
      }
    }

    // Check SKU Uniqueness if changed
    if (payload.sku !== undefined) {
      if (payload.sku === null || payload.sku === "") {
        updates.sku = FieldValue.delete();
      } else {
        const cleanSku = payload.sku.trim();
        const dupQuery = await adminDb
          .collection(`businesses/${payload.businessId}/products`)
          .where("sku", "==", cleanSku)
          .get();

        const conflictingDoc = dupQuery.docs.find(d => d.id !== payload.productId);
        if (conflictingDoc) {
          return NextResponse.json(
            { success: false, message: `SKU "${cleanSku}" sudah digunakan oleh produk lain.` },
            { status: 400 }
          );
        }
        updates.sku = cleanSku;
      }
    }

    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.category !== undefined) updates.category = payload.category;
    if (payload.sellingPrice !== undefined) updates.sellingPrice = payload.sellingPrice;
    if (payload.stockQty !== undefined && payload.stockQty !== existingData.stockQty) {
      return NextResponse.json(
        { 
          success: false, 
          message: "Perubahan jumlah stok tidak boleh dilakukan melalui edit produk langsung tanpa audit trail. Gunakan modul Penyesuaian Stok (Stock Adjustment) atau Penerimaan PO agar tercatat di stock ledger." 
        },
        { status: 400 }
      );
    }
    if (payload.trackStock !== undefined) updates.trackStock = payload.trackStock;
    if (payload.available !== undefined) updates.available = payload.available;
    if (payload.isActive !== undefined) updates.isActive = payload.isActive;
    if (payload.imageUrl !== undefined) {
      updates.imageUrl = payload.imageUrl ? payload.imageUrl : FieldValue.delete();
    }
    if (payload.brand !== undefined) updates.brand = payload.brand;
    if (payload.model !== undefined) updates.model = payload.model;
    if (payload.storage !== undefined) updates.storage = payload.storage;
    if (payload.color !== undefined) updates.color = payload.color;
    if (payload.condition !== undefined) updates.condition = payload.condition;

    // Only allow costPrice updates if caller has permission
    if (payload.costPrice !== undefined) {
      if (allowedCost) {
        updates.costPrice = payload.costPrice;
      }
    }

    await prodRef.update(updates);

    const updatedSnap = await prodRef.get();
    const updatedProd = { id: updatedSnap.id, ...updatedSnap.data() } as Product;

    return NextResponse.json({
      success: true,
      product: sanitizeProductDto(updatedProd, allowedCost),
      message: "Data produk berhasil diperbarui.",
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const { businessId, productId } = body || {};

    if (!businessId || !productId) {
      return NextResponse.json(
        { success: false, message: "Parameter businessId dan productId wajib diisi." },
        { status: 400 }
      );
    }

    // Require products.delete permission
    await requireBusinessPermission(businessId, authUser.uid, "products.delete");

    const prodRef = adminDb.doc(`businesses/${businessId}/products/${productId}`);
    const existingSnap = await prodRef.get();

    if (!existingSnap.exists) {
      return NextResponse.json(
        { success: false, message: "Produk tidak ditemukan di katalog bisnis ini." },
        { status: 404 }
      );
    }

    // Authoritative Soft-Archive:
    // NEVER hard delete to preserve sales transaction line items and financial reporting history.
    await prodRef.update({
      isActive: false,
      available: false,
      archivedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return NextResponse.json({
      success: true,
      message: "Produk berhasil dinonaktifkan/diarsipkan. Histori transaksi penjualan tetap aman.",
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
