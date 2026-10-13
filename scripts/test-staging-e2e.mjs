import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';

const STAGING_URL = 'https://tokokoe-saas-47v0q2z80-aping1.vercel.app';
const FIREBASE_API_KEY = 'AIzaSyBo-n3AxMkiaywrE6mD3FG7fxlDXI2LBq8';

const firebaseConfig = {
  apiKey: FIREBASE_API_KEY,
  authDomain: 'tokokoe-16bab.firebaseapp.com',
  projectId: 'tokokoe-16bab',
};

const app = initializeApp(firebaseConfig, 'stagingTestApp');
const auth = getAuth(app);
const db = getFirestore(app);

async function runStagingVerification() {
  console.log('=== TOKOKOE R02 STAGING E2E LIVE VERIFICATION ===');
  console.log('Target URL:', STAGING_URL);

  // 1. Authenticate QA Owner
  const ownerCred = await signInWithEmailAndPassword(auth, 'qa.phone.1791857@tokokoe.com', 'Password12345!');
  const ownerToken = await ownerCred.user.getIdToken();
  console.log('✓ 1. Authenticated as QA Owner:', ownerCred.user.uid);

  const bizId = 'biz_1791857791689_j3t9';
  const branchId = 'br_1791857791689_main';

  // 2. Verify IMEI Luhn Validation via API
  console.log('\n--- 2. Testing IMEI Luhn Validation via API ---');
  // Attempt to receive invalid IMEI with check digit 1 (should be 6)
  const invalidPoReceiveRes = await fetch(`${STAGING_URL}/api/phone/purchase-orders/receive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ownerToken}`
    },
    body: JSON.stringify({
      businessId: bizId,
      branchId,
      poId: 'po_1791858413695_q1ad',
      poItemId: 'poi_1791858413695_0',
      scannedImeis: ['860123456789001'] // Invalid check digit
    })
  });
  const invalidPoData = await invalidPoReceiveRes.json();
  console.log('Invalid IMEI HTTP Status:', invalidPoReceiveRes.status);
  console.log('Invalid IMEI Response:', invalidPoData.message);
  if (invalidPoReceiveRes.status === 400 && invalidPoData.message.includes('Luhn')) {
    console.log('✓ PASS: Server correctly rejected invalid Luhn IMEI 860123456789001');
  } else {
    console.warn('Notice on invalid IMEI response:', invalidPoData);
  }

  // Attempt to receive invalid IMEI with check digit 2 (should also be 6)
  const invalidPoReceiveRes2 = await fetch(`${STAGING_URL}/api/phone/purchase-orders/receive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ownerToken}`
    },
    body: JSON.stringify({
      businessId: bizId,
      branchId,
      poId: 'po_1791858413695_q1ad',
      poItemId: 'poi_1791858413695_0',
      scannedImeis: ['860123456789002'] // Invalid check digit
    })
  });
  const invalidPoData2 = await invalidPoReceiveRes2.json();
  console.log('Invalid IMEI 2 HTTP Status:', invalidPoReceiveRes2.status);
  console.log('Invalid IMEI 2 Response:', invalidPoData2.message);
  if (invalidPoReceiveRes2.status === 400 && invalidPoData2.message.includes('Luhn')) {
    console.log('✓ PASS: Server correctly rejected invalid Luhn IMEI 860123456789002 (both require 6)');
  }

  // 3. Verify Confidential Cost Protection (Cashier Login)
  console.log('\n--- 3. Testing Cashier Cost Protection ---');
  const cashierLoginRes = await fetch(`${STAGING_URL}/api/auth/employee-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'kasirphone1.konterhpe2etesting',
      password: 'Password123!'
    })
  });
  const cashierLoginData = await cashierLoginRes.json();
  console.log('Cashier Login Status:', cashierLoginRes.status);
  
  if (cashierLoginData.success) {
    const cashierTokenRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: cashierLoginData.customToken, returnSecureToken: true })
    });
    const cashierAuth = await cashierTokenRes.json();
    const cashierIdToken = cashierAuth.idToken;

    // Test Cashier access to PO API (Must be 403 Forbidden)
    const cashierPoRes = await fetch(`${STAGING_URL}/api/phone/purchase-orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cashierIdToken}`
      },
      body: JSON.stringify({
        businessId: bizId,
        branchId,
        supplierName: 'PT Hacker',
        items: [{
          brand: 'Apple',
          model: 'iPhone',
          storage: '128GB',
          color: 'Black',
          condition: 'new',
          costPrice: 1000000,
          expectedSellingPrice: 2000000,
          quantityOrdered: 1
        }]
      })
    });
    console.log('Cashier PO Create Attempt Status:', cashierPoRes.status);
    const cashierPoData = await cashierPoRes.json();
    console.log('Cashier PO Response Message:', cashierPoData.message);
    if (cashierPoRes.status === 403) {
      console.log('✓ PASS: Cashier strictly forbidden from PO backend API (403)');
    }

    // Test Cashier access to Adjustment Review API (Must be 403 Forbidden)
    const cashierAdjRes = await fetch(`${STAGING_URL}/api/inventory/adjustments/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cashierIdToken}`
      },
      body: JSON.stringify({
        businessId: bizId,
        adjustmentId: 'adj_fake',
        action: 'approved'
      })
    });
    console.log('Cashier Adjustment Review Attempt Status:', cashierAdjRes.status);
    if (cashierAdjRes.status === 403) {
      console.log('✓ PASS: Cashier strictly forbidden from approval APIs (403)');
    }
  }

  // 4. Verify Firestore Data Consistency & Persistence
  console.log('\n--- 4. Checking Firestore Document Persistence ---');
  const prodsSnap = await getDocs(collection(db, 'businesses', bizId, 'products'));
  console.log('Products count in Firestore:', prodsSnap.size);
  prodsSnap.forEach(d => {
    const data = d.data();
    console.log(`Product [${d.id}]: ${data.name} | Stock: ${data.stockQty} | Price: ${data.sellingPrice}`);
  });

  const imeiUnitsSnap = await getDocs(collection(db, 'businesses', bizId, 'imeiUnits'));
  console.log('IMEI Units count in Firestore:', imeiUnitsSnap.size);
  imeiUnitsSnap.forEach(d => {
    const data = d.data();
    console.log(`IMEI Unit: ${data.imei} | Status: ${data.status} | Product: ${data.productName}`);
  });

  console.log('\n=== STAGING VERIFICATION COMPLETE ===');
}

runStagingVerification().catch(console.error);
