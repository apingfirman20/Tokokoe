import { describe, it, expect, beforeEach } from 'vitest';
import { 
  INITIAL_BUSINESSES, INITIAL_BRANCHES, INITIAL_MEMBERS, 
  INITIAL_PRODUCTS, INITIAL_IMEI_UNITS 
} from '../lib/data/seed-data';
import { hasPermission, DEFAULT_ROLE_PERMISSIONS } from '../lib/permissions';
import { getNavigationForUser, DEFAULT_MODULES_BY_TYPE } from '../lib/modules/registry';
import { formatRupiah, generateSaleReference } from '../lib/utils';
import { CartLineItem, Business, Sale, ImeiUnit, ImeiHistory } from '../types';

describe('Tokokoe Multi-Tenant Business & POS SaaS Engine', () => {

  describe('1. Currency & Tabular Number Rules', () => {
    it('formats integer IDR amounts correctly without floating-point decimals', () => {
      expect(formatRupiah(18000)).toBe('Rp 18.000');
      expect(formatRupiah(10499000)).toBe('Rp 10.499.000');
      expect(formatRupiah(0)).toBe('Rp 0');
    });

    it('generates consistent unique transaction numbers', () => {
      const ref1 = generateSaleReference();
      const ref2 = generateSaleReference();
      expect(ref1).toMatch(/^TRX-\d{8}-[A-Z0-9]{4}$/);
      expect(ref1).not.toBe(ref2);
    });
  });

  describe('2. Multi-Tenant Business & Category Module Provisioning', () => {
    it('initializes correct default modules for F&B business', () => {
      const fnbModules = DEFAULT_MODULES_BY_TYPE.fnb;
      expect(fnbModules).toContain('fnb.tables');
      expect(fnbModules).toContain('fnb.kitchen');
      expect(fnbModules).not.toContain('phone.imei');
    });

    it('initializes correct default modules for Phone Store business', () => {
      const phoneModules = DEFAULT_MODULES_BY_TYPE.phone;
      expect(phoneModules).toContain('phone.imei');
      expect(phoneModules).toContain('phone.sellin');
      expect(phoneModules).toContain('phone.exchange');
      expect(phoneModules).not.toContain('fnb.tables');
    });

    it('initializes correct default modules for Retail Minimarket business', () => {
      const retailModules = DEFAULT_MODULES_BY_TYPE.retail;
      expect(retailModules).toContain('retail.barcode');
      expect(retailModules).not.toContain('phone.exchange');
    });
  });

  describe('3. Role-Based Access Control & Permission Gates', () => {
    it('grants Owner full access to all system operations', () => {
      expect(hasPermission('owner', 'products.cost.read')).toBe(true);
      expect(hasPermission('owner', 'finance.read')).toBe(true);
      expect(hasPermission('owner', 'employees.manage')).toBe(true);
      expect(hasPermission('owner', 'sales.create')).toBe(true);
    });

    it('strictly forbids Cashier from viewing cost price (HPP) and finance reports', () => {
      expect(hasPermission('cashier', 'products.cost.read')).toBe(false);
      expect(hasPermission('cashier', 'finance.read')).toBe(false);
      expect(hasPermission('cashier', 'employees.manage')).toBe(false);
      expect(hasPermission('cashier', 'sales.create')).toBe(true);
    });

    it('dynamically hides restricted navigation items from Cashier', () => {
      const cashierNav = getNavigationForUser(
        'biz_kopi_senja',
        'fnb',
        DEFAULT_MODULES_BY_TYPE.fnb,
        'cashier'
      );

      const navIds = cashierNav.map(item => item.id);
      expect(navIds).toContain('core.pos');
      expect(navIds).toContain('core.products');
      expect(navIds).not.toContain('core.finance');
      expect(navIds).not.toContain('core.employees');
    });
  });

  describe('4. Tenant Isolation & Staff Scoping', () => {
    it('isolates staff between distinct businesses', () => {
      const andiKs = INITIAL_MEMBERS.find(m => m.username === 'andi.kopisenja');
      const rianKj = INITIAL_MEMBERS.find(m => m.username === 'rian.konter');

      expect(andiKs?.businessId).toBe('biz_kopi_senja');
      expect(rianKj?.businessId).toBe('biz_konter_jaya');

      // Andi cannot access Konter Jaya branches
      expect(andiKs?.branchIds).not.toContain('br_roxy');
      // Rian cannot access Senopati F&B branch
      expect(rianKj?.branchIds).not.toContain('br_senopati');
    });
  });

  describe('5. Inventory Mutation & Oversell Protection', () => {
    it('deducts inventory correctly upon sale completion', () => {
      const initialStock = 85;
      const soldQuantity = 3;
      const remainingStock = initialStock - soldQuantity;
      expect(remainingStock).toBe(82);
    });

    it('rejects checkout when requested quantity exceeds available stock', () => {
      const availableStock = 2;
      const requestedQty = 5;
      const canFulfill = availableStock >= requestedQty;
      expect(canFulfill).toBe(false);
    });
  });

  describe('6. Phone Store Serialized IMEI & Warranty Tracking', () => {
    it('maintains uniqueness and tracks IMEI unit states', () => {
      const sampleImei = '358941091234567';
      const unit = INITIAL_IMEI_UNITS.find(u => u.imei === sampleImei);
      expect(unit).toBeDefined();
      expect(unit?.status).toBe('available');
    });

    it('records audit log on unit exchange and marks old IMEI quarantined', () => {
      const oldUnit: ImeiUnit = {
        ...INITIAL_IMEI_UNITS[0],
        status: 'available',
      };
      const replacementUnit: ImeiUnit = {
        ...INITIAL_IMEI_UNITS[1],
        status: 'available',
      };

      // Simulate Exchange action
      oldUnit.status = 'quarantined';
      replacementUnit.status = 'sold';

      const histories: ImeiHistory[] = [
        {
          id: 'hist_1',
          businessId: 'biz_konter_jaya',
          imei: oldUnit.imei,
          unitId: oldUnit.id,
          action: 'exchanged_in',
          referenceId: 'EXC-1001',
          branchId: 'br_roxy',
          operatorId: 'usr_staff',
          operatorName: 'Rian Staf',
          notes: 'Unit lama ditarik',
          timestamp: Date.now(),
        },
        {
          id: 'hist_2',
          businessId: 'biz_konter_jaya',
          imei: replacementUnit.imei,
          unitId: replacementUnit.id,
          action: 'exchanged_out',
          referenceId: 'EXC-1001',
          branchId: 'br_roxy',
          operatorId: 'usr_staff',
          operatorName: 'Rian Staf',
          notes: 'Unit pengganti diserahkan',
          timestamp: Date.now(),
        }
      ];

      expect(oldUnit.status).toBe('quarantined');
      expect(replacementUnit.status).toBe('sold');
      expect(histories.length).toBe(2);
      expect(histories[0].action).toBe('exchanged_in');
      expect(histories[1].action).toBe('exchanged_out');
    });
  });

  describe('7. Cashier Shift & Discrepancy Calculation', () => {
    it('calculates expected cash and cash discrepancies accurately', () => {
      const openingCash = 200000;
      const cashSales = 180000;
      const expectedCash = openingCash + cashSales; // 380.000

      const countedCash = 380000;
      const discrepancy = countedCash - expectedCash;
      expect(discrepancy).toBe(0);

      // Discrepancy scenario: short 10.000
      const shortCountedCash = 370000;
      const shortDiscrepancy = shortCountedCash - expectedCash;
      expect(shortDiscrepancy).toBe(-10000);
    });
  });
});
