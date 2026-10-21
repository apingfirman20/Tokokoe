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

  public getCoreApiBaseUrl(customIsProduction?: boolean): string {
    const isProd = customIsProduction !== undefined
      ? customIsProduction
      : (process.env.MIDTRANS_IS_PRODUCTION === "true" || this.isProduction);
    return isProd
      ? "https://api.midtrans.com/v2"
      : "https://api.sandbox.midtrans.com/v2";
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

  /**
   * Generates a dynamic QRIS transaction directly via Midtrans Core API (/v2/charge).
   * Returns the exact EMVCo qr_string and QR code image URL directly from Bank Indonesia / Midtrans.
   */
  public async createQrisCharge(request: {
    orderId: string;
    grossAmount: number;
    serverKey?: string;
    isProduction?: boolean;
    customerName?: string;
  }): Promise<{
    success: boolean;
    qrString?: string;
    qrUrl?: string;
    orderId?: string;
    transactionId?: string;
    error?: string;
    notConfigured?: boolean;
    rawResponse?: any;
  }> {
    const effectiveServerKey = request.serverKey || this.getServerKey();
    if (!this.isConfigured(effectiveServerKey)) {
      return {
        success: false,
        notConfigured: true,
        error: "Midtrans Server Key belum dikonfigurasi. Silakan hubungkan Midtrans pada menu Pengaturan Bisnis."
      };
    }

    try {
      const authHeader = Buffer.from(`${effectiveServerKey}:`).toString("base64");
      const url = `${this.getCoreApiBaseUrl(request.isProduction)}/charge`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${authHeader}`,
        },
        body: JSON.stringify({
          payment_type: "qris",
          transaction_details: {
            order_id: request.orderId,
            gross_amount: Math.max(1, Math.round(request.grossAmount)),
          },
          qris: {
            acquirer: "gopay",
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || (data.status_code && Number(data.status_code) >= 400)) {
        return {
          success: false,
          error: data.status_message || data.error_messages?.join(", ") || "Midtrans menolak pembuatan QRIS. Periksa kredensial Server Key.",
          rawResponse: data,
        };
      }

      const qrAction = Array.isArray(data.actions)
        ? data.actions.find((a: any) => a.name === "generate-qr-code") || data.actions[0]
        : undefined;

      return {
        success: true,
        qrString: data.qr_string || "",
        qrUrl: qrAction?.url || "",
        orderId: data.order_id || request.orderId,
        transactionId: data.transaction_id || "",
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.message || "Gagal menghubungi API Midtrans Core",
      };
    }
  }

  /**
   * Checks the real-time payment status of an order via Midtrans API (/v2/{order_id}/status).
   */
  public async checkTransactionStatus(
    orderId: string,
    serverKey?: string,
    isProduction?: boolean
  ): Promise<{
    success: boolean;
    isPaid: boolean;
    status?: string;
    transactionId?: string;
    grossAmount?: number;
    error?: string;
  }> {
    const effectiveServerKey = serverKey || this.getServerKey();
    if (!this.isConfigured(effectiveServerKey)) {
      return {
        success: false,
        isPaid: false,
        error: "Midtrans Server Key belum dikonfigurasi.",
      };
    }

    try {
      const authHeader = Buffer.from(`${effectiveServerKey}:`).toString("base64");
      const url = `${this.getCoreApiBaseUrl(isProduction)}/${encodeURIComponent(orderId)}/status`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${authHeader}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          isPaid: false,
          error: data.status_message || "Gagal memeriksa status Midtrans",
        };
      }

      const trxStatus = data.transaction_status;
      const fraudStatus = data.fraud_status;
      const isPaid = trxStatus === "settlement" || (trxStatus === "capture" && fraudStatus === "accept");

      return {
        success: true,
        isPaid,
        status: trxStatus,
        transactionId: data.transaction_id,
        grossAmount: data.gross_amount ? Number(data.gross_amount) : undefined,
      };
    } catch (e: any) {
      return {
        success: false,
        isPaid: false,
        error: e.message || "Gagal menghubungi status Midtrans",
      };
    }
  }
}

export const midtransAdapter = new MidtransAdapter();

