import { 
  Business, Branch, Product, ImeiUnit, ImeiHistory, Sale, 
  CashSession, TableItem, BusinessMember, StockAdjustment, PurchaseOrder 
} from "@/types";
import { 
  INITIAL_BUSINESSES, INITIAL_BRANCHES, INITIAL_MEMBERS, 
  INITIAL_PRODUCTS, INITIAL_IMEI_UNITS, INITIAL_TABLES, 
  INITIAL_CASH_SESSION, INITIAL_PURCHASE_ORDERS, INITIAL_STOCK_ADJUSTMENTS, SEED_BASE_TIMESTAMP 
} from "./seed-data";

const STORAGE_KEY_BASE = 'tokokoe_mvp_store_v2';

export interface AppStoreData {
  businesses: Business[];
  branches: Branch[];
  members: BusinessMember[];
  products: Product[];
  imeiUnits: ImeiUnit[];
  imeiHistories: ImeiHistory[];
  sales: Sale[];
  cashSessions: CashSession[];
  tables: TableItem[];
  stockAdjustments: StockAdjustment[];
  purchaseOrders: PurchaseOrder[];
}

/**
 * Returns a 100% clean, empty store for production onboarding.
 * New users start with ZERO businesses, products, sales, and transactions.
 */
export function getEmptyStore(): AppStoreData {
  return {
    businesses: [],
    branches: [],
    members: [],
    products: [],
    imeiUnits: [],
    imeiHistories: [],
    sales: [],
    cashSessions: [],
    tables: [],
    stockAdjustments: [],
    purchaseOrders: [],
  };
}

/**
 * Demo data generator reserved exclusively for dev/demo mode or explicit test seeds.
 */
export function getDemoStore(): AppStoreData {
  return {
    businesses: [...INITIAL_BUSINESSES],
    branches: [...INITIAL_BRANCHES],
    members: [...INITIAL_MEMBERS],
    products: [...INITIAL_PRODUCTS],
    imeiUnits: [...INITIAL_IMEI_UNITS],
    imeiHistories: [
      {
        id: 'hist_01',
        businessId: 'biz_konter_jaya',
        imei: '356611095551234',
        unitId: 'imei_unit_04',
        action: 'sold',
        referenceId: 'sale_demo_kj_01',
        branchId: 'br_roxy',
        operatorId: 'usr_rian_staff',
        operatorName: 'Rian Teknisi & Kasir',
        notes: 'Penjualan iPhone 13 128GB Midnight ke customer',
        timestamp: SEED_BASE_TIMESTAMP - 1 * 86400000,
      }
    ],
    sales: [
      {
        id: 'sale_demo_ks_01',
        saleNumber: 'TRX-20261012-DEM1',
        businessId: 'biz_kopi_senja',
        branchId: 'br_senopati',
        cashierId: 'usr_andi_kasir',
        cashierName: 'Andi Kasir',
        customerName: 'Meja 02 - Ferry',
        orderType: 'dine_in',
        tableNumber: 'Meja 02',
        lineItems: [
          {
            productId: 'prod_fnb_01',
            productName: 'Es Kopi Susu Senja',
            quantity: 2,
            unitPrice: 18000,
            subtotal: 36000,
            notes: 'Less Sugar 50%',
          },
          {
            productId: 'prod_fnb_04',
            productName: 'Butter Croissant',
            quantity: 1,
            unitPrice: 22000,
            subtotal: 22000,
          }
        ],
        subtotal: 58000,
        discount: 0,
        tax: 5800,
        serviceCharge: 0,
        grandTotal: 63800,
        paidAmount: 100000,
        changeAmount: 36200,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        orderStatus: 'preparing',
        cashSessionId: 'shift_senopati_active',
        createdAt: SEED_BASE_TIMESTAMP - 40 * 60000,
        updatedAt: SEED_BASE_TIMESTAMP - 40 * 60000,
      }
    ],
    cashSessions: [INITIAL_CASH_SESSION],
    tables: [...INITIAL_TABLES],
    stockAdjustments: [...INITIAL_STOCK_ADJUSTMENTS],
    purchaseOrders: [...INITIAL_PURCHASE_ORDERS],
  };
}

/**
 * Standard initialization function.
 * In production, always returns empty store so new users start with ZERO businesses.
 */
export function getInitialStore(): AppStoreData {
  if (process.env.NEXT_PUBLIC_ENABLE_DEMO_SEED === 'true') {
    return getDemoStore();
  }
  return getEmptyStore();
}

function getStorageKey(userUid?: string): string {
  return userUid ? `${STORAGE_KEY_BASE}_${userUid}` : STORAGE_KEY_BASE;
}

export function loadStore(userUid?: string): AppStoreData {
  if (typeof window === 'undefined') {
    return getInitialStore();
  }
  try {
    const key = getStorageKey(userUid);
    const raw = localStorage.getItem(key);
    if (!raw) {
      return getEmptyStore();
    }
    const parsed: AppStoreData = JSON.parse(raw);
    
    // Safety check: If user is not the demo owner, never load demo businesses
    if (userUid && userUid !== 'usr_owner_budi') {
      parsed.businesses = (parsed.businesses || []).filter(b => 
        b.id !== 'biz_kopi_senja' && b.id !== 'biz_konter_jaya' && b.id !== 'biz_toko_sembako'
      );
      parsed.branches = (parsed.branches || []).filter(br => 
        parsed.businesses.some(b => b.id === br.businessId)
      );
    }
    
    return parsed;
  } catch (err) {
    console.error('Failed to parse store from localStorage', err);
    return getEmptyStore();
  }
}

export function saveStore(data: AppStoreData, userUid?: string) {
  if (typeof window !== 'undefined') {
    try {
      const key = getStorageKey(userUid);
      localStorage.setItem(key, JSON.stringify(data));
      window.dispatchEvent(new Event('tokokoe_store_updated'));
    } catch (err) {
      console.error('Failed to save store to localStorage', err);
    }
  }
}

export function resetStore(userUid?: string): AppStoreData {
  const fresh = getEmptyStore();
  if (typeof window !== 'undefined') {
    const key = getStorageKey(userUid);
    localStorage.setItem(key, JSON.stringify(fresh));
    window.dispatchEvent(new Event('tokokoe_store_updated'));
  }
  return fresh;
}

export function resetToDemoStore(userUid?: string): AppStoreData {
  const demo = getDemoStore();
  if (typeof window !== 'undefined') {
    const key = getStorageKey(userUid);
    localStorage.setItem(key, JSON.stringify(demo));
    window.dispatchEvent(new Event('tokokoe_store_updated'));
  }
  return demo;
}
