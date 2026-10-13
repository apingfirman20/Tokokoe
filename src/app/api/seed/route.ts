import { NextResponse } from "next/server";
import { 
  INITIAL_BUSINESSES, 
  INITIAL_BRANCHES, 
  INITIAL_PRODUCTS, 
  INITIAL_IMEI_UNITS, 
  INITIAL_TABLES,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_STOCK_ADJUSTMENTS
} from "@/lib/data/seed-data";

export async function POST() {
  // Production Safety Guard: Disable public seed endpoint in production
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "true") {
    return NextResponse.json(
      { success: false, message: "Akses ditolak: Endpoint seeding dinonaktifkan pada lingkungan produksi." },
      { status: 403 }
    );
  }

  try {
    return NextResponse.json({
      success: true,
      message: "Database seed data initialized successfully",
      data: {
        businesses: INITIAL_BUSINESSES,
        branches: INITIAL_BRANCHES,
        productsCount: INITIAL_PRODUCTS.length,
        imeiUnitsCount: INITIAL_IMEI_UNITS.length,
        tablesCount: INITIAL_TABLES.length,
        purchaseOrdersCount: INITIAL_PURCHASE_ORDERS.length,
        stockAdjustmentsCount: INITIAL_STOCK_ADJUSTMENTS.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Gagal memproses data seed" },
      { status: 500 }
    );
  }
}
