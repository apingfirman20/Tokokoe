import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as productPost, PUT as productPut } from '../app/api/products/route';
import { GET as ledgerGet } from '../app/api/inventory/ledger/route';
import { POST as adjRequestPost } from '../app/api/inventory/adjustments/request/route';
import { POST as adjReviewPost } from '../app/api/inventory/adjustments/review/route';
import { POST as shiftOpenPost } from '../app/api/shifts/open/route';
import { POST as shiftClosePost } from '../app/api/shifts/close/route';
import { POST as shiftMovementPost } from '../app/api/shifts/cash-movement/route';
import { POST as checkoutPost } from '../app/api/sales/checkout/route';

// In-memory mock store for Firestore and Auth
const { mockDbStore } = vi.hoisted(() => ({
  mockDbStore: {} as Record<string, any>,
}));

vi.mock('../lib/firebase/admin', () => {
  const getDocRef = (path: string) => {
    const docId = path.split('/').pop()!;
    const ref = {
      id: docId,
      path,
      get: async () => ({
        exists: Boolean(mockDbStore[path]),
        id: docId,
        ref,
        data: () => mockDbStore[path],
      }),
      set: async (data: any, options?: any) => {
        if (options?.merge && mockDbStore[path]) {
          mockDbStore[path] = { ...mockDbStore[path], ...data };
        } else {
          mockDbStore[path] = data;
        }
      },
      update: async (data: any) => {
        if (!mockDbStore[path]) throw new Error(`Document not found: ${path}`);
        mockDbStore[path] = { ...mockDbStore[path], ...data };
      },
    };
    return ref;
  };

  return {
    adminAuth: {
      verifyIdToken: vi.fn(async (token: string) => {
        if (token.startsWith('test_token__')) {
          const parts = token.slice('test_token__'.length).split('__');
          return {
            uid: parts[0] || 'usr_owner_1',
            email: `${parts[0] || 'usr_owner_1'}@tokokoe.local`,
            role: parts[1] || 'owner',
            businessId: parts[2] || 'biz_fase3_1',
          };
        }
        if (token.startsWith('test_token_')) {
          const parts = token.slice('test_token_'.length).split('_');
          return {
            uid: parts[0] || 'usr_owner_1',
            email: `${parts[0] || 'usr_owner_1'}@tokokoe.local`,
            role: parts[1] || 'owner',
            businessId: parts[2] || 'biz_fase3_1',
          };
        }
        throw new Error('Invalid token');
      }),
      updateUser: vi.fn().mockResolvedValue({}),
      revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
    },
    adminDb: {
      _mockStore: mockDbStore,
      doc: (path: string) => getDocRef(path),
      collection: (path: string) => {
        const getDocsInPath = () => {
          const prefix = `${path}/`;
          return Object.keys(mockDbStore)
            .filter(k => k.startsWith(prefix) && k.indexOf('/', prefix.length) === -1)
            .map(k => ({
              id: k.split('/').pop()!,
              ref: getDocRef(k),
              data: () => mockDbStore[k],
              exists: true,
            }));
        };

        const createQuery = (currentDocs: any[]) => {
          const queryObj: any = {
            where: (field: string, op: string, value: any) => {
              const filtered = currentDocs.filter(d => {
                const val = d.data()[field];
                if (op === '==') return val === value;
                if (op === '>=') return val >= value;
                if (op === '<=') return val <= value;
                return true;
              });
              return createQuery(filtered);
            },
            orderBy: () => queryObj,
            limit: (n: number) => {
              const sliced = currentDocs.slice(0, n);
              return {
                get: async () => ({
                  empty: sliced.length === 0,
                  size: sliced.length,
                  docs: sliced,
                }),
              };
            },
            get: async () => ({
              empty: currentDocs.length === 0,
              size: currentDocs.length,
              docs: currentDocs,
            }),
          };
          return queryObj;
        };

        return {
          doc: (id?: string) => {
            const docId = id || `doc_${Math.random().toString(36).substring(2, 7)}`;
            return getDocRef(`${path}/${docId}`);
          },
          get: async () => {
            const docs = getDocsInPath();
            return {
              empty: docs.length === 0,
              size: docs.length,
              docs,
            };
          },
          where: (field: string, op: string, value: any) => {
            return createQuery(getDocsInPath()).where(field, op, value);
          },
          orderBy: () => createQuery(getDocsInPath()),
        };
      },
      runTransaction: async (updateFn: any) => {
        // Serialized transaction simulation
        const transaction = {
          get: async (docRef: any) => {
            const p = docRef.path || (docRef.ref && docRef.ref.path);
            const data = p ? mockDbStore[p] : undefined;
            return {
              exists: Boolean(data),
              id: docRef.id || p?.split('/').pop(),
              ref: docRef,
              data: () => data,
            };
          },
          update: (docRef: any, data: any) => {
            const p = docRef.path || (docRef.ref && docRef.ref.path);
            if (p && mockDbStore[p]) {
              mockDbStore[p] = { ...mockDbStore[p], ...data };
            }
          },
          set: (docRef: any, data: any) => {
            const p = docRef.path || (docRef.ref && docRef.ref.path);
            if (p) {
              mockDbStore[p] = data;
            }
          },
        };
        return updateFn(transaction);
      },
    },
    FieldValue: {
      delete: () => ({ _deleteField: true }),
      serverTimestamp: () => Date.now(),
    },
  };
});

