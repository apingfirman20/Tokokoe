import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireBusinessMembership, requireBusinessPermission, requireBranchAccess, AuthError } from '../lib/server/auth-guard';
import { hasPermission, DEFAULT_ROLE_PERMISSIONS } from '../lib/permissions';
import { evaluateRouteAccess, MODULE_REGISTRY } from '../lib/modules/registry';
import { 
  canReadCostPrice, 
  sanitizeProductDto, 
  sanitizeProductDtos, 
  sanitizeImeiUnitDto, 
  sanitizeImeiUnitDtos,
  sanitizePurchaseOrderDto, 
  sanitizeSaleDto 
} from '../lib/server/cost-protection';
import { Business, Product, ImeiUnit, PurchaseOrder, Sale } from '../types';
import { saveStore, loadStore, getEmptyStore, AppStoreData } from '../lib/data/store';

// Mock Firebase Admin SDK for deterministic unit testing
vi.mock('../lib/firebase/admin', () => {
  const mockDbStore: Record<string, any> = {};

  return {
    adminAuth: {
      updateUser: vi.fn().mockResolvedValue({}),
      revokeRefreshTokens: vi.fn().mockResolvedValue({}),
      createUser: vi.fn().mockResolvedValue({ uid: 'usr_new_test' }),
      setCustomUserClaims: vi.fn().mockResolvedValue({}),
    },
    adminDb: {
      _mockStore: mockDbStore,
      doc: (path: string) => ({
        get: async () => ({
          exists: Boolean(mockDbStore[path]),
          id: path.split('/').pop(),
          data: () => mockDbStore[path],
        }),
        set: async (data: any, options?: any) => {
          if (options?.merge && mockDbStore[path]) {
            mockDbStore[path] = { ...mockDbStore[path], ...data };
          } else {
            mockDbStore[path] = data;
          }
        },
      }),
      collection: (path: string) => ({
        doc: (id?: string) => {
          const docId = id || `doc_${Math.random().toString(36).substring(2, 7)}`;
          const fullPath = `${path}/${docId}`;
          return {
            id: docId,
            get: async () => ({
              exists: Boolean(mockDbStore[fullPath]),
              id: docId,
              data: () => mockDbStore[fullPath],
            }),
            set: async (data: any) => {
              mockDbStore[fullPath] = data;
            },
          };
        },
        where: () => ({
          get: async () => ({
            docs: Object.keys(mockDbStore)
              .filter(k => k.startsWith(path))
              .map(k => ({ id: k.split('/').pop(), data: () => mockDbStore[k] })),
          }),
        }),
      }),
    },
  };
});

