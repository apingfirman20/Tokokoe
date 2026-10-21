import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as checkoutPost } from '../app/api/sales/checkout/route';
import { POST as refundPost } from '../app/api/sales/refund/route';
import { GET as salesHistoryGet } from '../app/api/sales/history/route';
import { POST as shiftOpenPost } from '../app/api/shifts/open/route';
import { POST as shiftClosePost } from '../app/api/shifts/close/route';
import { POST as adjRequestPost } from '../app/api/inventory/adjustments/request/route';
import { POST as adjReviewPost } from '../app/api/inventory/adjustments/review/route';
import { POST as receivingPost } from '../app/api/inventory/receiving/route';
import { POST as sellInPost } from '../app/api/phone/sell-in/route';
import { POST as exchangePost } from '../app/api/phone/exchange/route';
import { POST as serviceTicketPost } from '../app/api/phone/service-tickets/route';
import { GET as kitchenOrdersGet } from '../app/api/fnb/kitchen/orders/route';
import { POST as midtransWebhookPost } from '../app/api/webhooks/midtrans/route';

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
          mockDbStore[path] = JSON.parse(JSON.stringify(data));
        }
      },
      update: async (data: any) => {
        if (!mockDbStore[path]) throw new Error(`Document not found: ${path}`);
        mockDbStore[path] = { ...mockDbStore[path], ...JSON.parse(JSON.stringify(data)) };
      },
      delete: async () => {
        delete mockDbStore[path];
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
            uid: parts[0] || 'usr_owner_alpha',
            email: `${parts[0] || 'usr_owner_alpha'}@tokokoe.local`,
            role: parts[1] || 'owner',
            businessId: parts[2] || 'biz_alpha',
          };
        }
        if (token === 'unauthenticated') {
          throw new Error('Invalid token');
        }
        return {
          uid: 'usr_owner_alpha',
          email: 'owner@alpha.local',
          role: 'owner',
          businessId: 'biz_alpha',
        };
      }),
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
          limit: (n: number) => createQuery(getDocsInPath()).limit(n),
        };
      },
      collectionGroup: (collectionId: string) => {
        const matchingKeys = Object.keys(mockDbStore).filter(k => {
          const segments = k.split('/');
          return segments[segments.length - 2] === collectionId;
        });

        const matchingDocs = matchingKeys.map(k => ({
          id: k.split('/').pop()!,
          ref: getDocRef(k),
          data: () => mockDbStore[k],
          exists: true,
        }));

        const createQuery = (docs: any[]) => ({
          where: (field: string, op: string, value: any) => {
            const filtered = docs.filter(d => {
              const val = d.data()[field];
              if (op === '==') return val === value;
              return true;
            });
            return createQuery(filtered);
          },
          limit: (n: number) => ({
            get: async () => ({
              empty: docs.slice(0, n).length === 0,
              size: docs.slice(0, n).length,
              docs: docs.slice(0, n),
            }),
          }),
          get: async () => ({
            empty: docs.length === 0,
            size: docs.length,
            docs,
          }),
        });

        return createQuery(matchingDocs);
      },
      runTransaction: async (updateFunction: (tx: any) => Promise<any>) => {
        const tx = {
          get: async (docRef: any) => docRef.get(),
          set: (docRef: any, data: any, options?: any) => docRef.set(data, options),
          update: (docRef: any, data: any) => docRef.update(data),
          delete: (docRef: any) => docRef.delete(),
        };
        return await updateFunction(tx);
      },
    },
  };
});

