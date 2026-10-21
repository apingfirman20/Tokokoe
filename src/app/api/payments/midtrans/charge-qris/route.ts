import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { midtransAdapter } from "@/lib/payments/midtrans-adapter";
import { Business } from "@/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { businessId, grossAmount, customOrderId, customerName } = body;

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "ID Bisnis (businessId) wajib disertakan." },
        { status: 400 }
      );
    }

    if (!grossAmount || Number(grossAmount) <= 0) {
      return NextResponse.json(
        { success: false, error: "Nominal pembayaran (grossAmount) harus lebih dari 0." },
        { status: 400 }
      );
    }

    // 1. Fetch Business Profile and isolated Midtrans settings
    const bizSnap = await adminDb.doc(`businesses/${businessId}`).get();
    if (!bizSnap.exists) {
      return NextResponse.json(
        { success: false, error: "Bisnis tidak ditemukan." },
        { status: 404 }
      );
    }

    const business = bizSnap.data() as Business;
    const midtrans = business.midtransSettings;

    // 2. Authoritative check: Is Midtrans connected and enabled?
    if (!midtrans || !midtrans.isEnabled || !midtrans.serverKey?.trim()) {
      return NextResponse.json({
        success: false,
        notConfigured: true,
        error: "Midtrans belum terhubung atau belum diaktifkan untuk bisnis ini. Silakan hubungkan Server Key dan Merchant ID di menu Pengaturan Bisnis -> Integrasi Midtrans.",
      });
    }

    // 3. Generate structured unique orderId: ${businessId}__QRIS_${timestamp}_${rand}
    const orderId = customOrderId || `${businessId}__QRIS_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // 4. Call Midtrans Core API (/v2/charge)
    const chargeResult = await midtransAdapter.createQrisCharge({
      orderId,
      grossAmount: Number(grossAmount),
      serverKey: midtrans.serverKey.trim(),
      isProduction: midtrans.isProduction ?? true,
      customerName: customerName || "Pelanggan Tokokoe",
    });

    if (!chargeResult.success) {
      return NextResponse.json({
        success: false,
        notConfigured: false,
        error: chargeResult.error || "Gagal membuat tagihan QRIS di Midtrans.",
        rawResponse: chargeResult.rawResponse,
      });
    }

    return NextResponse.json({
      success: true,
      notConfigured: false,
      orderId: chargeResult.orderId,
      transactionId: chargeResult.transactionId,
      qrString: chargeResult.qrString,
      qrUrl: chargeResult.qrUrl,
      grossAmount: Number(grossAmount),
      merchantName: business.name,
      isProduction: midtrans.isProduction ?? true,
    });
  } catch (error: any) {
    console.error("Error in charge-qris route:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Terjadi kesalahan internal server saat memproses QRIS Midtrans." },
      { status: 500 }
    );
  }
}
