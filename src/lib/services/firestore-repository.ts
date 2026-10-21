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
  CashSession,
  TableItem
} from "@/types";

export interface BusinessTenantSnapshot {
  business?: Business;
  branches: Branch[];
  products: Product[];
  members: BusinessMember[];
  sales: Sale[];
  tables: TableItem[];
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
        onUpdate({ products });
      },
      (err) => {
        console.warn("Firestore products live listener notice:", err.message);
        if (onError) onError(err);
      }
    );
    unsubscribers.push(unsubProducts);

    // 2. Branches collection real-time listener
    const branchesRef = collection(db, `businesses/${businessId}/branches`);
    const unsubBranches = onSnapshot(
      branchesRef,
      (snapshot) => {
        const branches = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Branch));
        onUpdate({ branches });
      },
      (err) => {
        console.warn("Firestore branches live listener notice:", err.message);
      }
    );
    unsubscribers.push(unsubBranches);

    // 3. Members collection real-time listener
    const membersRef = collection(db, `businesses/${businessId}/members`);
    const unsubMembers = onSnapshot(
      membersRef,
      (snapshot) => {
        const members = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BusinessMember));
        onUpdate({ members });
      },
      (err) => {
        console.warn("Firestore members live listener notice:", err.message);
      }
    );
    unsubscribers.push(unsubMembers);

    // 4. Sales collection real-time listener (Recent sales)
    const salesRef = collection(db, `businesses/${businessId}/sales`);
    const salesQuery = query(salesRef, orderBy("createdAt", "desc"), limit(100));
    const unsubSales = onSnapshot(
      salesQuery,
      (snapshot) => {
        const sales = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale));
        onUpdate({ sales });
      },
      (err) => {
        console.warn("Firestore sales live listener notice:", err.message);
      }
    );
    unsubscribers.push(unsubSales);

    // 5. IMEI Units real-time listener
    const imeiRef = collection(db, `businesses/${businessId}/imeiUnits`);
    const unsubImei = onSnapshot(
      imeiRef,
      (snapshot) => {
        const imeiUnits = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ImeiUnit));
        onUpdate({ imeiUnits });
      },
      (err) => {
        console.warn("Firestore imei live listener notice:", err.message);
      }
    );
    unsubscribers.push(unsubImei);

    // 6. Stock Adjustments real-time listener
    const adjustmentsRef = collection(db, `businesses/${businessId}/stockAdjustments`);
    const unsubAdjustments = onSnapshot(
      adjustmentsRef,
      (snapshot) => {
        const stockAdjustments = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as StockAdjustment));
        onUpdate({ stockAdjustments });
      },
      (err) => {
        console.warn("Firestore adjustments live listener notice:", err.message);
      }
    );
    unsubscribers.push(unsubAdjustments);

    // 7. Purchase Orders real-time listener
    const poRef = collection(db, `businesses/${businessId}/purchaseOrders`);
    const unsubPo = onSnapshot(
      poRef,
      (snapshot) => {
        const purchaseOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseOrder));
        onUpdate({ purchaseOrders });
      },
      (err) => {
        console.warn("Firestore PO live listener notice:", err.message);
      }
    );
    unsubscribers.push(unsubPo);

    // 8. IMEI Histories real-time listener
    const imeiHistRef = collection(db, `businesses/${businessId}/imeiHistory`);
    const unsubImeiHist = onSnapshot(
      imeiHistRef,
      (snapshot) => {
        const imeiHistories = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ImeiHistory));
        onUpdate({ imeiHistories });
      },
      (err) => {
        console.warn("Firestore IMEI History live listener notice:", err.message);
      }
    );
    unsubscribers.push(unsubImeiHist);

    // 9. Cash Sessions real-time listener
    const cashRef = collection(db, `businesses/${businessId}/cashSessions`);
    const unsubCash = onSnapshot(
      cashRef,
      (snapshot) => {
        const cashSessions = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CashSession));
        onUpdate({ cashSessions });
      },
      (err) => {
        console.warn("Firestore Cash Sessions live listener notice:", err.message);
      }
    );
    unsubscribers.push(unsubCash);

    // 10. Tables collection real-time listener (F&B Multi-session Sync)
    const tablesRef = collection(db, `businesses/${businessId}/tables`);
    const unsubTables = onSnapshot(
      tablesRef,
      (snapshot) => {
        const tables = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TableItem));
        tables.sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true }));
        onUpdate({ tables });
      },
      (err) => {
        console.warn("Firestore Tables live listener notice:", err.message);
      }
    );
    unsubscribers.push(unsubTables);

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

