'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { 
  Business, Branch, Product, ImeiUnit, ImeiHistory, 
  Sale, CashSession, TableItem, BusinessMember, 
  CartLineItem, OrderType, PaymentMethod, PaymentStatus, BusinessType,
  KitchenOrderStatus, UserRole, PermissionKey,
  StockAdjustment, PurchaseOrder, HeldCart, ReceiptSettings, MidtransSettings
} from '@/types';
import { loadStore, saveStore, resetStore, getInitialStore, resetToDemoStore, getEmptyStore, AppStoreData } from '@/lib/data/store';
import { useAuth } from './AuthContext';
import { DEFAULT_MODULES_BY_TYPE } from '@/lib/modules/registry';
import { DEFAULT_ROLE_PERMISSIONS, hasPermission } from '@/lib/permissions';
import { executePosCheckout } from '@/lib/services/checkout-service';
import { subscribeToBusinessTenant, subscribeToUserBusinesses } from '@/lib/services/firestore-repository';
import { db } from '@/lib/firebase/client';
import { doc, setDoc } from 'firebase/firestore';
import { cleanUndefined } from '@/lib/utils';
import { validateImei, validateDualSimDevice, normalizeImei } from '@/lib/validation/imei';
import { checkDuplicateBarcode, detectBarcodeType } from '@/lib/validation/barcode';

