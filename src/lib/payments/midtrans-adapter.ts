import crypto from "crypto";

export interface MidtransNotificationPayload {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  fraud_status?: string;
  payment_type: string;
  transaction_time: string;
  transaction_id: string;
}

export interface MidtransChargeRequest {
  orderId: string;
  grossAmount: number;
  customerName?: string;
  customerEmail?: string;
  businessId: string;
  serverKey?: string;
  isProduction?: boolean;
}

export class MidtransAdapter {
  private serverKey: string;
  private clientKey: string;
  private isProduction: boolean;

  constructor() {
    this.serverKey = process.env.MIDTRANS_SERVER_KEY || "";
    this.clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || "";
    this.isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
  }

  public getServerKey(): string {
    return process.env.MIDTRANS_SERVER_KEY || this.serverKey || "";
  }

  public isConfigured(customServerKey?: string): boolean {
    const key = customServerKey || this.getServerKey();
    return Boolean(key && key !== "SB-Mid-server-xxxxxx");
  }

  public verifySignature(notification: MidtransNotificationPayload, customServerKey?: string): boolean {
    const key = customServerKey || this.getServerKey();
    if (!this.isConfigured(key)) {
      return false;
    }

    const rawString = `${notification.order_id}${notification.status_code}${notification.gross_amount}${key}`;
    const calculatedHash = crypto.createHash("sha512").update(rawString).digest("hex");

    return calculatedHash === notification.signature_key;
  }

  public getSnapBaseUrl(customIsProduction?: boolean): string {
    const isProd = customIsProduction !== undefined 
      ? customIsProduction 
      : (process.env.MIDTRANS_IS_PRODUCTION === "true" || this.isProduction);
    return isProd
      ? "https://app.midtrans.com/snap/v1/transactions"
      : "https://app.sandbox.midtrans.com/snap/v1/transactions";
  }

  public async createSnapTransaction(request: MidtransChargeRequest): Promise<{ token?: string; redirectUrl?: string; error?: string }> {
    const effectiveServerKey = request.serverKey || this.getServerKey();
    if (!this.isConfigured(effectiveServerKey)) {
      return {
        error: "Midtrans Server Key belum dikonfigurasi. Silakan isi Server Key pada menu Pengaturan Bisnis."
      };
    }

    try {
      const authHeader = Buffer.from(`${effectiveServerKey}:`).toString("base64");
      const res = await fetch(this.getSnapBaseUrl(request.isProduction), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${authHeader}`,
        },
        body: JSON.stringify({
          transaction_details: {
            order_id: request.orderId,
            gross_amount: request.grossAmount,
          },
          customer_details: {
            first_name: request.customerName || "Customer",
            email: request.customerEmail || "customer@tokokoe.internal",
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { error: data.error_messages?.join(", ") || "Gagal membuat transaksi Midtrans Snap" };
      }

      return {
        token: data.token,
        redirectUrl: data.redirect_url,
      };
    } catch (e: any) {
      return { error: e.message || "Gagal menghubungi API Midtrans" };
    }
  }
}

export const midtransAdapter = new MidtransAdapter();
