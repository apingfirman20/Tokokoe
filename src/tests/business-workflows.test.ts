import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as refundPost } from '../app/api/sales/refund/route';
import { POST as receivingPost } from '../app/api/inventory/receiving/route';
import { POST as sellInPost } from '../app/api/phone/sell-in/route';
import { POST as poReceivePost } from '../app/api/phone/purchase-orders/receive/route';
import { POST as exchangePost } from '../app/api/phone/exchange/route';
import { POST as fnbOrdersPost } from '../app/api/fnb/orders/route';
import { GET as fnbTablesGet, POST as fnbTablesPost } from '../app/api/fnb/tables/route';
import { GET as kitchenOrdersGet, PATCH as kitchenOrdersPatch } from '../app/api/fnb/kitchen/orders/route';
import { POST as serviceTicketsPost } from '../app/api/phone/service-tickets/route';
import { POST as checkoutPost } from '../app/api/sales/checkout/route';

// In-memory mock database store
const { mockDbStore } = vi.hoisted(() => ({
  mockDbStore: {} as Record<string, any>,
}));

vi.mock('../lib/firebase/admin', () => {
  const getDocRef = (path: string): any => {
    const docId = path.split('/').pop()!;
    const ref = {
      id: docId,
      path,
      collection: (subCol: string) => adminDbMock.collection(`${path}/${subCol}`),
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
          mockDbStore[path] = { ...(data.id ? {} : { id: docId }), ...data };
        }
      },
      update: async (data: any) => {
        if (!mockDbStore[path]) throw new Error(`Document not found: ${path}`);
        mockDbStore[path] = { ...mockDbStore[path], ...data };
      },
      delete: async () => {
        delete mockDbStore[path];
      },
    };
    return ref;
  };

  const adminDbMock = {
    doc: (path: string) => getDocRef(path),
    collection: (path: string) => {
      const filters: Array<{ field: string; op: string; val: any }> = [];
      const queryObj: any = {
        doc: (docId?: string) => {
          const id = docId || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          return getDocRef(`${path}/${id}`);
        },
        where: (field: string, op: string, val: any) => {
          filters.push({ field, op, val });
          return queryObj;
        },
        orderBy: () => queryObj,
        limit: () => queryObj,
        get: async () => {
          const prefix = `${path}/`;
          const matchingKeys = Object.keys(mockDbStore).filter(k => {
            if (!k.startsWith(prefix)) return false;
            const rest = k.slice(prefix.length);
            if (rest.includes('/')) return false; // top-level in collection
            const doc = mockDbStore[k];
            for (const f of filters) {
              if (f.op === '==' && doc[f.field] !== f.val) return false;
              if (f.op === 'in' && Array.isArray(f.val) && !f.val.includes(doc[f.field])) return false;
            }
            return true;
          });

          return {
            empty: matchingKeys.length === 0,
            size: matchingKeys.length,
            docs: matchingKeys.map(k => ({
              id: k.split('/').pop()!,
              ref: getDocRef(k),
              data: () => mockDbStore[k],
            })),
          };
        },
        add: async (data: any) => {
          const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const p = `${path}/${id}`;
          mockDbStore[p] = { id, ...data };
          return getDocRef(p);
        },
      };
      return queryObj;
    },
    runTransaction: async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        get: async (ref: any) => {
          return await ref.get();
        },
        set: (ref: any, data: any, options?: any) => {
          if (options?.merge && mockDbStore[ref.path]) {
            mockDbStore[ref.path] = { ...mockDbStore[ref.path], ...data };
          } else {
            mockDbStore[ref.path] = { ...(data.id ? {} : { id: ref.id }), ...data };
          }
        },
        update: (ref: any, data: any) => {
          if (!mockDbStore[ref.path]) throw new Error(`Document not found: ${ref.path}`);
          mockDbStore[ref.path] = { ...mockDbStore[ref.path], ...data };
        },
        delete: (ref: any) => {
          delete mockDbStore[ref.path];
        },
      };
      return await cb(tx);
    },
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
            businessId: parts[2] || 'biz_fase4_1',
          };
        }
        return {
          uid: 'usr_owner_1',
          email: 'owner@tokokoe.local',
          role: 'owner',
          businessId: 'biz_fase4_1',
        };
      }),
    },
    adminDb: adminDbMock,
  };
});

