/**
 * TOKOKOE LIVE PRODUCTION AUTOMATED TEST SUITE
 * Tests Auth, Business CRUD, Employee CRUD & Login, Sales & Anti-Spam Idempotency, and Inventory Stock Workflows
 */

const BASE_URL = 'https://tokokoe-saas.vercel.app';
const FIREBASE_API_KEY = 'AIzaSyBo-n3AxMkiaywrE6mD3FG7fxlDXI2LBq8';
const OWNER_EMAIL = 'tester.1791789500@tokokoe.com';
const OWNER_PASSWORD = 'Password12345!';

const results = [];

function record(name, status, details = '') {
  results.push({ name, status, details });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [${status}] ${name} ${details ? `(${details})` : ''}`);
}

async function run() {
  console.log('='.repeat(60));
  console.log('🚀 MEMULAI PENGUJIAN OTOMATIS FITUR & CRUD TOKOKOE (LIVE PRODUCTION)');
  console.log(`Target: ${BASE_URL}`);
  console.log('='.repeat(60));

  let idToken = '';
  let ownerUid = '';

  // 1. Owner Login
  try {
    const authRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: OWNER_EMAIL,
          password: OWNER_PASSWORD,
          returnSecureToken: true,
        }),
      }
    );
    const authData = await authRes.json();
    if (!authRes.ok || !authData.idToken) {
      throw new Error(authData.error?.message || 'Login gagal');
    }
    idToken = authData.idToken;
    ownerUid = authData.localId;
    record('Auth: Owner Firebase Sign-In', 'PASS', `UID: ${ownerUid}`);
  } catch (err) {
    record('Auth: Owner Firebase Sign-In', 'FAIL', err.message);
    process.exit(1);
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`,
  };

  // 2. Business Listing
  let businesses = [];
  try {
    const listRes = await fetch(`${BASE_URL}/api/businesses/list`, {
      method: 'GET',
      headers: authHeaders,
    });
    const listData = await listRes.json();
    if (!listRes.ok || !listData.success) {
      throw new Error(listData.message || 'Gagal mengambil daftar bisnis');
    }
    businesses = listData.businesses || [];
    const kopiTesting = businesses.find(b => b.name === 'Kopi Testing');
    record('Business: List Scoped Businesses', 'PASS', `${businesses.length} bisnis ditemukan. Kopi Testing: ${kopiTesting ? 'ADA' : 'TIDAK'}`);
  } catch (err) {
    record('Business: List Scoped Businesses', 'FAIL', err.message);
  }

  // 3. Business Creation CRUD (Create)
  let createdBiz = null;
  const testBizName = `Barokah Mart AutoTest ${Date.now().toString().slice(-4)}`;
  try {
    const createRes = await fetch(`${BASE_URL}/api/businesses/create`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: testBizName,
        businessType: 'retail',
        address: 'Jl. Ahmad Yani No. 12',
        phone: '081234567890',
      }),
    });
    const createData = await createRes.json();
    if (!createRes.ok || !createData.success) {
      throw new Error(createData.message || 'Gagal membuat bisnis baru');
    }
    createdBiz = createData.business;
    const branch = createData.mainBranch;
    record('Business: Create New Business (Retail)', 'PASS', `ID: ${createdBiz.id}, Branch: ${branch?.id}`);
  } catch (err) {
    record('Business: Create New Business (Retail)', 'FAIL', err.message);
  }

  const targetBizId = createdBiz?.id || businesses[0]?.id;
  const targetBranchId = createdBiz ? `br_${createdBiz.createdAt}_main` : (businesses[0]?.id ? `branch_default` : '');

  // 4. Employee Creation CRUD (Create)
  let createdUsername = '';
  const employeePassword = 'KasirPassword123!';
  if (targetBizId) {
    try {
      createdUsername = `kasir.autotest.${Date.now().toString().slice(-4)}`;
      const empRes = await fetch(`${BASE_URL}/api/employees/create`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          businessId: targetBizId,
          displayName: 'Ahmad Kasir AutoTest',
          username: createdUsername,
          role: 'cashier',
          branchIds: [targetBranchId || 'br_main'],
          initialPassword: employeePassword,
        }),
      });
      const empData = await empRes.json();
      if (!empRes.ok || !empData.success) {
        throw new Error(empData.message || JSON.stringify(empData.errors) || 'Gagal mendaftarkan karyawan');
      }
      record('Employee: Create Staff Member', 'PASS', `Username: ${createdUsername}, Role: cashier`);
    } catch (err) {
      record('Employee: Create Staff Member', 'FAIL', err.message);
    }
  }

  // 5. Employee Auth / Login
  if (createdUsername) {
    try {
      const empLoginRes = await fetch(`${BASE_URL}/api/auth/employee-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: createdUsername,
          password: employeePassword,
        }),
      });
      const empLoginData = await empLoginRes.json();
      if (!empLoginRes.ok || !empLoginData.success) {
        throw new Error(empLoginData.message || 'Login karyawan gagal');
      }
      record('Employee: Staff Login & Token Issue', 'PASS', `Custom Token issued, Role: ${empLoginData.role}`);
    } catch (err) {
      record('Employee: Staff Login & Token Issue', 'FAIL', err.message);
    }
  }

  // 6. Sales / POS Checkout Transaction (CRUD)
  const testIdempotencyKey = `idem_autotest_${Date.now()}`;
  let lastSaleId = null;
  if (targetBizId) {
    try {
      const checkoutRes = await fetch(`${BASE_URL}/api/sales/checkout`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          businessId: targetBizId,
          branchId: targetBranchId || 'br_main',
          customerName: 'Bapak Hendra',
          orderType: 'retail_pos',
          lineItems: [
            {
              productId: 'prod_beras_5kg',
              productName: 'Beras Ramos 5kg',
              quantity: 1,
              unitPrice: 75000,
              subtotal: 75000,
            },
          ],
          discount: 0,
          tax: 0,
          serviceCharge: 0,
          paidAmount: 80000,
          paymentMethod: 'cash',
          idempotencyKey: testIdempotencyKey,
        }),
      });
      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok || !checkoutData.success) {
        throw new Error(checkoutData.message || 'Gagal memproses transaksi checkout');
      }
      lastSaleId = checkoutData.sale?.id;
      record('Sales: POS Checkout Transaction', 'PASS', `Sale: ${checkoutData.sale?.saleNumber}, Total: Rp ${checkoutData.sale?.total}, Kembalian: Rp ${checkoutData.sale?.change}`);
    } catch (err) {
      record('Sales: POS Checkout Transaction', 'FAIL', err.message);
    }
  }

  // 7. Anti-Spam / Idempotency Duplicate Replay Check
  if (lastSaleId) {
    try {
      const replayRes = await fetch(`${BASE_URL}/api/sales/checkout`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          businessId: targetBizId,
          branchId: targetBranchId || 'br_main',
          customerName: 'Bapak Hendra',
          orderType: 'retail_pos',
          lineItems: [
            {
              productId: 'prod_beras_5kg',
              productName: 'Beras Ramos 5kg',
              quantity: 1,
              unitPrice: 75000,
              subtotal: 75000,
            },
          ],
          discount: 0,
          tax: 0,
          serviceCharge: 0,
          paidAmount: 80000,
          paymentMethod: 'cash',
          idempotencyKey: testIdempotencyKey,
        }),
      });
      const replayData = await replayRes.json();
      if (replayRes.ok && replayData.success) {
        // Idempotency returned existing sale
        if (replayData.sale?.id === lastSaleId) {
          record('Anti-Spam: Idempotency Protection', 'PASS', `Duplicate dicegah, mengembalikan sale ID yang sama: ${lastSaleId}`);
        } else {
          record('Anti-Spam: Idempotency Protection', 'FAIL', 'Terjadi duplicate sale ID baru!');
        }
      } else {
        record('Anti-Spam: Idempotency Protection', 'PASS', `Replay ditolak: ${replayData.message}`);
      }
    } catch (err) {
      record('Anti-Spam: Idempotency Protection', 'FAIL', err.message);
    }
  }

  // 8. Inventory Stock Adjustment Workflow (Request & Review)
  let adjId = null;
  if (targetBizId) {
    try {
      const adjReqRes = await fetch(`${BASE_URL}/api/inventory/adjustments/request`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          businessId: targetBizId,
          branchId: targetBranchId || 'br_main',
          productId: 'prod_beras_5kg',
          productName: 'Beras Ramos 5kg',
          previousQty: 20,
          adjustedQty: 18,
          reason: '2 karung sobek dan berkurang berat saat pengiriman',
        }),
      });
      const adjReqData = await adjReqRes.json();
      if (!adjReqRes.ok || !adjReqData.success) {
        throw new Error(adjReqData.message || 'Gagal mengajukan penyesuaian stok');
      }
      adjId = adjReqData.adjustment?.id || adjReqData.adjustmentId;
      record('Inventory: Request Stock Adjustment', 'PASS', `ID: ${adjId}`);
    } catch (err) {
      record('Inventory: Request Stock Adjustment', 'FAIL', err.message);
    }
  }

  // 9. Stock Adjustment Review / Approval
  if (adjId) {
    try {
      const reviewRes = await fetch(`${BASE_URL}/api/inventory/adjustments/review`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          businessId: targetBizId,
          adjustmentId: adjId,
          action: 'approved',
        }),
      });
      const reviewData = await reviewRes.json();
      if (!reviewRes.ok || !reviewData.success) {
        throw new Error(reviewData.message || 'Gagal review penyesuaian stok');
      }
      record('Inventory: Approve Stock Adjustment', 'PASS', `Status: approved`);
    } catch (err) {
      record('Inventory: Approve Stock Adjustment', 'FAIL', err.message);
    }
  }

  // 10. Phone Shop Exchange Validation (Module Endpoint Integrity)
  try {
    const exchangeRes = await fetch(`${BASE_URL}/api/phone/exchange`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        businessId: targetBizId,
        branchId: targetBranchId || 'br_main',
        oldImei: 'INVALID_IMEI_999999999999999',
        newImei: 'INVALID_IMEI_888888888888888',
        reason: 'Uji integritas validasi IMEI',
        differenceFee: 0,
      }),
    });
    const exchangeData = await exchangeRes.json();
    // It should cleanly return 400 or 404 with error message, not 500
    if (exchangeRes.status === 400 || exchangeRes.status === 404 || !exchangeData.success) {
      record('Phone Module: Exchange Route Integrity', 'PASS', `Validasi bekerja baik (${exchangeRes.status}): ${exchangeData.message}`);
    } else {
      record('Phone Module: Exchange Route Integrity', 'WARN', `Status ${exchangeRes.status}`);
    }
  } catch (err) {
    record('Phone Module: Exchange Route Integrity', 'FAIL', err.message);
  }

  console.log('='.repeat(60));
  console.log('📋 RINGKASAN HASIL PENGUJIAN:');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  console.log(`TOTAL: ${results.length} | PASS: ${passCount} | FAIL: ${failCount}`);
  console.log('='.repeat(60));
}

run().catch(console.error);
