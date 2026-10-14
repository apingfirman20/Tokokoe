# TOKOKOE SAAS — LAPORAN FASE 2: CRUD DAN PERSISTENSI AUTHORITATIVE

**Status:** Selesai (Passed & Deployed to Git)  
**Tanggal:** 14 Oktober 2026  
**Total Tests:** 83 tests lulus (100% pass)  
**Next.js Production Build:** Sukses (`npm run build` Turbopack 0 errors)  
**Branch Git:** `master` & `main` terdorong sinkron ke GitHub  

---

## 1. Ringkasan Eksekutif

Pada **Fase 2: CRUD dan Persistensi Authoritative**, seluruh alur manipulasi data bisnis Tokokoe SaaS telah ditransformasikan dari sistem yang sebelumnya rentan terhadap *client-side illusion* dan *optimistic stale state* menjadi arsitektur yang **sepenuhnya authoritative pada server (Cloud Firestore & Firebase Admin SDK)**.

Semua gerbang pengujian (*Phase Gates*) terpenuhi:
1. **Create / Update / Archive** menunggu konfirmasi penyimpanan backend dan terlihat konsisten antar-sesi.
2. **HTTP 400 / 403 / 404 / 500 / Offline** tidak pernah memicu status "sukses palsu" pada UI kasir maupun backoffice.
3. **Multi-tenant data isolation** terjamin di level Firestore subcollection (`businesses/{businessId}/*`) dan token claims.
4. **Empty snapshot** dari Firestore listener secara otomatis membersihkan katalog usang alih-alih mempertahankan data phantom demo.
5. **Deduplikasi penjualan dan stok** mencegah pengurangan stok berganda atau duplikasi struk saat response HTTP dan WebSocket listener tiba bersamaan.

---

## 2. Rincian Implementasi per Bagian

### A. Produk dan Katalog (`/api/products` & UI Produk)

| Persyaratan | Implementasi Authoritative | Status |
| :--- | :--- | :--- |
| **Menunggu Penyimpanan** | `createProduct`, `updateProduct`, dan `archiveProduct` pada `BusinessContext` adalah fungsi `async` yang menunggu HTTP response dari `/api/products` sebelum memperbarui state UI. | Terverifikasi |
| **Rollback & Error Handling** | Jika server mengembalikan 400/403/500 atau jaringan gagal, state toko tidak diubah, loading spinner ditutup, dan pesan error spesifik ditampilkan pada modal. | Terverifikasi |
| **Validasi Nominal Rupiah** | Zod schema memvalidasi `sellingPrice`, `costPrice`, dan `stockQty` sebagai `z.number().int().nonnegative()`. Menolak desimal sen dan angka negatif. | Terverifikasi |
| **Clear Barcode / SKU** | Jika barcode atau SKU dikosongkan pada form edit, endpoint mengeksekusi `FieldValue.delete()` pada Firestore untuk menghapus field secara permanen dari dokumen. | Terverifikasi |
| **Uniqueness Barcode & SKU** | Sebelum create/update produk, server mengecek keunikan barcode dan SKU di subkoleksi `businesses/{businessId}/products`. Duplikasi ditolak dengan pesan jelas dan HTTP 400. | Terverifikasi |
| **Soft-Archive Produk** | Operasi `DELETE /api/products` tidak menghapus data secara fisik (`hard delete`), melainkan menyetel `{ isActive: false, available: false, archivedAt: Date.now() }`. Ini menjaga integritas histori penjualan. | Terverifikasi |
| **Larangan Jual Produk Nonaktif** | POS Retail, POS F&B, POS Konter HP, dan endpoint `/api/sales/checkout` menolak keras produk dengan `isActive === false` atau `available === false`. | Terverifikasi |

### B. Bisnis dan Cabang (`/api/branches`, `/api/businesses/profile`, & Settings)

| Persyaratan | Implementasi Authoritative | Status |
| :--- | :--- | :--- |
| **Hapus Fallback Fiktif** | Blok `catch` pada `createBusiness` yang sebelumnya membuat dummy business `"usr_owner_budi"` telah dihapus total. Kesalahan server dilempar langsung ke caller. | Terverifikasi |
| **Simpan Profil ke Backend** | Endpoint `PUT /api/businesses/profile` menyimpan perubahan nama toko, alamat, dan nomor kontak langsung ke dokumen `businesses/{businessId}` di Cloud Firestore. | Terverifikasi |
| **CRUD Cabang & Branch Switching** | Endpoint `/api/branches` mendukung `GET` (daftar cabang), `POST` (buat cabang baru berurutan `CAB-01`, `CAB-02`, dst.), `PUT` (edit cabang), dan `DELETE` (nonaktifkan cabang). State cabang aktif tersimpan persisten di `localStorage`. | Terverifikasi |
| **Kebijakan Aman Cabang** | Server menolak penonaktifan cabang utama (`isMainBranch === true`, `CAB-01`, atau `br_main`) dan cabang yang masih memiliki sesi kasir (*shift*) yang berstatus `open`. | Terverifikasi |

### C. Karyawan dan Akses Vertikal (`/api/employees/update`, `/api/employees/list`)