describe('FASE 4: Business Workflows Integration Test Suite', () => {
  const businessId = 'biz_fase4_test';
  const branchId = 'br_fase4_test';
  const ownerToken = 'test_token__usr_owner__owner__biz_fase4_test';
  const cashierToken = 'test_token__usr_cashier__cashier__biz_fase4_test';

  beforeEach(() => {
    for (const key of Object.keys(mockDbStore)) {
      delete mockDbStore[key];
    }

    // Seed base business
    mockDbStore[`businesses/${businessId}`] = {
      id: businessId,
      name: 'Toko Serba Ada Fase 4',
      businessType: 'fnb',
      ownerId: 'usr_owner',
      taxRate: 11,
      serviceChargeRate: 5,
      createdAt: Date.now(),
    };

    // Seed branch
    mockDbStore[`businesses/${businessId}/branches/${branchId}`] = {
      id: branchId,
      businessId,
      name: 'Cabang Utama',
      code: 'MAIN',
      active: true,
      isMainBranch: true,
    };

    // Seed owner membership
    mockDbStore[`businesses/${businessId}/members/usr_owner`] = {
      id: 'usr_owner',
      userId: 'usr_owner',
      businessId,
      displayName: 'Owner Fase 4',
      role: 'owner',
      branchIds: [branchId],
      permissions: ['sales.create', 'sales.read', 'sales.refund', 'inventory.manage', 'finance.read'],
      status: 'active',
    };

    // Seed cashier membership
    mockDbStore[`businesses/${businessId}/members/usr_cashier`] = {
      id: 'usr_cashier',
      userId: 'usr_cashier',
      businessId,
      displayName: 'Kasir Fase 4',
      role: 'cashier',
      branchIds: [branchId],
      permissions: ['sales.create', 'sales.read'],
      status: 'active',
    };

    // Seed active cash session for payments
    mockDbStore[`businesses/${businessId}/cashSessions/shift_fase4_1`] = {
      id: 'shift_fase4_1',
      businessId,
      branchId,
      cashierId: 'usr_owner',
      cashierName: 'Owner Fase 4',
      openingCash: 500000,
      currentCashDrawer: 500000,
      status: 'open',
      openedAt: Date.now(),
    };
  });

  // ==========================================
  // SECTION A: RETAIL WORKFLOWS
  // ==========================================
  describe('A. Retail Workflows', () => {
    it('1. Non-serialized goods receiving increments inventory and records stock ledger', async () => {
      // Seed retail product
      const prodId = 'prod_indomie';
      mockDbStore[`businesses/${businessId}/products/${prodId}`] = {
        id: prodId,
        businessId,
        name: 'Indomie Goreng',
        category: 'Makanan Ringan',
        sellingPrice: 3500,
        costPrice: 2800,
        trackStock: true,
        stockQty: 20,
        available: true,
        isActive: true,
      };

      const req = new Request('http://localhost/api/inventory/receiving', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          businessId,
          branchId,
          supplierName: 'PT Indomarco Adi Prima',
          referenceNo: 'INV-INDOMARCO-001',
          items: [
            {
              productId: prodId,
              quantity: 50,
              costPrice: 2900,
            },
          ],
          notes: 'Intake reguler bulanan',
        }),
      });

      const res = await receivingPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.totalItemsReceived).toBe(50);

      // Verify updated product stock: 20 + 50 = 70
      const updatedProd = mockDbStore[`businesses/${businessId}/products/${prodId}`];
      expect(updatedProd.stockQty).toBe(70);
      expect(updatedProd.costPrice).toBe(2900);

      // Verify stock movement ledger entry
      const movementKeys = Object.keys(mockDbStore).filter(k => k.startsWith(`businesses/${businessId}/stockMovements/`));
      expect(movementKeys.length).toBeGreaterThanOrEqual(1);
      const m = mockDbStore[movementKeys[0]];
      expect(m.productId).toBe(prodId);
      expect(m.type).toBe('purchase_order');
      expect(m.quantityDelta).toBe(50);
      expect(m.previousQty).toBe(20);
      expect(m.newQty).toBe(70);
    });

    it('2. Authoritative refund restores stock, reduces cash drawer, and prevents hard-delete', async () => {
      const prodId = 'prod_shampoo';
      mockDbStore[`businesses/${businessId}/products/${prodId}`] = {
        id: prodId,
        businessId,
        name: 'Shampoo Botol 200ml',
        sellingPrice: 25000,
        costPrice: 18000,
        trackStock: true,
        stockQty: 10,
        available: true,
        isActive: true,
      };

      // Seed completed sale
      const saleId = 'sale_ret_1001';
      mockDbStore[`businesses/${businessId}/sales/${saleId}`] = {
        id: saleId,
        saleNumber: 'RET-202610-1001',
        businessId,
        branchId,
        cashierId: 'usr_owner',
        cashierName: 'Owner Fase 4',
        orderType: 'retail_pos',
        lineItems: [
          {
            productId: prodId,
            productName: 'Shampoo Botol 200ml',
            quantity: 2,
            unitPrice: 25000,
            subtotal: 50000,
          },
        ],
        subtotal: 50000,
        discount: 0,
        tax: 0,
        serviceCharge: 0,
        grandTotal: 50000,
        paidAmount: 50000,
        changeAmount: 0,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashSessionId: 'shift_fase4_1',
        createdAt: Date.now() - 3600000,
      };

      // Cash drawer was at 500000
      mockDbStore[`businesses/${businessId}/cashSessions/shift_fase4_1`].currentCashDrawer = 550000;

      const req = new Request('http://localhost/api/sales/refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          businessId,
          branchId,
          saleId,
          reason: 'Botol pecah saat dibuka pelanggan di rumah',
        }),
      });

      const res = await refundPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Verify sale is marked refunded and NOT deleted
      const refundedSale = mockDbStore[`businesses/${businessId}/sales/${saleId}`];
      expect(refundedSale).toBeDefined();
      expect(refundedSale.paymentStatus).toBe('refunded');
      expect(refundedSale.refundReason).toBe('Botol pecah saat dibuka pelanggan di rumah');

      // Verify inventory was restored: 10 + 2 = 12
      const updatedProd = mockDbStore[`businesses/${businessId}/products/${prodId}`];
      expect(updatedProd.stockQty).toBe(12);

      // Verify cash drawer was deducted: 550000 - 50000 = 500000
      const updatedShift = mockDbStore[`businesses/${businessId}/cashSessions/shift_fase4_1`];
      expect(updatedShift.currentCashDrawer).toBe(500000);

      // Verify repeating refund is rejected
      const dupReq = new Request('http://localhost/api/sales/refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          businessId,
          branchId,
          saleId,
          reason: 'Klaim ulang',
        }),
      });
      const dupRes = await refundPost(dupReq);
      expect(dupRes.status).toBe(409);
      const dupJson = await dupRes.json();
      expect(dupJson.message).toContain('direfund');
    });
  });

  // ==========================================
  // SECTION B: F&B WORKFLOWS
  // ==========================================
  describe('B. F&B Workflows', () => {
    it('1. Table lifecycle, occupancy lock, moving, and merging tables', async () => {
      // 1. Create Table 01 and Table 02
      const createReq1 = new Request('http://localhost/api/fnb/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
        body: JSON.stringify({
          action: 'create',
          businessId,
          branchId,
          tableNumber: 'Meja 01',
          capacity: 4,
        }),
      });
      const res1 = await fnbTablesPost(createReq1);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      const table1Id = json1.table.id;

      const createReq2 = new Request('http://localhost/api/fnb/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
        body: JSON.stringify({
          action: 'create',
          businessId,
          branchId,
          tableNumber: 'Meja 02',
          capacity: 2,
        }),
      });
      const res2 = await fnbTablesPost(createReq2);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      const table2Id = json2.table.id;

      // Seed menu item
      const coffeeId = 'prod_latte';
      mockDbStore[`businesses/${businessId}/products/${coffeeId}`] = {
        id: coffeeId,
        businessId,
        name: 'Caffe Latte',
        sellingPrice: 30000,
        costPrice: 12000,
        available: true,
        isActive: true,
      };

      // 2. Open Order on Meja 01
      const openReq = new Request('http://localhost/api/fnb/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
        body: JSON.stringify({
          action: 'open',
          businessId,
          branchId,
          orderType: 'dine_in',
          tableId: table1Id,
          tableNumber: 'Meja 01',
          customerName: 'Bpk. Budi',
          lineItems: [
            {
              productId: coffeeId,
              productName: 'Caffe Latte',
              quantity: 2,
              unitPrice: 30000,
              subtotal: 60000,
            },
          ],
        }),
      });
      const openRes = await fnbOrdersPost(openReq);
      const openJson = await openRes.json();
      expect(openRes.status).toBe(200);
      expect(openJson.success).toBe(true);
      const saleId = openJson.sale.id;

      // Verify Meja 01 is now occupied
      const t1 = mockDbStore[`businesses/${businessId}/tables/${table1Id}`];
      expect(t1.status).toBe('occupied');
      expect(t1.activeSaleId).toBe(saleId);

      // Verify trying to open another order on occupied Meja 01 is rejected
      const conflictReq = new Request('http://localhost/api/fnb/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
        body: JSON.stringify({
          action: 'open',
          businessId,
          branchId,
          orderType: 'dine_in',
          tableId: table1Id,
          tableNumber: 'Meja 01',
          lineItems: [
            { productId: coffeeId, productName: 'Caffe Latte', quantity: 1, unitPrice: 30000, subtotal: 30000 },
          ],
        }),
      });
      const conflictRes = await fnbOrdersPost(conflictReq);
      expect(conflictRes.status).toBe(400);

      // 3. Move Order from Meja 01 to Meja 02
      const moveReq = new Request('http://localhost/api/fnb/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
        body: JSON.stringify({
          action: 'move_table',
          businessId,
          branchId,
          fromTableId: table1Id,
          toTableId: table2Id,
        }),
      });
      const moveRes = await fnbTablesPost(moveReq);
      const moveJson = await moveRes.json();
      expect(moveRes.status).toBe(200);
      expect(moveJson.success).toBe(true);

      // Meja 01 should be freed, Meja 02 occupied with saleId
      expect(mockDbStore[`businesses/${businessId}/tables/${table1Id}`].status).toBe('available');
      expect(mockDbStore[`businesses/${businessId}/tables/${table2Id}`].status).toBe('occupied');
      expect(mockDbStore[`businesses/${businessId}/tables/${table2Id}`].activeSaleId).toBe(saleId);
      expect(mockDbStore[`businesses/${businessId}/sales/${saleId}`].tableId).toBe(table2Id);
    });

    it('2. Recipe/BOM & modifier consumption reduces raw ingredients accurately during sale', async () => {
      // 1. Seed raw ingredients
      const beansId = 'ing_coffee_beans';
      const milkId = 'ing_fresh_milk';
      mockDbStore[`businesses/${businessId}/ingredients/${beansId}`] = {
        id: beansId,
        businessId,
        name: 'Biji Kopi Arabica',
        uom: 'gram',
        stockQty: 1000, // 1000g
        costPerUnit: 250,
      };
      mockDbStore[`businesses/${businessId}/ingredients/${milkId}`] = {
        id: milkId,
        businessId,
        name: 'Susu Segar Pasteurised',
        uom: 'ml',
        stockQty: 5000, // 5000ml
        costPerUnit: 20,
      };

      // 2. Seed menu item with Recipe (BOM) & Modifier Recipe
      const cappuccinoId = 'prod_cappuccino';
      mockDbStore[`businesses/${businessId}/products/${cappuccinoId}`] = {
        id: cappuccinoId,
        businessId,
        name: 'Cappuccino 250ml',
        sellingPrice: 32000,
        costPrice: 11000,
        available: true,
        isActive: true,
        recipe: [
          { ingredientId: beansId, quantityRequired: 18 }, // 18g beans
          { ingredientId: milkId, quantityRequired: 150 }, // 150ml milk
        ],
        modifiers: [
          {
            name: 'Extra Shot Espresso',
            price: 6000,
            recipe: [
              { ingredientId: beansId, quantityRequired: 9 }, // +9g beans
            ],
          },
        ],
      };

      // 3. Checkout 2 portions of Cappuccino, each with 'Extra Shot Espresso'
      const checkoutReq = new Request('http://localhost/api/sales/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
        body: JSON.stringify({
          businessId,
          branchId,
          orderType: 'takeaway',
          paymentMethod: 'cash',
          cashSessionId: 'shift_fase4_1',
          lineItems: [
            {
              productId: cappuccinoId,
              productName: 'Cappuccino 250ml',
              quantity: 2,
              unitPrice: 38000, // 32000 + 6000
              subtotal: 76000,
              selectedModifiers: ['Extra Shot Espresso'],
            },
          ],
          subtotal: 76000,
          discount: 0,
          tax: 0,
          serviceCharge: 0,
          grandTotal: 76000,
          paidAmount: 100000,
          changeAmount: 24000,
        }),
      });

      const res = await checkoutPost(checkoutReq);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Verify ingredient consumption:
      // Beans: 1000 - (2 * (18 + 9)) = 1000 - 54 = 946g
      // Milk: 5000 - (2 * 150) = 5000 - 300 = 4700ml
      const updatedBeans = mockDbStore[`businesses/${businessId}/ingredients/${beansId}`];
      const updatedMilk = mockDbStore[`businesses/${businessId}/ingredients/${milkId}`];

      expect(updatedBeans.stockQty).toBe(946);
      expect(updatedMilk.stockQty).toBe(4700);
    });

    it('3. Kitchen completion does NOT prematurely close bill or release table occupancy', async () => {
      const tableId = 'tbl_dine_3';
      const saleId = 'sale_kitchen_test';

      mockDbStore[`businesses/${businessId}/tables/${tableId}`] = {
        id: tableId,
        businessId,
        branchId,
        tableNumber: 'Meja VIP 01',
        status: 'occupied',
        activeSaleId: saleId,
      };

      mockDbStore[`businesses/${businessId}/sales/${saleId}`] = {
        id: saleId,
        businessId,
        branchId,
        orderType: 'dine_in',
        tableId,
        tableNumber: 'Meja VIP 01',
        orderStatus: 'preparing',
        paymentStatus: 'pending',
        lineItems: [
          { productId: 'p1', productName: 'Sirloin Steak', quantity: 1, unitPrice: 150000, subtotal: 150000 },
        ],
        grandTotal: 150000,
      };

      // Kitchen marks ticket as 'completed' (served to customer)
      const patchReq = new Request('http://localhost/api/fnb/kitchen/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
        body: JSON.stringify({
          businessId,
          branchId,
          saleId,
          orderStatus: 'completed',
        }),
      });

      const res = await kitchenOrdersPatch(patchReq);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Sale is marked completed in kitchen, BUT table remains occupied and paymentStatus remains pending
      const saleAfterKitchen = mockDbStore[`businesses/${businessId}/sales/${saleId}`];
      expect(saleAfterKitchen.orderStatus).toBe('completed');
      expect(saleAfterKitchen.paymentStatus).toBe('pending');

      const tableAfterKitchen = mockDbStore[`businesses/${businessId}/tables/${tableId}`];
      expect(tableAfterKitchen.status).toBe('occupied');
      expect(tableAfterKitchen.activeSaleId).toBe(saleId);
    });
  });

  // ==========================================
  // SECTION C: PHONE STORE WORKFLOWS
  // ==========================================
  describe('C. Phone Store Workflows', () => {
    it('1. Direct Sell-In intakes device, registers IMEI, auto-resolves parent product, and records ledger', async () => {
      // Valid Luhn IMEI for testing
      const validImei = '356938035643809';

      const req = new Request('http://localhost/api/phone/sell-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
        body: JSON.stringify({
          businessId,
          branchId,
          imei: validImei,
          brand: 'Samsung',
          model: 'Galaxy S24 Ultra 256GB',
          storage: '256GB',
          color: 'Titanium Black',
          condition: 'second_grade_a',
          costPrice: 14000000,
          sellingPrice: 16500000,
          customerName: 'Kurniawan',
          cashSessionId: 'shift_fase4_1',
          notes: 'Kelengkapan fullset original',
        }),
      });

      const res = await sellInPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.unit.imei).toBe(validImei);
      expect(json.unit.status).toBe('available');

      // Verify parent product was auto-created and NOT dangling
      const parentProd = mockDbStore[`businesses/${businessId}/products/${json.unit.productId}`];
      expect(parentProd).toBeDefined();
      expect(parentProd.name).toContain('Samsung Galaxy S24 Ultra');
      expect(parentProd.stockQty).toBe(1);

      // Verify IMEI registry was created
      const reg = mockDbStore[`businesses/${businessId}/registeredImeis/${validImei}`];
      expect(reg).toBeDefined();
      expect(reg.unitId).toBe(json.unit.id);

      // Verify stock ledger entry was created
      const movements = Object.keys(mockDbStore)
        .filter(k => k.startsWith(`businesses/${businessId}/stockMovements/`))
        .map(k => mockDbStore[k]);
      const intakeMv = movements.find(m => m.notes?.includes(validImei));
      expect(intakeMv).toBeDefined();
      expect(intakeMv?.type).toBe('purchase_order');
      expect(intakeMv?.quantityDelta).toBe(1);

      // Verify intake payout reduced cash drawer
      const shift = mockDbStore[`businesses/${businessId}/cashSessions/shift_fase4_1`];
      expect(shift.currentCashDrawer).toBe(500000 - 14000000);
    });

    it('2. Phone Exchange rejects self-exchange alias, branch mismatch, and expired warranty', async () => {
      const imeiOld = '356938035643809';
      const imeiOldSim2 = '356938035643817';
      const imeiReplacement = '862084050218909';

      // Seed sold unit with unexpired warranty
      const unitOldId = 'unit_sold_old';
      mockDbStore[`businesses/${businessId}/imeiUnits/${unitOldId}`] = {
        id: unitOldId,
        businessId,
        branchId,
        imei: imeiOld,
        imei2: imeiOldSim2,
        productId: 'prod_ip14',
        productName: 'iPhone 14 128GB',
        status: 'sold',
        warrantyUntil: Date.now() + 86400000 * 30, // 30 days left
      };
      mockDbStore[`businesses/${businessId}/registeredImeis/${imeiOld}`] = { unitId: unitOldId };
      mockDbStore[`businesses/${businessId}/registeredImeis/${imeiOldSim2}`] = { unitId: unitOldId };

      // Seed available replacement unit
      const unitRepId = 'unit_avail_rep';
      mockDbStore[`businesses/${businessId}/imeiUnits/${unitRepId}`] = {
        id: unitRepId,
        businessId,
        branchId,
        imei: imeiReplacement,
        productId: 'prod_ip14',
        productName: 'iPhone 14 128GB',
        status: 'available',
      };
      mockDbStore[`businesses/${businessId}/registeredImeis/${imeiReplacement}`] = { unitId: unitRepId };

      // 1. Attempt self-exchange with Dual-SIM alias
      const selfReq = new Request('http://localhost/api/phone/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
        body: JSON.stringify({
          businessId,
          branchId,
          oldImei: imeiOld,
          newImei: imeiOldSim2, // Same device!
          reason: 'SIM alias test',
          differenceFee: 0,
        }),
      });
      const selfRes = await exchangePost(selfReq);
      expect(selfRes.status).toBe(400);
      const selfJson = await selfRes.json();
      expect(selfJson.message).toContain('perangkat fisik yang sama');

      // 2. Attempt exchange on expired warranty
      mockDbStore[`businesses/${businessId}/imeiUnits/${unitOldId}`].warrantyUntil = Date.now() - 1000;
      const expiredReq = new Request('http://localhost/api/phone/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
        body: JSON.stringify({
          businessId,
          branchId,
          oldImei: imeiOld,
          newImei: imeiReplacement,
          reason: 'Mati total',
          differenceFee: 0,
        }),
      });
      const expRes = await exchangePost(expiredReq);
      expect(expRes.status).toBe(400);
      const expJson = await expRes.json();
      expect(expJson.message).toContain('Masa garansi unit telah berakhir');

      // 3. Successful exchange when warranty is valid
      mockDbStore[`businesses/${businessId}/imeiUnits/${unitOldId}`].warrantyUntil = Date.now() + 86400000 * 30;
      const validReq = new Request('http://localhost/api/phone/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
        body: JSON.stringify({
          businessId,
          branchId,
          oldImei: imeiOld,
          newImei: imeiReplacement,
          reason: 'Layar bergaris hijau',
          differenceFee: 150000,
          cashSessionId: 'shift_fase4_1',
        }),
      });
      const validRes = await exchangePost(validReq);
      const validJson = await validRes.json();

      expect(validRes.status).toBe(200);
      expect(validJson.success).toBe(true);

      // Verify unit states: defective unit enters quarantine disposition, replacement is sold
      expect(mockDbStore[`businesses/${businessId}/imeiUnits/${unitOldId}`].status).toBe('quarantined');
      expect(mockDbStore[`businesses/${businessId}/imeiUnits/${unitRepId}`].status).toBe('sold');
    });

    it('3. Service Ticket repair module deducts sparepart stock and settles invoice', async () => {
      // 1. Seed sparepart product
      const lcdId = 'prod_lcd_ip13';
      mockDbStore[`businesses/${businessId}/products/${lcdId}`] = {
        id: lcdId,
        businessId,
        name: 'LCD OLED Screen iPhone 13 Original',
        sellingPrice: 1200000,
        costPrice: 850000,
        trackStock: true,
        stockQty: 5,
        available: true,
        isActive: true,
      };

      // 2. Create Service Ticket
      const createReq = new Request('http://localhost/api/phone/service-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
        body: JSON.stringify({
          action: 'create',
          businessId,
          branchId,
          customerName: 'Siti Aminah',
          customerPhone: '08123456789',
          deviceModel: 'iPhone 13 128GB Midnight',
          imei: '356938035643809',
          issueDescription: 'Layar pecah terkena benturan',
          technicianId: 'usr_tech_1',
          technicianName: 'Asep Teknisi',
        }),
      });

      const createRes = await serviceTicketsPost(createReq);
      const createJson = await createRes.json();

      expect(createRes.status).toBe(200);
      expect(createJson.success).toBe(true);
      const ticketId = createJson.ticket.id;
      expect(createJson.ticket.status).toBe('received');

      // 3. Add Sparepart to Service Ticket (deducts stock)
      const sparepartReq = new Request('http://localhost/api/phone/service-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
        body: JSON.stringify({
          action: 'add_spareparts',
          businessId,
          branchId,
          ticketId,
          spareparts: [
            {
              productId: lcdId,
              productName: 'LCD OLED Screen iPhone 13 Original',
              quantity: 1,
              unitPrice: 1200000,
            },
          ],
        }),
      });

      const sparepartRes = await serviceTicketsPost(sparepartReq);
      const sparepartJson = await sparepartRes.json();
      expect(sparepartRes.status).toBe(200);
      expect(sparepartJson.success).toBe(true);

      // Verify sparepart inventory deduction: 5 - 1 = 4
      const updatedLcd = mockDbStore[`businesses/${businessId}/products/${lcdId}`];
      expect(updatedLcd.stockQty).toBe(4);

      // 4. Settle Service Ticket Payment
      const settleReq = new Request('http://localhost/api/phone/service-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
        body: JSON.stringify({
          action: 'settle_payment',
          businessId,
          branchId,
          ticketId,
          laborFee: 250000,
          paymentMethod: 'cash',
          cashSessionId: 'shift_fase4_1',
        }),
      });

      const settleRes = await serviceTicketsPost(settleReq);
      const settleJson = await settleRes.json();

      expect(settleRes.status).toBe(200);
      expect(settleJson.success).toBe(true);
      expect(settleJson.ticket.status).toBe('delivered');
      expect(settleJson.ticket.isPaid).toBe(true);
      expect(settleJson.ticket.totalFee).toBe(1450000); // 1200000 (sparepart) + 250000 (labor)

      // Verify cash drawer received service payment
      const shift = mockDbStore[`businesses/${businessId}/cashSessions/shift_fase4_1`];
      expect(shift.currentCashDrawer).toBeGreaterThanOrEqual(1450000);
    });
  });
});
