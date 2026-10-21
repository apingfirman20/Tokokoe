import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { Business, Sale, TableItem, CartLineItem } from "@/types";

const customerOrderItemSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().positive("Jumlah item minimal 1"),
  unitPrice: z.number().int().nonnegative(),
  subtotal: z.number().int().nonnegative(),
  notes: z.string().optional(),
  selectedOptions: z.record(z.string(), z.string()).optional(),
  selectedModifiers: z.array(z.string()).optional(),
});

const submitCustomerOrderSchema = z.object({
  businessId: z.string().min(1, "businessId wajib diisi"),
  tableId: z.string().optional(),
  tableNumber: z.string().min(1, "Nomor meja wajib dipilih/diisi"),
  customerName: z.string().trim().min(1, "Nama pemesan wajib diisi"),
  paymentMethod: z.enum(['cash', 'qris']).default('cash'),
  lineItems: z.array(customerOrderItemSchema).min(1, "Minimal 1 menu harus dipilih."),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = submitCustomerOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data pesanan tidak valid." },
        { status: 400 }
      );
    }

    const { businessId, tableId, tableNumber, customerName, paymentMethod, lineItems, notes } = parsed.data;

    // 1. Verify business existence and F&B type
    const bizDoc = await adminDb.doc(`businesses/${businessId}`).get();
    if (!bizDoc.exists) {
      return NextResponse.json(
        { success: false, message: "Restoran / Kafe tidak ditemukan." },
        { status: 404 }
      );
    }

    const business = bizDoc.data() as Business;
    if (business.businessType !== "fnb") {
      return NextResponse.json(
        { success: false, message: "Fitur pemesanan meja QR hanya berlaku khusus untuk usaha F&B." },
        { status: 403 }
      );
    }

    const taxRate = business.taxRate !== undefined ? business.taxRate : 10; // PB1 Resto default 10%
    const serviceRate = business.serviceChargeRate !== undefined ? business.serviceChargeRate : 0;

    const subtotal = lineItems.reduce((acc, item) => acc + item.subtotal, 0);
    const tax = Math.round((subtotal * taxRate) / 100);
    const serviceCharge = Math.round((subtotal * serviceRate) / 100);
    const grandTotal = subtotal + tax + serviceCharge;

    const now = Date.now();
    const saleRef = adminDb.collection(`businesses/${businessId}/sales`).doc();
    const saleNumber = `QR-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;

    let resolvedTableId = tableId || "";
    let resolvedBranchId = "main";

    // 2. Resolve table doc if tableId not passed
    if (!resolvedTableId && tableNumber) {
      const tblSnap = await adminDb
        .collection(`businesses/${businessId}/tables`)
        .where("tableNumber", "==", tableNumber)
        .limit(1)
        .get();

      if (!tblSnap.empty) {
        resolvedTableId = tblSnap.docs[0].id;
        resolvedBranchId = (tblSnap.docs[0].data() as TableItem).branchId || "main";
      }
    } else if (resolvedTableId) {
      const tblDoc = await adminDb.doc(`businesses/${businessId}/tables/${resolvedTableId}`).get();
      if (tblDoc.exists) {
        resolvedBranchId = (tblDoc.data() as TableItem).branchId || "main";
      }
    }

    // 3. Create Sale record
    const isQris = paymentMethod === "qris";
    const newSale: Sale = {
      id: saleRef.id,
      saleNumber,
      businessId,
      branchId: resolvedBranchId,
      cashierId: "qr_customer_guest",
      cashierName: `Self-Order QR (${tableNumber})`,
      customerName: customerName.trim(),
      orderType: "dine_in",
      tableId: resolvedTableId || undefined,
      tableNumber: tableNumber.trim(),
      lineItems: lineItems as CartLineItem[],
      subtotal,
      discount: 0,
      tax,
      serviceCharge,
      grandTotal,
      paidAmount: isQris ? grandTotal : 0,
      changeAmount: 0,
      paymentMethod: isQris ? "qris" : "cash",
      paymentStatus: isQris ? "paid" : "pending",
      orderStatus: "waiting_cashier", // Kasir menerima & verifikasi sebelum lanjut ke dapur
      notes: notes?.trim() 
        ? `[Self-Order QR - ${isQris ? 'Lunas via QRIS' : 'Bayar di Kasir'}] ${notes.trim()}` 
        : `[Self-Order QR - ${isQris ? 'Lunas via QRIS' : 'Bayar di Kasir'}]`,
      createdAt: now,
      updatedAt: now,
    };

    const batch = adminDb.batch();
    batch.set(saleRef, newSale);

    // 4. Update Table status to occupied
    if (resolvedTableId) {
      const tableRef = adminDb.doc(`businesses/${businessId}/tables/${resolvedTableId}`);
      batch.update(tableRef, {
        status: "occupied",
        customerName: customerName.trim(),
        activeSaleId: saleRef.id,
        lastOrderedAt: now,
      });
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      saleId: saleRef.id,
      saleNumber,
      tableNumber,
      customerName: customerName.trim(),
      grandTotal,
      paymentMethod: isQris ? "qris" : "cash",
      paymentStatus: isQris ? "paid" : "pending",
      orderStatus: "waiting_cashier",
      message: "Pesanan berhasil dikirim ke kasir! Menunggu konfirmasi kasir sebelum diteruskan ke dapur.",
    });
  } catch (error: any) {
    console.error("Error creating customer QR order:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Gagal memproses pesanan meja." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId");
    const saleId = searchParams.get("saleId");

    if (!businessId || !saleId) {
      return NextResponse.json(
        { success: false, message: "Parameter businessId dan saleId wajib diisi." },
        { status: 400 }
      );
    }

    const saleDoc = await adminDb.doc(`businesses/${businessId}/sales/${saleId}`).get();
    if (!saleDoc.exists) {
      return NextResponse.json(
        { success: false, message: "Pesanan tidak ditemukan." },
        { status: 404 }
      );
    }

    const sale = saleDoc.data() as Sale;

    return NextResponse.json({
      success: true,
      sale: {
        id: sale.id,
        saleNumber: sale.saleNumber,
        tableNumber: sale.tableNumber,
        customerName: sale.customerName,
        orderStatus: sale.orderStatus,
        paymentStatus: sale.paymentStatus,
        paymentMethod: sale.paymentMethod,
        lineItems: sale.lineItems,
        subtotal: sale.subtotal,
        tax: sale.tax,
        serviceCharge: sale.serviceCharge,
        grandTotal: sale.grandTotal,
        createdAt: sale.createdAt,
      },
    });
  } catch (error: any) {
    console.error("Error checking customer order status:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Gagal mengecek status pesanan." },
      { status: 500 }
    );
  }
}