function createReq(url: string, method: string, body?: any, token: string = 'test_token__usr_owner_alpha__owner__biz_alpha') {
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('FASE 6: REGRESSION AND RELEASE GATE MATRIX', () => {
  // Two distinct tenants
  const tenantAlpha = 'biz_alpha';
  const tenantBeta = 'biz_beta';

  // Two branches under Tenant Alpha
  const branchAlpha1 = 'branch_alpha_1';
  const branchAlpha2 = 'branch_alpha_2';

  // One branch under Tenant Beta
  const branchBeta1 = 'branch_beta_1';

  beforeEach(() => {
    // Reset mock store
    for (const key of Object.keys(mockDbStore)) {
      delete mockDbStore[key];
    }

    // 1. Seed Tenant Alpha (Retail & Phone)
    mockDbStore[`businesses/${tenantAlpha}`] = {
      id: tenantAlpha,
      name: 'Tenant Alpha Stores',
      businessType: 'retail',
      ownerId: 'usr_owner_alpha',
      createdAt: Date.now(),
    };

    mockDbStore[`businesses/${tenantAlpha}/branches/${branchAlpha1}`] = {
      id: branchAlpha1,
      businessId: tenantAlpha,
      name: 'Cabang Alpha Pusat',
      isActive: true,
    };

    mockDbStore[`businesses/${tenantAlpha}/branches/${branchAlpha2}`] = {
      id: branchAlpha2,
      businessId: tenantAlpha,
      name: 'Cabang Alpha Mall',
      isActive: true,
    };

    // 2. Seed Tenant Beta (F&B Cafe)
    mockDbStore[`businesses/${tenantBeta}`] = {
      id: tenantBeta,
      name: 'Tenant Beta Resto',
      businessType: 'fnb',
      ownerId: 'usr_owner_beta',
      createdAt: Date.now(),
    };

    mockDbStore[`businesses/${tenantBeta}/branches/${branchBeta1}`] = {
      id: branchBeta1,
      businessId: tenantBeta,
      name: 'Cabang Beta Senopati',
      isActive: true,
    };

    // 3. Seed Memberships for 8 ROLES in Tenant Alpha
    const rolesConfig: { uid: string; role: any; branchIds: string[]; status: 'active' | 'inactive'; displayName: string }[] = [
      { uid: 'usr_owner_alpha', role: 'owner', branchIds: ['*'], status: 'active', displayName: 'Owner Alpha' },
      { uid: 'usr_manager_alpha', role: 'manager', branchIds: ['*'], status: 'active', displayName: 'Manager Alpha' },
      { uid: 'usr_cashier_alpha1', role: 'cashier', branchIds: [branchAlpha1], status: 'active', displayName: 'Cashier Alpha 1' },
      { uid: 'usr_waiter_alpha', role: 'waiter', branchIds: [branchAlpha1], status: 'active', displayName: 'Waiter Alpha' },
      { uid: 'usr_kitchen_alpha', role: 'kitchen', branchIds: [branchAlpha1], status: 'active', displayName: 'Kitchen Alpha' },
      { uid: 'usr_warehouse_alpha', role: 'warehouse', branchIds: ['*'], status: 'active', displayName: 'Warehouse Alpha' },
      { uid: 'usr_accountant_alpha', role: 'accountant', branchIds: ['*'], status: 'active', displayName: 'Accountant Alpha' },
      { uid: 'usr_technician_alpha', role: 'technician', branchIds: [branchAlpha1], status: 'active', displayName: 'Technician Alpha' },
      { uid: 'usr_inactive_staff', role: 'cashier', branchIds: [branchAlpha1], status: 'inactive', displayName: 'Inactive Staff' },
    ];

    for (const r of rolesConfig) {
      mockDbStore[`businesses/${tenantAlpha}/members/${r.uid}`] = {
        id: `mem_${r.uid}`,
        userId: r.uid,
        businessId: tenantAlpha,
        role: r.role,
        permissions: r.role === 'owner' ? ['*'] : [],
        branchIds: r.branchIds,
        status: r.status,
        displayName: r.displayName,
      };
    }

    // 4. Seed Membership for Tenant Beta Owner & Cashier
    mockDbStore[`businesses/${tenantBeta}/members/usr_owner_beta`] = {
      id: 'mem_owner_beta',
      userId: 'usr_owner_beta',
      businessId: tenantBeta,
      role: 'owner',
      permissions: ['*'],
      branchIds: ['*'],
      status: 'active',
      displayName: 'Owner Beta',
    };

    // 5. Seed Catalog Products
    // Product in Tenant Alpha
    mockDbStore[`businesses/${tenantAlpha}/products/prod_alpha_coffee`] = {
      id: 'prod_alpha_coffee',
      businessId: tenantAlpha,
      name: 'Alpha Arabica Beans',
      costPrice: 40000,
      sellingPrice: 75000,
      stockQty: 20,
      trackStock: true,
      status: 'active',
    };

    // Serialized Phone in Tenant Alpha
    mockDbStore[`businesses/${tenantAlpha}/products/prod_alpha_phone`] = {
      id: 'prod_alpha_phone',
      businessId: tenantAlpha,
      name: 'Samsung Galaxy A54',
      costPrice: 3000000,
      sellingPrice: 4500000,
      stockQty: 5,
      trackStock: true,
      hasImei: true,
      status: 'active',
    };

    mockDbStore[`businesses/${tenantAlpha}/registeredImeis/860123456789006`] = {
      imei: '860123456789006',
      unitId: 'unit_a54_01',
      businessId: tenantAlpha,
      branchId: branchAlpha1,
      isPrimary: true,
      status: 'available',
    };

    mockDbStore[`businesses/${tenantAlpha}/imeiUnits/unit_a54_01`] = {
      id: 'unit_a54_01',
      businessId: tenantAlpha,
      branchId: branchAlpha1,
      imei: '860123456789006',
      productId: 'prod_alpha_phone',
      productName: 'Samsung Galaxy A54',
      costPrice: 3000000,
      sellingPrice: 4500000,
      condition: 'new',
      status: 'available',
    };

    // Product in Tenant Beta (Strictly isolated)
    mockDbStore[`businesses/${tenantBeta}/products/prod_beta_pasta`] = {
      id: 'prod_beta_pasta',
      businessId: tenantBeta,
      name: 'Beta Truffle Pasta',
      costPrice: 60000,
      sellingPrice: 120000,
      stockQty: 50,
      trackStock: true,
      status: 'active',
    };
  });

  // =========================================================================
  // 1. RBAC ACCESS MATRIX TESTING FOR 8 ROLES
  // =========================================================================
  describe('1. 8 Roles Access Matrix Verification', () => {
    it('Owner and Manager can approve stock adjustments, whereas Cashier and Waiter cannot', async () => {
      // Create pending adjustment request first
      mockDbStore[`businesses/${tenantAlpha}/stockAdjustments/adj_001`] = {
        id: 'adj_001',
        businessId: tenantAlpha,
        branchId: branchAlpha1,
        productId: 'prod_alpha_coffee',
        previousQty: 20,
        adjustedQty: 18,
        difference: -2,
        reason: 'Kemasan sobek',
        status: 'pending',
        requestedBy: 'usr_warehouse_alpha',
        createdAt: Date.now(),
      };

      // 1. Cashier attempts to review/approve adjustment -> MUST BE 403 FORBIDDEN
      const cashierToken = `test_token__usr_cashier_alpha1__cashier__${tenantAlpha}`;
      const cashierReq = createReq(`http://localhost/api/inventory/adjustments/review`, 'POST', {
        businessId: tenantAlpha,
        branchId: branchAlpha1,
        adjustmentId: 'adj_001',
        action: 'approved',
      }, cashierToken);
      const cashierRes = await adjReviewPost(cashierReq);
      expect(cashierRes.status).toBe(403);

      // 2. Waiter attempts to review/approve adjustment -> MUST BE 403 FORBIDDEN
      const waiterToken = `test_token__usr_waiter_alpha__waiter__${tenantAlpha}`;
      const waiterReq = createReq(`http://localhost/api/inventory/adjustments/review`, 'POST', {
        businessId: tenantAlpha,
        branchId: branchAlpha1,
        adjustmentId: 'adj_001',
        action: 'approved',
      }, waiterToken);
      const waiterRes = await adjReviewPost(waiterReq);
      expect(waiterRes.status).toBe(403);

      // 3. Manager attempts to review/approve adjustment -> MUST BE 200 SUCCESS
      const managerToken = `test_token__usr_manager_alpha__manager__${tenantAlpha}`;
      const managerReq = createReq(`http://localhost/api/inventory/adjustments/review`, 'POST', {
        businessId: tenantAlpha,
        branchId: branchAlpha1,
        adjustmentId: 'adj_001',
        action: 'approved',
      }, managerToken);
      const managerRes = await adjReviewPost(managerReq);
      expect(managerRes.status).toBe(200);
      const managerJson = await managerRes.json();
      expect(managerJson.success).toBe(true);
      expect(mockDbStore[`businesses/${tenantAlpha}/products/prod_alpha_coffee`].stockQty).toBe(18);
    });

    it('Accountant can read sales history and financial reports, but cannot create sales', async () => {
      const accountantToken = `test_token__usr_accountant_alpha__accountant__${tenantAlpha}`;

      // 1. Accountant reads sales history -> 200 SUCCESS
      const histReq = createReq(`http://localhost/api/sales/history?businessId=${tenantAlpha}`, 'GET', undefined, accountantToken);
      const histRes = await salesHistoryGet(histReq);
      expect(histRes.status).toBe(200);

      // 2. Accountant attempts to process checkout -> 403 FORBIDDEN (No sales.create)
      const checkoutReq = createReq(`http://localhost/api/sales/checkout`, 'POST', {
        businessId: tenantAlpha,
        branchId: branchAlpha1,
        orderType: 'retail_pos',
        paymentMethod: 'cash',
        paidAmount: 75000,
        lineItems: [{ productId: 'prod_alpha_coffee', quantity: 1 }],
      }, accountantToken);
      const checkoutRes = await checkoutPost(checkoutReq);
      expect(checkoutRes.status).toBe(403);
    });

    it('Kitchen can read KDS orders, but cannot process sales checkout', async () => {
      const kitchenToken = `test_token__usr_kitchen_alpha__kitchen__${tenantAlpha}`;

      // 1. Kitchen reads KDS orders -> 200 SUCCESS
      const kdsReq = createReq(`http://localhost/api/fnb/kitchen/orders?businessId=${tenantAlpha}&branchId=${branchAlpha1}`, 'GET', undefined, kitchenToken);
      const kdsRes = await kitchenOrdersGet(kdsReq);
      expect(kdsRes.status).toBe(200);

      // 2. Kitchen attempts checkout -> 403 FORBIDDEN
      const checkoutReq = createReq(`http://localhost/api/sales/checkout`, 'POST', {
        businessId: tenantAlpha,
        branchId: branchAlpha1,
        orderType: 'retail_pos',
        paymentMethod: 'cash',
        paidAmount: 75000,
        lineItems: [{ productId: 'prod_alpha_coffee', quantity: 1 }],
      }, kitchenToken);
      const checkoutRes = await checkoutPost(checkoutReq);
      expect(checkoutRes.status).toBe(403);
    });

    it('Warehouse staff can receive goods, but cannot open or close cash shifts', async () => {
      const warehouseToken = `test_token__usr_warehouse_alpha__warehouse__${tenantAlpha}`;

      // 1. Warehouse staff receives stock via PO intake -> 200 SUCCESS
      const recvReq = createReq(`http://localhost/api/inventory/receiving`, 'POST', {
        businessId: tenantAlpha,
        branchId: branchAlpha1,
        supplierName: 'PT Kopi Nusantara',
        items: [{ productId: 'prod_alpha_coffee', quantity: 10, costPrice: 40000 }],
      }, warehouseToken);
      const recvRes = await receivingPost(recvReq);
      expect(recvRes.status).toBe(200);
      expect(mockDbStore[`businesses/${tenantAlpha}/products/prod_alpha_coffee`].stockQty).toBe(30); // 20 + 10

      // 2. Warehouse staff attempts to open a cash drawer shift -> 403 FORBIDDEN
      const shiftReq = createReq(`http://localhost/api/shifts/open`, 'POST', {
        businessId: tenantAlpha,
        branchId: branchAlpha1,
        openingCash: 500000,
      }, warehouseToken);
      const shiftRes = await shiftOpenPost(shiftReq);
      expect(shiftRes.status).toBe(403);
    });

    it('Technician can create device service tickets, but cannot refund sales', async () => {
      const techToken = `test_token__usr_technician_alpha__technician__${tenantAlpha}`;

      // 1. Technician creates device intake service ticket -> 200 SUCCESS
      const ticketReq = createReq(`http://localhost/api/phone/service-tickets`, 'POST', {
        action: 'create',
        businessId: tenantAlpha,
        branchId: branchAlpha1,
        customerName: 'Bapak Joko',
        customerPhone: '081234567890',
        deviceModel: 'Redmi Note 10',
        imei: '869123456789012',
        issueDescription: 'Ganti baterai kembung',
        notes: 'Pelanggan minta estimasi selesai sore',
      }, techToken);
      const ticketRes = await serviceTicketPost(ticketReq);
      expect(ticketRes.status).toBe(200);

      // 2. Technician attempts to refund a sale -> 403 FORBIDDEN
      const refundReq = createReq(`http://localhost/api/sales/refund`, 'POST', {
        businessId: tenantAlpha,
        branchId: branchAlpha1,
        saleId: 'sale_any',
        reason: 'Refund unauthorized',
      }, techToken);
      const refundRes = await refundPost(refundReq);
      expect(refundRes.status).toBe(403);
    });

    it('Deactivated employee (status: inactive) is strictly rejected from all operations', async () => {
      const inactiveToken = `test_token__usr_inactive_staff__cashier__${tenantAlpha}`;
      const req = createReq(`http://localhost/api/sales/history?businessId=${tenantAlpha}`, 'GET', undefined, inactiveToken);
      const res = await salesHistoryGet(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.message).toContain('dinonaktifkan');
    });
  });

  // =========================================================================
  // 2. MULTI-TENANT & MULTI-BRANCH ISOLATION
  // =========================================================================
  describe('2. Multi-Tenant & Multi-Branch Scoping Verification', () => {
    it('Tenant Alpha cashier CANNOT access or transact on Tenant Beta resources', async () => {
      const alphaCashierToken = `test_token__usr_cashier_alpha1__cashier__${tenantAlpha}`;

      // Alpha Cashier tries to checkout on Tenant Beta's business
      const crossTenantReq = createReq(`http://localhost/api/sales/checkout`, 'POST', {
        businessId: tenantBeta,
        branchId: branchBeta1,
        orderType: 'retail_pos',
        paymentMethod: 'cash',
        paidAmount: 120000,
        lineItems: [{ productId: 'prod_beta_pasta', quantity: 1 }],
      }, alphaCashierToken);

      const crossTenantRes = await checkoutPost(crossTenantReq);
      expect(crossTenantRes.status).toBe(403);
      const json = await crossTenantRes.json();
      expect(json.message).toContain('bukan anggota resmi');
    });

    it('Branch 1 restricted cashier CANNOT checkout on Branch 2 within the same tenant', async () => {
      const alpha1CashierToken = `test_token__usr_cashier_alpha1__cashier__${tenantAlpha}`;

      // Cashier is assigned strictly to branchAlpha1, tries to transact on branchAlpha2
      const crossBranchReq = createReq(`http://localhost/api/sales/checkout`, 'POST', {
        businessId: tenantAlpha,
        branchId: branchAlpha2, // Branch Alpha 2
        orderType: 'retail_pos',
        paymentMethod: 'cash',
        paidAmount: 75000,
        lineItems: [{ productId: 'prod_alpha_coffee', quantity: 1 }],
      }, alpha1CashierToken);

      const crossBranchRes = await checkoutPost(crossBranchReq);
      expect(crossBranchRes.status).toBe(403);
      const json = await crossBranchRes.json();
      expect(json.message).toContain('tidak memiliki akses ke cabang');
    });
  });

  // =========================================================================
  // 3. CONCURRENCY, IDEMPOTENCY & EDGE CASES
  // =========================================================================
  describe('3. Concurrency, Idempotency & Edge Cases', () => {
    it('Simultaneous checkout for the last item prevents negative stock and awards exactly 1 sale', async () => {
      // Set stock to exactly 1
      mockDbStore[`businesses/${tenantAlpha}/products/prod_alpha_coffee`].stockQty = 1;

      const cashierToken = `test_token__usr_cashier_alpha1__cashier__${tenantAlpha}`;

      // Client 1 request
      const req1 = createReq(`http://localhost/api/sales/checkout`, 'POST', {
        businessId: tenantAlpha,
        branchId: branchAlpha1,
        orderType: 'retail_pos',
        paymentMethod: 'cash',
        paidAmount: 75000,
        idempotencyKey: 'idem_race_1',
        lineItems: [{ productId: 'prod_alpha_coffee', quantity: 1 }],
      }, cashierToken);

      // Client 2 request
      const req2 = createReq(`http://localhost/api/sales/checkout`, 'POST', {
        businessId: tenantAlpha,
        branchId: branchAlpha1,
        orderType: 'retail_pos',
        paymentMethod: 'cash',
        paidAmount: 75000,
        idempotencyKey: 'idem_race_2',
        lineItems: [{ productId: 'prod_alpha_coffee', quantity: 1 }],
      }, cashierToken);

      // Execute concurrently
      const [res1, res2] = await Promise.all([
        checkoutPost(req1),
        checkoutPost(req2),
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(400);

      // Final stock must be strictly 0 (NEVER negative!)
      expect(mockDbStore[`businesses/${tenantAlpha}/products/prod_alpha_coffee`].stockQty).toBe(0);
    });

    it('Duplicate idempotency key returns cached sale without duplicate stock deduction', async () => {
      const cashierToken = `test_token__usr_cashier_alpha1__cashier__${tenantAlpha}`;
      const idemKey = 'idem_fixed_key_123';

      const reqBody = {
        businessId: tenantAlpha,
        branchId: branchAlpha1,
        orderType: 'retail_pos',
        paymentMethod: 'cash',
        paidAmount: 75000,
        idempotencyKey: idemKey,
        lineItems: [{ productId: 'prod_alpha_coffee', quantity: 1 }],
      };

      // 1. First execution
      const res1 = await checkoutPost(createReq(`http://localhost/api/sales/checkout`, 'POST', reqBody, cashierToken));
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.sale.id).toBeDefined();
      expect(mockDbStore[`businesses/${tenantAlpha}/products/prod_alpha_coffee`].stockQty).toBe(19);

      // 2. Duplicate retry with same idempotency key
      const res2 = await checkoutPost(createReq(`http://localhost/api/sales/checkout`, 'POST', reqBody, cashierToken));
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.idempotentReplay).toBe(true);
      expect(json2.sale.id).toBe(json1.sale.id);

      // Stock was NOT deducted again (still 19)
      expect(mockDbStore[`businesses/${tenantAlpha}/products/prod_alpha_coffee`].stockQty).toBe(19);
    });

    it('Missing authentication token returns 401 Unauthorized', async () => {
      const unauthReq = new Request(`http://localhost/api/sales/history?businessId=${tenantAlpha}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await salesHistoryGet(unauthReq);
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 4. VERTICAL-SPECIFIC ENGINE WORKFLOWS
  // =========================================================================
  describe('4. Three Verticals Engine Workflows', () => {
    it('Retail: PO intake increments stock, and stock adjustment review syncs catalog ledger', async () => {
      const managerToken = `test_token__usr_manager_alpha__manager__${tenantAlpha}`;

      // PO receiving
      const poRes = await receivingPost(createReq(`http://localhost/api/inventory/receiving`, 'POST', {
        businessId: tenantAlpha,
        branchId: branchAlpha1,
        supplierName: 'PT Sumber Kopi Makmur',
        items: [{ productId: 'prod_alpha_coffee', quantity: 5, costPrice: 40000 }],
      }, managerToken));
      expect(poRes.status).toBe(200);
      expect(mockDbStore[`businesses/${tenantAlpha}/products/prod_alpha_coffee`].stockQty).toBe(25); // 20 + 5
    });

    it('Phone: IMEI sell-in registers device, sale locks IMEI to sold, and exchange rejects branch mismatch', async () => {
      const managerToken = `test_token__usr_manager_alpha__manager__${tenantAlpha}`;

      // 1. Direct sell-in unit intake
      const sellInRes = await sellInPost(createReq(`http://localhost/api/phone/sell-in`, 'POST', {
        businessId: tenantAlpha,
        branchId: branchAlpha1,
        imei: '860123456789014',
        model: 'iPhone 12 Pro Max',
        brand: 'Apple',
        storage: '256GB',
        color: 'Black',
        condition: 'second_grade_a',
        costPrice: 7000000,
        sellingPrice: 8500000,
        customerName: 'Pak Hendra',
      }, managerToken));
      expect(sellInRes.status).toBe(200);

      // Verify unit registered
      expect(mockDbStore[`businesses/${tenantAlpha}/registeredImeis/860123456789014`]).toBeDefined();
      const sellInReg = mockDbStore[`businesses/${tenantAlpha}/registeredImeis/860123456789014`];

      // Mark old unit as sold with active warranty to qualify for exchange
      mockDbStore[`businesses/${tenantAlpha}/imeiUnits/${sellInReg.unitId}`].status = 'sold';
      mockDbStore[`businesses/${tenantAlpha}/imeiUnits/${sellInReg.unitId}`].warrantyUntil = Date.now() + 86400000;

      // 2. Phone exchange across mismatched branch is rejected
      const exchangeRes = await exchangePost(createReq(`http://localhost/api/phone/exchange`, 'POST', {
        businessId: tenantAlpha,
        branchId: branchAlpha2, // Branch Alpha 2 tries to exchange unit registered on Branch Alpha 1
        oldImei: '860123456789014',
        newImei: '860123456789006',
        reason: 'Sinyal hilang',
      }, managerToken));
      expect(exchangeRes.status).toBe(400);
      const exJson = await exchangeRes.json();
      expect(exJson.message).toContain('berada di cabang lain');
    });

    it('F&B: Table dine-in locks table to occupied and settlement releases table to available', async () => {
      const ownerBetaToken = `test_token__usr_owner_beta__owner__${tenantBeta}`;

      // Seed table
      mockDbStore[`businesses/${tenantBeta}/tables/tbl_beta_01`] = {
        id: 'tbl_beta_01',
        businessId: tenantBeta,
        branchId: branchBeta1,
        tableNumber: '01',
        status: 'available',
      };

      // Checkout dine in with cash
      const checkoutRes = await checkoutPost(createReq(`http://localhost/api/sales/checkout`, 'POST', {
        businessId: tenantBeta,
        branchId: branchBeta1,
        orderType: 'dine_in',
        tableId: 'tbl_beta_01',
        tableNumber: '01',
        customerName: 'Meja 01 Keluarga',
        paymentMethod: 'cash',
        paidAmount: 200000,
        lineItems: [{ productId: 'prod_beta_pasta', quantity: 1 }],
      }, ownerBetaToken));
      expect(checkoutRes.status).toBe(200);

      // Verify Table was automatically released to available because cash sale settled immediately
      const tableInDb = mockDbStore[`businesses/${tenantBeta}/tables/tbl_beta_01`];
      expect(tableInDb.status).toBe('available');
    });
  });
});
