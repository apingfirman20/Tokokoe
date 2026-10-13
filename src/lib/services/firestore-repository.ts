import { 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  where,
  getDocs,
  Unsubscribe 
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { 
  Business, 
  Branch, 
  Product, 
  BusinessMember, 
  Sale, 
  ImeiUnit, 
  ImeiHistory,
  PurchaseOrder, 
  StockAdjustment, 
  CashSession 
} from "@/types";

export interface BusinessTenantSnapshot {
  business?: Business;
  branches: Branch[];
  products: Product[];
  members: BusinessMember[];
  sales: Sale[];
  imeiUnits: ImeiUnit[];
  imeiHistories: ImeiHistory[];
  purchaseOrders: PurchaseOrder[];
  stockAdjustments: StockAdjustment[];
  cashSessions: CashSession[];
}

/**
 * Subscribes to real-time Cloud Firestore updates for a business tenant.
 * Enables live synchronization across multiple cashiers and separate browser sessions.
 */
export function subscribeToBusinessTenant(
  businessId: string,
  onUpdate: (data: Partial<BusinessTenantSnapshot>) => void,
  onError?: (err: Error) => void
): () => void {
  const unsubscribers: Unsubscribe[] = [];

  try {
    // 1. Products collection real-time listener
    const productsRef = collection(db, `businesses/${businessId}/products`);
    const unsubProducts = onSnapshot(
      productsRef, 
      (snapshot) => {
        const products = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));
        if (products.length > 0) {
          onUpdate({ products });
        }
      },
      (err) => {
        console.warn("Firestore products live listener notice:", err.message);
        if (onError) onError(err);
      }
    );
    unsubscribers.push(unsubProducts);

    // 2. Sales collection real-time listener (Recent sales)
    const salesRef = collection(db, `businesses/${businessId}/sales`);
    const salesQuery = query(salesRef, orderBy("createdAt", "desc"), limit(50));
    const unsubSales = onSnapshot(
      salesQuery,
      (snapshot) => {
        const sales = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale));
        if (sales.length > 0) {
          onUpdate({ sales });
        }
      },
      (err) => {
        console.warn("Firestore sales live listener notice:", err.message);
      }
    );
    unsubscribers.push(unsubSales);

    // 3. IMEI Units real-time listener
    const imeiRef = collection(db, `businesses/${businessId}/imeiUnits`);
    const unsubImei = onSnapshot(
      imeiRef,
      (snapshot) => {
        const imeiUnits = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ImeiUnit));
        if (imeiUnits.length > 0) {
          onUpdate({ imeiUnits });
        }
      },
      (err) => {
        console.warn("Firestore imei live listener notice:", err.message);
      }
    );
    unsubscribers.push(unsubImei);

    // 4. Stock Adjustments real-time listener
    const adjustmentsRef = collection(db, `businesses/${businessId}/stockAdjustments`);
    const unsubAdjustments = onSnapshot(
      adjustmentsRef,
      (snapshot) => {
        const stockAdjustments = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as StockAdjustment));
        if (stockAdjustments.length > 0) {
          onUpdate({ stockAdjustments });
        }
      },
      (err) => {
        console.warn("Firestore adjustments live listener notice:", err.message);
      }
    );
    unsubscribers.push(unsubAdjustments);

    // 5. Purchase Orders real-time listener
    const poRef = collection(db, `businesses/${businessId}/purchaseOrders`);
    const unsubPo = onSnapshot(
      poRef,
      (snapshot) => {
        const purchaseOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseOrder));
        if (purchaseOrders.length > 0) {
          onUpdate({ purchaseOrders });
        }
      },
      (err) => {
        console.warn("Firestore PO live listener notice:", err.message);
      }
    );
    unsubscribers.push(unsubPo);

    // 6. IMEI Histories real-time listener
    const imeiHistRef = collection(db, `businesses/${businessId}/imeiHistory`);
    const unsubImeiHist = onSnapshot(
      imeiHistRef,
      (snapshot) => {
        const imeiHistories = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ImeiHistory));
        if (imeiHistories.length > 0) {
          onUpdate({ imeiHistories });
        }
      },
      (err) => {
        console.warn("Firestore IMEI History live listener notice:", err.message);
      }
    );
    unsubscribers.push(unsubImeiHist);

  } catch (err: any) {
    console.warn("Firestore real-time subscription setup notice:", err.message);
  }

  // Return teardown function
  return () => {
    unsubscribers.forEach(unsub => {
      try {
        unsub();
      } catch (e) {
        // ignore teardown error
      }
    });
  };
}

/**
 * Subscribes in real-time to all businesses owned by a specific Firebase user.
 */
export function subscribeToUserBusinesses(
  userId: string,
  onUpdate: (businesses: Business[]) => void,
  onError?: (err: Error) => void
): () => void {
  try {
    const q = query(collection(db, "businesses"), where("ownerId", "==", userId));
    return onSnapshot(
      q,
      (snapshot) => {
        const businesses = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Business));
        onUpdate(businesses);
      },
      (err) => {
        console.warn("Firestore user businesses live listener notice:", err.message);
        if (onError) onError(err);
      }
    );
  } catch (err: any) {
    console.warn("subscribeToUserBusinesses setup notice:", err.message);
    return () => {};
  }
}

/**
 * Fetches all businesses owned by a specific Firebase user once from Firestore.
 */
export async function fetchUserBusinesses(userId: string): Promise<Business[]> {
  try {
    const q = query(collection(db, "businesses"), where("ownerId", "==", userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Business));
  } catch (err: any) {
    console.warn("fetchUserBusinesses notice:", err.message);
    return [];
  }
}