describe('FASE 3: ENGINE STOK DAN TRANSAKSI GATES', () => {
  const bizId = 'biz_fase3_1';
  const branchId = 'br_fase3_main';
  const ownerToken = `test_token__usr_owner__owner__${bizId}`;
  const managerToken = `test_token__usr_mgr__manager__${bizId}`;
  const cashierToken = `test_token__usr_cashier__cashier__${bizId}`;
  const cashier2Token = `test_token__usr_cashier2__cashier__${bizId}`;

  beforeEach(() => {
    // Clear in-memory mock store
    for (const key of Object.keys(mockDbStore)) {
      delete mockDbStore[key];
    }

    // Provision baseline business
    mockDbStore[`businesses/${bizId}`] = {
      id: bizId,
      name: 'Toko FASE 3 Official',
      businessType: 'phone_store',
      ownerId: 'usr_owner',
      status: 'active',
      branches: [
        { id: branchId, name: 'Cabang Utama', businessId: bizId, active: true },
        { id: 'br_fase3_second', name: 'Cabang Cabang 2', businessId: bizId, active: true },
      ],
      createdAt: Date.now(),
    };

    mockDbStore[`businesses/${bizId}/branches/${branchId}`] = {
      id: branchId,
      name: 'Cabang Utama',
      businessId: bizId,
      active: true,
    };

    mockDbStore[`businesses/${bizId}/branches/br_fase3_second`] = {
      id: 'br_fase3_second',
      name: 'Cabang Cabang 2',
      businessId: bizId,
      active: true,
    };

    // Memberships with appropriate RBAC
    mockDbStore[`businesses/${bizId}/members/usr_owner`] = {
      id: 'usr_owner',
      userId: 'usr_owner',
      displayName: 'Owner FASE 3',
      role: 'owner',
      status: 'active',
      branchIds: ['*'],
      permissions: ['*'],
    };

    mockDbStore[`businesses/${bizId}/members/usr_mgr`] = {
      id: 'usr_mgr',
      userId: 'usr_mgr',
      displayName: 'Manager FASE 3',
      role: 'manager',
      status: 'active',
      branchIds: [branchId, 'br_fase3_second'],
      permissions: [
        'products.read', 'products.cost.read', 'products.create', 'products.update',
        'sales.create', 'sales.read', 'inventory.read', 'inventory.receive', 'inventory.adjust',
        'approvals.manage', 'shift.manage'
      ],
    };

    mockDbStore[`businesses/${bizId}/members/usr_cashier`] = {
      id: 'usr_cashier',
      userId: 'usr_cashier',
      displayName: 'Kasir FASE 3',
      role: 'cashier',
      status: 'active',
      branchIds: [branchId],
      permissions: [
        'products.read', 'sales.create', 'sales.read', 'inventory.read',
        'inventory.adjust', 'shift.manage'
      ],
    };

    mockDbStore[`businesses/${bizId}/members/usr_cashier2`] = {
      id: 'usr_cashier2',
      userId: 'usr_cashier2',
      displayName: 'Kasir 2 FASE 3',
      role: 'cashier',
      status: 'active',
      branchIds: [branchId],
      permissions: [
        'products.read', 'sales.create', 'sales.read', 'inventory.read',
        'inventory.adjust', 'shift.manage'
      ],
    };
  });

  // ========================================================
  // A. Stock Ledger & Direct Stock Mutation Blocking
  // ========================================================
  describe('A. Stock Ledger and Direct Mutation Blocking', () => {
    it('catat opening_balance saat createProduct dengan stok awal dan larang edit stok langsung via PUT /api/products', async () => {
      // 1. Create product with stockQty = 5
      const createReq = new Request('http://localhost/api/products', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: bizId,
          name: 'Produk Uji Ledger',
          sellingPrice: 50000,
          costPrice: 30000,
          stockQty: 5,
          trackStock: true,
          category: 'Aksesoris',
        }),
      });

      const createRes = await productPost(createReq);
      expect(createRes.status).toBe(200);
      const createData = await createRes.json();
      const productId = createData.product.id;

      // Verify opening_balance StockMovement was automatically created
      const movements = Object.keys(mockDbStore)
        .filter(k => k.startsWith(`businesses/${bizId}/stockMovements/`))
        .map(k => mockDbStore[k]);
      expect(movements.some(m => m.productId === productId && m.type === 'opening_balance' && m.quantityDelta === 5)).toBe(true);

      // 2. Attempt direct stock edit via PUT /api/products -> MUST be rejected with HTTP 400
      const editReq = new Request('http://localhost/api/products', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: bizId,
          productId,
          name: 'Produk Uji Ledger Renamed',
          stockQty: 99, // Direct edit attempt
        }),
      });

      const editRes = await productPut(editReq);
      expect(editRes.status).toBe(400);
      const editData = await editRes.json();
      expect(editData.message).toContain('Perubahan jumlah stok tidak boleh dilakukan melalui edit produk langsung tanpa audit trail');

      // Product stock remains 5
      expect(mockDbStore[`businesses/${bizId}/products/${productId}`].stockQty).toBe(5);

      // 3. Query Stock Ledger API
      const ledgerReq = new Request(`http://localhost/api/inventory/ledger?businessId=${bizId}&productId=${productId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      const ledgerRes = await ledgerGet(ledgerReq);
      expect(ledgerRes.status).toBe(200);
      const ledgerData = await ledgerRes.json();
      expect(ledgerData.success).toBe(true);
      expect(ledgerData.reconciliation.openingBalance).toBe(5);
      expect(ledgerData.reconciliation.netDelta).toBe(5);
    });
  });

  // ========================================================
  // B. Adjustment: Stale Request Protection & Role Validation
  // ========================================================
  describe('B. Adjustment & Stale Request Protection', () => {
    it('request stale akibat intervening sale ditolak (HTTP 409) dan tidak menimpa stok live', async () => {
      // Setup product with 10 units
      const prodId = 'prod_stale_test';
      mockDbStore[`businesses/${bizId}/products/${prodId}`] = {
        id: prodId,
        businessId: bizId,
        name: 'Kabel Data Fast Charge',
        sellingPrice: 40000,
        stockQty: 10,
        trackStock: true,
        isActive: true,
        available: true,
      };

      // 1. Kasir mengajukan stock adjustment dari 10 menjadi 12 (karena hitung fisik)
      const adjReq = new Request('http://localhost/api/inventory/adjustments/request', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: bizId,
          branchId,
          productId: prodId,
          productName: 'Kabel Data Fast Charge',
          previousQty: 10,
          adjustedQty: 12,
          reason: 'Kelebihan fisik stok saat opname kasir',
        }),
      });

      const adjRes = await adjRequestPost(adjReq);
      expect(adjRes.status).toBe(201);
      const adjData = await adjRes.json();
      expect(adjData.success).toBe(true);
      const adjId = adjData.adjustment.id;
      expect(adjId).toMatch(/^adj_/);

      // Stok fisik belum berubah sebelum approval
      expect(mockDbStore[`businesses/${bizId}/products/${prodId}`].stockQty).toBe(10);

      // 2. Intervening Sale occurs: Kasir menjual 3 unit (live stock turun ke 7)
      mockDbStore[`businesses/${bizId}/products/${prodId}`].stockQty = 7;

      // 3. Owner mencoba menyetujui request yang sudah stale (previousQty 10 != live stock 7)
      const reviewReq = new Request('http://localhost/api/inventory/adjustments/review', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: bizId,
          adjustmentId: adjId,
          action: 'approved',
        }),
      });

      const reviewRes = await adjReviewPost(reviewReq);
      expect(reviewRes.status).toBe(409); // Conflict: stale request
      const reviewData = await reviewRes.json();
      expect(reviewData.message).toContain('telah berubah dari nilai saat diajukan');

      // Pastikan stok live tetap 7 (tidak tertimpa menjadi 12)
      expect(mockDbStore[`businesses/${bizId}/products/${prodId}`].stockQty).toBe(7);

      // 4. Request stale tetap dapat ditolak (rejected) tanpa mengubah stok
      const rejectReq = new Request('http://localhost/api/inventory/adjustments/review', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: bizId,
          adjustmentId: adjId,
          action: 'rejected',
        }),
      });

      const rejectRes = await adjReviewPost(rejectReq);
      expect(rejectRes.status).toBe(200);
      const rejectData = await rejectRes.json();
      expect(rejectData.success).toBe(true);
      expect(rejectData.adjustment.status).toBe('rejected');
      expect(mockDbStore[`businesses/${bizId}/products/${prodId}`].stockQty).toBe(7);
    });
  });

  // ========================================================
  // C. Checkout: Discount Capping & Secret Cost Protection
  // ========================================================
  describe('C. Checkout Authoritative Engine & Security', () => {
    it('membatasi diskon kasir maks 10% dan tidak membocorkan HPP/costPrice ke sale document', async () => {
      const prodId = 'prod_disc_test';
      mockDbStore[`businesses/${bizId}/products/${prodId}`] = {
        id: prodId,
        businessId: bizId,
        name: 'Headset Gaming',
        sellingPrice: 100000,
        costPrice: 50000, // Secret HPP
        stockQty: 20,
        trackStock: true,
        isActive: true,
        available: true,
      };

      // 1. Kasir mencoba memberikan diskon 15% (Rp 15.000) tanpa kewenangan owner/manager -> Ditolak HTTP 400
      const invalidDiscountReq = new Request('http://localhost/api/sales/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: bizId,
          branchId,
          orderType: 'retail_pos',
          paymentMethod: 'cash',
          lineItems: [{ productId: prodId, quantity: 1 }],
          discount: 15000, // 15% > 10%
          paidAmount: 100000,
        }),
      });

      const invalidRes = await checkoutPost(invalidDiscountReq);
      expect(invalidRes.status).toBe(403);
      const invalidData = await invalidRes.json();
      expect(invalidData.message).toContain('Diskon melebihi batas kewenangan kasir (maksimal 10%)');

      // 2. Manager memberikan diskon 15% -> Diterima
      const validDiscountReq = new Request('http://localhost/api/sales/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${managerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: bizId,
          branchId,
          orderType: 'retail_pos',
          paymentMethod: 'cash',
          lineItems: [{ productId: prodId, quantity: 1 }],
          discount: 15000, // 15%
          paidAmount: 85000,
        }),
      });

      const validRes = await checkoutPost(validDiscountReq);
      expect(validRes.status).toBe(200);
      const validData = await validRes.json();
      expect(validData.success).toBe(true);

      const sale = validData.sale;
      expect(sale.grandTotal).toBe(85000);
      // Ensure secret costPrice is not leaked to Sale document
      expect((sale as any).costPrice).toBeUndefined();
      expect((sale as any).hpp).toBeUndefined();
      expect((sale.lineItems[0] as any).costPrice).toBeUndefined();
    });
  });

  // ========================================================
  // D. Idempotency: Key Reuse with Different Payload Rejection
  // ========================================================
  describe('D. Idempotency & Replay Protection', () => {
    it('replay identik aman tanpa double deduction stok, sedangkan reuse key dengan payload berbeda ditolak (HTTP 409)', async () => {
      const prodId = 'prod_idem_test';
      mockDbStore[`businesses/${bizId}/products/${prodId}`] = {
        id: prodId,
        businessId: bizId,
        name: 'Mouse Wireless',
        sellingPrice: 50000,
        stockQty: 10,
        trackStock: true,
        isActive: true,
        available: true,
      };

      const idempotencyKey = 'idem_unique_key_001';

      const checkoutPayload = {
        businessId: bizId,
        branchId,
        orderType: 'retail_pos',
        paymentMethod: 'cash',
        lineItems: [{ productId: prodId, quantity: 2 }],
        paidAmount: 100000,
        idempotencyKey,
      };

      // 1. First execution
      const req1 = new Request('http://localhost/api/sales/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(checkoutPayload),
      });

      const res1 = await checkoutPost(req1);
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.success).toBe(true);
      expect(mockDbStore[`businesses/${bizId}/products/${prodId}`].stockQty).toBe(8); // 10 - 2

      // 2. Replay with identical payload and key (e.g. lost response retry)
      const req2 = new Request('http://localhost/api/sales/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(checkoutPayload),
      });

      const res2 = await checkoutPost(req2);
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.idempotentDuplicate).toBe(true);
      expect(data2.sale.id).toBe(data1.sale.id);
      // Stok tetap 8 (tidak dikurangi lagi)
      expect(mockDbStore[`businesses/${bizId}/products/${prodId}`].stockQty).toBe(8);

      // 3. Reuse same idempotency key with DIFFERENT payload (e.g. quantity changed to 1) -> MUST return HTTP 409
      const req3 = new Request('http://localhost/api/sales/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...checkoutPayload,
          lineItems: [{ productId: prodId, quantity: 1 }], // Different fingerprint
          paidAmount: 50000,
        }),
      });

      const res3 = await checkoutPost(req3);
      expect(res3.status).toBe(409);
      const data3 = await res3.json();
      expect(data3.message).toContain('telah digunakan untuk transaksi yang berbeda');
      expect(mockDbStore[`businesses/${bizId}/products/${prodId}`].stockQty).toBe(8);
    });
  });

  // ========================================================
  // E. Shift & Cash Sessions
  // ========================================================
  describe('E. Shift Management and Drawer Reconciliation', () => {
    it('mencegah dua shift aktif di cabang yang sama dan menghitung selisih rekonsiliasi kas', async () => {
      // 1. Buka shift kasir
      const openReq1 = new Request('http://localhost/api/shifts/open', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: bizId,
          branchId,
          openingCash: 200000,
          notes: 'Shift Pagi Kasir',
        }),
      });

      const openRes1 = await shiftOpenPost(openReq1);
      expect(openRes1.status).toBe(201);
      const openData1 = await openRes1.json();
      const shiftId = openData1.shift.id;

      // 2. Coba buka shift kedua untuk kasir yang sama di cabang yang sama -> Ditolak HTTP 409
      const openReq2 = new Request('http://localhost/api/shifts/open', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: bizId,
          branchId,
          openingCash: 100000,
        }),
      });

      const openRes2 = await shiftOpenPost(openReq2);
      expect(openRes2.status).toBe(409);
      const openData2 = await openRes2.json();
      expect(openData2.message).toContain('sudah memiliki sesi shift aktif');

      // 3. Catat Mutasi Kas Masuk (+Rp 50.000) dan Kas Keluar (-Rp 20.000)
      const cashInReq = new Request('http://localhost/api/shifts/cash-movement', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: bizId,
          cashSessionId: shiftId,
          type: 'cash_in',
          amount: 50000,
          reason: 'Tambah modal kembalian receh',
        }),
      });
      const cashInRes = await shiftMovementPost(cashInReq);
      expect(cashInRes.status).toBe(200);

      const cashOutReq = new Request('http://localhost/api/shifts/cash-movement', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: bizId,
          cashSessionId: shiftId,
          type: 'cash_out',
          amount: 20000,
          reason: 'Beli kertas struk thermal',
        }),
      });
      const cashOutRes = await shiftMovementPost(cashOutReq);
      expect(cashOutRes.status).toBe(200);

      // Expected cash = 200.000 + 50.000 - 20.000 = 230.000
      expect(mockDbStore[`businesses/${bizId}/cashSessions/${shiftId}`].expectedClosingCash).toBe(230000);

      // 4. Tutup shift kasir dengan uang fisik aktual 225.000 (terjadi selisih -5.000)
      const closeReq = new Request('http://localhost/api/shifts/close', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: bizId,
          cashSessionId: shiftId,
          actualClosingCash: 225000,
          notes: 'Serah terima shift selesai',
        }),
      });

      const closeRes = await shiftClosePost(closeReq);
      expect(closeRes.status).toBe(200);
      const closeData = await closeRes.json();
      expect(closeData.reconciliation.expectedClosingCash).toBe(230000);
      expect(closeData.reconciliation.actualClosingCash).toBe(225000);
      expect(closeData.reconciliation.discrepancy).toBe(-5000);
      expect(closeData.reconciliation.isBalanced).toBe(false);
      expect(mockDbStore[`businesses/${bizId}/cashSessions/${shiftId}`].status).toBe('closed');
    });
  });

  // ========================================================
  // F. Serialized Invariants: Dual-SIM, Quantity, Branch Mismatch
  // ========================================================
  describe('F. Serialized Invariants', () => {
    it('menolak quantity > 1, dual-SIM alias duplication, unit cabang salah, dan derives price secara authoritative', async () => {
      const prodId = 'prod_iphone13';
      const imei1 = '860123456789006'; // Luhn valid (15 digit)
      const imei2 = '860123456789014'; // Luhn valid (15 digit)
      const unitId = 'unit_ip13_dual';

      mockDbStore[`businesses/${bizId}/products/${prodId}`] = {
        id: prodId,
        businessId: bizId,
        name: 'iPhone 13 128GB Blue',
        sellingPrice: 11000000,
        trackStock: false,
        isActive: true,
        available: true,
      };

      mockDbStore[`businesses/${bizId}/registeredImeis/${imei1}`] = {
        imei: imei1,
        unitId,
        businessId: bizId,
      };

      mockDbStore[`businesses/${bizId}/registeredImeis/${imei2}`] = {
        imei: imei2,
        unitId,
        businessId: bizId,
      };

      mockDbStore[`businesses/${bizId}/imeiUnits/${unitId}`] = {
        id: unitId,
        businessId: bizId,
        branchId, // in main branch
        productId: prodId,
        productName: 'iPhone 13 128GB Blue',
        imei: imei1,
        imei2: imei2,
        registeredImeis: [imei1, imei2],
        sellingPrice: 11500000, // Authoritative unit price
        status: 'available',
      };

      // 1. Rejection on quantity > 1 for serialized product
      const qtyReq = new Request('http://localhost/api/sales/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: bizId,
          branchId,
          orderType: 'phone_pos',
          paymentMethod: 'cash',
          lineItems: [{ productId: prodId, imei: imei1, quantity: 2 }],
          paidAmount: 23000000,
        }),
      });

      const qtyRes = await checkoutPost(qtyReq);
      expect(qtyRes.status).toBe(400);
      const qtyData = await qtyRes.json();
      expect(qtyData.message).toContain('Kuantitas untuk produk bernomor IMEI');

      // 2. Rejection on dual-SIM alias duplication (selling IMEI 1 and IMEI 2 in same cart)
      const dualSimReq = new Request('http://localhost/api/sales/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: bizId,
          branchId,
          orderType: 'phone_pos',
          paymentMethod: 'cash',
          lineItems: [
            { productId: prodId, imei: imei1, quantity: 1 },
            { productId: prodId, imei: imei2, quantity: 1 },
          ],
          paidAmount: 23000000,
        }),
      });

      const dualSimRes = await checkoutPost(dualSimReq);
      expect(dualSimRes.status).toBe(400);
      const dualSimData = await dualSimRes.json();
      expect(dualSimData.message).toContain('duplikasi unit IMEI');

      // 3. Rejection on unit branch mismatch (unit belongs to main branch, checkout at second branch)
      const branchMismatchReq = new Request('http://localhost/api/sales/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: bizId,
          branchId: 'br_fase3_second', // Mismatch!
          orderType: 'phone_pos',
          paymentMethod: 'cash',
          lineItems: [{ productId: prodId, imei: imei1, quantity: 1 }],
          paidAmount: 11500000,
        }),
      });

      const branchMismatchRes = await checkoutPost(branchMismatchReq);
      expect(branchMismatchRes.status).toBe(400);
      const branchMismatchData = await branchMismatchRes.json();
      expect(branchMismatchData.message).toContain('tidak dapat dijual di cabang transaksi');

      // 4. Successful checkout uses authoritative unit price (11.500.000, not fallback or client 10.000.000)
      const validCheckoutReq = new Request('http://localhost/api/sales/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: bizId,
          branchId,
          orderType: 'phone_pos',
          paymentMethod: 'cash',
          lineItems: [{ productId: prodId, imei: imei1, quantity: 1, unitPrice: 10000000 }], // Client manipulated unitPrice
          paidAmount: 11500000,
        }),
      });

      const validCheckoutRes = await checkoutPost(validCheckoutReq);
      expect(validCheckoutRes.status).toBe(200);
      const validCheckoutData = await validCheckoutRes.json();
      expect(validCheckoutData.sale.grandTotal).toBe(11500000); // Enforced server unit price
      expect(mockDbStore[`businesses/${bizId}/imeiUnits/${unitId}`].status).toBe('sold');
    });
  });

  // ========================================================
  // Gate: Dua Kasir Mencoba Stok Terakhir (Race Condition)
  // ========================================================
  describe('Gate Phase: Dua Kasir Mencoba Stok Terakhir (Race Condition)', () => {
    it('hanya satu kasir yang berhasil membeli unit terakhir dan kasir kedua ditolak kehabisan stok', async () => {
      const prodId = 'prod_last_unit';
      mockDbStore[`businesses/${bizId}/products/${prodId}`] = {
        id: prodId,
        businessId: bizId,
        name: 'Item Langka Terakhir',
        sellingPrice: 75000,
        stockQty: 1, // Only 1 unit left!
        trackStock: true,
        isActive: true,
        available: true,
      };

      const checkoutPayload1 = {
        businessId: bizId,
        branchId,
        orderType: 'retail_pos',
        paymentMethod: 'cash',
        lineItems: [{ productId: prodId, quantity: 1 }],
        paidAmount: 75000,
        idempotencyKey: 'idem_kasir_1_last_unit',
      };

      const checkoutPayload2 = {
        businessId: bizId,
        branchId,
        orderType: 'retail_pos',
        paymentMethod: 'cash',
        lineItems: [{ productId: prodId, quantity: 1 }],
        paidAmount: 75000,
        idempotencyKey: 'idem_kasir_2_last_unit',
      };

      const req1 = new Request('http://localhost/api/sales/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(checkoutPayload1),
      });

      const req2 = new Request('http://localhost/api/sales/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashier2Token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(checkoutPayload2),
      });

      // Kasir 1 executes first inside atomic transaction
      const res1 = await checkoutPost(req1);
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.success).toBe(true);

      // Sisa stok sekarang 0
      expect(mockDbStore[`businesses/${bizId}/products/${prodId}`].stockQty).toBe(0);

      // Kasir 2 executes right after
      const res2 = await checkoutPost(req2);
      expect(res2.status).toBe(400);
      const data2 = await res2.json();
      expect(data2.message).toContain('tidak mencukupi');
      expect(data2.message).toContain('tersisa 0, diminta 1');
    });
  });
});