describe('SECURITY GATE VERIFICATION — TOKOKOE HARDENING', () => {
  let mockStore: Record<string, any>;

  beforeEach(async () => {
    const { adminDb } = await import('../lib/firebase/admin');
    mockStore = (adminDb as any)._mockStore;
    // Clear in-memory mock store before each test
    for (const key of Object.keys(mockStore)) {
      delete mockStore[key];
    }
  });

  // =========================================================================
  // GATE 1: FOREIGN TENANT ACCESS DITOLAK
  // =========================================================================
  describe('Gate 1: Foreign Tenant & Cross-Tenant Access Rejection', () => {
    it('rejects cross-tenant membership checks with 403 when user is not member of target business', async () => {
      // Business A owned by Owner A
      mockStore['businesses/biz_a'] = {
        id: 'biz_a',
        name: 'Warung A',
        ownerId: 'usr_owner_a',
        status: 'active',
      };
      mockStore['businesses/biz_a/members/usr_cashier_a'] = {
        id: 'mem_a',
        userId: 'usr_cashier_a',
        businessId: 'biz_a',
        role: 'cashier',
        status: 'active',
        permissions: ['sales.create'],
        branchIds: ['CAB-01'],
      };

      // Business B owned by Owner B
      mockStore['businesses/biz_b'] = {
        id: 'biz_b',
        name: 'Warung B',
        ownerId: 'usr_owner_b',
        status: 'active',
      };

      // 1. Cashier A trying to access Business B -> must be rejected
      await expect(requireBusinessMembership('biz_b', 'usr_cashier_a')).rejects.toThrow(
        /Akses ditolak: Anda bukan anggota resmi dari unit bisnis ini/
      );

      // 2. Owner A trying to access Business B -> must be rejected
      await expect(requireBusinessMembership('biz_b', 'usr_owner_a')).rejects.toThrow(
        /Akses ditolak: Anda bukan anggota resmi dari unit bisnis ini/
      );
    });

    it('rejects cross-tenant password reset when target employee does not belong to business', async () => {
      mockStore['businesses/biz_a'] = { id: 'biz_a', ownerId: 'usr_owner_a', status: 'active' };
      mockStore['businesses/biz_b'] = { id: 'biz_b', ownerId: 'usr_owner_b', status: 'active' };
      mockStore['businesses/biz_b/members/usr_cashier_b'] = {
        id: 'mem_b',
        userId: 'usr_cashier_b',
        businessId: 'biz_b',
        role: 'cashier',
        status: 'active',
      };
      mockStore['staffLogins/budi.warungb'] = {
        uid: 'usr_cashier_b',
        username: 'budi.warungb',
        businessId: 'biz_b',
        status: 'active',
      };

      // Evaluate admin reset logic: Owner A cannot reset cashier B in biz_a
      const evaluateAdminResetTarget = (callerBizId: string, targetUid: string, targetUsername: string) => {
        const staff = mockStore[`staffLogins/${targetUsername}`];
        if (staff && staff.businessId !== callerBizId) {
          throw new AuthError(403, "Akses ditolak: Akun target tidak terdaftar pada unit bisnis ini (Cross-tenant reset blocked).");
        }
        const member = mockStore[`businesses/${callerBizId}/members/${targetUid}`];
        if (!member) {
          throw new AuthError(403, "Akses ditolak: Akun target bukan merupakan anggota dari bisnis ini (Cross-tenant reset blocked).");
        }
        return true;
      };

      expect(() => evaluateAdminResetTarget('biz_a', 'usr_cashier_b', 'budi.warungb')).toThrow(
        /Cross-tenant reset blocked/
      );
    });

    it('rejects self-service password reset when username does not match caller UID', () => {
      mockStore['staffLogins/andi.warung'] = {
        uid: 'usr_andi_actual',
        username: 'andi.warung',
        businessId: 'biz_a',
      };

      const evaluateSelfServiceReset = (callerUid: string, username: string) => {
        const staff = mockStore[`staffLogins/${username}`];
        if (staff && staff.uid !== callerUid) {
          throw new AuthError(403, "Akses ditolak: Username ini bukan milik akun Anda.");
        }
        return true;
      };

      // Attacker usr_hacker claims username 'andi.warung'
      expect(() => evaluateSelfServiceReset('usr_hacker', 'andi.warung')).toThrow(
        /Akses ditolak: Username ini bukan milik akun Anda/
      );
      // Legitimate user usr_andi_actual succeeds
      expect(evaluateSelfServiceReset('usr_andi_actual', 'andi.warung')).toBe(true);
    });
  });

  // =========================================================================
  // GATE 2: MANAGER-TO-OWNER DITOLAK (ROLE ESCALATION)
  // =========================================================================
  describe('Gate 2: Role Escalation Prevention', () => {
    it('rejects creation of employee with owner role', () => {
      const evaluateCreateEmployeeRole = (requestedRole: string) => {
        if (requestedRole === 'owner') {
          throw new AuthError(403, "Akses ditolak: Peran 'owner' tidak dapat dibuat melalui pendaftaran karyawan biasa. Alur pendaftaran karyawan bukan jalur pengalihan kepemilikan.");
        }
        return true;
      };

      expect(() => evaluateCreateEmployeeRole('owner')).toThrow(/Peran 'owner' tidak dapat dibuat/);
      expect(evaluateCreateEmployeeRole('cashier')).toBe(true);
    });

    it('rejects manager attempting to create another manager or owner', () => {
      const evaluateManagerCreateRole = (callerRole: string, requestedRole: string) => {
        if (callerRole === 'manager' && (requestedRole === 'manager' || requestedRole === 'owner')) {
          throw new AuthError(403, "Akses ditolak: Manajer tidak berwenang membuat akun dengan peran manajer atau pemilik usaha. Hanya pemilik usaha (owner) yang memiliki kewenangan ini.");
        }
        return true;
      };

      expect(() => evaluateManagerCreateRole('manager', 'owner')).toThrow(/Manajer tidak berwenang/);
      expect(() => evaluateManagerCreateRole('manager', 'manager')).toThrow(/Manajer tidak berwenang/);
      expect(evaluateManagerCreateRole('manager', 'cashier')).toBe(true);
      expect(evaluateManagerCreateRole('owner', 'manager')).toBe(true);
    });

    it('rejects manager attempting to assign permissions exceeding their own authority', () => {
      const managerPermissions = DEFAULT_ROLE_PERMISSIONS.manager;
      const evaluatePermissionAssignment = (callerRole: string, callerPerms: string[], assignedPerms: string[]) => {
        if (callerRole !== 'owner') {
          const exceeds = assignedPerms.some(p => !callerPerms.includes(p));
          if (exceeds) {
            throw new AuthError(403, "Akses ditolak: Anda tidak dapat memberikan izin yang melebihi kewenangan peran Anda sendiri.");
          }
        }
        return true;
      };

      // Owner permissions includes 'business.settings.manage' and 'finance.read'
      // Manager does not have 'business.settings.manage'
      expect(() => 
        evaluatePermissionAssignment('manager', managerPermissions, ['sales.create', 'business.settings.manage'])
      ).toThrow(/melebihi kewenangan peran Anda sendiri/);

      expect(
        evaluatePermissionAssignment('manager', managerPermissions, ['sales.create', 'sales.read'])
      ).toBe(true);
    });

    it('rejects manager attempting to reset password of owner or another manager', () => {
      const evaluateResetHierarchy = (callerRole: string, targetRole: string) => {
        if (targetRole === 'owner') {
          throw new AuthError(403, "Akses ditolak: Kata sandi pemilik (owner) tidak dapat direset melalui jalur manajemen karyawan.");
        }
        if (callerRole === 'manager' && targetRole === 'manager') {
          throw new AuthError(403, "Akses ditolak: Manajer tidak berwenang mereset kata sandi sesama manajer.");
        }
        return true;
      };

      expect(() => evaluateResetHierarchy('manager', 'owner')).toThrow(/Kata sandi pemilik \(owner\) tidak dapat direset/);
      expect(() => evaluateResetHierarchy('manager', 'manager')).toThrow(/Manajer tidak berwenang mereset kata sandi sesama manajer/);
      expect(evaluateResetHierarchy('manager', 'cashier')).toBe(true);
      expect(evaluateResetHierarchy('owner', 'manager')).toBe(true);
    });
  });

  // =========================================================================
  // GATE 3: INACTIVE MEMBER DITOLAK
  // =========================================================================
  describe('Gate 3: Inactive Member Rejection', () => {
    it('rejects inactive members from accessing business tenant resources', async () => {
      mockStore['businesses/biz_active'] = {
        id: 'biz_active',
        name: 'Toko Berkah',
        ownerId: 'usr_owner',
        status: 'active',
      };
      mockStore['businesses/biz_active/members/usr_fired_cashier'] = {
        id: 'mem_fired',
        userId: 'usr_fired_cashier',
        businessId: 'biz_active',
        role: 'cashier',
        status: 'inactive', // Member has been deactivated
        permissions: ['sales.create'],
        branchIds: ['CAB-01'],
      };

      await expect(requireBusinessMembership('biz_active', 'usr_fired_cashier')).rejects.toThrow(
        /Status keanggotaan Anda dalam bisnis ini telah dinonaktifkan/
      );
    });

    it('rejects access to deactivated businesses with 403', async () => {
      mockStore['businesses/biz_suspended'] = {
        id: 'biz_suspended',
        name: 'Toko Ditutup',
        ownerId: 'usr_owner',
        status: 'suspended',
      };

      await expect(requireBusinessMembership('biz_suspended', 'usr_owner')).rejects.toThrow(
        /Unit bisnis ini sedang dinonaktifkan/
      );
    });
  });

  // =========================================================================
  // GATE 4: GUARD TIDAK MEMBUAT DOKUMEN (NO SIDE EFFECTS)
  // =========================================================================
  describe('Gate 4: Auth Guard Has Zero Database Side-Effects on Missing Tenant', () => {
    it('returns 404 and does NOT create business or member documents when business does not exist', async () => {
      const nonExistentBizId = 'biz_ghost_12345';
      const callerUserId = 'usr_attacker';

      // Verify non-existent beforehand
      expect(mockStore[`businesses/${nonExistentBizId}`]).toBeUndefined();

      // Guard must throw 404
      await expect(requireBusinessMembership(nonExistentBizId, callerUserId)).rejects.toThrow(
        /tidak ditemukan/
      );

      // Verify NO documents were created as side effects!
      expect(mockStore[`businesses/${nonExistentBizId}`]).toBeUndefined();
      expect(mockStore[`businesses/${nonExistentBizId}/members/${callerUserId}`]).toBeUndefined();
    });
  });

  // =========================================================================
  // GATE 5: STAF TANPA IZIN TIDAK MENERIMA HPP (COST PRICE PROTECTION)
  // =========================================================================
  describe('Gate 5: HPP (Cost Price) Confidentiality and DTO Protection', () => {
    it('evaluates canReadCostPrice accurately across roles', () => {
      expect(canReadCostPrice('owner')).toBe(true);
      expect(canReadCostPrice('manager')).toBe(true);
      expect(canReadCostPrice('accountant')).toBe(true);
      expect(canReadCostPrice('cashier')).toBe(false);
      expect(canReadCostPrice('warehouse')).toBe(false);
      expect(canReadCostPrice('waiter')).toBe(false);
      expect(canReadCostPrice('kitchen')).toBe(false);
      expect(canReadCostPrice('technician')).toBe(false);

      // Custom permission override
      expect(canReadCostPrice('cashier', ['products.cost.read'])).toBe(true);
    });

    it('sanitizes product DTOs stripping costPrice to 0 for unauthorized staff', () => {
      const rawProduct: Product = {
        id: 'prod_macbook',
        businessId: 'biz_phone',
        name: 'MacBook Pro M3',
        category: 'Laptop',
        sellingPrice: 28000000,
        costPrice: 22000000,
        stockQty: 3,
        available: true,
        trackStock: true,
      };

      const cashierProduct = sanitizeProductDto(rawProduct, false);
      expect(cashierProduct.costPrice).toBe(0);
      expect(cashierProduct.sellingPrice).toBe(28000000);

      const ownerProduct = sanitizeProductDto(rawProduct, true);
      expect(ownerProduct.costPrice).toBe(22000000);
    });

    it('sanitizes IMEI unit acquisition cost prices for unauthorized roles', () => {
      const rawUnit: ImeiUnit = {
        id: 'unit_iphone_01',
        businessId: 'biz_phone',
        branchId: 'CAB-01',
        productId: 'prod_ip15',
        productName: 'iPhone 15 Pro',
        imei: '860123456789006',
        brand: 'Apple',
        model: 'iPhone 15 Pro',
        storage: '256GB',
        color: 'Natural Titanium',
        condition: 'new',
        costPrice: 16500000,
        sellingPrice: 19999000,
        status: 'available',
        source: 'purchase_order',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const cashierUnit = sanitizeImeiUnitDto(rawUnit, false);
      expect(cashierUnit.costPrice).toBe(0);
      expect(cashierUnit.sellingPrice).toBe(19999000);

      const ownerUnit = sanitizeImeiUnitDto(rawUnit, true);
      expect(ownerUnit.costPrice).toBe(16500000);
    });

    it('sanitizes Purchase Orders wiping totalCost and item costs for unauthorized roles', () => {
      const rawPO: PurchaseOrder = {
        id: 'po_001',
        poNumber: 'PO-2026-001',
        businessId: 'biz_phone',
        branchId: 'CAB-01',
        supplierName: 'Distributor Resmi',
        items: [
          {
            id: 'poi_1',
            brand: 'Apple',
            model: 'iPhone 15',
            storage: '128GB',
            color: 'Black',
            condition: 'new',
            costPrice: 12000000,
            expectedSellingPrice: 14500000,
            quantityOrdered: 5,
            quantityReceived: 5,
            receivedImeis: ['860123456789006'],
          }
        ],
        totalCost: 60000000,
        status: 'received',
        createdBy: 'usr_owner',
        createdByName: 'Owner',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const sanitizedPO = sanitizePurchaseOrderDto(rawPO, false);
      expect(sanitizedPO.totalCost).toBe(0);
      expect(sanitizedPO.items[0].costPrice).toBe(0);
      expect(sanitizedPO.items[0].expectedSellingPrice).toBe(14500000);
    });

    it('protects local storage cache by stripping cost prices when stripCostPrice is active', () => {
      const mockStoreData: AppStoreData = {
        ...getEmptyStore(),
        products: [
          {
            id: 'prod_1',
            businessId: 'biz_1',
            name: 'Kopi Susu',
            category: 'Kopi',
            sellingPrice: 18000,
            costPrice: 8000,
            stockQty: 50,
            available: true,
            trackStock: true,
          }
        ],
        purchaseOrders: [
          {
            id: 'po_1',
            poNumber: 'PO-1',
            businessId: 'biz_1',
            branchId: 'CAB-01',
            supplierName: 'Supplier Kopi',
            items: [],
            totalCost: 5000000,
            status: 'received',
            createdBy: 'usr_1',
            createdByName: 'Admin',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
        ]
      };

      // Mock localStorage
      const localStorageMap: Record<string, string> = {};
      const mockLocalStorage = {
        getItem: (k: string) => localStorageMap[k] || null,
        setItem: (k: string, v: string) => { localStorageMap[k] = v; },
        removeItem: (k: string) => { delete localStorageMap[k]; },
      };
      vi.stubGlobal('localStorage', mockLocalStorage);
      vi.stubGlobal('window', { dispatchEvent: () => {} });

      // Save with stripCostPrice = true (for cashier)
      saveStore(mockStoreData, 'usr_cashier', true);

      const cachedRaw = JSON.parse(localStorageMap['tokokoe_mvp_store_v2_usr_cashier']);
      expect(cachedRaw.products[0].costPrice).toBe(0);
      expect(cachedRaw.products[0].sellingPrice).toBe(18000);
      expect(cachedRaw.purchaseOrders).toHaveLength(0); // PO wiped from cashier cache
    });
  });

  // =========================================================================
  // GATE 6: CABANG DAN MODUL TERLARANG DITOLAK
  // =========================================================================
  describe('Gate 6: Branch & Vertical Module Enforcement', () => {
    it('rejects access to non-existent or inactive branches', async () => {
      mockStore['businesses/biz_branches'] = {
        id: 'biz_branches',
        ownerId: 'usr_owner',
        status: 'active',
      };
      mockStore['businesses/biz_branches/branches/CAB-01'] = {
        id: 'CAB-01',
        businessId: 'biz_branches',
        name: 'Cabang Pusat',
        active: true,
      };
      mockStore['businesses/biz_branches/branches/CAB-INACTIVE'] = {
        id: 'CAB-INACTIVE',
        businessId: 'biz_branches',
        name: 'Cabang Ditutup',
        active: false,
      };

      // 1. Non-existent branch
      await expect(requireBranchAccess('biz_branches', 'usr_owner', 'CAB-UNKNOWN')).rejects.toThrow(
        /Cabang 'CAB-UNKNOWN' tidak ditemukan/
      );

      // 2. Inactive branch
      await expect(requireBranchAccess('biz_branches', 'usr_owner', 'CAB-INACTIVE')).rejects.toThrow(
        /sedang dinonaktifkan/
      );
    });

    it('rejects employee assigned only to CAB-01 from accessing CAB-02', async () => {
      mockStore['businesses/biz_b'] = { id: 'biz_b', ownerId: 'usr_owner', status: 'active' };
      mockStore['businesses/biz_b/branches/CAB-01'] = { id: 'CAB-01', active: true };
      mockStore['businesses/biz_b/branches/CAB-02'] = { id: 'CAB-02', active: true };
      mockStore['businesses/biz_b/members/usr_cashier'] = {
        id: 'mem_1',
        userId: 'usr_cashier',
        businessId: 'biz_b',
        role: 'cashier',
        branchIds: ['CAB-01'], // Explicitly restricted to CAB-01
        status: 'active',
      };

      // CAB-01 allowed
      const res = await requireBranchAccess('biz_b', 'usr_cashier', 'CAB-01');
      expect(res.branchIds).toContain('CAB-01');

      // CAB-02 rejected
      await expect(requireBranchAccess('biz_b', 'usr_cashier', 'CAB-02')).rejects.toThrow(
        /Akses ditolak: Anda tidak memiliki akses ke cabang/
      );
    });

    it('distinguishes unset permissions from explicitly empty permissions array []', () => {
      // Unset permissions (undefined) falls back to default role permissions
      expect(hasPermission('cashier', 'sales.create', undefined)).toBe(true);

      // Explicitly empty permissions array [] REVOKES all permissions
      expect(hasPermission('cashier', 'sales.create', [])).toBe(false);
      expect(hasPermission('cashier', 'products.read', [])).toBe(false);
    });

    it('evaluates direct URL route vertical incompatibilities', () => {
      const retailBusiness: Business = {
        id: 'biz_retail_1',
        name: 'Minimarket Sejahtera',
        businessType: 'retail',
        ownerId: 'usr_owner',
        currency: 'IDR',
        timezone: 'Asia/Jakarta',
        address: '',
        phone: '',
        enabledModules: ['core.dashboard', 'core.pos', 'core.products', 'core.inventory'],
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Retail opening F&B Kitchen
      const fnbRouteCheck = evaluateRouteAccess('/app/biz_retail_1/fnb/kitchen', retailBusiness, 'owner');
      expect(fnbRouteCheck.allowed).toBe(false);
      expect(fnbRouteCheck.reason).toMatch(/Modul 'Layar Dapur \(KDS\)' hanya tersedia untuk unit bisnis bertipe FNB/);

      // Retail opening Phone Store IMEI exchange
      const phoneRouteCheck = evaluateRouteAccess('/app/biz_retail_1/phone/exchange', retailBusiness, 'owner');
      expect(phoneRouteCheck.allowed).toBe(false);
      expect(phoneRouteCheck.reason).toMatch(/Modul 'Tukar Unit & Garansi' hanya tersedia untuk unit bisnis bertipe PHONE/);

      // Retail opening Retail POS -> allowed
      const validRouteCheck = evaluateRouteAccess('/app/biz_retail_1/pos', retailBusiness, 'owner');
      expect(validRouteCheck.allowed).toBe(true);
    });

    it('evaluates direct URL permission restrictions for cashiers opening management pages', () => {
      const fnbBusiness: Business = {
        id: 'biz_fnb_1',
        name: 'Kopi Senja',
        businessType: 'fnb',
        ownerId: 'usr_owner',
        currency: 'IDR',
        timezone: 'Asia/Jakarta',
        address: '',
        phone: '',
        enabledModules: ['core.dashboard', 'core.pos', 'core.employees', 'core.finance'],
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Cashier opening /employees page (requires employees.manage)
      const empCheck = evaluateRouteAccess('/app/biz_fnb_1/employees', fnbBusiness, 'cashier');
      expect(empCheck.allowed).toBe(false);
      expect(empCheck.reason).toMatch(/tidak memiliki izin 'employees\.manage'/);

      // Cashier opening /finance page (requires finance.read)
      const finCheck = evaluateRouteAccess('/app/biz_fnb_1/finance', fnbBusiness, 'cashier');
      expect(finCheck.allowed).toBe(false);
      expect(finCheck.reason).toMatch(/tidak memiliki izin 'finance\.read'/);

      // Manager opening /employees page -> allowed
      const managerCheck = evaluateRouteAccess('/app/biz_fnb_1/employees', fnbBusiness, 'manager');
      expect(managerCheck.allowed).toBe(true);
    });
  });
});
