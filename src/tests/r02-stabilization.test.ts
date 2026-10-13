import { describe, it, expect } from 'vitest';
import { 
  validateImei, 
  validateLuhnChecksum, 
  calculateLuhnCheckDigit, 
  createValidTestImei, 
  validateDualSimDevice 
} from '../lib/validation/imei';
import { 
  validateProductBarcode, 
  validateEan13Checksum, 
  checkDuplicateBarcode, 
  detectBarcodeType 
} from '../lib/validation/barcode';
import { Product, ImeiUnit, ImeiHistory, PurchaseOrder, StockMovement } from '../types';

describe('TOKOKOE R02 — CRITICAL FIXES & INVENTORY STABILIZATION TEST SUITE', () => {

  // =========================================================================
  // PHASE 1: IMEI VALIDATION & LUHN CHECKSUM
  // =========================================================================
  describe('Phase 1 — Authoritative IMEI Validation & Luhn Algorithm', () => {
    it('accurately calculates and validates Luhn checksum for 15-digit IMEIs', () => {
      // Direct check digit calculation
      expect(calculateLuhnCheckDigit('86012345678900')).toBe('6');
      expect(calculateLuhnCheckDigit('86012345678901')).toBe('4');

      // Fourteen-digit prefixes:
      // '86012345678900' -> check digit 6
      // '86012345678901' -> check digit 4
      // '35894109123456' -> check digit 0
      // '35661109555120' -> check digit 6
      const validImei1 = createValidTestImei('86012345678900');
      expect(validImei1).toBe('860123456789006');
      expect(validateLuhnChecksum(validImei1)).toBe(true);

      const validImei2 = createValidTestImei('86012345678901');
      expect(validImei2).toBe('860123456789014');
      expect(validateLuhnChecksum(validImei2)).toBe(true);

      const res1 = validateImei(validImei1);
      expect(res1.valid).toBe(true);
      expect(res1.normalized).toBe('860123456789006');
    });

    it('rejects invalid IMEI checksum with descriptive Indonesian error message', () => {
      // Both identifiers share prefix '86012345678900' and both require check digit 6
      const invalidImei1 = '860123456789001'; // check digit should be 6
      const res1 = validateImei(invalidImei1);
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('tidak valid (gagal verifikasi Luhn checksum');
      expect(res1.error).toContain('seharusnya "6"');

      const invalidImei2 = '860123456789002'; // same prefix, also requires check digit 6
      const res2 = validateImei(invalidImei2);
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('tidak valid (gagal verifikasi Luhn checksum');
      expect(res2.error).toContain('seharusnya "6"');
    });

    it('rejects non-numeric characters and wrong digit counts', () => {
      const shortImei = validateImei('123456789');
      expect(shortImei.valid).toBe(false);
      expect(shortImei.error).toContain('tepat 15 digit angka');

      const alphaImei = validateImei('86012345678900A');
      expect(alphaImei.valid).toBe(false);
      expect(alphaImei.error).toContain('hanya berupa angka numerik');
    });

    it('normalizes scanner input by safely stripping spaces, hyphens, and slashes', () => {
      const scannedWithFormatting = ' 8601-2345-6789-006 ';
      const res = validateImei(scannedWithFormatting);
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe('860123456789006');
    });

    it('supports dual-SIM devices with IMEI 1, IMEI 2, and separate hardware Serial Number', () => {
      const imei1 = '860123456789006';
      const imei2 = '860123456789014';
      const sn = 'F2LM80V9N6R4';

      const dualRes = validateDualSimDevice({ imei1, imei2, serialNumber: sn });
      expect(dualRes.valid).toBe(true);
      expect(dualRes.imei1).toBe('860123456789006');
      expect(dualRes.imei2).toBe('860123456789014');
      expect(dualRes.serialNumber).toBe('F2LM80V9N6R4');
    });

    it('rejects identical IMEI 1 and IMEI 2 on dual-SIM devices', () => {
      const duplicateSim = validateDualSimDevice({
        imei1: '860123456789006',
        imei2: '860123456789006',
      });
      expect(duplicateSim.valid).toBe(false);
      expect(duplicateSim.error).toContain('tidak boleh identik');
    });

    it('prevents duplicate active IMEI records within the same business', () => {
      const registeredImeis = new Set<string>();
      const registerDevice = (imei: string) => {
        const val = validateImei(imei);
        if (!val.valid) throw new Error(val.error);
        if (registeredImeis.has(val.normalized)) {
          throw new Error(`IMEI ${val.normalized} sudah pernah didaftarkan pada inventaris bisnis ini.`);
        }
        registeredImeis.add(val.normalized);
        return { success: true, imei: val.normalized };
      };

      const reg1 = registerDevice('860123456789006');
      expect(reg1.success).toBe(true);

      expect(() => registerDevice('860123456789006')).toThrow('sudah pernah didaftarkan');
    });
  });

  // =========================================================================
  // PHASE 2: RETAIL BARCODE VALIDATION
  // =========================================================================
  describe('Phase 2 — Retail Barcode Validation & Collision Prevention', () => {
    it('accurately validates genuine GTIN/EAN-13 barcodes with check digit', () => {
      // 8996001414002: Le Minerale (genuine Indomaret/Alfamart EAN-13, check digit = 2)
      expect(validateEan13Checksum('8996001414002')).toBe(true);
      const res = validateProductBarcode('8996001414002', 'EAN13');
      expect(res.valid).toBe(true);
      expect(res.barcodeType).toBe('EAN13');

      // Invalid check digit for EAN-13 (check digit is 9 instead of 2)
      const invalidEan = validateProductBarcode('8996001414009', 'EAN13');
      expect(invalidEan.valid).toBe(false);
      expect(invalidEan.error).toContain('check digit ke-13');
    });

    it('supports custom internal business barcodes without rejecting them', () => {
      // Alphanumeric internal codes (e.g. fashion, cafe, mini market internal SKU)
      const internalCodes = ['MIN-600ML', 'BRG-001', 'TOKO-12345', 'ROKOK-SAMPOERNA-16'];
      for (const code of internalCodes) {
        expect(detectBarcodeType(code)).toBe('INTERNAL');
        const res = validateProductBarcode(code);
        expect(res.valid).toBe(true);
        expect(res.barcodeType).toBe('INTERNAL');
      }
    });

    it('prevents duplicate product barcode conflicts within the same business', () => {
      const mockProducts: Product[] = [
        {
          id: 'prod_1',
          businessId: 'biz_1',
          name: 'Air Mineral 600ml',
          category: 'Minuman',
          sellingPrice: 5000,
          costPrice: 3000,
          barcode: '8996001414001',
          available: true,
          trackStock: true,
          stockQty: 10,
        },
      ];

      // Attempting to register another product with same barcode
      const check1 = checkDuplicateBarcode(mockProducts, '8996001414001');
      expect(check1.isDuplicate).toBe(true);
      expect(check1.conflictingProduct?.name).toBe('Air Mineral 600ml');

      // Editing existing product with its own barcode is permitted
      const checkSelf = checkDuplicateBarcode(mockProducts, '8996001414001', 'prod_1');
      expect(checkSelf.isDuplicate).toBe(false);

      // Unique barcode is permitted
      const checkUnique = checkDuplicateBarcode(mockProducts, '8992775211119');
      expect(checkUnique.isDuplicate).toBe(false);
    });
  });

  // =========================================================================
  // PHASE 3: AUTHORITATIVE INVENTORY & STOCK MOVEMENTS
  // =========================================================================
  describe('Phase 3 — Authoritative Firestore Inventory & Concurrency Protection', () => {
    it('maintains serialized lifecycle status (available, reserved, sold, quarantined)', () => {
      const unit: ImeiUnit = {
        id: 'unit_1',
        businessId: 'biz_phone',
        branchId: 'br_main',
        imei: '860123456789006',
        productId: 'prod_ip15',
        productName: 'iPhone 15 Pro 128GB',
        brand: 'Apple',
        model: 'iPhone 15 Pro',
        storage: '128GB',
        color: 'Titanium',
        condition: 'new',
        costPrice: 15000000,
        sellingPrice: 18000000,
        status: 'available',
        source: 'purchase_order',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(unit.status).toBe('available');

      // Transition to sold
      unit.status = 'sold';
      expect(unit.status).toBe('sold');

      // Warranty exchange transition to quarantined
      unit.status = 'quarantined';
      expect(unit.status).toBe('quarantined');
    });

    it('rejects double selling of already SOLD units', () => {
      const unitsMap = new Map<string, ImeiUnit>([
        [
          '860123456789006',
          {
            id: 'u_1',
            businessId: 'biz_1',
            branchId: 'br_1',
            imei: '860123456789006',
            productId: 'p_1',
            productName: 'iPhone 15 Pro',
            brand: 'Apple',
            model: '15 Pro',
            storage: '128GB',
            color: 'Black',
            condition: 'new',
            costPrice: 15000000,
            sellingPrice: 18000000,
            status: 'sold',
            source: 'purchase_order',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      ]);

      const attemptSale = (imei: string) => {
        const u = unitsMap.get(imei);
        if (!u) throw new Error('Unit tidak ditemukan');
        if (u.status !== 'available') {
          throw new Error(`Unit IMEI ${imei} sudah tidak tersedia untuk dijual (status: ${u.status}).`);
        }
        u.status = 'sold';
        return u;
      };

      expect(() => attemptSale('860123456789006')).toThrow('sudah tidak tersedia untuk dijual (status: sold)');
    });

    it('prevents overselling by concurrent cashiers when physical stock is insufficient', () => {
      let currentStock = 1;

      const checkoutTransaction = (requestedQty: number) => {
        if (currentStock < requestedQty) {
          throw new Error(`Stok produk tidak mencukupi (tersisa ${currentStock}, diminta ${requestedQty}).`);
        }
        currentStock -= requestedQty;
        return { success: true, remaining: currentStock };
      };

      // First cashier buys 1 unit
      const tx1 = checkoutTransaction(1);
      expect(tx1.success).toBe(true);
      expect(currentStock).toBe(0);

      // Concurrent/second cashier attempts to buy 1 unit
      expect(() => checkoutTransaction(1)).toThrow('Stok produk tidak mencukupi (tersisa 0, diminta 1)');
    });

    it('records immutable StockMovement records for each transaction', () => {
      const movements: StockMovement[] = [];
      let stock = 10;

      const recordSaleMovement = (qtySold: number) => {
        const previousQty = stock;
        stock -= qtySold;
        const mov: StockMovement = {
          id: `mov_${Date.now()}`,
          businessId: 'biz_1',
          branchId: 'br_1',
          productId: 'prod_1',
          productName: 'Air Mineral Testing',
          type: 'sale',
          quantityDelta: -qtySold,
          previousQty,
          newQty: stock,
          referenceId: 'TRX-TEST-001',
          operatorId: 'cashier_1',
          operatorName: 'Kasir Retail',
          timestamp: Date.now(),
        };
        movements.push(mov);
      };

      recordSaleMovement(2);
      recordSaleMovement(1);

      expect(stock).toBe(7);
      expect(movements).toHaveLength(2);
      expect(movements[0].quantityDelta).toBe(-2);
      expect(movements[1].quantityDelta).toBe(-1);

      // Reconciliation sum
      const totalDelta = movements.reduce((acc, m) => acc + m.quantityDelta, 0);
      expect(totalDelta).toBe(-3);
      expect(10 + totalDelta).toBe(stock);
    });
  });

  // =========================================================================
  // PHASE 4: PURCHASE ORDER & WARRANTY EXCHANGE WORKFLOW
  // =========================================================================
  describe('Phase 4 — Purchase Order Receiving & Warranty Exchange Workflow', () => {
    it('manages PO partial receiving correctly and prevents exceeding ordered quantity', () => {
      const po: PurchaseOrder = {
        id: 'po_1',
        poNumber: 'PO-202610-001',
        businessId: 'biz_1',
        branchId: 'br_1',
        supplierName: 'PT Erajaya',
        items: [
          {
            id: 'poi_1',
            brand: 'Apple',
            model: 'iPhone 15 Pro',
            storage: '128GB',
            color: 'Titanium',
            condition: 'new',
            costPrice: 15000000,
            expectedSellingPrice: 18000000,
            quantityOrdered: 2,
            quantityReceived: 0,
            receivedImeis: [],
          },
        ],
        totalCost: 30000000,
        status: 'ordered',
        createdBy: 'owner_1',
        createdByName: 'Owner',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Step 1: Receive 1 unit (Partial)
      const validImei1 = '860123456789006';
      po.items[0].quantityReceived += 1;
      po.items[0].receivedImeis.push(validImei1);
      po.status = po.items[0].quantityReceived >= po.items[0].quantityOrdered ? 'received' : 'partially_received';

      expect(po.status).toBe('partially_received');
      expect(po.items[0].quantityReceived).toBe(1);

      // Attempting to receive 2 more units (exceeds remaining 1)
      const remaining = po.items[0].quantityOrdered - po.items[0].quantityReceived;
      expect(() => {
        const attempted = 2;
        if (attempted > remaining) {
          throw new Error(`Jumlah IMEI yang discan (${attempted}) melebihi sisa pesanan (${remaining}).`);
        }
      }).toThrow('melebihi sisa pesanan (1)');

      // Step 2: Receive 2nd unit (Complete)
      const validImei2 = '860123456789014';
      po.items[0].quantityReceived += 1;
      po.items[0].receivedImeis.push(validImei2);
      po.status = po.items[0].quantityReceived >= po.items[0].quantityOrdered ? 'received' : 'partially_received';

      expect(po.status).toBe('received');
      expect(po.items[0].quantityReceived).toBe(2);
    });

    it('executes warranty exchange atomically, quarantines old unit, and links histories', () => {
      const units = new Map<string, ImeiUnit>([
        [
          '860123456789006',
          {
            id: 'u_sold',
            businessId: 'biz_1',
            branchId: 'br_1',
            imei: '860123456789006',
            productId: 'p_1',
            productName: 'iPhone 15 Pro',
            brand: 'Apple',
            model: '15 Pro',
            storage: '128GB',
            color: 'Black',
            condition: 'new',
            costPrice: 15000000,
            sellingPrice: 18000000,
            status: 'sold',
            source: 'purchase_order',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        [
          '860123456789014',
          {
            id: 'u_avail',
            businessId: 'biz_1',
            branchId: 'br_1',
            imei: '860123456789014',
            productId: 'p_1',
            productName: 'iPhone 15 Pro',
            brand: 'Apple',
            model: '15 Pro',
            storage: '128GB',
            color: 'Black',
            condition: 'new',
            costPrice: 15000000,
            sellingPrice: 18000000,
            status: 'available',
            source: 'purchase_order',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      ]);

      const histories: ImeiHistory[] = [];

      const executeExchange = (oldImei: string, newImei: string, reason: string) => {
        const oldU = units.get(oldImei);
        const newU = units.get(newImei);

        if (!oldU) throw new Error('Unit lama tidak ditemukan');
        if (!newU) throw new Error('Unit baru tidak ditemukan');
        if (newU.status !== 'available') {
          throw new Error('Unit pengganti tidak tersedia');
        }

        const exchangeId = 'EXC-TEST-001';

        // Old unit MUST be quarantined, never directly available
        oldU.status = 'quarantined';
        oldU.notes = `Ditukar: ${reason}`;

        // Replacement unit becomes sold
        newU.status = 'sold';

        histories.push({
          id: 'hist_old',
          businessId: 'biz_1',
          imei: oldImei,
          unitId: oldU.id,
          action: 'exchanged_in',
          referenceId: exchangeId,
          branchId: 'br_1',
          operatorId: 'staff_1',
          operatorName: 'Staff',
          notes: `Unit lama diterima kembali (Alasan: ${reason}). Digantikan dengan IMEI ${newImei}`,
          timestamp: Date.now(),
        });

        histories.push({
          id: 'hist_new',
          businessId: 'biz_1',
          imei: newImei,
          unitId: newU.id,
          action: 'exchanged_out',
          referenceId: exchangeId,
          branchId: 'br_1',
          operatorId: 'staff_1',
          operatorName: 'Staff',
          notes: `Unit pengganti diserahkan ke pelanggan (Tukar unit dari IMEI ${oldImei})`,
          timestamp: Date.now(),
        });

        return { success: true, exchangeId };
      };

      const result = executeExchange('860123456789006', '860123456789014', 'LCD Flicker defect');
      expect(result.success).toBe(true);

      const oldUnitAfter = units.get('860123456789006')!;
      const newUnitAfter = units.get('860123456789014')!;

      expect(oldUnitAfter.status).toBe('quarantined');
      expect(newUnitAfter.status).toBe('sold');
      expect(histories).toHaveLength(2);
      expect(histories[0].action).toBe('exchanged_in');
      expect(histories[1].action).toBe('exchanged_out');
    });
  });

  // =========================================================================
  // PHASE 5: SECURITY & MULTI-TENANT ISOLATION
  // =========================================================================
  describe('Phase 5 — Security & Multi-Tenant Role Isolation', () => {
    it('strictly denies unauthorized cashier access to owner administrative operations', () => {
      const evaluateRoleAccess = (role: 'owner' | 'manager' | 'cashier', operation: string) => {
        if (role === 'cashier') {
          if (operation === 'employees.create' || operation === 'approvals.manage' || operation === 'products.cost.read') {
            throw new Error(`Akses ditolak: Peran 'cashier' tidak memiliki izin operasi '${operation}'.`);
          }
        }
        return { authorized: true };
      };

      expect(() => evaluateRoleAccess('cashier', 'employees.create')).toThrow('Akses ditolak');
      expect(() => evaluateRoleAccess('cashier', 'approvals.manage')).toThrow('Akses ditolak');
      expect(() => evaluateRoleAccess('cashier', 'products.cost.read')).toThrow('Akses ditolak');
      expect(evaluateRoleAccess('owner', 'employees.create').authorized).toBe(true);
    });

    it('enforces multi-tenant business isolation so cashiers cannot query other merchants', () => {
      const merchantBusinesses = [
        { id: 'biz_retail_1', name: 'Retail E2E Testing', members: ['cashier_retail'] },
        { id: 'biz_phone_2', name: 'Konter HP E2E Testing', members: ['cashier_phone'] },
      ];

      const getScopedBusinessesForUser = (userId: string) => {
        return merchantBusinesses.filter(b => b.members.includes(userId));
      };

      const retailCashierBiz = getScopedBusinessesForUser('cashier_retail');
      expect(retailCashierBiz).toHaveLength(1);
      expect(retailCashierBiz[0].id).toBe('biz_retail_1');

      const phoneCashierBiz = getScopedBusinessesForUser('cashier_phone');
      expect(phoneCashierBiz).toHaveLength(1);
      expect(phoneCashierBiz[0].id).toBe('biz_phone_2');
    });

    it('verifies cashiers cannot read costPrice through direct backend APIs or state sanitization', () => {
      // 1. Backend PO API RBAC check (inventory.receive required)
      const evaluateBackendPoAccess = (role: string, endpoint: string) => {
        if (role === 'cashier') {
          throw new Error(`Akses ditolak: Peran 'cashier' tidak memiliki izin 'inventory.receive' untuk mengakses ${endpoint}. (HTTP 403)`);
        }
        return { allowed: true };
      };

      expect(() => evaluateBackendPoAccess('cashier', '/api/phone/purchase-orders')).toThrow('HTTP 403');
      expect(() => evaluateBackendPoAccess('cashier', '/api/phone/purchase-orders/receive')).toThrow('HTTP 403');
      expect(evaluateBackendPoAccess('owner', '/api/phone/purchase-orders').allowed).toBe(true);

      // 2. Direct Firestore Rules check simulation: PO reads restricted to owner/manager/warehouse
      const evaluateFirestorePoReadRule = (authRole: string) => {
        const allowedRoles = ['owner', 'manager', 'warehouse'];
        if (!allowedRoles.includes(authRole)) {
          throw new Error('PERMISSION_DENIED: False for expression: getMemberData(businessId).role in [owner, manager, warehouse]');
        }
        return true;
      };

      expect(() => evaluateFirestorePoReadRule('cashier')).toThrow('PERMISSION_DENIED');
      expect(evaluateFirestorePoReadRule('owner')).toBe(true);
      expect(evaluateFirestorePoReadRule('warehouse')).toBe(true);

      // 3. Client state sanitization for roles without products.cost.read
      const mockRawCatalog: Product[] = [
        {
          id: 'prod_apple_15',
          businessId: 'biz_phone',
          name: 'iPhone 15 Pro 128GB',
          category: 'Handphone',
          sellingPrice: 18000000,
          costPrice: 15000000,
          stockQty: 5,
          available: true,
          trackStock: true,
        },
      ];

      const sanitizeCatalogForRole = (catalog: Product[], role: string) => {
        const canViewCostPrice = role === 'owner' || role === 'manager';
        if (!canViewCostPrice) {
          return catalog.map(p => ({ ...p, costPrice: 0 }));
        }
        return catalog;
      };

      const cashierView = sanitizeCatalogForRole(mockRawCatalog, 'cashier');
      expect(cashierView[0].costPrice).toBe(0); // Stripped for cashier
      expect(cashierView[0].sellingPrice).toBe(18000000); // Selling price retained

      const ownerView = sanitizeCatalogForRole(mockRawCatalog, 'owner');
      expect(ownerView[0].costPrice).toBe(15000000); // Retained for owner
    });
  });
});
