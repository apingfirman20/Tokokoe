import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { midtransAdapter } from "@/lib/payments/midtrans-adapter";
import { Business } from "@/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId");
    const orderId = searchParams.get("orderId");

    if (!businessId || !orderId) {
      return NextResponse.json(
        { success: false, error: "Parameter businessId dan orderId wajib disertakan." },
        { status: 400 }
      );
    }

    const bizSnap = await adminDb.doc(`businesses/${businessId}`).get();
    if (!bizSnap.exists) {
      return NextResponse.json(
        { success: false, error: "Bisnis tidak ditemukan." },
        { status: 404 }
      );
    }

    const business = bizSnap.data() as Business;
    const midtrans = business.midtransSettings;

    if (!midtrans || !midtrans.serverKey?.trim()) {
      return NextResponse.json({
        success: false,
        isPaid: false,
        error: "Midtrans belum dikonfigurasi untuk bisnis ini.",
      });
    }

    const statusResult = await midtransAdapter.checkTransactionStatus(
      orderId,
      midtrans.serverKey.trim(),
      midtrans.isProduction ?? true
    );

    return NextResponse.json(statusResult);
  } catch (error: any) {
    console.error("Error in midtrans status check:", error);
    return NextResponse.json(
      { success: false, isPaid: false, error: error.message || "Gagal memeriksa status pembayaran Midtrans." },
      { status: 500 }
    );
  }
}
