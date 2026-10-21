import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { POST as checkoutPost } from '../app/api/sales/checkout/route';
import { POST as refundPost } from '../app/api/sales/refund/route';
import { POST as midtransWebhookPost } from '../app/api/webhooks/midtrans/route';
import { GET as salesHistoryGet } from '../app/api/sales/history/route';
import { POST as shiftOpenPost } from '../app/api/shifts/open/route';
import { POST as shiftClosePost } from '../app/api/shifts/close/route';

// In-memory mock store for Firestore and Auth
const { mockDbStore } = vi.hoisted(() => ({
  mockDbStore: {} as Record<string, any>,
}));

const TEST_MIDTRANS_SERVER_KEY = "SB-Mid-server-test-secret-key-12345";
process.env.MIDTRANS_SERVER_KEY = TEST_MIDTRANS_SERVER_KEY;
process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY = "SB-Mid-client-test-key";

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
            uid: parts[0] || 'usr_owner_1',
            email: `${parts[0] || 'usr_owner_1'}@tokokoe.local`,
            role: parts[1] || 'owner',
            businessId: parts[2] || 'biz_fase5_test',
          };
        }
        return {
          uid: 'usr_owner_1',
          email: 'owner@tokokoe.local',
          role: 'owner',
          businessId: 'biz_fase5_test',
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

function createReq(url: string, method: string, body?: any, token: string = 'test_token__usr_owner_1__owner__biz_fase5_test') {
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function generateMidtransSignature(orderId: string, statusCode: string, grossAmount: string, serverKey: string): string {
  const raw = `${orderId}${statusCode}${grossAmount}${serverKey}`;
  return crypto.createHash('sha512').update(raw).digest('hex');
}

describe('FASE 5: PEMBAYARAN DAN LAPORAN INTEGRATION SUITE', () => {
  const bizId = 'biz_fase5_test';
  const branchId = 'branch_fase5_main';
  const ownerUid = 'usr_owner_1';

  beforeEach(() => {
    // Reset mock store
    for (const key of Object.keys(mockDbStore)) {
      delete mockDbStore[key];
    }

    // Seed business & membership
    mockDbStore[`businesses/${bizId}`] = {
      id: bizId,
      name: 'Toko Fase 5 Gadget & Ritel',
      businessType: 'retail',
      ownerId: ownerUid,
      createdAt: Date.now(),
    };

    mockDbStore[`businesses/${bizId}/memberships/${ownerUid}`] = {
      userId: ownerUid,
      businessId: bizId,
      role: 'owner',
      permissions: ['*'],
      branchIds: ['*'],
      displayName: 'Owner Fase 5',
    };

    // Seed branch
    mockDbStore[`businesses/${bizId}/branches/${branchId}`] = {
      id: branchId,
      businessId: bizId,
      name: 'Cabang Utama Fase 5',
      isActive: true,
    };

    // Seed product with initial costPrice 1,000,000 and sellingPrice 1,500,000
    mockDbStore[`businesses/${bizId}/products/prod_iphone_13`] = {
      id: 'prod_iphone_13',
      businessId: bizId,
      name: 'iPhone 13 128GB',
      costPrice: 1000000,
      sellingPrice: 1500000,
      stockQty: 10,
      trackStock: true,
      hasImei: true,
      status: 'active',
    };

    // Seed registered IMEI
    mockDbStore[`businesses/${bizId}/registeredImeis/358123456789012`] = {
      imei: '358123456789012',
      unitId: 'unit_ip13_001',
      businessId: bizId,
      branchId,
      isPrimary: true,
      status: 'available',
    };

    mockDbStore[`businesses/${bizId}/imeiUnits/unit_ip13_001`] = {
      id: 'unit_ip13_001',
      businessId: bizId,
      branchId,
      imei: '358123456789012',
      productId: 'prod_iphone_13',
      productName: 'iPhone 13 128GB',
      costPrice: 1000000,
      sellingPrice: 1500000,
      condition: 'new',
      status: 'available',
    };

    // Seed table
    mockDbStore[`businesses/${bizId}/tables/table_vip_1`] = {
      id: 'table_vip_1',
      businessId: bizId,
      branchId,
      tableNumber: 'VIP-01',
      status: 'available',
    };
  });

  // =========================================================================
  // SECTION A: PAYMENT LIFECYCLE (Cash, Transfer, QRIS Reservation)
  // =========================================================================
  describe('A. Payment Lifecycle', () => {
    it('1. Cash payment requires sufficient paid amount and rejects underpayment', async () => {
      // Open a cash shift first
      const openShiftReq = createReq(`http://localhost/api/shifts/open`, 'POST', {
        businessId: bizId,
        branchId,
        openingCash: 500000,
      });
      const shiftRes = await shiftOpenPost(openShiftReq);
      const shiftData = await shiftRes.json();
      expect(shiftData.success).toBe(true);
      const sessionId = shiftData.shift.id;

      // Attempt cash checkout with underpayment (Rp 1,000,000 for Rp 1,500,000 bill)
      const underpaidReq = createReq(`http://localhost/api/sales/checkout`, 'POST', {
        businessId: bizId,
        branchId,
        orderType: 'retail_pos',
        paymentMethod: 'cash',
        paidAmount: 1000000,
        cashSessionId: sessionId,
        lineItems: [{
          productId: 'prod_iphone_13',
          quantity: 1,
          selectedImei: '358123456789012',
        }],
      });
      const underpaidRes = await checkoutPost(underpaidReq);
      expect(underpaidRes.status).toBe(400);
      const underpaidJson = await underpaidRes.json();
      expect(underpaidJson.message).toContain('kurang dari total tagihan');

      // Valid cash checkout (Rp 1,500,000 paid)
      const validCashReq = createReq(`http://localhost/api/sales/checkout`, 'POST', {
        businessId: bizId,
        branchId,
        orderType: 'retail_pos',
        paymentMethod: 'cash',
        paidAmount: 1500000,
        cashSessionId: sessionId,
        lineItems: [{
          productId: 'prod_iphone_13',
          quantity: 1,
          selectedImei: '358123456789012',
        }],
      });
      const validRes = await checkoutPost(validCashReq);
      expect(validRes.status).toBe(200);
      const validJson = await validRes.json();
      expect(validJson.sale.paymentStatus).toBe('paid');
      expect(validJson.sale.settledAt).toBeDefined();

      // Check cash shift was updated
      const sessionInDb = mockDbStore[`businesses/${bizId}/cashSessions/${sessionId}`];
      expect(sessionInDb.expectedClosingCash).toBe(2000000); // 500k opening + 1500k sale
    });

    it('2. Bank transfer is pending by default unless explicit verification and reference provided', async () => {
      // Unverified bank transfer
      const unverifiedReq = createReq(`http://localhost/api/sales/checkout`, 'POST', {
        businessId: bizId,
        branchId,
        orderType: 'retail_pos',
        paymentMethod: 'transfer',
        paidAmount: 0,
        lineItems: [{
          productId: 'prod_iphone_13',
          quantity: 1,
          selectedImei: '358123456789012',
        }],
      });
      const unverifiedRes = await checkoutPost(unverifiedReq);
      expect(unverifiedRes.status).toBe(200);
      const unverifiedJson = await unverifiedRes.json();
      expect(unverifiedJson.sale.paymentStatus).toBe('pending');
      expect(unverifiedJson.sale.settledAt).toBeUndefined();

      // Seed a second IMEI unit for verified test
      mockDbStore[`businesses/${bizId}/registeredImeis/358123456789099`] = {
        imei: '358123456789099',
        unitId: 'unit_ip13_099',
        businessId: bizId,
        branchId,
        isPrimary: true,
      };
      mockDbStore[`businesses/${bizId}/imeiUnits/unit_ip13_099`] = {
        id: 'unit_ip13_099',
        businessId: bizId,
        branchId,
        imei: '358123456789099',
        productId: 'prod_iphone_13',
        status: 'available',
      };

      // Verified bank transfer
      const verifiedReq = createReq(`http://localhost/api/sales/checkout`, 'POST', {
        businessId: bizId,
        branchId,
        orderType: 'retail_pos',
        paymentMethod: 'transfer',
        isTransferVerified: true,
        transferReferenceNumber: 'TRF-BCA-987654321',
        paidAmount: 0,
        lineItems: [{
          productId: 'prod_iphone_13',
          quantity: 1,
          selectedImei: '358123456789099',
        }],
      });
      const verifiedRes = await checkoutPost(verifiedReq);
      expect(verifiedRes.status).toBe(200);
      const verifiedJson = await verifiedRes.json();
      expect(verifiedJson.sale.paymentStatus).toBe('paid');
      expect(verifiedJson.sale.settledAt).toBeDefined();
      expect(verifiedJson.sale.transferReferenceNumber).toBe('TRF-BCA-987654321');
    });

    it('3. Midtrans QRIS checkout creates pending reservation and tenant-isolated order reference', async () => {
      const qrisReq = createReq(`http://localhost/api/sales/checkout`, 'POST', {
        businessId: bizId,
        branchId,
        orderType: 'dine_in',
        tableId: 'table_vip_1',
        tableNumber: 'VIP-01',
        paymentMethod: 'midtrans_qris',
        paidAmount: 0,
        lineItems: [{
          productId: 'prod_iphone_13',
          quantity: 1,
          selectedImei: '358123456789012',
        }],
      });
      const qrisRes = await checkoutPost(qrisReq);
      expect(qrisRes.status).toBe(200);
      const qrisJson = await qrisRes.json();

      expect(qrisJson.sale.paymentStatus).toBe('pending');
      expect(qrisJson.sale.settledAt).toBeUndefined();
      expect(qrisJson.sale.midtransOrderId).toContain(`${bizId}__`);

      // Verify catalog stock reserved (decremented from 10 to 9 with pending note)
      const prodInDb = mockDbStore[`businesses/${bizId}/products/prod_iphone_13`];
      expect(prodInDb.stockQty).toBe(9);

      // Verify IMEI status is 'reserved' (NOT 'sold')
      const imeiInDb = mockDbStore[`businesses/${bizId}/imeiUnits/unit_ip13_001`];
      expect(imeiInDb.status).toBe('reserved');

      // Verify Table remains 'occupied' (NOT released)
      const tableInDb = mockDbStore[`businesses/${bizId}/tables/table_vip_1`];
      expect(tableInDb.status).toBe('occupied');
    });
  });

  // =========================================================================
  // SECTION B: MIDTRANS WEBHOOK & REVENUE GATES
  // =========================================================================
  describe('B. Webhook & State Transitions', () => {
    it('1. Webhook rejects invalid signature and amount mismatch', async () => {
      // 1a. Invalid signature
      const badSigReq = new Request(`http://localhost/api/webhooks/midtrans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: `${bizId}__sale_test_1`,
          status_code: '200',
          gross_amount: '1500000.00',
          signature_key: 'completely_invalid_hash',
          transaction_status: 'settlement',
          payment_type: 'qris',
          transaction_time: '2026-10-15 10:00:00',
          transaction_id: 'trx_mid_123',
        }),
      });
      const badSigRes = await midtransWebhookPost(badSigReq);
      expect(badSigRes.status).toBe(401);

      // 1b. Amount mismatch
      // First create pending sale in mock store
      const saleId = 'sale_mismatch_test';
      const orderId = `${bizId}__${saleId}`;
      mockDbStore[`businesses/${bizId}/sales/${saleId}`] = {
        id: saleId,
        businessId: bizId,
        branchId,
        grandTotal: 1500000,
        paymentStatus: 'pending',
        lineItems: [],
      };

      const mismatchAmount = '1000000.00';
      const mismatchSig = generateMidtransSignature(orderId, '200', mismatchAmount, TEST_MIDTRANS_SERVER_KEY);
      const mismatchReq = new Request(`http://localhost/api/webhooks/midtrans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          status_code: '200',
          gross_amount: mismatchAmount,
          signature_key: mismatchSig,
          transaction_status: 'settlement',
          payment_type: 'qris',
          transaction_time: '2026-10-15 10:00:00',
          transaction_id: 'trx_mid_124',
        }),
      });
      const mismatchRes = await midtransWebhookPost(mismatchReq);
      expect(mismatchRes.status).toBe(400);
      const mismatchJson = await mismatchRes.json();
      expect(mismatchJson.message).toContain('tidak cocok');
    });

    it('2. Pending to Settlement transition finalizes sale, marks IMEI sold, and frees table', async () => {
      const saleId = 'sale_pending_to_settled';
      const orderId = `${bizId}__${saleId}`;

      mockDbStore[`businesses/${bizId}/sales/${saleId}`] = {
        id: saleId,
        saleNumber: 'TRX-SETTLE-001',
        businessId: bizId,
        branchId,
        grandTotal: 1500000,
        paymentStatus: 'pending',
        tableId: 'table_vip_1',
        lineItems: [{
          productId: 'prod_iphone_13',
          productName: 'iPhone 13 128GB',
          quantity: 1,
          unitPrice: 1500000,
          subtotal: 1500000,
          imei: '358123456789012',
        }],
      };

      mockDbStore[`businesses/${bizId}/imeiUnits/unit_ip13_001`].status = 'reserved';
      mockDbStore[`businesses/${bizId}/tables/table_vip_1`].status = 'occupied';
      mockDbStore[`businesses/${bizId}/tables/table_vip_1`].activeSaleId = saleId;

      const grossAmount = '1500000.00';
      const sig = generateMidtransSignature(orderId, '200', grossAmount, TEST_MIDTRANS_SERVER_KEY);

      const webhookReq = new Request(`http://localhost/api/webhooks/midtrans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          status_code: '200',
          gross_amount: grossAmount,
          signature_key: sig,
          transaction_status: 'settlement',
          payment_type: 'qris',
          transaction_time: '2026-10-15 10:00:00',
          transaction_id: 'trx_mid_settle_99',
        }),
      });

      const res = await midtransWebhookPost(webhookReq);
      expect(res.status).toBe(200);

      // Verify Sale is paid
      const saleInDb = mockDbStore[`businesses/${bizId}/sales/${saleId}`];
      expect(saleInDb.paymentStatus).toBe('paid');
      expect(saleInDb.settledAt).toBeDefined();

      // Verify IMEI unit is now sold with warranty
      const imeiInDb = mockDbStore[`businesses/${bizId}/imeiUnits/unit_ip13_001`];
      expect(imeiInDb.status).toBe('sold');
      expect(imeiInDb.warrantyUntil).toBeGreaterThan(Date.now());

      // Verify Table is released to available
      const tableInDb = mockDbStore[`businesses/${bizId}/tables/table_vip_1`];
      expect(tableInDb.status).toBe('available');
      expect(tableInDb.activeSaleId).toBe('');
    });

    it('3. GATE: Settlement followed by late pending/expiry remains PAID without reverting stock', async () => {
      const saleId = 'sale_late_expiry_test';
      const orderId = `${bizId}__${saleId}`;

      // Sale is already settled / paid
      mockDbStore[`businesses/${bizId}/sales/${saleId}`] = {
        id: saleId,
        saleNumber: 'TRX-SETTLE-002',
        businessId: bizId,
        branchId,
        grandTotal: 1500000,
        paymentStatus: 'paid',
        settledAt: Date.now() - 3600000,
        lineItems: [{
          productId: 'prod_iphone_13',
          productName: 'iPhone 13 128GB',
          quantity: 1,
          unitPrice: 1500000,
          subtotal: 1500000,
          imei: '358123456789012',
        }],
      };
      mockDbStore[`businesses/${bizId}/products/prod_iphone_13`].stockQty = 9;
      mockDbStore[`businesses/${bizId}/imeiUnits/unit_ip13_001`].status = 'sold';

      const grossAmount = '1500000.00';

      // 3a. Late notification arrives with 'expire'
      const lateExpireSig = generateMidtransSignature(orderId, '202', grossAmount, TEST_MIDTRANS_SERVER_KEY);
      const lateExpireReq = new Request(`http://localhost/api/webhooks/midtrans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          status_code: '202',
          gross_amount: grossAmount,
          signature_key: lateExpireSig,
          transaction_status: 'expire',
          payment_type: 'qris',
          transaction_time: '2026-10-15 10:30:00',
          transaction_id: 'trx_mid_late_expire',
        }),
      });

      const resExpire = await midtransWebhookPost(lateExpireReq);
      expect(resExpire.status).toBe(200);
      const jsonExpire = await resExpire.json();
      expect(jsonExpire.details.status).toBe('LATE_NOTIFICATION_IGNORED');

      // VERIFY CRITICAL INVARIANT: Sale remains PAID!
      const saleAfterExpire = mockDbStore[`businesses/${bizId}/sales/${saleId}`];
      expect(saleAfterExpire.paymentStatus).toBe('paid');

      // VERIFY: Stock was NOT reverted
      expect(mockDbStore[`businesses/${bizId}/products/prod_iphone_13`].stockQty).toBe(9);
      // VERIFY: IMEI remains sold
      expect(mockDbStore[`businesses/${bizId}/imeiUnits/unit_ip13_001`].status).toBe('sold');

      // 3b. Duplicate settlement is idempotent
      const dupSig = generateMidtransSignature(orderId, '200', grossAmount, TEST_MIDTRANS_SERVER_KEY);
      const dupReq = new Request(`http://localhost/api/webhooks/midtrans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          status_code: '200',
          gross_amount: grossAmount,
          signature_key: dupSig,
          transaction_status: 'settlement',
          payment_type: 'qris',
          transaction_time: '2026-10-15 10:35:00',
          transaction_id: 'trx_mid_dup_settle',
        }),
      });
      const resDup = await midtransWebhookPost(dupReq);
      expect(resDup.status).toBe(200);
      const jsonDup = await resDup.json();
      expect(jsonDup.details.status).toBe('IDEMPOTENT_ALREADY_PAID');
    });

    it('4. GATE: Payment failure releases reservation and does NOT leave dangling sold stock/units', async () => {
      const saleId = 'sale_fail_reservation_test';
      const orderId = `${bizId}__${saleId}`;

      // Pending sale with reserved stock and reserved IMEI
      mockDbStore[`businesses/${bizId}/sales/${saleId}`] = {
        id: saleId,
        saleNumber: 'TRX-FAIL-001',
        businessId: bizId,
        branchId,
        grandTotal: 1500000,
        paymentStatus: 'pending',
        tableId: 'table_vip_1',
        lineItems: [{
          productId: 'prod_iphone_13',
          productName: 'iPhone 13 128GB',
          quantity: 1,
          unitPrice: 1500000,
          subtotal: 1500000,
          imei: '358123456789012',
        }],
      };

      mockDbStore[`businesses/${bizId}/products/prod_iphone_13`].stockQty = 9; // Was decremented during checkout
      mockDbStore[`businesses/${bizId}/imeiUnits/unit_ip13_001`].status = 'reserved';
      mockDbStore[`businesses/${bizId}/tables/table_vip_1`].status = 'occupied';
      mockDbStore[`businesses/${bizId}/tables/table_vip_1`].activeSaleId = saleId;

      const grossAmount = '1500000.00';
      const cancelSig = generateMidtransSignature(orderId, '202', grossAmount, TEST_MIDTRANS_SERVER_KEY);

      const cancelReq = new Request(`http://localhost/api/webhooks/midtrans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          status_code: '202',
          gross_amount: grossAmount,
          signature_key: cancelSig,
          transaction_status: 'cancel',
          payment_type: 'qris',
          transaction_time: '2026-10-15 10:05:00',
          transaction_id: 'trx_mid_cancel_1',
        }),
      });

      const res = await midtransWebhookPost(cancelReq);
      expect(res.status).toBe(200);

      // Verify Sale status transitioned to failed
      const saleInDb = mockDbStore[`businesses/${bizId}/sales/${saleId}`];
      expect(saleInDb.paymentStatus).toBe('failed');
      expect(saleInDb.cancelledAt).toBeDefined();

      // VERIFY: Catalog stock restored from 9 back to 10
      expect(mockDbStore[`businesses/${bizId}/products/prod_iphone_13`].stockQty).toBe(10);

      // VERIFY: Compensatory Stock Movement ledger recorded
      const movements = Object.values(mockDbStore).filter(
        (v: any) => v.type === 'adjustment' && v.referenceId === 'TRX-FAIL-001'
      );
      expect(movements.length).toBe(1);
      expect((movements[0] as any).quantityDelta).toBe(1);

      // VERIFY: IMEI unit restored back to 'available'
      expect(mockDbStore[`businesses/${bizId}/imeiUnits/unit_ip13_001`].status).toBe('available');

      // VERIFY: Table occupancy released
      expect(mockDbStore[`businesses/${bizId}/tables/table_vip_1`].status).toBe('available');
      expect(mockDbStore[`businesses/${bizId}/tables/table_vip_1`].activeSaleId).toBe('');
    });
  });

  // =========================================================================
  // SECTION C: REFUND POLICY & IDEMPOTENCY
  // =========================================================================
  describe('C. Refund Lifecycle & Idempotency', () => {
    it('1. GATE: Refund does not return stock or money twice (idempotent & rejects second attempt)', async () => {
      const saleId = 'sale_refund_test_01';

      // Seed a paid sale
      mockDbStore[`businesses/${bizId}/sales/${saleId}`] = {
        id: saleId,
        saleNumber: 'TRX-REFUND-001',
        businessId: bizId,
        branchId,
        grandTotal: 1500000,
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        lineItems: [{
          productId: 'prod_iphone_13',
          productName: 'iPhone 13 128GB',
          quantity: 1,
          unitPrice: 1500000,
          subtotal: 1500000,
          imei: '358123456789012',
        }],
      };
      mockDbStore[`businesses/${bizId}/products/prod_iphone_13`].stockQty = 9;
      mockDbStore[`businesses/${bizId}/imeiUnits/unit_ip13_001`].status = 'sold';

      // First refund: succeeds
      const firstRefundReq = createReq(`http://localhost/api/sales/refund`, 'POST', {
        businessId: bizId,
        branchId,
        saleId,
        reason: 'Layar terdapat goresan halus',
      });
      const firstRes = await refundPost(firstRefundReq);
      expect(firstRes.status).toBe(200);

      const saleAfterFirstRefund = mockDbStore[`businesses/${bizId}/sales/${saleId}`];
      expect(saleAfterFirstRefund.paymentStatus).toBe('refunded');
      expect(saleAfterFirstRefund.refundedAt).toBeDefined();

      // Product stock restored to 10
      expect(mockDbStore[`businesses/${bizId}/products/prod_iphone_13`].stockQty).toBe(10);
      // IMEI restored to available
      expect(mockDbStore[`businesses/${bizId}/imeiUnits/unit_ip13_001`].status).toBe('available');

      // Second refund attempt: MUST BE REJECTED (409 Conflict)
      const secondRefundReq = createReq(`http://localhost/api/sales/refund`, 'POST', {
        businessId: bizId,
        branchId,
        saleId,
        reason: 'Mencoba refund kedua kalinya',
      });
      const secondRes = await refundPost(secondRefundReq);
      expect(secondRes.status).toBe(409);
      const secondJson = await secondRes.json();
      expect(secondJson.message).toContain('sudah pernah direfund sebelumnya');

      // Ensure stock did not increment again to 11
      expect(mockDbStore[`businesses/${bizId}/products/prod_iphone_13`].stockQty).toBe(10);
    });

    it('2. Refund rejects non-paid orders (e.g. pending or failed sales)', async () => {
      const pendingSaleId = 'sale_pending_cannot_refund';
      mockDbStore[`businesses/${bizId}/sales/${pendingSaleId}`] = {
        id: pendingSaleId,
        saleNumber: 'TRX-PENDING-99',
        businessId: bizId,
        branchId,
        grandTotal: 1500000,
        paymentStatus: 'pending',
        lineItems: [],
      };

      const refundPendingReq = createReq(`http://localhost/api/sales/refund`, 'POST', {
        businessId: bizId,
        branchId,
        saleId: pendingSaleId,
        reason: 'Refund order pending',
      });
      const res = await refundPost(refundPendingReq);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('Hanya transaksi dengan status \'paid\'');
    });
  });

  // =========================================================================
  // SECTION D: REPORTING, HISTORICAL HPP PROTECTION & CASH RECONCILIATION
  // =========================================================================
  describe('D. Financial Reporting & Historical HPP Protection', () => {
    it('1. GATE: Changing product catalog costPrice does NOT alter past sales profit', async () => {
      // 1. Checkout an item while catalog costPrice is 1,000,000 (sellingPrice 1,500,000)
      const checkoutReq = createReq(`http://localhost/api/sales/checkout`, 'POST', {
        businessId: bizId,
        branchId,
        orderType: 'retail_pos',
        paymentMethod: 'cash',
        paidAmount: 1500000,
        lineItems: [{
          productId: 'prod_iphone_13',
          quantity: 1,
          selectedImei: '358123456789012',
        }],
      });
      const checkoutRes = await checkoutPost(checkoutReq);
      const checkoutJson = await checkoutRes.json();
      const sale = checkoutJson.sale;

      // Sale should have snapshot: cogsSnapshot = 1,000,000; grossProfit = 500,000
      expect(sale.cogsSnapshot).toBe(1000000);
      expect(sale.grossProfit).toBe(500000);

      // Verify report before catalog change
      const reportReq1 = createReq(`http://localhost/api/sales/history?businessId=${bizId}`, 'GET');
      const reportRes1 = await salesHistoryGet(reportReq1);
      const reportJson1 = await reportRes1.json();

      expect(reportJson1.summary.netRevenue).toBe(1500000);
      expect(reportJson1.summary.totalCogs).toBe(1000000);
      expect(reportJson1.summary.grossProfit).toBe(500000);

      // 2. NOW: Update product catalog costPrice to 1,300,000 (price increase from supplier)
      mockDbStore[`businesses/${bizId}/products/prod_iphone_13`].costPrice = 1300000;

      // 3. Query report again: PAST PROFIT MUST NOT CHANGE!
      const reportReq2 = createReq(`http://localhost/api/sales/history?businessId=${bizId}`, 'GET');
      const reportRes2 = await salesHistoryGet(reportReq2);
      const reportJson2 = await reportRes2.json();

      // Net revenue, totalCogs, and grossProfit remain strictly 1,500,000, 1,000,000, and 500,000!
      expect(reportJson2.summary.netRevenue).toBe(1500000);
      expect(reportJson2.summary.totalCogs).toBe(1000000);
      expect(reportJson2.summary.grossProfit).toBe(500000);
    });

    it('2. GATE: Reporting separates paid, pending, failed, refunded, and reconciles cash drawer from open shifts only', async () => {
      const now = Date.now();

      // Seed sales with various lifecycles
      mockDbStore[`businesses/${bizId}/sales/s_paid_1`] = {
        id: 's_paid_1',
        saleNumber: 'TRX-PAID-01',
        businessId: bizId,
        branchId,
        grandTotal: 1000000,
        cogsSnapshot: 600000,
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        createdAt: now - 10000,
      };

      mockDbStore[`businesses/${bizId}/sales/s_paid_2`] = {
        id: 's_paid_2',
        saleNumber: 'TRX-PAID-02',
        businessId: bizId,
        branchId,
        grandTotal: 2000000,
        cogsSnapshot: 1400000,
        paymentStatus: 'paid',
        paymentMethod: 'transfer',
        createdAt: now - 8000,
      };

      mockDbStore[`businesses/${bizId}/sales/s_pending`] = {
        id: 's_pending',
        saleNumber: 'TRX-PEND-01',
        businessId: bizId,
        branchId,
        grandTotal: 500000,
        cogsSnapshot: 300000,
        paymentStatus: 'pending',
        paymentMethod: 'midtrans_qris',
        createdAt: now - 6000,
      };

      mockDbStore[`businesses/${bizId}/sales/s_refunded`] = {
        id: 's_refunded',
        saleNumber: 'TRX-REF-01',
        businessId: bizId,
        branchId,
        grandTotal: 400000,
        cogsSnapshot: 250000,
        paymentStatus: 'refunded',
        paymentMethod: 'cash',
        createdAt: now - 4000,
      };

      mockDbStore[`businesses/${bizId}/sales/s_failed`] = {
        id: 's_failed',
        saleNumber: 'TRX-FAIL-01',
        businessId: bizId,
        branchId,
        grandTotal: 300000,
        cogsSnapshot: 180000,
        paymentStatus: 'failed',
        paymentMethod: 'midtrans_qris',
        createdAt: now - 2000,
      };

      // Seed cash sessions:
      // - 1 historical closed shift from yesterday with expectedClosingCash Rp 2,000,000
      // - 1 active OPEN shift today with currentCashDrawer Rp 750,000
      mockDbStore[`businesses/${bizId}/cashSessions/shift_yesterday_closed`] = {
        id: 'shift_yesterday_closed',
        businessId: bizId,
        branchId,
        status: 'closed',
        expectedClosingCash: 2000000,
        actualClosingCash: 2000000,
      };

      mockDbStore[`businesses/${bizId}/cashSessions/shift_today_open`] = {
        id: 'shift_today_open',
        businessId: bizId,
        branchId,
        status: 'open',
        openingCash: 500000,
        currentCashDrawer: 750000,
        expectedClosingCash: 750000,
      };

      const req = createReq(`http://localhost/api/sales/history?businessId=${bizId}`, 'GET');
      const res = await salesHistoryGet(req);
      const json = await res.json();
      expect(res.status).toBe(200);

      const s = json.summary;
      // Revenue checks:
      expect(s.paidRevenue).toBe(3000000); // 1,000,000 + 2,000,000
      expect(s.pendingRevenue).toBe(500000);
      expect(s.refundedTotal).toBe(400000);
      expect(s.failedRevenue).toBe(300000);
      expect(s.grossRevenue).toBe(3400000); // paid (3m) + refunded (400k)
      expect(s.netRevenue).toBe(3000000); // Net settled revenue

      // Cost & Profit checks:
      // totalCogs from paid sales only: 600,000 + 1,400,000 = 2,000,000
      expect(s.totalCogs).toBe(2000000);
      // grossProfit: netRevenue (3,000,000) - totalCogs (2,000,000) = 1,000,000
      expect(s.grossProfit).toBe(1000000);

      // Cash breakdown:
      expect(s.cashSales).toBe(1000000);
      expect(s.nonCashSales).toBe(2000000);

      // INVARIANT: Current cash drawer is strictly 750,000 from the OPEN shift,
      // NOT 2,750,000 (which would mistakenly sum yesterday's closed shift)!
      expect(s.currentCashDrawer).toBe(750000);
    });

    it('3. CSV Export returns proper text/csv with formatted headers and rows', async () => {
      mockDbStore[`businesses/${bizId}/sales/s_csv_1`] = {
        id: 's_csv_1',
        saleNumber: 'TRX-CSV-001',
        businessId: bizId,
        branchId,
        cashierName: 'Budi Kasir',
        customerName: 'Pelanggan Setia',
        orderType: 'retail_pos',
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        subtotal: 1500000,
        discount: 0,
        tax: 0,
        serviceCharge: 0,
        grandTotal: 1500000,
        cogsSnapshot: 1000000,
        createdAt: Date.now(),
      };

      const req = createReq(`http://localhost/api/sales/history?businessId=${bizId}&export=csv`, 'GET');
      const res = await salesHistoryGet(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/csv');
      const csvText = await res.text();

      expect(csvText).toContain('Nomor Transaksi');
      expect(csvText).toContain('TRX-CSV-001');
      expect(csvText).toContain('Budi Kasir');
      expect(csvText).toContain('1500000');
    });
  });
});