interface BusinessContextType {
  businesses: Business[];
  activeBusiness: Business | null;
  branches: Branch[];
  activeBranch: Branch | null;
  products: Product[];
  imeiUnits: ImeiUnit[];
  imeiHistories: ImeiHistory[];
  sales: Sale[];
  tables: TableItem[];
  members: BusinessMember[];
  stockAdjustments: StockAdjustment[];
  purchaseOrders: PurchaseOrder[];
  activeShift: CashSession | null;
  cashSessions: CashSession[];
  switchBusiness: (businessId: string) => void;
  switchBranch: (branchId: string) => void;
  isOnline: boolean;
  createBusiness: (name: string, businessType: BusinessType, address: string, phone: string) => Promise<Business>;
  updateBusinessProfile: (businessId: string, updates: { name: string; address?: string; phone?: string; logoUrl?: string; receiptSettings?: ReceiptSettings; midtransSettings?: MidtransSettings }) => Promise<{ success: boolean; business?: Business; error?: string }>;
  createBranch: (name: string, address: string, phone?: string) => Promise<{ success: boolean; branch?: Branch; error?: string }>;
  updateBranch: (branchId: string, updates: Partial<Branch>) => Promise<{ success: boolean; branch?: Branch; error?: string }>;
  deactivateBranch: (branchId: string) => Promise<{ success: boolean; error?: string }>;
  createProduct: (data: Partial<Product>) => Promise<{ success: boolean; product?: Product; error?: string }>;
  updateProduct: (productId: string, updates: Partial<Product>) => Promise<{ success: boolean; product?: Product; error?: string }>;
  archiveProduct: (productId: string) => Promise<{ success: boolean; error?: string }>;
  updateEmployee: (memberId: string, updates: { displayName?: string; role?: UserRole; branchIds?: string[]; status?: 'active' | 'inactive'; permissions?: PermissionKey[] }) => Promise<{ success: boolean; member?: BusinessMember; error?: string }>;
  reloadMembers: () => Promise<void>;
  processCheckout: (payload: {
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
    tableId?: string;
    customerName?: string;
  }) => Promise<{ success: boolean; sale?: Sale; error?: string }>;
  openShift: (openingCash: number, notes?: string) => Promise<CashSession>;
  closeShift: (actualCash: number, notes?: string) => Promise<CashSession>;
  recordCashMovement: (type: 'cash_in' | 'cash_out', amount: number, reason: string) => Promise<{ success: boolean; error?: string }>;
  addEmployee: (displayName: string, username: string, role: UserRole, branchIds: string[], initialPassword: string) => Promise<{ success: boolean; error?: string }>;
  heldCarts: HeldCart[];
  holdCart: (customerTag: string, lineItems: CartLineItem[], subtotal: number, discount: number, grandTotal: number) => HeldCart;
  removeHeldCart: (id: string) => void;
  refundSale: (data: { saleId: string; reason: string; refundPaymentMethod?: PaymentMethod }) => Promise<{ success: boolean; sale?: Sale; error?: string }>;
  sellInDevice: (data: {
    imei: string;
    imei2?: string;
    serialNumber?: string;
    brand: string;
    model: string;
    storage: string;
    color: string;
    condition: 'new' | 'second_grade_a' | 'second_grade_b';
    costPrice: number;
    sellingPrice: number;
    customerName: string;
    notes?: string;
  }) => Promise<{ success: boolean; unit?: ImeiUnit; error?: string }>;
  exchangeImei: (oldImei: string, newImei: string, reason: string, differenceFee: number) => Promise<{ success: boolean; error?: string }>;
  addTable: (tableNumber: string, capacity?: number) => TableItem;
  deleteTable: (tableId: string) => void;
  updateTableStatus: (tableId: string, status: 'available' | 'occupied' | 'reserved', customerName?: string) => void;
  moveTable: (fromTableId: string, toTableId: string) => Promise<{ success: boolean; error?: string }>;
  mergeTables: (fromTableId: string, targetTableId: string) => Promise<{ success: boolean; error?: string }>;
  openFnBOrder: (orderData: {
    orderType: 'dine_in' | 'takeaway';
    tableId?: string;
    tableNumber?: string;
    customerName?: string;
    lineItems: CartLineItem[];
    notes?: string;
  }) => Promise<{ success: boolean; sale?: Sale; error?: string }>;
  addItemsToFnBOrder: (saleId: string, lineItems: CartLineItem[]) => Promise<{ success: boolean; sale?: Sale; error?: string }>;
  cancelFnBOrder: (saleId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  updateOrderStatus: (saleId: string, status: KitchenOrderStatus, paymentStatus?: PaymentStatus, paidAmount?: number, changeAmount?: number) => Promise<void>;
  requestStockAdjustment: (data: {
    productId: string;
    productName: string;
    previousQty: number;
    adjustedQty: number;
    reason: string;
    imei?: string;
  }) => Promise<{ success: boolean; adjustment?: StockAdjustment; error?: string }>;
  reviewStockAdjustment: (adjustmentId: string, action: 'approved' | 'rejected') => Promise<{ success: boolean; error?: string }>;
  createPurchaseOrder: (data: {
    supplierName: string;
    items: {
      brand: string;
      model: string;
      storage: string;
      color: string;
      condition: 'new' | 'second_grade_a' | 'second_grade_b';
      costPrice: number;
      expectedSellingPrice: number;
      quantityOrdered: number;
    }[];
  }) => Promise<{ success: boolean; purchaseOrder?: PurchaseOrder; error?: string }>;
  receivePurchaseOrder: (data: {
    poId: string;
    poItemId: string;
    scannedImeis?: string[];
    imeiDetails?: Array<{ imei: string; imei2?: string; serialNumber?: string }>;
  }) => Promise<{ success: boolean; count?: number; error?: string }>;
  resetToDemoData: () => void;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const { user, getIdToken } = useAuth();
  // Initialize with getInitialStore() so SSR and initial client hydration match 100%
  const [storeData, setStoreData] = useState<AppStoreData>(getInitialStore);
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const isCheckingOutRef = useRef(false);
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const reloadData = useCallback(() => {
    if (user?.uid) {
      setStoreData(loadStore(user.uid));
    } else {
      setStoreData(getEmptyStore());
    }
  }, [user?.uid]);

  // Synchronize store with current authenticated user & fetch authoritative businesses
  useEffect(() => {
    if (!user?.uid) {
      setStoreData(getEmptyStore());
      setActiveBusinessId(null);
      setActiveBranchId(null);
      return;
    }

    // 1. Initial cached store load for immediate UI rendering
    setStoreData(loadStore(user.uid));

    let isSubscribed = true;

    // 2. Fetch authoritative user businesses from Firestore via server API
    const fetchAuthoritative = async () => {
      try {
        const token = await getIdToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/businesses/list', { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.success && isSubscribed) {
            setStoreData(prev => {
              const next = {
                ...prev,
                businesses: data.businesses || [],
                branches: data.branches && data.branches.length > 0 ? data.branches : prev.branches,
              };
              saveStore(next, user.uid);
              return next;
            });
          }
        }
      } catch (err) {
        console.warn("Authoritative business fetch notice:", err);
      }
    };

    fetchAuthoritative();

    // 3. Real-time Firestore subscription to user's businesses
    let unsubBusinesses = () => {};
    if (user.role !== 'employee') {
      unsubBusinesses = subscribeToUserBusinesses(user.uid, (liveBiz) => {
        if (!isSubscribed) return;
        setStoreData(prev => {
          const next = {
            ...prev,
            businesses: liveBiz,
          };
          saveStore(next, user.uid);
          return next;
        });
      });
    }

    const handleUpdate = () => reloadData();
    window.addEventListener('tokokoe_store_updated', handleUpdate);

    return () => {
      isSubscribed = false;
      unsubBusinesses();
      window.removeEventListener('tokokoe_store_updated', handleUpdate);
    };
  }, [user?.uid, getIdToken, reloadData]);

  // Real-time synchronization with Cloud Firestore for active business tenant
  useEffect(() => {
    if (!activeBusinessId) return;

    const isCostAllowed = user?.role !== 'employee' || 
      user?.memberRole === 'manager' || 
      user?.memberRole === 'accountant' || 
      (user?.permissions && user.permissions.includes('products.cost.read'));

    const unsubscribe = subscribeToBusinessTenant(activeBusinessId, (updates) => {
      // Direct Data Sanitization: Strip HPP metrics immediately upon receipt across WebSocket
      if (!isCostAllowed) {
        if (updates.products) {
          updates.products = updates.products.map(p => ({ ...p, costPrice: 0 }));
        }
        if (updates.imeiUnits) {
          updates.imeiUnits = updates.imeiUnits.map(u => ({ ...u, costPrice: 0 }));
        }
        if (updates.purchaseOrders) {
          updates.purchaseOrders = [];
        }
      }

      setStoreData((prev) => {
        let hasChanges = false;
        let newProducts = prev.products;
        let newBranches = prev.branches;
        let newMembers = prev.members;
        let newSales = prev.sales;
        let newImeiUnits = prev.imeiUnits;
        let newStockAdjustments = prev.stockAdjustments;
        let newPurchaseOrders = prev.purchaseOrders;
        let newImeiHistories = prev.imeiHistories;
        let newCashSessions = prev.cashSessions;
        let newTables = prev.tables;

        if (updates.products !== undefined) {
          const other = prev.products.filter(p => p.businessId !== activeBusinessId);
          newProducts = [...other, ...updates.products];
          hasChanges = true;
        }

        if (updates.branches !== undefined) {
          const other = prev.branches.filter(b => b.businessId !== activeBusinessId);
          newBranches = [...other, ...updates.branches];
          hasChanges = true;
        }

        if (updates.members !== undefined) {
          const other = prev.members.filter(m => m.businessId !== activeBusinessId);
          newMembers = [...other, ...updates.members];
          hasChanges = true;
        }

        if (updates.sales !== undefined) {
          const other = prev.sales.filter(s => s.businessId !== activeBusinessId);
          // Deduplicate sales by id
          const saleMap = new Map<string, Sale>();
          updates.sales.forEach(s => saleMap.set(s.id, s));
          other.forEach(s => {
            if (!saleMap.has(s.id)) saleMap.set(s.id, s);
          });
          newSales = Array.from(saleMap.values()).sort((a, b) => b.createdAt - a.createdAt);
          hasChanges = true;
        }

        if (updates.tables !== undefined) {
          const other = (prev.tables || []).filter(t => t.businessId !== activeBusinessId);
          newTables = [...other, ...updates.tables];
          hasChanges = true;
        }

        if (updates.imeiUnits !== undefined) {
          const other = prev.imeiUnits.filter(u => u.businessId !== activeBusinessId);
          newImeiUnits = [...other, ...updates.imeiUnits];
          hasChanges = true;
        }

        if (updates.stockAdjustments !== undefined) {
          const other = (prev.stockAdjustments || []).filter(a => a.businessId !== activeBusinessId);
          newStockAdjustments = [...other, ...updates.stockAdjustments];
          hasChanges = true;
        }

        if (updates.purchaseOrders !== undefined) {
          const other = (prev.purchaseOrders || []).filter(po => po.businessId !== activeBusinessId);
          newPurchaseOrders = [...other, ...updates.purchaseOrders];
          hasChanges = true;
        }

        if (updates.imeiHistories !== undefined) {
          const other = (prev.imeiHistories || []).filter(h => h.businessId !== activeBusinessId);
          newImeiHistories = [...other, ...updates.imeiHistories];
          hasChanges = true;
        }

        if (updates.cashSessions !== undefined) {
          const other = (prev.cashSessions || []).filter(cs => cs.businessId !== activeBusinessId);
          newCashSessions = [...other, ...updates.cashSessions];
          hasChanges = true;
        }

        if (!hasChanges) return prev;

        const next: AppStoreData = {
          ...prev,
          products: newProducts,
          branches: newBranches,
          members: newMembers,
          sales: newSales,
          tables: newTables,
          imeiUnits: newImeiUnits,
          stockAdjustments: newStockAdjustments,
          purchaseOrders: newPurchaseOrders,
          imeiHistories: newImeiHistories,
          cashSessions: newCashSessions,
        };

        // Never persist cost price or confidential supplier documents to unauthorized user localStorage
        saveStore(next, user?.uid, !isCostAllowed);
        return next;
      });
    });

    return () => unsubscribe();
  }, [activeBusinessId, user?.uid, user?.role, user?.memberRole, user?.permissions]);

  // Filter businesses strictly to only those owned by or assigned to the authenticated user
  const userBusinesses = React.useMemo(() => {
    if (!user?.uid) return [];
    if (user.uid === 'usr_owner_budi' && process.env.NEXT_PUBLIC_ENABLE_DEMO_SEED === 'true') {
      return storeData.businesses;
    }
    if (user.role === 'employee') {
      return storeData.businesses.filter(b => 
        !user.activeBusinessId || b.id === user.activeBusinessId || 
        (storeData.members || []).some(m => m.businessId === b.id && m.userId === user.uid)
      );
    }
    return storeData.businesses.filter(b => b.ownerId === user.uid);
  }, [user, storeData.businesses, storeData.members]);

  // Automatically keep activeBusinessId and activeBranchId in sync with userBusinesses
  useEffect(() => {
    if (userBusinesses.length === 0) {
      if (activeBusinessId !== null) setActiveBusinessId(null);
      if (activeBranchId !== null) setActiveBranchId(null);
      return;
    }

    const currentExists = userBusinesses.some(b => b.id === activeBusinessId);
    if (!currentExists) {
      const first = userBusinesses[0];
      setActiveBusinessId(first.id);
      const bBranches = storeData.branches.filter(br => br.businessId === first.id);
      if (bBranches.length > 0) {
        setActiveBranchId(bBranches[0].id);
      } else {
        setActiveBranchId(null);
      }
    }
  }, [userBusinesses, activeBusinessId, storeData.branches]);

  const activeBusiness = React.useMemo(() => {
    if (!activeBusinessId) return null;
    return userBusinesses.find(b => b.id === activeBusinessId) || null;
  }, [activeBusinessId, userBusinesses]);

  const branches = React.useMemo(() => {
    if (!activeBusiness) return [];
    return storeData.branches.filter(br => br.businessId === activeBusiness.id);
  }, [activeBusiness, storeData.branches]);

  const activeBranch = React.useMemo(() => {
    if (!activeBusiness) return null;
    return branches.find(br => br.id === activeBranchId) || branches[0] || null;
  }, [activeBusiness, branches, activeBranchId]);

  // RBAC Permission Check: Protect confidential cost prices (HPP)
  // Cashiers, waiters, and kitchen staff cannot access cost prices or purchase orders
  const canViewCostPrice = React.useMemo(() => {
    if (!user?.uid) return false;
    if (user.role !== 'employee') return true; // Owner has full access
    const member = (storeData.members || []).find(m => m.businessId === activeBusiness?.id && m.userId === user.uid);
    const role: UserRole = member?.role || 'cashier';
    return hasPermission(role, 'products.cost.read', member?.permissions);
  }, [user, storeData.members, activeBusiness]);

  const products = React.useMemo(() => {
    if (!activeBusiness) return [];
    const list = storeData.products.filter(p => p.businessId === activeBusiness.id);
    if (!canViewCostPrice) {
      return list.map(p => ({
        ...p,
        costPrice: 0, // Stripped for cashier / roles without products.cost.read
      }));
    }
    return list;
  }, [activeBusiness, storeData.products, canViewCostPrice]);

  const imeiUnits = React.useMemo(() => {
    if (!activeBusiness) return [];
    const list = storeData.imeiUnits.filter(u => u.businessId === activeBusiness.id);
    if (!canViewCostPrice) {
      return list.map(u => ({
        ...u,
        costPrice: 0, // Stripped for cashier
      }));
    }
    return list;
  }, [activeBusiness, storeData.imeiUnits, canViewCostPrice]);

  const imeiHistories = React.useMemo(() => {
    if (!activeBusiness) return [];
    return storeData.imeiHistories.filter(h => h.businessId === activeBusiness.id);
  }, [activeBusiness, storeData.imeiHistories]);

  const sales = React.useMemo(() => {
    if (!activeBusiness) return [];
    return storeData.sales.filter(s => s.businessId === activeBusiness.id);
  }, [activeBusiness, storeData.sales]);

  const tables = React.useMemo(() => {
    if (!activeBusiness) return [];
    return storeData.tables.filter(t => t.businessId === activeBusiness.id);
  }, [activeBusiness, storeData.tables]);

  const members = React.useMemo(() => {
    if (!activeBusiness) return [];
    return storeData.members.filter(m => m.businessId === activeBusiness.id);
  }, [activeBusiness, storeData.members]);

  const stockAdjustments = React.useMemo(() => {
    if (!activeBusiness) return [];
    return (storeData.stockAdjustments || []).filter(a => a.businessId === activeBusiness.id);
  }, [activeBusiness, storeData.stockAdjustments]);

  const purchaseOrders = React.useMemo(() => {
    if (!activeBusiness || !canViewCostPrice) return [];
    return (storeData.purchaseOrders || []).filter(po => po.businessId === activeBusiness.id);
  }, [activeBusiness, storeData.purchaseOrders, canViewCostPrice]);

  const activeShift = React.useMemo(() => {
    if (!activeBusiness || !activeBranch) return null;
    return storeData.cashSessions.find(
      s => s.businessId === activeBusiness.id && s.branchId === activeBranch.id && s.status === 'open'
    ) || null;
  }, [activeBusiness, activeBranch, storeData.cashSessions]);

  const switchBusiness = (bId: string) => {
    setActiveBusinessId(bId);
    const bBranches = storeData.branches.filter(br => br.businessId === bId && br.active !== false);
    let targetBranchId = bBranches.length > 0 ? bBranches[0].id : null;
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`tokokoe_active_branch_${bId}`);
        if (saved && bBranches.some(br => br.id === saved)) {
          targetBranchId = saved;
        }
      } catch (e) {
        // ignore
      }
    }
    setActiveBranchId(targetBranchId);
  };

  const switchBranch = (brId: string) => {
    setActiveBranchId(brId);
    if (activeBusinessId && typeof window !== 'undefined') {
      try {
        localStorage.setItem(`tokokoe_active_branch_${activeBusinessId}`, brId);
      } catch (e) {
        // ignore
      }
    }
  };

  const createBusiness = async (
    name: string, 
    businessType: BusinessType, 
    address: string, 
    phone: string
  ): Promise<Business> => {
    const token = await getIdToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/businesses/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, businessType, address, phone })
    });

    const resData = await res.json();
    if (!res.ok || !resData.success) {
      throw new Error(resData.message || 'Gagal menyimpan bisnis ke server');
    }

    const createdBiz: Business = resData.business;
    const createdBranch: Branch = resData.branch;

    setStoreData(prev => {
      const next = {
        ...prev,
        businesses: [createdBiz, ...prev.businesses.filter(b => b.id !== createdBiz.id)],
        branches: [createdBranch, ...prev.branches.filter(br => br.id !== createdBranch.id)],
      };
      saveStore(next, user?.uid);
      return next;
    });

    setActiveBusinessId(createdBiz.id);
    setActiveBranchId(createdBranch.id);
    return createdBiz;
  };

  const updateBusinessProfile = async (
    businessId: string, 
    updates: { name: string; address?: string; phone?: string; logoUrl?: string; receiptSettings?: ReceiptSettings; midtransSettings?: MidtransSettings }
  ): Promise<{ success: boolean; business?: Business; error?: string }> => {
    try {
      const token = await getIdToken();
      const res = await fetch('/api/businesses/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          businessId,
          ...updates,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        return { success: false, error: data.message || 'Gagal menyimpan profil usaha.' };
      }
      setStoreData(prev => {
        const next = {
          ...prev,
          businesses: prev.businesses.map(b => b.id === businessId ? data.business : b),
        };
        saveStore(next, user?.uid, !canViewCostPrice);
        return next;
      });
      return { success: true, business: data.business };
    } catch (err: any) {
      return { success: false, error: err.message || 'Terjadi kesalahan sistem saat menyimpan profil bisnis.' };
    }
  };

  const createBranch = async (
    name: string, 
    address: string, 
    phone?: string
  ): Promise<{ success: boolean; branch?: Branch; error?: string }> => {
    if (!activeBusinessId) return { success: false, error: 'Bisnis aktif belum dipilih.' };
    try {
      const token = await getIdToken();
      const res = await fetch('/api/branches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          businessId: activeBusinessId,
          name,
          address,
          phone,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        return { success: false, error: data.message || 'Gagal menambahkan cabang.' };
      }
      const newBr: Branch = data.branch;
      setStoreData(prev => {
        const next = {
          ...prev,
          branches: [...prev.branches.filter(b => b.id !== newBr.id), newBr],
        };
        saveStore(next, user?.uid, !canViewCostPrice);
        return next;
      });
      return { success: true, branch: newBr };
    } catch (err: any) {
      return { success: false, error: err.message || 'Terjadi kesalahan sistem saat membuat cabang.' };
    }
  };

  const updateBranch = async (
    branchId: string, 
    updates: Partial<Branch>
  ): Promise<{ success: boolean; branch?: Branch; error?: string }> => {
    if (!activeBusinessId) return { success: false, error: 'Bisnis aktif belum dipilih.' };
    try {
      const token = await getIdToken();
      const res = await fetch('/api/branches', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          businessId: activeBusinessId,
          branchId,
          ...updates,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        return { success: false, error: data.message || 'Gagal memperbarui cabang.' };
      }
      const updatedBr: Branch = data.branch;
      setStoreData(prev => {
        const next = {
          ...prev,
          branches: prev.branches.map(b => b.id === branchId ? updatedBr : b),
        };
        saveStore(next, user?.uid, !canViewCostPrice);
        return next;
      });
      return { success: true, branch: updatedBr };
    } catch (err: any) {
      return { success: false, error: err.message || 'Terjadi kesalahan sistem saat memperbarui cabang.' };
    }
  };

  const deactivateBranch = async (
    branchId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!activeBusinessId) return { success: false, error: 'Bisnis aktif belum dipilih.' };
    try {
      const token = await getIdToken();
      const res = await fetch('/api/branches', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          businessId: activeBusinessId,
          branchId,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        return { success: false, error: data.message || 'Gagal menonaktifkan cabang.' };
      }
      setStoreData(prev => {
        const next = {
          ...prev,
          branches: prev.branches.map(b => b.id === branchId ? { ...b, active: false } : b),
        };
        saveStore(next, user?.uid, !canViewCostPrice);
        return next;
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Terjadi kesalahan sistem saat menonaktifkan cabang.' };
    }
  };

  const createProduct = async (data: Partial<Product>): Promise<{ success: boolean; product?: Product; error?: string }> => {
    const targetBusinessId = activeBusinessId || '';
    if (!targetBusinessId) return { success: false, error: 'Bisnis aktif belum dipilih.' };
    try {
      const token = await getIdToken();
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          businessId: targetBusinessId,
          ...data,
        }),
      });
      const resData = await res.json();
      if (!resData.success) {
        return { success: false, error: resData.message || 'Gagal menambahkan produk.' };
      }
      const authoritativeProd: Product = resData.product;
      setStoreData(prev => {
        const next = {
          ...prev,
          products: [...prev.products.filter(p => p.id !== authoritativeProd.id), authoritativeProd],
        };
        saveStore(next, user?.uid, !canViewCostPrice);
        return next;
      });
      return { success: true, product: authoritativeProd };
    } catch (err: any) {
      return { success: false, error: err.message || 'Terjadi kesalahan sistem saat menyimpan produk.' };
    }
  };

  const updateProduct = async (productId: string, updates: Partial<Product>): Promise<{ success: boolean; product?: Product; error?: string }> => {
    const targetBusinessId = activeBusinessId || '';
    if (!targetBusinessId) return { success: false, error: 'Bisnis aktif belum dipilih.' };
    try {
      const token = await getIdToken();
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          businessId: targetBusinessId,
          productId,
          ...updates,
        }),
      });
      const resData = await res.json();
      if (!resData.success) {
        return { success: false, error: resData.message || 'Gagal memperbarui data produk.' };
      }
      const updatedProd: Product = resData.product;
      setStoreData(prev => {
        const next = {
          ...prev,
          products: prev.products.map(p => p.id === productId ? updatedProd : p),
        };
        saveStore(next, user?.uid, !canViewCostPrice);
        return next;
      });
      return { success: true, product: updatedProd };
    } catch (err: any) {
      return { success: false, error: err.message || 'Terjadi kesalahan sistem saat memperbarui produk.' };
    }
  };

  const archiveProduct = async (productId: string): Promise<{ success: boolean; error?: string }> => {
    const targetBusinessId = activeBusinessId || '';
    if (!targetBusinessId) return { success: false, error: 'Bisnis aktif belum dipilih.' };
    try {
      const token = await getIdToken();
      const res = await fetch('/api/products', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          businessId: targetBusinessId,
          productId,
        }),
      });
      const resData = await res.json();
      if (!resData.success) {
        return { success: false, error: resData.message || 'Gagal menonaktifkan produk.' };
      }
      setStoreData(prev => {
        const next = {
          ...prev,
          products: prev.products.map(p => p.id === productId ? { ...p, isActive: false, available: false, archivedAt: Date.now() } : p),
        };
        saveStore(next, user?.uid, !canViewCostPrice);
        return next;
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Terjadi kesalahan sistem saat menonaktifkan produk.' };
    }
  };

  const updateEmployee = async (
    memberId: string, 
    updates: { displayName?: string; role?: UserRole; branchIds?: string[]; status?: 'active' | 'inactive'; permissions?: PermissionKey[] }
  ): Promise<{ success: boolean; member?: BusinessMember; error?: string }> => {
    if (!activeBusinessId) return { success: false, error: 'Bisnis aktif belum dipilih.' };
    try {
      const token = await getIdToken();
      const res = await fetch('/api/employees/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          businessId: activeBusinessId,
          memberId,
          ...updates,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        return { success: false, error: data.message || 'Gagal memperbarui data karyawan.' };
      }
      const updatedMem: BusinessMember = data.member;
      setStoreData(prev => {
        const next = {
          ...prev,
          members: prev.members.map(m => m.id === memberId ? updatedMem : m),
        };
        saveStore(next, user?.uid, !canViewCostPrice);
        return next;
      });
      return { success: true, member: updatedMem };
    } catch (err: any) {
      return { success: false, error: err.message || 'Terjadi kesalahan sistem saat memperbarui karyawan.' };
    }
  };

  const reloadMembers = async (): Promise<void> => {
    if (!activeBusinessId) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/employees/list?businessId=${activeBusinessId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.members) {
          setStoreData(prev => {
            const other = prev.members.filter(m => m.businessId !== activeBusinessId);
            const next = {
              ...prev,
              members: [...other, ...data.members],
            };
            saveStore(next, user?.uid, !canViewCostPrice);
            return next;
          });
        }
      }
    } catch (err) {
      console.warn("Notice: could not reload members:", err);
    }
  };

  // Server-authoritative checkout process: Calls /api/sales/checkout and persists to Cloud Firestore
  const processCheckout = async (payload: {
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
    tableId?: string;
    customerName?: string;
  }): Promise<{ success: boolean; sale?: Sale; error?: string }> => {
    if (isCheckingOutRef.current) {
      return { success: false, error: 'Transaksi sedang diproses, mohon tunggu sebentar...' };
    }
    if (!activeBranch) {
      return { success: false, error: 'Cabang aktif belum dipilih.' };
    }
    if (payload.lineItems.length === 0) {
      return { success: false, error: 'Keranjang belanja masih kosong.' };
    }

    isCheckingOutRef.current = true;
    try {
      const res = await executePosCheckout({
        businessId: activeBusinessId || '',
        branchId: activeBranch.id,
        lineItems: payload.lineItems,
        subtotal: payload.subtotal,
        discount: payload.discount,
        tax: payload.tax,
        serviceCharge: payload.serviceCharge,
        grandTotal: payload.grandTotal,
        paidAmount: payload.paidAmount,
        changeAmount: payload.changeAmount,
        paymentMethod: payload.paymentMethod,
        orderType: payload.orderType,
        tableNumber: payload.tableNumber,
        tableId: payload.tableId,
        customerName: payload.customerName,
        cashSessionId: activeShift?.id,
      }, getIdToken);

      if (!res.success || !res.sale) {
        return { success: false, error: res.error || 'Gagal memproses transaksi pada server.' };
      }

      const authoritativeSale = res.sale;

      // Server-authoritative state synchronization with immutable updates & deduplication
      setStoreData(prev => {
        // Prevent duplicate sale if real-time listener already added it
        const alreadyExists = prev.sales.some(s => s.id === authoritativeSale.id);
        const updatedSales = alreadyExists 
          ? prev.sales 
          : [authoritativeSale, ...prev.sales];

        // Deduct stock immutably only if listener hasn't already delivered the deducted stock
        const updatedProducts = alreadyExists
          ? prev.products
          : prev.products.map(prod => {
              const line = authoritativeSale.lineItems.find(item => item.productId === prod.id);
              if (!line || !prod.trackStock) return prod;
              return {
                ...prod,
                stockQty: Math.max(0, prod.stockQty - line.quantity),
              };
            });

        const updatedImeis = alreadyExists
          ? prev.imeiUnits
          : prev.imeiUnits.map(unit => {
              const line = authoritativeSale.lineItems.find(item => item.imei === unit.imei);
              if (!line) return unit;
              return {
                ...unit,
                status: 'sold' as const,
                soldAtSaleId: authoritativeSale.id,
              };
            });

        const updatedSessions = prev.cashSessions.map(cs => {
          if (activeShift && cs.id === activeShift.id && payload.paymentMethod === 'cash' && !alreadyExists) {
            return {
              ...cs,
              cashSalesTotal: cs.cashSalesTotal + authoritativeSale.grandTotal,
              expectedClosingCash: cs.expectedClosingCash + authoritativeSale.grandTotal,
            };
          }
          return cs;
        });

        const updatedTables = prev.tables.map(tbl => {
          if (payload.tableNumber && tbl.tableNumber === payload.tableNumber && tbl.businessId === activeBusinessId) {
            return {
              ...tbl,
              status: 'occupied' as const,
              activeSaleId: authoritativeSale.id,
              customerName: payload.customerName,
            };
          }
          return tbl;
        });

        const nextStore: AppStoreData = {
          ...prev,
          products: updatedProducts,
          imeiUnits: updatedImeis,
          sales: updatedSales,
          cashSessions: updatedSessions,
          tables: updatedTables,
        };

        saveStore(nextStore, user?.uid, !canViewCostPrice);
        return nextStore;
      });

      return { success: true, sale: authoritativeSale };
    } finally {
      isCheckingOutRef.current = false;
    }
  };


  const openShift = async (openingCash: number, notes?: string): Promise<CashSession> => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/shifts/open', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: activeBusinessId,
          branchId: activeBranch?.id || 'br_main',
          openingCash: Math.round(Number(openingCash)),
          notes: notes?.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal membuka shift kasir.');
      }

      const authoritativeShift: CashSession = data.shift;
      setStoreData(prev => {
        const otherSessions = prev.cashSessions.filter(s => s.id !== authoritativeShift.id);
        const nextStore = {
          ...prev,
          cashSessions: [authoritativeShift, ...otherSessions],
        };
        saveStore(nextStore, user?.uid, !canViewCostPrice);
        return nextStore;
      });

      return authoritativeShift;
    } catch (err: any) {
      console.error('Error opening shift:', err);
      throw err;
    }
  };

  const closeShift = async (actualCash: number, notes?: string): Promise<CashSession> => {
    if (!activeShift) {
      throw new Error('Tidak ada shift kasir yang sedang aktif.');
    }

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/shifts/close', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: activeBusinessId,
          cashSessionId: activeShift.id,
          actualClosingCash: Math.round(Number(actualCash)),
          notes: notes?.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal menutup shift kasir.');
      }

      const authoritativeShift: CashSession = data.shift;
      setStoreData(prev => {
        const updated = prev.cashSessions.map(s => s.id === authoritativeShift.id ? authoritativeShift : s);
        const nextStore = {
          ...prev,
          cashSessions: updated,
        };
        saveStore(nextStore, user?.uid, !canViewCostPrice);
        return nextStore;
      });

      return authoritativeShift;
    } catch (err: any) {
      console.error('Error closing shift:', err);
      throw err;
    }
  };

  const recordCashMovement = async (
    type: 'cash_in' | 'cash_out',
    amount: number,
    reason: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!activeShift) {
      return { success: false, error: 'Tidak ada shift kasir yang sedang aktif.' };
    }

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/shifts/cash-movement', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: activeBusinessId,
          cashSessionId: activeShift.id,
          type,
          amount: Math.round(Number(amount)),
          reason: reason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.message || 'Gagal mencatat mutasi kas kasir.' };
      }

      if (data.shift) {
        setStoreData(prev => {
          const updated = prev.cashSessions.map(s => s.id === data.shift.id ? data.shift : s);
          const nextStore = {
            ...prev,
            cashSessions: updated,
          };
          saveStore(nextStore, user?.uid, !canViewCostPrice);
          return nextStore;
        });
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Gagal menghubungi server mutasi kas.' };
    }
  };

  const addEmployee = async (
    displayName: string, 
    username: string, 
    role: UserRole, 
    branchIds: string[], 
    initialPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanUsername = username.trim().toLowerCase();

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/employees/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: activeBusinessId,
          displayName,
          username: cleanUsername,
          role,
          branchIds,
          initialPassword,
        }),
      });

      let data: any;
      try {
        data = await res.json();
      } catch {
        return {
          success: false,
          error: `Gagal memproses respon server (Status: ${res.status}). Silakan coba beberapa saat lagi.`
        };
      }

      if (!res.ok || !data?.success) {
        return { success: false, error: data?.message || 'Gagal membuat akun karyawan di server.' };
      }

      const newMember: BusinessMember = {
        id: `mem_${data.user?.uid || Date.now()}`,
        userId: data.user?.uid || `usr_emp_${Date.now()}`,
        businessId: activeBusinessId || '',
        displayName,
        username: cleanUsername,
        role,
        branchIds,
        permissions: DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.cashier,
        status: 'active',
        joinedAt: Date.now(),
      };

      const newStore = { ...storeData };
      newStore.members.push(newMember);
      saveStore(newStore, user?.uid);
      setStoreData(newStore);

      return { success: true };
    } catch (err: any) {
      console.error("addEmployee exception:", err);
      return { success: false, error: err.message || 'Terjadi kesalahan sistem saat menghubungi server.' };
    }
  };


  const holdCart = (
    customerTag: string, 
    lineItems: CartLineItem[], 
    subtotal: number, 
    discount: number, 
    grandTotal: number
  ): HeldCart => {
    const newHeld: HeldCart = {
      id: `held_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      businessId: activeBusinessId || '',
      branchId: activeBranch?.id || '',
      customerTag: customerTag.trim() || undefined,
      lineItems,
      subtotal,
      discount,
      grandTotal,
      createdAt: Date.now(),
      cashierId: user?.uid || '',
      cashierName: user?.displayName || 'Kasir',
    };
    setHeldCarts(prev => [newHeld, ...prev]);
    return newHeld;
  };

  const removeHeldCart = (id: string) => {
    setHeldCarts(prev => prev.filter(c => c.id !== id));
  };

  const refundSale = async (data: {
    saleId: string;
    reason: string;
    refundPaymentMethod?: PaymentMethod;
  }): Promise<{ success: boolean; sale?: Sale; error?: string }> => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/sales/refund', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: activeBusinessId,
          branchId: activeBranch?.id || 'br_main',
          saleId: data.saleId,
          reason: data.reason,
          refundPaymentMethod: data.refundPaymentMethod,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        return { success: false, error: resData.message || 'Gagal memproses refund transaksi.' };
      }

      const refundedSale: Sale = resData.sale;

      setStoreData(prev => {
        const updatedSales = prev.sales.map(s => s.id === refundedSale.id ? refundedSale : s);
        // Also restore physical stock in local storeData if non-serialized
        const updatedProducts = prev.products.map(p => {
          const item = refundedSale.lineItems.find(li => li.productId === p.id && !li.imei);
          if (item) {
            return { ...p, stockQty: p.stockQty + item.quantity };
          }
          return p;
        });
        // Also restore IMEI units to available
        const updatedImeis = prev.imeiUnits.map(u => {
          const item = refundedSale.lineItems.find(li => li.imei === u.imei);
          if (item) {
            return { ...u, status: 'available' as const, soldAtSaleId: '' };
          }
          return u;
        });

        const nextStore = {
          ...prev,
          sales: updatedSales,
          products: updatedProducts,
          imeiUnits: updatedImeis,
        };
        saveStore(nextStore, user?.uid, !canViewCostPrice);
        return nextStore;
      });

      return { success: true, sale: refundedSale };
    } catch (err: any) {
      return { success: false, error: err.message || 'Terjadi gangguan jaringan saat memproses refund.' };
    }
  };

  const sellInDevice = async (data: {
    imei: string;
    imei2?: string;
    serialNumber?: string;
    brand: string;
    model: string;
    storage: string;
    color: string;
    condition: 'new' | 'second_grade_a' | 'second_grade_b';
    costPrice: number;
    sellingPrice: number;
    customerName: string;
    notes?: string;
  }): Promise<{ success: boolean; unit?: ImeiUnit; error?: string }> => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/phone/sell-in', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: activeBusinessId,
          branchId: activeBranch?.id || 'br_main',
          imei: data.imei,
          imei2: data.imei2,
          serialNumber: data.serialNumber,
          brand: data.brand,
          model: data.model,
          storage: data.storage,
          color: data.color,
          condition: data.condition,
          costPrice: data.costPrice,
          sellingPrice: data.sellingPrice,
          customerName: data.customerName,
          cashSessionId: activeShift?.id,
          notes: data.notes,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        return { success: false, error: resData.message || 'Gagal memproses Sell In perangkat.' };
      }

      const createdUnit: ImeiUnit = resData.unit;

      setStoreData(prev => {
        const nextStore = {
          ...prev,
          imeiUnits: [createdUnit, ...prev.imeiUnits.filter(u => u.imei !== createdUnit.imei)],
        };
        saveStore(nextStore, user?.uid, !canViewCostPrice);
        return nextStore;
      });

      return { success: true, unit: createdUnit };
    } catch (err: any) {
      return { success: false, error: err.message || 'Terjadi gangguan jaringan saat memproses Sell In.' };
    }
  };

  const exchangeImei = async (
    oldImei: string, 
    newImei: string, 
    reason: string, 
    differenceFee: number
  ): Promise<{ success: boolean; error?: string }> => {
    const oldVal = validateImei(oldImei, { fieldLabel: 'IMEI unit lama' });
    if (!oldVal.valid) {
      return { success: false, error: oldVal.error };
    }
    const newVal = validateImei(newImei, { fieldLabel: 'IMEI unit pengganti' });
    if (!newVal.valid) {
      return { success: false, error: newVal.error };
    }
    if (oldVal.normalized === newVal.normalized) {
      return { success: false, error: 'IMEI unit lama dan unit pengganti tidak boleh sama.' };
    }

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/phone/exchange', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: activeBusinessId,
          branchId: activeBranch?.id || 'br_roxy',
          oldImei: oldVal.normalized,
          newImei: newVal.normalized,
          reason,
          differenceFee,
          cashSessionId: activeShift?.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.message || 'Gagal memproses tukar unit di server.' };
      }

      // Optimistically update local cache
      const newStore = { ...storeData };
      const oldUnit = newStore.imeiUnits.find(u => u.imei === oldVal.normalized);
      const replacementUnit = newStore.imeiUnits.find(u => u.imei === newVal.normalized);
      if (oldUnit) {
        oldUnit.status = 'quarantined';
        oldUnit.notes = `Unit bermasalah ditukar: ${reason}`;
      }
      if (replacementUnit) {
        replacementUnit.status = 'sold';
      }
      saveStore(newStore, user?.uid, !canViewCostPrice);
      setStoreData(newStore);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Terjadi gangguan jaringan saat memproses tukar unit.' };
    }
  };

  const addTable = (tableNumber: string, capacity: number = 4): TableItem => {
    const branchId = activeBranch?.id || branches[0]?.id || 'branch_default';
    const newTbl: TableItem = {
      id: `tbl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      businessId: activeBusinessId || '',
      branchId,
      tableNumber,
      capacity,
      status: 'available',
    };

    setStoreData(prev => {
      const nextStore = { ...prev, tables: [...(prev.tables || []), newTbl] };
      saveStore(nextStore, user?.uid, !canViewCostPrice);
      return nextStore;
    });

    if (activeBusinessId) {
      getIdToken().then(token => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        fetch('/api/fnb/tables', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'create',
            businessId: activeBusinessId,
            branchId,
            tableNumber,
            capacity,
          }),
        }).catch(err => console.warn('Failed to sync table create to backend:', err));
      });
    }

    return newTbl;
  };

  const deleteTable = (tableId: string) => {
    setStoreData(prev => {
      const nextStore = { ...prev, tables: (prev.tables || []).filter(t => t.id !== tableId) };
      saveStore(nextStore, user?.uid, !canViewCostPrice);
      return nextStore;
    });

    if (activeBusinessId) {
      getIdToken().then(token => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        fetch('/api/fnb/tables', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'delete',
            businessId: activeBusinessId,
            branchId: activeBranch?.id || branches[0]?.id || 'branch_default',
            tableId,
          }),
        }).catch(err => console.warn('Failed to sync table delete to backend:', err));
      });
    }
  };

  const updateTableStatus = (tableId: string, status: 'available' | 'occupied' | 'reserved', customerName?: string) => {
    setStoreData(prev => {
      const updatedTables = (prev.tables || []).map(t => {
        if (t.id === tableId) {
          return {
            ...t,
            status,
            customerName: status === 'available' ? undefined : (customerName ?? t.customerName),
            activeSaleId: status === 'available' ? undefined : t.activeSaleId,
          };
        }
        return t;
      });
      const nextStore = { ...prev, tables: updatedTables };
      saveStore(nextStore, user?.uid, !canViewCostPrice);
      return nextStore;
    });

    if (activeBusinessId) {
      getIdToken().then(token => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        fetch('/api/fnb/tables', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'update_status',
            businessId: activeBusinessId,
            branchId: activeBranch?.id || branches[0]?.id || 'branch_default',
            tableId,
            status,
            customerName,
          }),
        }).catch(err => console.warn('Failed to sync table status to backend:', err));
      });
    }
  };

  const moveTable = async (fromTableId: string, toTableId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/fnb/tables', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'move_table',
          businessId: activeBusinessId,
          branchId: activeBranch?.id || branches[0]?.id || 'branch_default',
          fromTableId,
          toTableId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.message || 'Gagal memindahkan meja.' };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Gagal menghubungi server untuk pindah meja.' };
    }
  };

  const mergeTables = async (fromTableId: string, targetTableId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/fnb/tables', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'merge_tables',
          businessId: activeBusinessId,
          branchId: activeBranch?.id || branches[0]?.id || 'branch_default',
          fromTableId,
          targetTableId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.message || 'Gagal menggabungkan meja.' };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Gagal menghubungi server untuk gabung meja.' };
    }
  };

  const openFnBOrder = async (orderData: {
    orderType: 'dine_in' | 'takeaway';
    tableId?: string;
    tableNumber?: string;
    customerName?: string;
    lineItems: CartLineItem[];
    notes?: string;
  }): Promise<{ success: boolean; sale?: Sale; error?: string }> => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/fnb/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'open',
          businessId: activeBusinessId,
          branchId: activeBranch?.id || branches[0]?.id || 'branch_default',
          ...orderData,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.message || 'Gagal membuka pesanan meja.' };
      }
      return { success: true, sale: data.sale };
    } catch (err: any) {
      return { success: false, error: err.message || 'Gagal menghubungi server pesanan F&B.' };
    }
  };

  const addItemsToFnBOrder = async (
    saleId: string, 
    lineItems: CartLineItem[]
  ): Promise<{ success: boolean; sale?: Sale; error?: string }> => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/fnb/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'add_items',
          businessId: activeBusinessId,
          branchId: activeBranch?.id || branches[0]?.id || 'branch_default',
          saleId,
          lineItems,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.message || 'Gagal menambah item ke pesanan.' };
      }
      return { success: true, sale: data.sale };
    } catch (err: any) {
      return { success: false, error: err.message || 'Gagal menghubungi server untuk menambah item.' };
    }
  };

  const cancelFnBOrder = async (
    saleId: string, 
    reason: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/fnb/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'cancel',
          businessId: activeBusinessId,
          branchId: activeBranch?.id || branches[0]?.id || 'branch_default',
          saleId,
          reason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.message || 'Gagal membatalkan pesanan.' };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Gagal menghubungi server untuk pembatalan pesanan.' };
    }
  };

  const updateOrderStatus = async (
    saleId: string, 
    status: KitchenOrderStatus, 
    paymentStatus?: PaymentStatus, 
    paidAmount?: number,
    changeAmount?: number
  ) => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch('/api/fnb/kitchen/orders', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          businessId: activeBusinessId,
          branchId: activeBranch?.id || 'br_main',
          saleId,
          orderStatus: status,
          paymentStatus,
          paidAmount,
          changeAmount,
        }),
      });
    } catch (e) {
      console.warn("Kitchen order sync notice:", e);
    }

    setStoreData(prev => {
      const updatedSales = prev.sales.map(s => 
        s.id === saleId 
          ? { 
              ...s, 
              orderStatus: status, 
              ...(paymentStatus ? { paymentStatus } : {}),
              ...(paidAmount !== undefined ? { 
                paidAmount, 
                changeAmount: changeAmount !== undefined ? changeAmount : Math.max(0, paidAmount - s.grandTotal) 
              } : {}),
              updatedAt: Date.now() 
            } 
          : s
      );
      const nextStore = { ...prev, sales: updatedSales };
      saveStore(nextStore, user?.uid, !canViewCostPrice);
      return nextStore;
    });
  };

  const requestStockAdjustment = async (data: {
    productId: string;
    productName: string;
    previousQty: number;
    adjustedQty: number;
    reason: string;
    imei?: string;
  }) => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/inventory/adjustments/request', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: activeBusinessId,
          branchId: activeBranch?.id || 'br_main',
          productId: data.productId,
          productName: data.productName,
          previousQty: data.previousQty,
          adjustedQty: data.adjustedQty,
          reason: data.reason,
          imei: data.imei,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        return {
          success: false,
          error: resData.message || 'Gagal mengajukan penyesuaian stok ke server.',
        };
      }

      const authoritativeAdj: StockAdjustment = resData.adjustment;
      setStoreData(prev => {
        const withoutExisting = (prev.stockAdjustments || []).filter(a => a.id !== authoritativeAdj.id);
        const nextStore = {
          ...prev,
          stockAdjustments: [authoritativeAdj, ...withoutExisting],
        };
        saveStore(nextStore, user?.uid, !canViewCostPrice);
        return nextStore;
      });

      return { success: true, adjustment: authoritativeAdj };
    } catch (err: any) {
      return { success: false, error: err.message || 'Gagal menghubungi server penyesuaian stok.' };
    }
  };

  const reviewStockAdjustment = async (adjustmentId: string, action: 'approved' | 'rejected') => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/inventory/adjustments/review', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: activeBusinessId,
          adjustmentId,
          action,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        return {
          success: false,
          error: resData.message || 'Gagal memproses review penyesuaian stok.',
        };
      }

      const authoritativeAdj: StockAdjustment = resData.adjustment;
      setStoreData(prev => {
        const updatedAdjs = (prev.stockAdjustments || []).map(a => 
          a.id === adjustmentId ? authoritativeAdj : a
        );

        let updatedProducts = prev.products;
        if (action === 'approved' && authoritativeAdj) {
          updatedProducts = prev.products.map(p => {
            if (p.id === authoritativeAdj.productId) {
              return {
                ...p,
                stockQty: authoritativeAdj.adjustedQty,
                updatedAt: Date.now(),
              };
            }
            return p;
          });
        }

        const nextStore = {
          ...prev,
          products: updatedProducts,
          stockAdjustments: updatedAdjs,
        };
        saveStore(nextStore, user?.uid, !canViewCostPrice);
        return nextStore;
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Gagal memproses persetujuan penyesuaian stok.' };
    }
  };

  const createPurchaseOrder = async (data: {
    supplierName: string;
    items: {
      brand: string;
      model: string;
      storage: string;
      color: string;
      condition: 'new' | 'second_grade_a' | 'second_grade_b';
      costPrice: number;
      expectedSellingPrice: number;
      quantityOrdered: number;
    }[];
  }) => {
    const now = Date.now();
    const poId = `po_${now}_${Math.random().toString(36).substring(2, 6)}`;
    const poNumber = `PO-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;

    const poItems = data.items.map((item, idx) => ({
      id: `poi_${now}_${idx}`,
      brand: item.brand,
      model: item.model,
      storage: item.storage,
      color: item.color,
      condition: item.condition,
      costPrice: item.costPrice,
      expectedSellingPrice: item.expectedSellingPrice,
      quantityOrdered: item.quantityOrdered,
      quantityReceived: 0,
      receivedImeis: [],
    }));

    const totalCost = poItems.reduce((sum, item) => sum + (item.costPrice * item.quantityOrdered), 0);

    const newPO: PurchaseOrder = {
      id: poId,
      poNumber,
      businessId: activeBusinessId || '',
      branchId: activeBranch?.id || 'br_main',
      supplierName: data.supplierName,
      items: poItems,
      totalCost,
      status: 'ordered',
      createdBy: user?.uid || 'usr_owner',
      createdByName: user?.displayName || 'Owner',
      createdAt: now,
      updatedAt: now,
    };

    const newStore = { ...storeData };
    newStore.purchaseOrders.unshift(newPO);
    saveStore(newStore, user?.uid);
    setStoreData(newStore);

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/phone/purchase-orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: activeBusinessId,
          branchId: activeBranch?.id || 'br_main',
          supplierName: data.supplierName,
          createdBy: user?.uid || 'usr_owner',
          createdByName: user?.displayName || 'Owner',
          items: data.items,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        return { success: false, error: resData.message || 'Gagal menyimpan Purchase Order ke database server.' };
      }
      return { success: true, purchaseOrder: resData.purchaseOrder || newPO };
    } catch (err: any) {
      console.warn('Background PO sync notice:', err.message);
      return { success: true, purchaseOrder: newPO };
    }
  };

  const receivePurchaseOrder = async (data: {
    poId: string;
    poItemId: string;
    scannedImeis?: string[];
    imeiDetails?: Array<{ imei: string; imei2?: string; serialNumber?: string }>;
  }) => {
    // 1. Client-side Luhn verification before network trip
    const itemsToCheck: Array<{ imei: string; imei2?: string; serialNumber?: string }> = [];
    if (data.imeiDetails && data.imeiDetails.length > 0) {
      itemsToCheck.push(...data.imeiDetails);
    } else if (data.scannedImeis && data.scannedImeis.length > 0) {
      for (const s of data.scannedImeis) itemsToCheck.push({ imei: s });
    } else {
      return { success: false, error: 'Daftar IMEI yang discan tidak boleh kosong.' };
    }

    for (const it of itemsToCheck) {
      const check = validateDualSimDevice({ imei1: it.imei, imei2: it.imei2, serialNumber: it.serialNumber });
      if (!check.valid) {
        return { success: false, error: check.error || 'Format IMEI tidak valid (gagal Luhn checksum).' };
      }
    }

    // 2. Authoritative server transaction call
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/phone/purchase-orders/receive', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: activeBusinessId,
          branchId: activeBranch?.id || 'br_main',
          poId: data.poId,
          poItemId: data.poItemId,
          scannedImeis: data.scannedImeis,
          imeiDetails: data.imeiDetails,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        return { success: false, error: resData.message || 'Gagal memproses penerimaan IMEI di server.' };
      }

      // 3. Server approved: update local state with authoritative results
      const newStore = { ...storeData };
      const po = newStore.purchaseOrders.find(p => p.id === data.poId);
      if (po) {
        const item = po.items.find(i => i.id === data.poItemId);
        if (item) {
          const addedCount = resData.receivedCount || itemsToCheck.length;
          item.quantityReceived += addedCount;
          item.receivedImeis = [...(item.receivedImeis || []), ...itemsToCheck.map(it => it.imei)];
          const allReceived = po.items.every(i => i.quantityReceived >= i.quantityOrdered);
          po.status = allReceived ? 'received' : 'partially_received';
          po.updatedAt = Date.now();
        }
      }

      if (resData.createdUnits && Array.isArray(resData.createdUnits)) {
        newStore.imeiUnits = [...resData.createdUnits, ...newStore.imeiUnits.filter(u => !resData.createdUnits.some((cu: any) => cu.id === u.id))];
      }
      if (resData.createdHistories && Array.isArray(resData.createdHistories)) {
        newStore.imeiHistories = [...resData.createdHistories, ...newStore.imeiHistories];
      }

      saveStore(newStore, user?.uid);
      setStoreData(newStore);

      return { success: true, count: resData.receivedCount || itemsToCheck.length };
    } catch (err: any) {
      return { success: false, error: err.message || 'Terjadi gangguan jaringan saat memproses penerimaan PO.' };
    }
  };

  const resetToDemoData = () => {
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_ENABLE_DEMO_SEED !== 'true') {
      console.warn('Demo seed data is disabled in production.');
      return;
    }
    const fresh = resetToDemoStore(user?.uid);
    setStoreData(fresh);
    if (fresh.businesses.length > 0) {
      setActiveBusinessId(fresh.businesses[0].id);
      const bBranches = fresh.branches.filter(br => br.businessId === fresh.businesses[0].id);
      if (bBranches.length > 0) {
        setActiveBranchId(bBranches[0].id);
      }
    }
  };

  return (
    <BusinessContext.Provider value={{
      businesses: userBusinesses,
      activeBusiness,
      branches,
      activeBranch,
      products,
      imeiUnits,
      imeiHistories,
      sales,
      tables,
      members,
      stockAdjustments,
      purchaseOrders,
      activeShift,
      cashSessions: storeData.cashSessions,
      switchBusiness,
      switchBranch,
      isOnline,
      createBusiness,
      updateBusinessProfile,
      createBranch,
      updateBranch,
      deactivateBranch,
      createProduct,
      updateProduct,
      archiveProduct,
      updateEmployee,
      reloadMembers,
      processCheckout,
      openShift,
      closeShift,
      recordCashMovement,
      addEmployee,
      heldCarts,
      holdCart,
      removeHeldCart,
      refundSale,
      sellInDevice,
      exchangeImei,
      addTable,
      deleteTable,
      updateTableStatus,
      moveTable,
      mergeTables,
      openFnBOrder,
      addItemsToFnBOrder,
      cancelFnBOrder,
      updateOrderStatus,
      requestStockAdjustment,
      reviewStockAdjustment,
      createPurchaseOrder,
      receivePurchaseOrder,
      resetToDemoData,
    }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error('useBusiness must be used within a BusinessProvider');
  }
  return context;
}
