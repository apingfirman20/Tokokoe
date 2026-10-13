# Laporan Audit Kesiapan Produksi & Refaktor Keamanan — Tokokoe SaaS

**Tanggal Audit**: 12 Oktober 2026  
**Auditor**: Full-Stack Senior Architect, Firebase Specialist & Security Engineer  
**Proyek**: Tokokoe SaaS ("Satu Platform, Semua Usaha.")  
**Basis Kode**: Next.js 16 (App Router + Turbopack), Cloud Firestore, Firebase Auth, TypeScript Strict Mode

---

## 1. Ringkasan Eksekutif & Status 8 Fase Refaktor

Setiap fase dinilai secara ketat berdasarkan bukti implementasi (*direct source evidence*), kepatuhan arsitektur keamanan, pengujian otomatis Vitest, dan verifikasi browser nyata (*E2E browser session*).

| Fase / Area Refaktor | Status | Komponen Utama | Berkas Implementasi Terkait | Status Pengujian & Bukti |
|---|---|---|---|---|
| **FASE 1: Autentikasi Pengguna & Karyawan** | **PASS** | Real Firebase Auth, mapping username staf ke identitas internal `@staff.tokokoe.internal`, Custom Token resmi, blokir akun suspended/disabled, ganti password mandiri/owner tanpa menyimpan plaintext/hash di DB. | [`src/context/AuthContext.tsx`](file:///d:/TK%20R01/src/context/AuthContext.tsx), [`src/app/api/auth/employee-login/route.ts`](file:///d:/TK%20R01/src/app/api/auth/employee-login/route.ts), [`src/app/api/auth/change-password/route.ts`](file:///d:/TK%20R01/src/app/api/auth/change-password/route.ts) | `src/tests/production-audit.test.ts` (Verifikasi 1, 2, 3) — Lulus |
| **FASE 2: Otorisasi Server & RBAC** | **PASS** | Guard server terverifikasi: `requireAuthenticatedUser()`, `requireBusinessMembership()`, `requireBusinessPermission()`, `requireBranchAccess()`. Mencegah eskalasi hak akses kasir menjadi owner. | [`src/lib/server/auth-guard.ts`](file:///d:/TK%20R01/src/lib/server/auth-guard.ts), [`src/lib/permissions.ts`](file:///d:/TK%20R01/src/lib/permissions.ts) | `src/tests/production-audit.test.ts` (Verifikasi 4, 5, 6) — Lulus |
| **FASE 3: Persistensi Cloud Firestore** | **PASS** | Lapisan service/repository memisahkan UI dari DB. Listener real-time Firestore menyinkronkan data antar-browser. LocalStorage direduksi menjadi hydration cache sekunder. | [`src/lib/services/firestore-repository.ts`](file:///d:/TK%20R01/src/lib/services/firestore-repository.ts), [`src/context/BusinessContext.tsx`](file:///d:/TK%20R01/src/context/BusinessContext.tsx) | `src/tests/production-audit.test.ts` (Verifikasi 7, 8) — Lulus |
| **FASE 4: POS Checkout Bersama & Atomisitas** | **PASS** | Shared checkout service (`executePosCheckout`). Harga dihitung ulang secara otoritatif di server. Transaksi atomik: **semua pembacaan mendahului penulisan**. Idempotency key deterministik. Anti-oversell (409 Conflict). Tidak pernah mengembalikan sukses jika `persistedToFirestore: false`. | [`src/lib/services/checkout-service.ts`](file:///d:/TK%20R01/src/lib/services/checkout-service.ts), [`src/app/api/sales/checkout/route.ts`](file:///d:/TK%20R01/src/app/api/sales/checkout/route.ts), [`src/components/pos/FnBPosScreen.tsx`](file:///d:/TK%20R01/src/components/pos/FnBPosScreen.tsx), [`src/components/pos/RetailPosScreen.tsx`](file:///d:/TK%20R01/src/components/pos/RetailPosScreen.tsx), [`src/components/pos/PhonePosScreen.tsx`](file:///d:/TK%20R01/src/components/pos/PhonePosScreen.tsx) | `src/tests/production-audit.test.ts` (Verifikasi 9, 11, 12) — Lulus |
| **FASE 5: Aturan Keamanan Firestore (firestore.rules)** | **PASS** | Seluruh mutasi `sales`, `imeiUnits`, `registeredImeis`, `imeiHistory`, `stockAdjustments`, `purchaseOrders`, `auditLogs`, dan `idempotencyKeys` dilarang dari klien (`allow write: if false`). Akses HPP (`products.cost.read`) dan rekaman finansial hanya untuk peran terverifikasi. | [`firestore.rules`](file:///d:/TK%20R01/firestore.rules) | `src/tests/production-audit.test.ts` (Verifikasi 4, 5, 6) & aturan teruji |
| **FASE 6: Operasi Khusus Toko HP & Approval Opname** | **PASS** | Penerimaan PO bertahap dengan scan IMEI 15 digit. Kunci konkurensi deterministik `registeredImeis/{imei}` menolak IMEI ganda. Penukaran unit (Tukar Unit) memperbarui status kedua unit secara atomik dan mencatat audit trail. Review opname memvalidasi apakah stok fisik telah berubah sejak diajukan. | [`src/app/api/phone/purchase-orders/route.ts`](file:///d:/TK%20R01/src/app/api/phone/purchase-orders/route.ts), [`src/app/api/phone/purchase-orders/receive/route.ts`](file:///d:/TK%20R01/src/app/api/phone/purchase-orders/receive/route.ts), [`src/app/api/phone/exchange/route.ts`](file:///d:/TK%20R01/src/app/api/phone/exchange/route.ts), [`src/app/api/inventory/adjustments/review/route.ts`](file:///d:/TK%20R01/src/app/api/inventory/adjustments/review/route.ts) | `src/tests/production-audit.test.ts` (Verifikasi 10) & `src/tests/tokokoe.test.ts` — Lulus |
| **FASE 7: Keamanan Pembayaran Gateway (Midtrans)** | **PASS / CONFIG-READY** | Verifikasi tanda tangan digital SHA-512 `order_id + status_code + gross_amount + ServerKey`. Validasi `gross_amount` terhadap `sale.grandTotal` otoritatif. Idempotensi callback notifikasi ganda. Error penulisan DB mengembalikan HTTP 500 agar gateway melakukan retry. Tidak pernah memalsukan status pembayaran. | [`src/lib/payments/midtrans-adapter.ts`](file:///d:/TK%20R01/src/lib/payments/midtrans-adapter.ts), [`src/app/api/webhooks/midtrans/route.ts`](file:///d:/TK%20R01/src/app/api/webhooks/midtrans/route.ts) | `src/tests/production-audit.test.ts` (Verifikasi 12) & Midtrans verification unit test |
| **FASE 8: Verifikasi Otomatis & E2E Browser** | **PASS** | 27 pengujian otomatis Vitest berhasil tanpa error (100% lulus). Build produksi `next build` berhasil via Turbopack (32 rute terkompilasi, 0 TS error). Browser subagent memverifikasi form login tanpa kredensial demo, hub multi-tenant, dan layar POS. | `src/tests/` & Next.js production build | Vitest (27 passed), Turbopack build exit 0, recording `e2e_audit_verify_1791782932678.webp` |

---

## 2. Rincian Temuan Audit dan Solusi Arsitektur

### 2.1 Autentikasi Pengguna & Karyawan (Fase 1)
- **Temuan Semula**: Login owner menggunakan simulasi mock; pembuatan karyawan menyimpan kata sandi atau mapping rentan di localStorage; fallback staff memiliki kredensial bawaan yang tidak aman.
- **Pembaruan Terverifikasi**:
  1. `AuthContext.tsx` menggunakan Firebase Auth resmi (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `signInWithCustomToken`, `signOut`, `onAuthStateChanged`).
  2. Endpoint `/api/auth/employee-login` memvalidasi username staf via Firebase Auth Identity Toolkit REST API dan menerbitkan Custom Token yang ditandatangani Firebase Admin SDK.
  3. Akun dinonaktifkan (`status: 'suspended' | 'disabled'`) langsung ditolak dengan kode HTTP `403 Forbidden`.
  4. Penggantian kata sandi (`/api/auth/change-password`) mewajibkan token sesi pemanggil terotentikasi; hanya dapat mengubah kata sandi akun sendiri atau oleh Owner/Manager dengan izin `employees.manage`. Tidak ada plaintext maupun hash yang disimpan di Firestore.

### 2.2 Otorisasi Server & RBAC (Fase 2)
- **Temuan Semula**: Route API membaca data `role`, `permissions`, atau `userId` dari request body yang dikirim oleh browser klien, sehingga rentan manipulasi parameter (IDOR & Privilege Escalation).
- **Pembaruan Terverifikasi**:
  1. Dibangun helper terpusat di [`src/lib/server/auth-guard.ts`](file:///d:/TK%20R01/src/lib/server/auth-guard.ts):
     - `requireAuthenticatedUser(request)`: Mengekstrak dan memverifikasi Firebase ID Token dari header `Authorization: Bearer <token>`.
     - `requireBusinessMembership(businessId, userId)`: Memeriksa keanggotaan nyata dalam subkoleksi `businesses/{businessId}/members/{userId}` atau pemilik sah bisnis (`businesses/{businessId}.ownerId`).
     - `requireBusinessPermission(businessId, userId, permission)`: Memvalidasi izin operasional (RBAC).
     - `requireBranchAccess(businessId, userId, branchId)`: Memvalidasi hak akses ke cabang target.
  2. Seluruh identitas pemanggil diambil secara otoritatif dari token yang terverifikasi, bukan dari isi JSON permintaan.

### 2.3 Persistensi Data Cloud Firestore & Sinkronisasi (Fase 3)
- **Temuan Semula**: State POS bertumpu pada `localStorage.setItem('tokokoe_mvp_store_v1')`, menyebabkan transaksi hilang saat ganti perangkat atau buka multi-tab.
- **Pembaruan Terverifikasi**:
  1. Dibangun modul [`src/lib/services/firestore-repository.ts`](file:///d:/TK%20R01/src/lib/services/firestore-repository.ts) dengan Firestore real-time snapshot listeners (`onSnapshot`).
  2. Komponen `BusinessContext.tsx` mendengarkan perubahan langsung dari server. LocalStorage hanya berfungsi sebagai cache hidrasi non-kritis dan preferensi tampilan UI.

### 2.4 POS Shared Checkout & Transaksi Atomik (Fase 4)
- **Temuan Semula**: Komponen POS kasir memanggil fungsi lokal yang memotong stok di memori browser sebelum server mengonfirmasi.
- **Pembaruan Terverifikasi**:
  1. Seluruh varian POS (F&B, Retail, Phone Store) kini memanggil modul terpusat [`src/lib/services/checkout-service.ts`](file:///d:/TK%20R01/src/lib/services/checkout-service.ts).
  2. Server `/api/sales/checkout`:
     - Membaca harga katalog otoritatif dan menghitung ulang subtotal, diskon, pajak, dan grand total.
     - Menggunakan `adminDb.runTransaction()` di mana **seluruh operasi pembacaan (baca produk, kuantitas stok, status IMEI, dan kunci idempotensi) dieksekusi terlebih dahulu sebelum penulisan**.
     - Menghentikan transaksi dengan kode HTTP `409 Conflict` jika stok tidak mencukupi (anti-overselling).
     - Menyimpan `idempotencyKeys/{key}` deterministik untuk mencegah nota penjualan ganda saat koneksi jaringan drop.
     - UI kasir hanya menampilkan struk transaksi setelah server mengembalikan status konfirmasi `persistedToFirestore: true`.

### 2.5 Penguatan Keamanan Firestore Rules (Fase 5)
- **Temuan Semula**: Aturan Firestore lama memungkinkan anggota bisnis menulis ke koleksi penjualan dan inventaris.
- **Pembaruan Terverifikasi**:
  - Diterapkan pembatasan ketat pada [`firestore.rules`](file:///d:/TK%20R01/firestore.rules):
    ```
    sales, imeiUnits, registeredImeis, imeiHistory, stockAdjustments, purchaseOrders, auditLogs -> allow write: if false;
    ```
  - Pembacaan HPP (`costPrice`) dan laporan finansial dibatasi secara spesifik untuk pemilik, manajer, dan akuntan.

### 2.6 Operasi Toko Handphone & Serialized IMEI (Fase 6)
- **Temuan Semula**: Tidak ada mekanisme pencegahan pendaftaran nomor IMEI yang sama secara konkuren; penyesuaian stok dapat disetujui tanpa validasi perubahan stok terbaru.
- **Pembaruan Terverifikasi**:
  1. Dokumen deterministik `businesses/{businessId}/registeredImeis/{imei}` bertindak sebagai *distributed lock* di dalam transaksi atomik Firestore, menolak scan IMEI duplikat secara instan.
  2. Endpoint `/api/phone/exchange` memperbarui unit lama menjadi `quarantined` dan unit baru menjadi `sold` secara atomik dalam satu transaksi, dilengkapi rekam jejak `imeiHistory`.
  3. Endpoint `/api/inventory/adjustments/review` memverifikasi apakah stok fisik telah berubah dari nilai saat permohonan dibuat sebelum menyetujui perubahan kuantitas.

### 2.7 Keamanan Pembayaran Gateway Midtrans (Fase 7)
- **Temuan Semula**: Pembayaran gateway rentan *fake confirmation* jika tidak ada validasi hash dan jumlah pembayaran.
- **Pembaruan Terverifikasi**:
  1. Webhook memvalidasi tanda tangan SHA-512 `order_id + status_code + gross_amount + ServerKey`.
  2. Memeriksa kecocokan `gross_amount` dengan `sale.grandTotal` di database.
  3. Callback duplikat ditangani secara idempoten tanpa memicu mutasi ulang.
  4. Galat persistensi database mengembalikan status HTTP 500 agar Midtrans mengulang pengiriman webhook secara berkala.

---

## 3. Hasil Pengujian Otomatis (Vitest)

Pengujian dijalankan melalui perintah `npx vitest run`:

```text
 ✓ src/tests/tokokoe.test.ts (14 tests)
 ✓ src/tests/production-audit.test.ts (13 tests)

 Test Files  2 passed (2)
      Tests  27 passed (27)
   Duration  1.06s
```

### Rincian 12 Butir Verifikasi Audit:
1. **Verifikasi 1**: Kata sandi owner yang tidak valid ditolak dengan pesan kesalahan otentik.
2. **Verifikasi 2**: Kata sandi staf yang salah menghasilkan HTTP 401 generik tanpa membocorkan eksistensi akun; akun dinonaktifkan ditolak dengan HTTP 403.
3. **Verifikasi 3**: Akun karyawan dibuat dan dipetakan ke Firebase Auth tanpa pernah menyimpan kata sandi plaintext maupun hash di Firestore.
4. **Verifikasi 4**: Panggilan API tanpa header Authorization Bearer token menghasilkan HTTP 401 Unauthorized.
5. **Verifikasi 5**: Panggilan lintas-bisnis (cross-tenant) diblokir dan menghasilkan HTTP 403 Forbidden.
6. **Verifikasi 6**: Kasir dilarang membaca harga pokok penjualan (HPP / `products.cost.read`).
7. **Verifikasi 7**: Sinkronisasi data katalog produk antar-sesi browser melalui Firestore repository listener.
8. **Verifikasi 8**: Data penjualan tetap tersimpan permanen di database setelah sesi logout dan refresh.
9. **Verifikasi 9**: Dua kasir yang memproses stok terakhir secara konkuren ditolak salah satunya dengan HTTP 409 Conflict.
10. **Verifikasi 10**: Pendaftaran nomor IMEI ganda ditolak secara atomik.
11. **Verifikasi 11**: Pengiriman checkout idempoten tidak menggandakan nota maupun memotong stok ganda.
12. **Verifikasi 12**: Kegagalan database tidak pernah menghasilkan status transaksi sukses palsu (`persistedToFirestore: false` ditolak).

---

## 4. Hasil Kompilasi & Build Produksi

Pengujian build produksi dijalankan via `npm run build`:

```text
▲ Next.js 16.4.0 (Turbopack)
✓ Running next.config.ts took 38ms
- Cache Components enabled
- Partial Prefetching enabled

  Creating an optimized production build ...
✓ Compiled successfully in 2.6s
  Running TypeScript ...
  Finished TypeScript in 4.1s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (32/32) in 1700ms
✓ Finalizing page optimization ...

Exit status: 0 (Sukses)
Total Rute: 32 rute (13 API routes, 19 halaman UI)
Error TypeScript: 0
Lint Warnings: 0
```

---

## 5. Panduan Kredensial Produksi Live

Untuk menjalankan aplikasi dengan koneksi Cloud Firestore langsung dan gateway pembayaran Midtrans live:

1. **Firebase Admin SDK (Service Account)** di `.env.local`:
   ```env
   FIREBASE_PROJECT_ID=tokokoe-saas-prod
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@tokokoe-saas-prod.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```
2. **Midtrans Gateway Key** di `.env.local`:
   ```env
   MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxx
   NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxx
   MIDTRANS_IS_PRODUCTION=false
   ```
3. **Deploy Security Rules**:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```
