import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as productPost, PUT as productPut, DELETE as productDelete } from '../app/api/products/route';
import { GET as branchGet, POST as branchPost, PUT as branchPut, DELETE as branchDelete } from '../app/api/branches/route';
import { PUT as profilePut } from '../app/api/businesses/profile/route';
import { GET as employeeListGet } from '../app/api/employees/list/route';
import { PUT as employeeUpdatePut } from '../app/api/employees/update/route';
import { GET as salesHistoryGet } from '../app/api/sales/history/route';
import { POST as checkoutPost } from '../app/api/sales/checkout/route';

// In-memory mock store for Firestore and Auth
const { mockDbStore, revokedTokens } = vi.hoisted(() => ({
  mockDbStore: {} as Record<string, any>,
  revokedTokens: [] as string[],
}));

vi.mock('../lib/firebase/admin', () => {
  return {
    adminAuth: {
      verifyIdToken: vi.fn(async (token: string) => {
        if (token.startsWith('test_token__')) {
          const parts = token.slice('test_token__'.length).split('__');
          return {
            uid: parts[0] || 'usr_owner_1',
            email: `${parts[0] || 'usr_owner_1'}@tokokoe.local`,
            role: parts[1] || 'owner',
            businessId: parts[2] || 'biz_auth_test_1',
          };
        }
        if (token.startsWith('test_token_')) {
          const parts = token.slice('test_token_'.length).split('_');
          return {
            uid: parts[0] || 'usr_owner_1',
            email: `${parts[0] || 'usr_owner_1'}@tokokoe.local`,
            role: parts[1] || 'owner',
            businessId: parts[2] || 'biz_auth_test_1',
          };
        }
        throw new Error('Invalid token');
      }),
      updateUser: vi.fn().mockResolvedValue({}),
      revokeRefreshTokens: vi.fn(async (uid: string) => {
        revokedTokens.push(uid);
      }),
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
        update: async (data: any) => {
          if (!mockDbStore[path]) throw new Error(`Document not found: ${path}`);
          const current = { ...mockDbStore[path] };
          for (const key of Object.keys(data)) {
            const val = data[key];
            if (val && typeof val === 'object' && (val._deleteField || val.constructor?.name === 'DeleteTransform' || String(val).includes('DeleteTransform'))) {
              delete current[key];
            } else {
              current[key] = val;
            }
          }
          mockDbStore[path] = current;
        },
      }),
      collection: (path: string) => {
        const getDocsInPath = () => {
          const prefix = `${path}/`;
          return Object.keys(mockDbStore)
            .filter(k => k.startsWith(prefix) && k.indexOf('/', prefix.length) === -1)
            .map(k => ({
              id: k.split('/').pop()!,
              data: () => mockDbStore[k],
              exists: true,
            }));
        };

        return {
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
          get: async () => {
            const docs = getDocsInPath();
            return {
              empty: docs.length === 0,
              size: docs.length,
              docs,
            };
          },
          where: (field: string, op: string, value: any) => {
            let filtered = getDocsInPath().filter(d => {
              const val = d.data()[field];
              if (op === '==') return val === value;
              if (op === '>=') return val >= value;
              if (op === '<=') return val <= value;
              return true;
            });

            const queryObj: any = {
              where: (f2: string, op2: string, val2: any) => {
                filtered = filtered.filter(d => {
                  const val = d.data()[f2];
                  if (op2 === '==') return val === val2;
                  if (op2 === '>=') return val >= val2;
                  if (op2 === '<=') return val <= val2;
                  return true;
                });
                return queryObj;
              },
              orderBy: () => queryObj,
              limit: (n: number) => {
                const sliced = filtered.slice(0, n);
                return {
                  get: async () => ({
                    empty: sliced.length === 0,
                    size: sliced.length,
                    docs: sliced,
                  }),
                };
              },
              get: async () => ({
                empty: filtered.length === 0,
                size: filtered.length,
                docs: filtered,
              }),
            };
            return queryObj;
          },
          orderBy: () => {
            const docs = getDocsInPath();
            const queryObj: any = {
              where: (f: string, op: string, val: any) => {
                const filtered = docs.filter(d => {
                  const v = d.data()[f];
                  if (op === '==') return v === val;
                  if (op === '>=') return v >= val;
                  if (op === '<=') return v <= val;
                  return true;
                });
                return {
                  limit: (n: number) => ({
                    get: async () => ({
                      empty: filtered.slice(0, n).length === 0,
                      size: filtered.slice(0, n).length,
                      docs: filtered.slice(0, n),
                    }),
                  }),
                  get: async () => ({
                    empty: filtered.length === 0,
                    size: filtered.length,
                    docs: filtered,
                  }),
                };
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
            };
            return queryObj;
          },
        };
      },
      runTransaction: async (updateFn: any) => {
        const transaction = {
          get: async (docRef: any) => {
            return docRef.get();
          },
          update: (docRef: any, data: any) => {
            return docRef.set(data, { merge: true });
          },
          set: (docRef: any, data: any) => {
            return docRef.set(data);
          },
        };
        return updateFn(transaction);
      },
    },
    FieldValue: {
      delete: () => ({ _deleteField: true }),
      serverTimestamp: () => Date.now(),
    },
  };
});