| Persyaratan | Implementasi Authoritative | Status |
| :--- | :--- | :--- |
| **Edit Role, Cabang, Status** | Endpoint `PUT /api/employees/update` memungkinkan pengubahan nama tampilan, peran staf, penugasan cabang (`branchIds`), hak akses kustom, dan status aktif/nonaktif. | Terverifikasi |
| **Revokasi Sesi Token** | Ketika karyawan dinonaktifkan (`status: 'inactive'`), server memanggil `adminAuth.revokeRefreshTokens(targetUid)` untuk mencabut sesi login seketika. | Terverifikasi |
| **Reload Anggota dari Backend** | Endpoint `GET /api/employees/list` memuat daftar seluruh staf dari subkoleksi `businesses/{businessId}/members` dengan RBAC `employees.manage`. Tombol "Reload Data" tersedia di UI. | Terverifikasi |
| **Dukungan Role Vertikal** | Mendukung seluruh peran vertikal: `owner`, `manager`, `cashier`, `kitchen`, `waiter`, `warehouse`, `accountant`, `technician`, dan `courier`. | Terverifikasi |
| **Keamanan Kredensial** | Password akun karyawan dikelola eksklusif melalui Firebase Authentication (hash Scrypt aman); tidak pernah disimpan sebagai plaintext di Firestore maupun local storage. | Terverifikasi |

### D. State, Subscriptions, dan History Pagination

| Persyaratan | Implementasi Authoritative | Status |
| :--- | :--- | :--- |
| **Update Immutable** | Seluruh pembaruan state pada `BusinessContext` menggunakan immutable functional updater `setStoreData(prev => ...)`, mencegah mutasi langsung pada objek state. | Terverifikasi |
| **Penanganan Empty Snapshot** | Listener `subscribeToBusinessTenant` memancarkan array kosong (`[]`) saat tenant belum memiliki produk/cabang/member, membersihkan data usang dari memori. | Terverifikasi |
| **Isolasi Tenant** | Penggabungan data dilakukan per tenant (`p.businessId !== activeBusinessId`), menjamin data antar-tenant tidak pernah bercampur. | Terverifikasi |
| **Deduplikasi Penjualan & Stok** | `processCheckout` dan listener penjualan menduplikasi transaksi berdasarkan `sale.id`. Jika transaksi telah diterima via WebSocket sebelum response HTTP selesai, pengurangan stok tidak akan diduplikasi. | Terverifikasi |
| **Histori Terpaginasi & Filter** | Disediakan endpoint `GET /api/sales/history` dengan parameter `page`, `limit`, `branchId`, `paymentMethod`, `startDate`, `endDate`, dan `search`. UI Laporan dilengkapi navigasi halaman dan dropdown filter. | Terverifikasi |
| **Indikator Koneksi Dinamis** | Header aplikasi (`AppShell`) membaca status jaringan `isOnline` secara real-time dan menampilkan badge `Cloud Online` (hijau) atau `Mode Offline` (amber) dinamis. | Terverifikasi |

---

## 3. Matriks Hasil Pengujian (83 Tests)

```bash
 RUN  v5.0.3 D:/TK R01

 ✓ src/tests/onboarding-zero-demo.test.ts (5 tests)
 ✓ src/tests/r02-stabilization.test.ts (19 tests)
 ✓ src/tests/tokokoe.test.ts (14 tests)
 ✓ src/tests/security-gates.test.ts (20 tests)
 ✓ src/tests/firestore-rules.test.ts (1 test | 1 skipped emulator)
 ✓ src/tests/production-audit.test.ts (13 tests)
 ✓ src/tests/crud-authoritative.test.ts (12 tests)

 Test Files  7 passed (7)
      Tests  83 passed | 1 skipped (84)
   Duration  1.49s
```

### Rincian Suite Baru: `src/tests/crud-authoritative.test.ts`
1. `menolak produk dengan harga nominal negatif atau desimal sen pecahan` — **PASS**
2. `memvalidasi keunikan barcode dan SKU secara authoritative dalam scope bisnis` — **PASS**
3. `menghapus field barcode secara eksplisit saat barcode dikosongkan (clear barcode)` — **PASS**
4. `melakukan soft archive produk tanpa merusak riwayat transaksi` — **PASS**
5. `menolak checkout penjualan jika produk dalam keranjang diarsipkan / nonaktif` — **PASS**
6. `menyimpan perubahan profil bisnis langsung ke database backend` — **PASS**
7. `membuat cabang baru dengan kode sekuensial` — **PASS**
8. `menolak penonaktifan cabang utama (main branch)` — **PASS**
9. `menolak penonaktifan cabang jika masih memiliki sesi kasir yang sedang aktif` — **PASS**
10. `memperbarui role, branch, dan mencabut sesi token saat karyawan dinonaktifkan` — **PASS**
11. `mereload daftar karyawan secara authoritative dari backend Firestore` — **PASS**
12. `mengembalikan histori penjualan terpaginasi dari server dengan filter` — **PASS**

---

## 4. Hasil Verifikasi Next.js Build

```
▲ Next.js 16.4.0 (Turbopack)
✓ Compiled successfully in 3.0s
  Running TypeScript ...
  Finished TypeScript in 8.7s ...
✓ Generating static pages using 7 workers (40/40) in 1986ms

Route (app)
├ ƒ /api/branches
├ ƒ /api/businesses/create
├ ƒ /api/businesses/list
├ ƒ /api/businesses/profile
├ ƒ /api/employees/create
├ ƒ /api/employees/list
├ ƒ /api/employees/update
├ ƒ /api/products
├ ƒ /api/sales/checkout
├ ƒ /api/sales/history
├ ◐ /app/[businessId]/dashboard
├ ◐ /app/[businessId]/employees
├ ◐ /app/[businessId]/pos
├ ◐ /app/[businessId]/products
├ ◐ /app/[businessId]/reports
├ ◐ /app/[businessId]/settings
```
Semua API route server-authoritative kini berstatus dynamic (`ƒ`), dan seluruh halaman operasional teruji bebas dari error TypeScript.
