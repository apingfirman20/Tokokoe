'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { 
  Business, Branch, Product, ImeiUnit, ImeiHistory, 
  Sale, CashSession, TableItem, BusinessMember, 
  CartLineItem, OrderType, PaymentMethod, BusinessType,
  KitchenOrderStatus, UserRole, PermissionKey,
  StockAdjustment, PurchaseOrder 
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
  createBusiness: (name: string, businessType: BusinessType, address: string, phone: string) => Promise<Business>;
  createBranch: (name: string, address: string) => Branch;
  createProduct: (data: Partial<Product>) => Product;
  updateProduct: (productId: string, updates: Partial<Product>) => void;
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
    customerName?: string;
  }) => Promise<{ success: boolean; sale?: Sale; error?: string }>;
  openShift: (openingCash: number, notes?: string) => CashSession;
  closeShift: (actualCash: number, notes?: string) => CashSession;
  addEmployee: (displayName: string, username: string, role: UserRole, branchIds: string[], initialPassword: string) => Promise<{ success: boolean; error?: string }>;
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
  }) => { success: boolean; unit?: ImeiUnit; error?: string };
  exchangeImei: (oldImei: string, newImei: string, reason: string, differenceFee: number) => Promise<{ success: boolean; error?: string }>;
  addTable: (tableNumber: string, capacity?: number) => TableItem;
  deleteTable: (tableId: string) => void;
  updateTableStatus: (tableId: string, status: 'available' | 'occupied' | 'reserved', customerName?: string) => void;
  updateOrderStatus: (saleId: string, status: KitchenOrderStatus) => void;
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

    const unsubscribe = subscribeToBusinessTenant(activeBusinessId, (updates) => {
      setStoreData((prev) => {
        const next = { ...prev };
        let hasChanges = false;

        if (updates.products && updates.products.length > 0) {
          const otherProducts = prev.products.filter(p => p.businessId !== activeBusinessId);
          next.products = [...otherProducts, ...updates.products];
          hasChanges = true;
        }
        if (updates.sales && updates.sales.length > 0) {
          const saleMap = new Map<string, Sale>();
          updates.sales.forEach(s => saleMap.set(s.id, s));
          prev.sales.forEach(s => {
            if (!saleMap.has(s.id)) saleMap.set(s.id, s);
          });
          next.sales = Array.from(saleMap.values()).sort((a, b) => b.createdAt - a.createdAt);
          hasChanges = true;
        }
        if (updates.imeiUnits && updates.imeiUnits.length > 0) {
          next.imeiUnits = updates.imeiUnits;
          hasChanges = true;
        }
        if (updates.stockAdjustments && updates.stockAdjustments.length > 0) {
          next.stockAdjustments = updates.stockAdjustments;
          hasChanges = true;
        }
        if (updates.purchaseOrders && updates.purchaseOrders.length > 0) {
          next.purchaseOrders = updates.purchaseOrders;
          hasChanges = true;
        }
        if (updates.imeiHistories && updates.imeiHistories.length > 0) {
          next.imeiHistories = updates.imeiHistories;
          hasChanges = true;
        }

        if (hasChanges) {
          saveStore(next, user?.uid);
        }
        return next;
      });
    });

    return () => unsubscribe();
  }, [activeBusinessId, user?.uid]);

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
    const bBranches = storeData.branches.filter(br => br.businessId === bId);
    if (bBranches.length > 0) {
      setActiveBranchId(bBranches[0].id);
    } else {
      setActiveBranchId(null);
    }
  };

  const switchBranch = (brId: string) => {
    setActiveBranchId(brId);
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

    let createdBiz: Business;
    let createdBranch: Branch;

    try {
      const res = await fetch('/api/businesses/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, businessType, address, phone })
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.message || 'Gagal menyimpan bisnis ke server');
      }

      createdBiz = resData.business;
      createdBranch = resData.branch;
    } catch (apiErr: any) {
      console.warn('API /api/businesses/create fallback notice:', apiErr.message);
      const newBizId = `biz_${Date.now()}`;
      createdBiz = {
        id: newBizId,
        name,
        businessType,
        ownerId: user?.uid || 'usr_owner_budi',
        currency: 'IDR',
        timezone: 'Asia/Jakarta',
        address,
        phone,
        enabledModules: DEFAULT_MODULES_BY_TYPE[businessType] || DEFAULT_MODULES_BY_TYPE.fnb,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      createdBranch = {
        id: `br_${Date.now()}`,
        businessId: newBizId,
        name: 'Cabang Utama',
        code: 'CAB-01',
        address,
        isMainBranch: true,
        active: true,
      };
    }

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

  const createBranch = (name: string, address: string): Branch => {
    const count = branches.length + 1;
    const newBranch: Branch = {
      id: `br_${Date.now()}`,
      businessId: activeBusinessId || '',
      name,
      code: `CAB-0${count}`,
      address,
      isMainBranch: false,
      active: true,
    };
    const newStore = { ...storeData };
    newStore.branches.push(newBranch);
    saveStore(newStore, user?.uid);
    setStoreData(newStore);
    return newBranch;
  };

  const createProduct = (data: Partial<Product>): Product => {
    const targetBusinessId = activeBusinessId || '';
    const cleanBarcode = data.barcode ? data.barcode.trim() : undefined;
    const detectedType = cleanBarcode ? (data.barcodeType || detectBarcodeType(cleanBarcode)) : undefined;

    const newProd: Product = {
      id: `prod_${Date.now()}`,
      businessId: targetBusinessId,
      name: data.name || 'Produk Baru',
      category: data.category || 'Umum',
      sellingPrice: data.sellingPrice || 0,
      costPrice: data.costPrice || 0,
      available: true,
      trackStock: data.trackStock ?? true,
      stockQty: data.stockQty ?? 10,
      imageUrl: data.imageUrl,
      barcode: cleanBarcode,
      barcodeType: detectedType,
      sku: data.sku ? data.sku.trim() : undefined,
      options: data.options,
      modifiers: data.modifiers,
      brand: data.brand,
      model: data.model,
      storage: data.storage,
      color: data.color,
      condition: data.condition,
    };
    const newStore = { ...storeData };
    newStore.products.push(newProd);
    saveStore(newStore, user?.uid);
    setStoreData(newStore);

    if (targetBusinessId) {
      setDoc(doc(db, `businesses/${targetBusinessId}/products/${newProd.id}`), cleanUndefined(newProd)).catch(err => {
        console.warn("Product firestore sync notice:", err);
      });
    }

    return newProd;
  };

  const updateProduct = (productId: string, updates: Partial<Product>) => {
    const newStore = { ...storeData };
    const idx = newStore.products.findIndex(p => p.id === productId);
    if (idx !== -1) {
      const cleanBarcode = updates.barcode !== undefined ? (updates.barcode ? updates.barcode.trim() : undefined) : newStore.products[idx].barcode;
      const detectedType = cleanBarcode ? (updates.barcodeType || detectBarcodeType(cleanBarcode)) : undefined;
      const mergedUpdates: Partial<Product> = { ...updates, barcode: cleanBarcode, barcodeType: detectedType };

      newStore.products[idx] = { ...newStore.products[idx], ...mergedUpdates };
      saveStore(newStore, user?.uid);
      setStoreData(newStore);

      if (activeBusinessId) {
        setDoc(doc(db, `businesses/${activeBusinessId}/products/${productId}`), cleanUndefined(mergedUpdates), { merge: true }).catch(err => {
          console.warn("Product update firestore sync notice:", err);
        });
      }
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
        customerName: payload.customerName,
        cashSessionId: activeShift?.id,
      }, getIdToken);

      if (!res.success || !res.sale) {
        return { success: false, error: res.error || 'Gagal memproses transaksi pada server.' };
      }

      const authoritativeSale = res.sale;
      const newStore = { ...storeData };

      // Deduct stock in client store to match server authoritative transaction
      for (const item of authoritativeSale.lineItems) {
        const prod = newStore.products.find(p => p.id === item.productId);
        if (prod && prod.trackStock) {
          prod.stockQty = Math.max(0, prod.stockQty - item.quantity);
        }
        if (item.imei) {
          const unit = newStore.imeiUnits.find(u => u.imei === item.imei);
          if (unit) {
            unit.status = 'sold';
            unit.soldAtSaleId = authoritativeSale.id;
          }
        }
      }

      // Add authoritative sale
      newStore.sales.unshift(authoritativeSale);

      // Update active cash session if cash sale
      if (activeShift && payload.paymentMethod === 'cash') {
        const shiftIdx = newStore.cashSessions.findIndex(s => s.id === activeShift.id);
        if (shiftIdx !== -1) {
          newStore.cashSessions[shiftIdx].cashSalesTotal += authoritativeSale.grandTotal;
          newStore.cashSessions[shiftIdx].expectedClosingCash += authoritativeSale.grandTotal;
        }
      }

      // Update table status if dine-in
      if (payload.tableNumber) {
        const tbl = newStore.tables.find(t => t.tableNumber === payload.tableNumber && t.businessId === activeBusinessId);
        if (tbl) {
          tbl.status = 'occupied';
          tbl.activeSaleId = authoritativeSale.id;
          tbl.customerName = payload.customerName;
        }
      }

      saveStore(newStore, user?.uid);
      setStoreData(newStore);

      return { success: true, sale: authoritativeSale };
    } finally {
      isCheckingOutRef.current = false;
    }
  };


  const openShift = (openingCash: number, notes?: string): CashSession => {
    const newShift: CashSession = {
      id: `shift_${Date.now()}`,
      businessId: activeBusinessId || '',
      branchId: activeBranch?.id || 'br_main',
      cashierId: user?.uid || 'usr_cashier',
      cashierName: user?.displayName || 'Kasir',
      openedAt: Date.now(),
      openingCash,
      cashSalesTotal: 0,
      cashInTotal: 0,
      cashOutTotal: 0,
      expectedClosingCash: openingCash,
      status: 'open',
      notes: notes || 'Shift Kasir Aktif',
    };

    const newStore = { ...storeData };
    newStore.cashSessions.unshift(newShift);
    saveStore(newStore, user?.uid);
    setStoreData(newStore);
    return newShift;
  };

  const closeShift = (actualCash: number, notes?: string): CashSession => {
    if (!activeShift) {
      throw new Error('Tidak ada shift kasir yang sedang aktif.');
    }

    const newStore = { ...storeData };
    const shiftIdx = newStore.cashSessions.findIndex(s => s.id === activeShift.id);
    if (shiftIdx !== -1) {
      const current = newStore.cashSessions[shiftIdx];
      const discrepancy = actualCash - current.expectedClosingCash;
      newStore.cashSessions[shiftIdx] = {
        ...current,
        closedAt: Date.now(),
        actualClosingCash: actualCash,
        discrepancy,
        status: 'closed',
        notes: notes || current.notes,
      };
      saveStore(newStore, user?.uid);
      setStoreData(newStore);
      return newStore.cashSessions[shiftIdx];
    }
    return activeShift;
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


  const sellInDevice = (data: {
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
  }): { success: boolean; unit?: ImeiUnit; error?: string } => {
    const valResult = validateDualSimDevice({
      imei1: data.imei,
      imei2: data.imei2,
      serialNumber: data.serialNumber,
    });

    if (!valResult.valid) {
      return { success: false, error: valResult.error || 'Format IMEI tidak valid.' };
    }

    const cleanImei = valResult.imei1;
    const cleanImei2 = valResult.imei2;
    const cleanSn = valResult.serialNumber;
    const newStore = { ...storeData };

    const exists = newStore.imeiUnits.find(u => 
      (u.imei === cleanImei || (cleanImei2 && u.imei === cleanImei2) || (u.imei2 && u.imei2 === cleanImei)) && 
      (u.status === 'available' || u.status === 'reserved')
    );
    if (exists) {
      return { success: false, error: `IMEI ${cleanImei} sudah terdaftar dan berstatus aktif di sistem.` };
    }

    // Find or create device product definition
    let prod = newStore.products.find(p => p.brand === data.brand && p.model === data.model);
    if (!prod) {
      const newProduct: Product = {
        id: `prod_ph_${Date.now()}`,
        businessId: activeBusinessId || '',
        name: `${data.brand} ${data.model} ${data.storage} (${data.condition === 'new' ? 'Baru' : 'Second'})`,
        category: 'Smartphone',
        brand: data.brand,
        model: data.model,
        storage: data.storage,
        color: data.color,
        condition: data.condition,
        costPrice: data.costPrice,
        sellingPrice: data.sellingPrice,
        available: true,
        trackStock: true,
        stockQty: 1,
      };
      newStore.products.push(newProduct);
      prod = newProduct;
    } else {
      prod.stockQty += 1;
    }

    const now = Date.now();
    const unitId = `imei_unit_${now}`;
    const newUnit: ImeiUnit = {
      id: unitId,
      businessId: activeBusinessId || '',
      branchId: activeBranch?.id || 'br_roxy',
      imei: cleanImei,
      imei2: cleanImei2,
      serialNumber: cleanSn,
      productId: prod.id,
      productName: prod.name,
      brand: data.brand,
      model: data.model,
      storage: data.storage,
      color: data.color,
      condition: data.condition,
      costPrice: data.costPrice,
      sellingPrice: data.sellingPrice,
      status: 'available',
      warrantyUntil: now + 90 * 86400000,
      source: 'direct_sell_in',
      supplierOrCustomerName: data.customerName,
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    };

    newStore.imeiUnits.push(newUnit);
    const histItem: ImeiHistory = {
      id: `hist_${now}`,
      businessId: activeBusinessId || '',
      imei: cleanImei,
      imei2: cleanImei2,
      serialNumber: cleanSn,
      unitId,
      action: 'received',
      referenceId: `SELLIN-${now}`,
      branchId: activeBranch?.id || 'br_roxy',
      operatorId: user?.uid || 'usr_staff',
      operatorName: user?.displayName || 'Staf Gadget',
      notes: `Penerimaan Sell-In langsung dari customer ${data.customerName}${cleanImei2 ? ` [Dual-SIM IMEI 2: ${cleanImei2}]` : ''}`,
      timestamp: now,
    };
    newStore.imeiHistories.unshift(histItem);

    saveStore(newStore, user?.uid);
    setStoreData(newStore);

    if (activeBusinessId) {
      setDoc(doc(db, `businesses/${activeBusinessId}/imeiUnits/${unitId}`), cleanUndefined(newUnit)).catch(err => {
        console.warn("Direct SellIn unit sync notice:", err);
      });
      setDoc(doc(db, `businesses/${activeBusinessId}/registeredImeis/${cleanImei}`), {
        imei: cleanImei,
        unitId,
        businessId: activeBusinessId,
        isPrimary: true,
        registeredAt: now,
      }).catch(err => console.warn("Reg IMEI sync notice:", err));
      if (cleanImei2) {
        setDoc(doc(db, `businesses/${activeBusinessId}/registeredImeis/${cleanImei2}`), {
          imei: cleanImei2,
          unitId,
          businessId: activeBusinessId,
          isSecondary: true,
          registeredAt: now,
        }).catch(err => console.warn("Reg IMEI 2 sync notice:", err));
      }
      setDoc(doc(db, `businesses/${activeBusinessId}/imeiHistory/${histItem.id}`), cleanUndefined(histItem)).catch(err => {
        console.warn("Direct SellIn history sync notice:", err);
      });
      if (prod) {
        setDoc(doc(db, `businesses/${activeBusinessId}/products/${prod.id}`), cleanUndefined(prod), { merge: true }).catch(err => {
          console.warn("Product stock sync notice:", err);
        });
      }
    }

    return { success: true, unit: newUnit };
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
      saveStore(newStore, user?.uid);
      setStoreData(newStore);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Terjadi gangguan jaringan saat memproses tukar unit.' };
    }
  };


  const addTable = (tableNumber: string, capacity: number = 4): TableItem => {
    const newStore = { ...storeData };
    const branchId = branches[0]?.id || 'branch_default';
    const newTbl: TableItem = {
      id: `tbl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      businessId: activeBusinessId || '',
      branchId,
      tableNumber,
      capacity,
      status: 'available',
    };
    newStore.tables.push(newTbl);
    saveStore(newStore, user?.uid);
    setStoreData(newStore);
    return newTbl;
  };

  const deleteTable = (tableId: string) => {
    const newStore = { ...storeData };
    newStore.tables = newStore.tables.filter(t => t.id !== tableId);
    saveStore(newStore, user?.uid);
    setStoreData(newStore);
  };

  const updateTableStatus = (tableId: string, status: 'available' | 'occupied' | 'reserved', customerName?: string) => {
    const newStore = { ...storeData };
    const tbl = newStore.tables.find(t => t.id === tableId);
    if (tbl) {
      tbl.status = status;
      if (status === 'available') {
        tbl.customerName = undefined;
        tbl.activeSaleId = undefined;
      } else if (customerName) {
        tbl.customerName = customerName;
      }
      saveStore(newStore, user?.uid);
      setStoreData(newStore);
    }
  };

  const updateOrderStatus = (saleId: string, status: KitchenOrderStatus) => {
    const newStore = { ...storeData };
    const s = newStore.sales.find(item => item.id === saleId);
    if (s) {
      s.orderStatus = status;
      s.updatedAt = Date.now();
      saveStore(newStore);
      setStoreData(newStore);
    }
  };

  const requestStockAdjustment = async (data: {
    productId: string;
    productName: string;
    previousQty: number;
    adjustedQty: number;
    reason: string;
    imei?: string;
  }) => {
    const newStore = { ...storeData };
    const now = Date.now();
    const adjId = `adj_${now}_${Math.random().toString(36).substring(2, 6)}`;
    const newAdj: StockAdjustment = {
      id: adjId,
      businessId: activeBusinessId || '',
      branchId: activeBranch?.id || 'br_main',
      productId: data.productId,
      productName: data.productName,
      imei: data.imei,
      previousQty: data.previousQty,
      adjustedQty: data.adjustedQty,
      diff: data.adjustedQty - data.previousQty,
      reason: data.reason,
      requestedBy: user?.uid || 'usr_staff',
      requestedByName: user?.displayName || 'Staf Kasir',
      status: 'pending',
      createdAt: now,
    };
    newStore.stockAdjustments.unshift(newAdj);
    saveStore(newStore, user?.uid);
    setStoreData(newStore);

    getIdToken().then((token) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      fetch('/api/inventory/adjustments/request', {
        method: 'POST',
        headers,
        body: JSON.stringify(newAdj),
      }).catch(err => console.warn('Background adjustment request sync:', err));
    });

    return { success: true, adjustment: newAdj };
  };

  const reviewStockAdjustment = async (adjustmentId: string, action: 'approved' | 'rejected') => {
    const newStore = { ...storeData };
    const adj = newStore.stockAdjustments.find(a => a.id === adjustmentId);
    if (!adj) return { success: false, error: 'Permintaan penyesuaian tidak ditemukan.' };

    const now = Date.now();
    adj.status = action;
    adj.reviewedBy = user?.displayName || 'Owner';
    adj.reviewedAt = now;

    if (action === 'approved') {
      const prod = newStore.products.find(p => p.id === adj.productId);
      if (prod) {
        prod.stockQty = adj.adjustedQty;
        prod.updatedAt = now;
        if (activeBusinessId) {
          const prodRef = doc(db, `businesses/${activeBusinessId}/products/${prod.id}`);
          setDoc(prodRef, cleanUndefined({ stockQty: adj.adjustedQty, updatedAt: now }), { merge: true })
            .catch(e => console.warn('Product stock sync error:', e));
        }
      }
    }

    saveStore(newStore, user?.uid);
    setStoreData(newStore);

    getIdToken().then((token) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      fetch('/api/inventory/adjustments/review', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: activeBusinessId,
          adjustmentId,
          action,
        }),
      }).catch(err => console.warn('Background adjustment review sync:', err));
    });

    return { success: true };
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
      createBusiness,
      createBranch,
      createProduct,
      updateProduct,
      processCheckout,
      openShift,
      closeShift,
      addEmployee,
      sellInDevice,
      exchangeImei,
      addTable,
      deleteTable,
      updateTableStatus,
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