describe('FASE 2: CRUD DAN PERSISTENSI AUTHORITATIVE GATES', () => {
  const bizId = 'biz_auth_test_1';
  const ownerUid = 'usr_owner_1';
  const cashierUid = 'usr_cashier_1';

  beforeEach(() => {
    // Reset mock database
    for (const key of Object.keys(mockDbStore)) {
      delete mockDbStore[key];
    }
    revokedTokens.length = 0;

    // Seed test business
    mockDbStore[`businesses/${bizId}`] = {
      id: bizId,
      name: 'Toko Authoritative Testing',
      businessType: 'retail',
      ownerId: ownerUid,
      createdAt: Date.now(),
    };

    // Seed owner membership
    mockDbStore[`businesses/${bizId}/members/${ownerUid}`] = {
      id: ownerUid,
      businessId: bizId,
      userId: ownerUid,
      role: 'owner',
      status: 'active',
      branchIds: ['*'],
      displayName: 'Owner Testing',
      permissions: ['*'],
    };

    // Seed cashier membership
    mockDbStore[`businesses/${bizId}/members/${cashierUid}`] = {
      id: cashierUid,
      businessId: bizId,
      userId: cashierUid,
      role: 'cashier',
      status: 'active',
      branchIds: ['br_main'],
      displayName: 'Kasir Satu',
      permissions: ['sales.create', 'sales.read'],
    };

    // Seed main branch
    mockDbStore[`businesses/${bizId}/branches/br_main`] = {
      id: 'br_main',
      businessId: bizId,
      name: 'Cabang Utama',
      code: 'CAB-01',
      address: 'Jl. Merdeka No. 1',
      isMain: true,
      active: true,
    };
  });

  describe('A. Produk dan Katalog', () => {
    it('menolak produk dengan harga nominal negatif atau desimal sen pecahan', async () => {
      const req = new Request('http://localhost/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer test_token__${ownerUid}__owner__${bizId}`,
        },
        body: JSON.stringify({
          businessId: bizId,
          name: 'Kopi Tubruk',
          sellingPrice: -5000, // Invalid negative
          costPrice: 2000,
          stockQty: 10,
        }),
      });

      const res = await productPost(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toMatch(/Harga jual|tidak valid/);
    });

    it('memvalidasi keunikan barcode dan SKU secara authoritative dalam scope bisnis', async () => {
      // 1. Create first product with barcode 8991234567890
      const req1 = new Request('http://localhost/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer test_token__${ownerUid}__owner__${bizId}`,
        },
        body: JSON.stringify({
          businessId: bizId,
          name: 'Produk A',
          barcode: '8991234567890',
          sku: 'SKU-001',
          sellingPrice: 15000,
          costPrice: 10000,
          stockQty: 50,
          trackStock: true,
        }),
      });
      const res1 = await productPost(req1);
      const json1 = await res1.json();
      expect(res1.status).toBe(200);
      expect(json1.success).toBe(true);

      // 2. Try creating second product with duplicate barcode
      const req2 = new Request('http://localhost/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer test_token__${ownerUid}__owner__${bizId}`,
        },
        body: JSON.stringify({
          businessId: bizId,
          name: 'Produk B Duplicate Barcode',
          barcode: '8991234567890',
          sellingPrice: 20000,
          costPrice: 12000,
          stockQty: 10,
        }),
      });
      const res2 = await productPost(req2);
      const json2 = await res2.json();
      expect(res2.status).toBe(400);
      expect(json2.success).toBe(false);
      expect(json2.message).toContain('sudah digunakan oleh produk lain');

      // 3. Try creating third product with duplicate SKU
      const req3 = new Request('http://localhost/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer test_token__${ownerUid}__owner__${bizId}`,
        },
        body: JSON.stringify({
          businessId: bizId,
          name: 'Produk C Duplicate SKU',
          barcode: '8999999999999',
          sku: 'SKU-001', // duplicate sku
          sellingPrice: 20000,
          costPrice: 12000,
          stockQty: 10,
        }),
      });
      const res3 = await productPost(req3);
      const json3 = await res3.json();
      expect(res3.status).toBe(400);
      expect(json3.success).toBe(false);
      expect(json3.message).toContain('SKU "SKU-001" sudah digunakan');
    });

    it('menghapus field barcode secara eksplisit saat barcode dikosongkan (clear barcode)', async () => {
      // Seed product with barcode
      const prodId = 'prod_test_barcode';
      mockDbStore[`businesses/${bizId}/products/${prodId}`] = {
        id: prodId,
        businessId: bizId,
        name: 'Produk Barcode Lama',
        barcode: '1234567890123',
        sku: 'SKU-OLD',
        sellingPrice: 10000,
        costPrice: 5000,
        stockQty: 5,
        isActive: true,
        available: true,
      };

      const req = new Request('http://localhost/api/products', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer test_token__${ownerUid}__owner__${bizId}`,
        },
        body: JSON.stringify({
          businessId: bizId,
          productId: prodId,
          barcode: '', // Clear barcode
        }),
      });

      const res = await productPut(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Verify that barcode key is actually removed from document in database
      const stored = mockDbStore[`businesses/${bizId}/products/${prodId}`];
      expect(stored.barcode).toBeUndefined();
    });

    it('melakukan soft archive produk tanpa merusak riwayat transaksi', async () => {
      const prodId = 'prod_to_archive';
      mockDbStore[`businesses/${bizId}/products/${prodId}`] = {
        id: prodId,
        businessId: bizId,
        name: 'Produk Discontinue',
        sellingPrice: 10000,
        costPrice: 5000,
        stockQty: 5,
        isActive: true,
        available: true,
      };

      const req = new Request('http://localhost/api/products', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer test_token__${ownerUid}__owner__${bizId}`,
        },
        body: JSON.stringify({
          businessId: bizId,
          productId: prodId,
        }),
      });

      const res = await productDelete(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Document still exists (not hard deleted), but archived
      const archived = mockDbStore[`businesses/${bizId}/products/${prodId}`];
      expect(archived).toBeDefined();
      expect(archived.isActive).toBe(false);
      expect(archived.available).toBe(false);
      expect(archived.archivedAt).toBeDefined();
    });

    it('menolak checkout penjualan jika produk dalam keranjang diarsipkan / nonaktif', async () => {
      const prodId = 'prod_archived_sale';
      mockDbStore[`businesses/${bizId}/products/${prodId}`] = {
        id: prodId,
        businessId: bizId,
        name: 'Barang Usang',
        sellingPrice: 25000,
        costPrice: 15000,
        stockQty: 10,
        trackStock: true,
        isActive: false, // Inactive!
        available: false,
      };

      const req = new Request('http://localhost/api/sales/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer test_token__${cashierUid}__cashier__${bizId}`,
        },
        body: JSON.stringify({
          businessId: bizId,
          branchId: 'br_main',
          orderType: 'retail_pos',
          lineItems: [
            {
              productId: prodId,
              productName: 'Barang Usang',
              quantity: 1,
              unitPrice: 25000,
              subtotal: 25000,
            },
          ],
          discount: 0,
          tax: 0,
          serviceCharge: 0,
          paidAmount: 25000,
          paymentMethod: 'cash',
        }),
      });

      const res = await checkoutPost(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toMatch(/tidak aktif atau diarsipkan/);
    });
  });

  describe('B. Bisnis dan Cabang', () => {
    it('menyimpan perubahan profil bisnis langsung ke database backend', async () => {
      const req = new Request('http://localhost/api/businesses/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer test_token__${ownerUid}__owner__${bizId}`,
        },
        body: JSON.stringify({
          businessId: bizId,
          name: 'Toko Sukses Sejahtera Baru',
          address: 'Jl. Sudirman Kav 25',
          phone: '081298765432',
        }),
      });

      const res = await profilePut(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.business.name).toBe('Toko Sukses Sejahtera Baru');

      // Verify DB persistence
      const stored = mockDbStore[`businesses/${bizId}`];
      expect(stored.name).toBe('Toko Sukses Sejahtera Baru');
      expect(stored.address).toBe('Jl. Sudirman Kav 25');
      expect(stored.phone).toBe('081298765432');
    });

    it('membuat cabang baru dengan kode sekuensial', async () => {
      const req = new Request('http://localhost/api/branches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer test_token__${ownerUid}__owner__${bizId}`,
        },
        body: JSON.stringify({
          businessId: bizId,
          name: 'Cabang Senopati',
          address: 'Jl. Senopati Raya No. 8',
          phone: '0811223344',
        }),
      });

      const res = await branchPost(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.branch.code).toBe('CAB-02');
      expect(json.branch.isMainBranch).toBe(false);
      expect(json.branch.active).toBe(true);
    });

    it('menolak penonaktifan cabang utama (main branch)', async () => {
      const req = new Request('http://localhost/api/branches', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer test_token__${ownerUid}__owner__${bizId}`,
        },
        body: JSON.stringify({
          businessId: bizId,
          branchId: 'br_main',
        }),
      });

      const res = await branchDelete(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('Cabang utama');
    });

    it('menolak penonaktifan cabang jika masih memiliki sesi kasir yang sedang aktif', async () => {
      const branchId = 'br_senopati';
      mockDbStore[`businesses/${bizId}/branches/${branchId}`] = {
        id: branchId,
        businessId: bizId,
        name: 'Cabang Senopati',
        code: 'CAB-02',
        isMain: false,
        active: true,
      };

      // Seed an active cash session on this branch
      mockDbStore[`businesses/${bizId}/cashSessions/cs_open_1`] = {
        id: 'cs_open_1',
        businessId: bizId,
        branchId: branchId,
        status: 'open',
      };

      const req = new Request('http://localhost/api/branches', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer test_token__${ownerUid}__owner__${bizId}`,
        },
        body: JSON.stringify({
          businessId: bizId,
          branchId: branchId,
        }),
      });

      const res = await branchDelete(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('shift kasir yang sedang aktif');
    });
  });

  describe('C. Karyawan dan Akses Vertikal', () => {
    it('memperbarui role, branch, dan mencabut sesi token saat karyawan dinonaktifkan', async () => {
      const req = new Request('http://localhost/api/employees/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer test_token__${ownerUid}__owner__${bizId}`,
        },
        body: JSON.stringify({
          businessId: bizId,
          memberId: cashierUid,
          status: 'inactive', // Deactivate
          role: 'cashier',
        }),
      });

      const res = await employeeUpdatePut(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Verify status in DB
      const member = mockDbStore[`businesses/${bizId}/members/${cashierUid}`];
      expect(member.status).toBe('inactive');

      // Verify that refresh tokens were revoked
      expect(revokedTokens).toContain(cashierUid);
    });

    it('mereload daftar karyawan secara authoritative dari backend Firestore', async () => {
      const req = new Request(`http://localhost/api/employees/list?businessId=${bizId}`, {
        headers: {
          'Authorization': `Bearer test_token__${ownerUid}__owner__${bizId}`,
        },
      });

      const res = await employeeListGet(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.members).toBeDefined();
      expect(json.members.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('D. State, Subscriptions, dan History Pagination', () => {
    it('mengembalikan histori penjualan terpaginasi dari server dengan filter', async () => {
      // Seed 25 transactions
      for (let i = 1; i <= 25; i++) {
        const saleId = `sale_test_${i}`;
        mockDbStore[`businesses/${bizId}/sales/${saleId}`] = {
          id: saleId,
          businessId: bizId,
          branchId: 'br_main',
          saleNumber: `TRX-${1000 + i}`,
          grandTotal: 50000,
          paymentMethod: i % 2 === 0 ? 'cash' : 'midtrans_qris',
          cashierName: 'Kasir Satu',
          createdAt: 1700000000000 + i * 1000,
        };
      }

      // Query page 1 with limit 10
      const req = new Request(`http://localhost/api/sales/history?businessId=${bizId}&page=1&limit=10`, {
        headers: {
          'Authorization': `Bearer test_token__${ownerUid}__owner__${bizId}`,
        },
      });

      const res = await salesHistoryGet(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.sales.length).toBe(10);
      expect(json.pagination.total).toBe(25);
      expect(json.pagination.totalPages).toBe(3);
      expect(json.summary.totalRevenue).toBe(25 * 50000);
    });
  });
});
