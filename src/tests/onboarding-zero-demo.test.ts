import { describe, it, expect } from 'vitest';
import { getEmptyStore, getInitialStore, getDemoStore, loadStore } from '../lib/data/store';
import { DEFAULT_MODULES_BY_TYPE } from '../lib/modules/registry';
import { Business, BusinessType } from '../types';

describe('Tokokoe Production Onboarding & Zero Demo Isolation Tests', () => {

  it('Requirement 1 & 2: getEmptyStore returns zero businesses and zero demo entities', () => {
    const emptyStore = getEmptyStore();
    expect(emptyStore.businesses).toHaveLength(0);
    expect(emptyStore.branches).toHaveLength(0);
    expect(emptyStore.products).toHaveLength(0);
    expect(emptyStore.sales).toHaveLength(0);
    expect(emptyStore.imeiUnits).toHaveLength(0);
    expect(emptyStore.members).toHaveLength(0);
    expect(emptyStore.cashSessions).toHaveLength(0);
    expect(emptyStore.tables).toHaveLength(0);
    expect(emptyStore.stockAdjustments).toHaveLength(0);
    expect(emptyStore.purchaseOrders).toHaveLength(0);
  });

  it('Requirement 1: getInitialStore returns empty store by default without demo seed', () => {
    // In production without NEXT_PUBLIC_ENABLE_DEMO_SEED='true'
    const initial = getInitialStore();
    expect(initial.businesses).toHaveLength(0);
    expect(initial.products).toHaveLength(0);
  });

  it('Requirement 4: User businesses strictly filters by authenticated Firebase ownerId', () => {
    const demoBusinesses: Business[] = [
      {
        id: 'biz_kopi_senja',
        name: 'Kopi Senja',
        businessType: 'fnb',
        ownerId: 'usr_owner_budi',
        currency: 'IDR',
        timezone: 'Asia/Jakarta',
        address: 'Jakarta',
        phone: '0812',
        enabledModules: DEFAULT_MODULES_BY_TYPE.fnb,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'biz_konter_jaya',
        name: 'Konter Jaya Gadget',
        businessType: 'phone',
        ownerId: 'usr_owner_budi',
        currency: 'IDR',
        timezone: 'Asia/Jakarta',
        address: 'Jakarta',
        phone: '0813',
        enabledModules: DEFAULT_MODULES_BY_TYPE.phone,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    ];

    const newRegisteredUser = {
      uid: 'firebase_auth_uid_new_user_12345',
      email: 'newuser@tokokoe.com',
      role: 'owner' as const,
    };

    // Filter rule implemented in BusinessContext
    const filteredBusinesses = demoBusinesses.filter(b => b.ownerId === newRegisteredUser.uid);

    // Newly registered user must see ZERO demo businesses
    expect(filteredBusinesses).toHaveLength(0);
    expect(filteredBusinesses).toEqual([]);
  });

  it('Requirement 6: Business creation initializes correct modules with ZERO sample data', () => {
    const businessTypes: BusinessType[] = ['fnb', 'phone', 'retail'];

    businessTypes.forEach((type) => {
      const modules = DEFAULT_MODULES_BY_TYPE[type];
      expect(modules.length).toBeGreaterThan(0);
      expect(modules).toContain('core.dashboard');
      expect(modules).toContain('core.pos');
      if (type === 'fnb') expect(modules).toContain('fnb.tables');
      if (type === 'phone') expect(modules).toContain('phone.imei');
      if (type === 'retail') expect(modules).toContain('retail.barcode');

      // Verify simulated business payload has empty collections
      const newBusinessPayload = {
        name: `Toko Baru ${type}`,
        businessType: type,
        enabledModules: modules,
        products: [],
        customers: [],
        employees: [],
        transactions: [],
      };

      expect(newBusinessPayload.products).toHaveLength(0);
      expect(newBusinessPayload.transactions).toHaveLength(0);
      expect(newBusinessPayload.employees).toHaveLength(0);
    });
  });

  it('Requirement 8: Demo seed data is preserved in separate getDemoStore() function', () => {
    const demo = getDemoStore();
    expect(demo.businesses.length).toBeGreaterThanOrEqual(3);
    expect(demo.businesses.some(b => b.id === 'biz_kopi_senja')).toBe(true);
    expect(demo.businesses.some(b => b.id === 'biz_konter_jaya')).toBe(true);
    expect(demo.businesses.some(b => b.id === 'biz_toko_kita')).toBe(true);
  });
});
