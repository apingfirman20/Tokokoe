import { CartLineItem, OrderType, PaymentMethod, Sale } from "../../types";

export interface CheckoutPayload {
  businessId: string;
  branchId: string;
  lineItems: CartLineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  serviceCharge: number;
  grandTotal: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: PaymentMethod;
  orderType: OrderType;
  tableNumber?: string;
  customerName?: string;
  cashSessionId?: string;
  idempotencyKey?: string;
}

export interface CheckoutResult {
  success: boolean;
  sale?: Sale;
  error?: string;
  persistedToFirestore?: boolean;
}

/**
 * Shared, secure POS checkout service.
 * Directs checkout requests to the authoritative Firestore-backed server endpoint.
 */
export async function executePosCheckout(
  payload: CheckoutPayload,
  getIdToken: () => Promise<string | null>
): Promise<CheckoutResult> {
  try {
    const token = await getIdToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // Generate a deterministic idempotency key if not provided
    const idempotencyKey = payload.idempotencyKey || 
      `idem_${payload.businessId}_${payload.branchId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Align lineItems imei field contract
    const formattedLineItems = payload.lineItems.map(item => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      imei: item.imei,
      selectedImei: item.imei,
      notes: item.notes,
    }));

    const res = await fetch("/api/sales/checkout", {
      method: "POST",
      headers,
      body: JSON.stringify({
        businessId: payload.businessId,
        branchId: payload.branchId,
        customerName: payload.customerName,
        orderType: payload.orderType,
        tableNumber: payload.tableNumber,
        lineItems: formattedLineItems,
        discount: payload.discount || 0,
        tax: payload.tax || 0,
        serviceCharge: payload.serviceCharge || 0,
        paidAmount: payload.paidAmount,
        paymentMethod: payload.paymentMethod,
        cashSessionId: payload.cashSessionId,
        idempotencyKey,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.message || "Gagal memproses transaksi pada server.",
        persistedToFirestore: false,
      };
    }

    if (!data.persistedToFirestore) {
      return {
        success: false,
        error: "Transaksi tidak dapat disimpan secara permanen di database Cloud Firestore.",
        persistedToFirestore: false,
      };
    }

    return {
      success: true,
      sale: data.sale,
      persistedToFirestore: true,
    };
  } catch (err: any) {
    console.error("Execute checkout error:", err);
    return {
      success: false,
      error: err.message || "Terjadi gangguan koneksi ke server kasir.",
      persistedToFirestore: false,
    };
  }
}
