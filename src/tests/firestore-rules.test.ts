import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { 
  initializeTestEnvironment, 
  RulesTestEnvironment, 
  assertFails, 
  assertSucceeds 
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

describe('FIRESTORE SECURITY RULES EMULATOR TESTS', () => {
  let testEnv: RulesTestEnvironment | null = null;
  const PROJECT_ID = 'tokokoe-rules-test';

  beforeAll(async () => {
    // Only run if FIRESTORE_EMULATOR_HOST is present
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      console.warn('FIRESTORE_EMULATOR_HOST not set, skipping live emulator rules suite.');
      return;
    }

    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules,
        host: process.env.FIRESTORE_EMULATOR_HOST.split(':')[0] || 'localhost',
        port: parseInt(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1] || '8080', 10),
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  it('verifies rules emulator enforces tenant isolation, inactive member rejection, and HPP protection', async (ctx) => {
    if (!testEnv) {
      ctx.skip();
      return;
    }

    // Seed test database directly with admin privileges
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // Seed business
      await db.doc('businesses/biz_retail_1').set({
        id: 'biz_retail_1',
        name: 'Toko Retail',
        ownerId: 'usr_owner_1',
        status: 'active',
      });

      // Seed active member
      await db.doc('businesses/biz_retail_1/members/usr_cashier_active').set({
        id: 'mem_act',
        userId: 'usr_cashier_active',
        businessId: 'biz_retail_1',
        role: 'cashier',
        status: 'active',
        branchIds: ['CAB-01'],
      });

      // Seed inactive member
      await db.doc('businesses/biz_retail_1/members/usr_cashier_inactive').set({
        id: 'mem_inact',
        userId: 'usr_cashier_inactive',
        businessId: 'biz_retail_1',
        role: 'cashier',
        status: 'inactive', // DEACTIVATED
        branchIds: ['CAB-01'],
      });

      // Seed product
      await db.doc('businesses/biz_retail_1/products/prod_1').set({
        id: 'prod_1',
        name: 'Beras 5kg',
        costPrice: 50000,
        sellingPrice: 65000,
      });

      // Seed PO
      await db.doc('businesses/biz_retail_1/purchaseOrders/po_1').set({
        id: 'po_1',
        totalCost: 1000000,
      });
    });

    // 1. Active member CAN read products
    const activeCashierCtx = testEnv.authenticatedContext('usr_cashier_active');
    const activeDb = activeCashierCtx.firestore();
    await assertSucceeds(activeDb.doc('businesses/biz_retail_1/products/prod_1').get());

    // 2. Inactive member CANNOT read products (GATE CRITERIA: Inactive member tidak bisa membaca data)
    const inactiveCashierCtx = testEnv.authenticatedContext('usr_cashier_inactive');
    const inactiveDb = inactiveCashierCtx.firestore();
    await assertFails(inactiveDb.doc('businesses/biz_retail_1/products/prod_1').get());

    // 3. Foreign user CANNOT read products (GATE CRITERIA: Foreign tenant ditolak)
    const foreignUserCtx = testEnv.authenticatedContext('usr_stranger');
    const foreignDb = foreignUserCtx.firestore();
    await assertFails(foreignDb.doc('businesses/biz_retail_1/products/prod_1').get());

    // 4. Cashier CANNOT read purchase orders (GATE CRITERIA: Staf tanpa izin tidak menerima HPP PO)
    await assertFails(activeDb.doc('businesses/biz_retail_1/purchaseOrders/po_1').get());

    // 5. Client CANNOT write directly to sales (All sales must go through atomic server API)
    await assertFails(activeDb.doc('businesses/biz_retail_1/sales/sale_fraud').set({
      id: 'sale_fraud',
      total: 0,
    }));
  });
});
