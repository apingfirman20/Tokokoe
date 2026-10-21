import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Business, Product, TableItem } from "@/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId");

    if (!businessId) {
      return NextResponse.json(
        { success: false, message: "Parameter businessId wajib diisi." },
        { status: 400 }
      );
    }

    // 1. Fetch business doc
    const bizDoc = await adminDb.doc(`businesses/${businessId}`).get();
    if (!bizDoc.exists) {
      return NextResponse.json(
        { success: false, message: "Bisnis tidak ditemukan." },
        { status: 404 }
      );
    }

    const business = bizDoc.data() as Business;

    // 2. Strict verification: feature is exclusively for F&B businesses
    if (business.businessType !== "fnb") {
      return NextResponse.json(
        { 
          success: false, 
          message: "Sistem pemesanan mandiri via QR Code meja hanya tersedia khusus untuk jenis bisnis F&B (Restoran, Kafe, Rumah Makan)." 
        },
        { status: 403 }
      );
    }

    // 3. Fetch active products
    const productsSnap = await adminDb
      .collection(`businesses/${businessId}/products`)
      .get();

    const rawProducts = productsSnap.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as Product)
    );

    // Only active & available products, and NEVER expose costPrice to customers
    const publicProducts = rawProducts
      .filter((p) => p.isActive !== false && p.available !== false)
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category || "Umum",
        sellingPrice: p.sellingPrice || 0,
        imageUrl: p.imageUrl || null,
        stockQty: p.stockQty ?? 0,
        trackStock: p.trackStock ?? true,
        available: p.available ?? true,
        options: p.options || null,
        modifiers: p.modifiers || null,
      }));

    // Derive category list
    const defaultCategories = ['Makanan', 'Minuman', 'Dessert', 'Kopi', 'Camilan'];
    const detectedCategories = Array.from(new Set(publicProducts.map(p => p.category).filter(Boolean)));
    const categories = ['Semua', ...Array.from(new Set([...defaultCategories, ...detectedCategories]))];

    // 4. Fetch tables for this business
    const tablesSnap = await adminDb
      .collection(`businesses/${businessId}/tables`)
      .get();

    const tables = tablesSnap.docs.map((doc) => {
      const data = doc.data() as TableItem;
      return {
        id: doc.id,
        tableNumber: data.tableNumber,
        capacity: data.capacity || 4,
        status: data.status || "available",
      };
    });

    // Natural sort tables by number
    tables.sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true }));

    return NextResponse.json({
      success: true,
      business: {
        id: businessId,
        name: business.name,
        logoUrl: business.receiptSettings?.logoUrl || business.logoUrl || null,
        tagline: business.receiptSettings?.tagline || "Artisan Cafe & Resto",
        address: business.receiptSettings?.address || business.address || "",
        phone: business.receiptSettings?.phone || business.phone || "",
        footerMessage: business.receiptSettings?.footerMessage || "Selamat menikmati sajian kami!",
        taxRate: business.taxRate !== undefined ? business.taxRate : 10, // PB1 default 10%
        serviceChargeRate: business.serviceChargeRate !== undefined ? business.serviceChargeRate : 0,
        allowTableQris: Boolean(business.midtransSettings?.isEnabled && (business.midtransSettings?.allowTableQris ?? true)),
      },
      categories,
      products: publicProducts,
      tables,
    });
  } catch (error: any) {
    console.error("Error fetching public F&B menu:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Gagal memuat menu restoran." },
      { status: 500 }
    );
  }
}
