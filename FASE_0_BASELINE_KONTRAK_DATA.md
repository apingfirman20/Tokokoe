# FASE 0: BASELINE DAN KONTRAK DATA — TOKOKOE SAAS

**Dokumen:** Baseline Teknis, Audit Kode, Matriks Fitur, dan Kontrak Data  
**Aplikasi:** Tokokoe Multi-Tenant SaaS (Retail Minimarket, Food & Beverage, Phone & Gadget Store)  
**Lingkungan Produksi:** [https://tokokoe-saas.vercel.app/](https://tokokoe-saas.vercel.app/)  
**Lingkungan Staging / Preview:** [https://tokokoe-saas-47v0q2z80-aping1.vercel.app/](https://tokokoe-saas-47v0q2z80-aping1.vercel.app/)  
**Basis Data Cloud:** Google Cloud Firestore (Project: `tokokoe-16bab`)  
**Tanggal Baseline:** 14 Oktober 2026  
**Status Baseline:** **TERVERIFIKASI (51/51 Vitest PASS, tsc --noEmit 0 Errors, Build 34 Routes PASS)**

---

## 1. PEMETAAN MENYELURUH ARSITEKTUR SISTEM

### 1.1. Pemetaan Halaman Antarmuka (18 Halaman Next.js App Router)
| Rute Halaman | Modul Bisnis | Deskripsi & Kontrol Akses |
| :--- | :--- | :--- |
| `/` | Landing | Halaman beranda publik, portal navigasi produk & fitur |
| `/login` | Otentikasi | Login Owner (Email/Password) dan Staff (Username/Password via Admin SDK) |
| `/register` | Onboarding | Registrasi Owner baru & inisialisasi akun |
| `/businesses` | Multi-Tenant | Hub pemilih bisnis/cabang milik Owner atau yang ditugaskan ke Staff |
| `/businesses/new` | Onboarding | Wizard pembuatan bisnis baru dengan inisialisasi modul & cabang utama |
| `/app/[businessId]/dashboard` | Semua Modul | Metrik ringkasan omzet, grafik penjualan, transaksi terbaru, low stock alerts |
| `/app/[businessId]/pos` | Ritel, F&B, Phone | Layar POS adaptif multi-layar sesuai jenis usaha aktif |
| `/app/[businessId]/products` | Semua Modul | Manajemen katalog produk, deteksi tipe barcode, harga jual, dan HPP modal |
| `/app/[businessId]/inventory` | Ritel & Phone | Ikhtisar stok fisik, pengajuan penyesuaian stok (*Stock Opname*), audit ledger |
| `/app/[businessId]/finance` | Finansial | Laporan laba/rugi, pencatatan beban kas, ringkasan margin (Owner/Manager) |
| `/app/[businessId]/employees` | HR / Tim | Manajemen staf, pembagian peran RBAC, penerbitan username & reset sandi |
| `/app/[businessId]/reports` | Analitik | Rekapitulasi penjualan per kasir, metode bayar, dan ekspor data laporan |
| `/app/[businessId]/settings` | Pengaturan | Profil usaha, tarif pajak (PPN), service charge, dan footer struk nota |
| `/app/[businessId]/fnb/tables` | F&B Resto/Kafe | Denah tata letak meja, status okupansi (Kosong, Terisi, Billing), pesanan aktif |
| `/app/[businessId]/fnb/kitchen` | F&B Resto/Kafe | Kitchen Display System (KDS), antrean tiket pesanan (*New, Cooking, Ready*) |
| `/app/[businessId]/phone/sell-in`| Phone Store | Penerimaan gadget pelanggan (Trade-in/Buy) & penerimaan parsial PO distributor |
| `/app/[businessId]/phone/imei` | Phone Store | Pelacak inventaris unit berseri, status siklus hidup 8-state, dual-SIM & SN |
| `/app/[businessId]/phone/exchange`| Phone Store | Alur tukar garansi resmi unit rusak ke unit pengganti dengan karantina atomik |

---

### 1.2. Pemetaan API Endpoints (13 Backend Routes)
| Metode & Endpoint | Guard / Otorisasi | Fungsi & Tanggung Jawab Utama |
| :--- | :--- | :--- |
| `POST /api/auth/employee-login` | Publik | Otentikasi kasir via format username (`nama.toko`), mengembalikan Firebase Custom Token |
| `POST /api/auth/change-password` | Bearer Token | Pembaruan kata sandi pertama kali (*forced change*) atau berkala |
| `GET /api/businesses/list` | Bearer Token | Mengambil daftar bisnis sah yang dimiliki atau di mana staf terdaftar |
| `POST /api/businesses/create` | Bearer Token | Membuat dokumen bisnis, cabang default, dan default role members |
| `POST /api/employees/create` | `employees.create` | Mendaftarkan akun staf di Auth & Firestore dengan email virtual unik |
| `POST /api/inventory/adjustments/request`| `inventory.adjust` | Mengajukan penyesuaian selisih stok fisik (*Stock Opname*) oleh staf |
| `POST /api/inventory/adjustments/review` | `approvals.manage` | Persetujuan/penolakan penyesuaian stok oleh Owner; mencatat `StockMovement` |
| `POST /api/phone/purchase-orders` | `inventory.receive` | Pembuatan PO ke distributor dengan kuota item dan HPP vendor |
| `POST /api/phone/purchase-orders/receive` | `inventory.receive` | Penerimaan parsial/penuh PO dengan validasi Luhn IMEI & lock duplikasi |
| `POST /api/phone/exchange` | `sales.create` | Pertukaran garansi atomik: unit rusak -> `'quarantined'`, unit baru -> `'sold'` |
| `POST /api/sales/checkout` | `sales.create` | Transaksi kasir atomik (`runTransaction`), kurangi stok, kunci unit IMEI, buat nota |
| `POST /api/seed` | Development | Inisialisasi data demo untuk testing onboarding dan pengujian E2E |
| `POST /api/webhooks/midtrans` | Midtrans Sign | Webhook verifikasi pembayaran digital non-tunai (QRIS / VA) |

---

### 1.3. Pemetaan Firestore Security Rules (`firestore.rules`)
- **Isolasi Tenant:** Fungsi pembantu `isOwnerOf(businessId)` dan `isMemberOf(businessId)` menjamin kasir atau pedagang dari bisnis A tidak dapat membaca atau menulis data bisnis B.
- **Proteksi HPP Modal:**
  - Koleksi `purchaseOrders` dibatasi secara ketat hanya untuk peran `owner`, `manager`, dan `warehouse`. Kasir dilarang membaca (`PERMISSION_DENIED`).
  - Koleksi `financialRecords` hanya untuk `owner`, `manager`, dan `accountant`.
  - Koleksi `auditLogs` hanya untuk `owner` dan `manager`.
- **Integritas Transaksi & Inventaris:**
  - `sales`, `imeiUnits`, `registeredImeis`, `imeiHistory`, `stockMovements`, dan `stockAdjustments` memiliki aturan `allow write: if false;`. Seluruh mutasi hanya boleh dieksekusi melalui transaksi atomik Firebase Admin SDK di backend server.

---

### 1.4. Pemetaan Peran & Hak Akses (RBAC — `src/lib/permissions.ts`)
| Role | Izin Utama yang Dimiliki | Pembatasan Kritis |
| :--- | :--- | :--- |
| **Owner** | Seluruh 18 hak akses (Katalog, HPP, Penjualan, Finansial, HR, Pengaturan) | Tidak ada batasan |
| **Manager** | Operasional harian, HPP modal, approval stok, kelola karyawan, laporan | Tidak dapat menghapus tenant |
| **Cashier** | `products.read`, `sales.create`, `sales.read`, `inventory.read`, `shift.manage` | **DILARANG:** `products.cost.read`, `finance.read`, `approvals.manage`, `inventory.receive` |
| **Warehouse**| `products.read`, `inventory.read`, `inventory.receive`, `inventory.adjust` | Dilarang akses finansial laba rugi & penjualan kasir |
| **Waiter** | `products.read`, `sales.create`, `sales.read` | Dilarang akses HPP, penerimaan barang, dan pengaturan |
| **Kitchen** | `sales.read` (khusus tiket KDS dapur) | Dilarang membuat pesanan atau mengubah katalog |
| **Accountant**| `sales.read`, `finance.read`, `reports.read`, `products.cost.read` | Dilarang mengeksekusi kasir checkout langsung |
| **Technician**| `products.read`, `inventory.read`, `sales.create` | Khusus modul servis dan tukar tambah handphone |

---

### 1.5. Pemetaan Langganan Real-Time Firestore (`subscribeToBusinessTenant`)
Klien mendengarkan pembaruan realtime pada:
1. `businesses/{id}/products` (Sinkronisasi katalog & stok)
2. `businesses/{id}/sales` (Limit 50 transaksi terbaru)
3. `businesses/{id}/imeiUnits` (Status ketersediaan fisik IMEI)
4. `businesses/{id}/stockAdjustments` (Status pengajuan opname)
5. `businesses/{id}/purchaseOrders` (Khusus akun dengan izin; kasir diskip secara aman)
6. `businesses/{id}/imeiHistory` (Audit trail fisik unit)

---

## 2. VERIFIKASI TEMUAN AUDIT TERHADAP KODE TERKINI

| ID Isu | Temuan Awal Audit | Status Saat Ini | Bukti dalam Kode Sumber Terkini |
| :---: | :--- | :---: | :--- |
| **AUD-01** | Header Bearer hilang pada request Purchase Order | **FIXED** | [src/context/BusinessContext.tsx](file:///d:/TK%20R01/src/context/BusinessContext.tsx#L630-L640) menyertakan `Authorization: Bearer <token>`. |
| **AUD-02** | Header Bearer hilang pada request Sell-In | **FIXED** | Direct sell-in memvalidasi token dan memanggil Firestore secara tersanitasi. |
| **AUD-03** | Langganan riwayat IMEI belum realtime | **FIXED** | [firestore-repository.ts](file:///d:/TK%20R01/src/lib/services/firestore-repository.ts#L135-L148) memasang listener `imeiHistory`. |
| **AUD-04** | Banner error checkout saat stok habis tidak muncul | **FIXED** | [RetailPosScreen.tsx](file:///d:/TK%20R01/src/components/pos/RetailPosScreen.tsx#L250-L260) menampilkan banner merah saat HTTP 400. |
| **AUD-05** | Pemuatan tipe bisnis tidak presisi | **FIXED** | [BusinessContext.tsx](file:///d:/TK%20R01/src/context/BusinessContext.tsx#L250-L260) memetakan modul sesuai enum `BusinessType`. |
| **AUD-06** | Antarmuka Phone POS tidak responsif di layar mobile | **FIXED** | Grid layout responsif `grid-cols-1 lg:grid-cols-12` di [PhonePosScreen.tsx](file:///d:/TK%20R01/src/components/pos/PhonePosScreen.tsx). |
| **AUD-07** | ID produk fiktif diterima pada checkout | **FIXED** | [checkout/route.ts](file:///d:/TK%20R01/src/app/api/sales/checkout/route.ts#L110-L125) memvalidasi eksistensi dokumen produk di Firestore. |
| **AUD-08** | Validasi IMEI menerima checksum salah (`...001` & `...002`) | **FIXED** | Algoritma Luhn di [imei.ts](file:///d:/TK%20R01/src/lib/validation/imei.ts) menolak digit ke-15 yang tidak menghasilkan `sum % 10 === 0`. |
| **AUD-09** | Nomor Seri fisik tercampur dengan nomor IMEI | **FIXED** | Properti `serialNumber` dipisahkan dari `imei` dan `imei2` pada model [types/index.ts](file:///d:/TK%20R01/src/types/index.ts#L133). |
| **AUD-10** | Barcode internal tertolak karena bukan EAN-13 | **FIXED** | [barcode.ts](file:///d:/TK%20R01/src/lib/validation/barcode.ts#L125-L145) mendukung tipe `INTERNAL` untuk kode alfanumerik bebas. |
| **AUD-11** | Kasir berpotensi mengintip HPP modal di Firestore/API | **FIXED** | Rules mengunci `purchaseOrders`, API mengunci 403, dan state klien memotong `costPrice: 0`. |

---

## 3. MATRIKS FITUR: RETAIL, F&B, DAN PHONE STORE

| Modul | Fitur Fungsional | Status Saat Ini | Keterangan Teknis |
| :--- | :--- | :---: | :--- |
| **Ritel** | Scanning Barcode Keyboard Hardware | **Tersedia** | Prioritas kecocokan eksak barcode di atas filter teks nama |
| **Ritel** | Validasi Check Digit EAN-13 GTIN | **Tersedia** | Kalkulasi modulo-10 bobot ganjil x1, genap x3 |
| **Ritel** | Barcode Internal Kustom (Alfanumerik) | **Tersedia** | Tipe `INTERNAL` diterima tanpa paksaan rumus EAN |
| **Ritel** | Pencegahan Duplikasi Barcode Katalog | **Tersedia** | Validasi `checkDuplicateBarcode` pada modal produk |
| **Ritel** | Pemotongan Stok Transaksi Atomik | **Tersedia (Tenant-Wide)** | Menggunakan `runTransaction` Firestore pada `product.stockQty` |
| **Ritel** | Buku Besar Audit Mutasi (`StockMovement`) | **Tersedia** | Mencatat riwayat append-only setiap penjualan & opname |
| **Ritel** | Manajemen Shift & Kas Laci Kasir | **Tersedia** | Buka/tutup shift kasir dengan rekonsiliasi uang fisik |
| **Ritel** | Penyesuaian Stok (*Stock Opname Approval*) | **Tersedia** | Kasir mengajukan (`pending`), Owner menyetujui (`approved`) |
| **Ritel** | Pembagian Stok Terpisah per Cabang | **Belum Tersedia** | Struktur data saat ini `product.stockQty` berskala bisnis (*Tenant-Wide*) |
| **Ritel** | Penerimaan PO Khusus Barang Grosir FMCG | **Lokal Saja** | Alur PO saat ini difokuskan pada unit berseri gadget |
| **Phone** | Validasi IMEI 15 Digit Algoritma Luhn | **Tersedia** | Wajib lolos check digit ke-15 di client dan server |
| **Phone** | Dukungan Dual-SIM (IMEI 1 & IMEI 2) | **Tersedia** | IMEI 2 opsional, dilarang identik dengan IMEI 1 |
| **Phone** | Pemisahan Serial Number Perangkat | **Tersedia** | Tersimpan pada atribut `serialNumber` terpisah |
| **Phone** | Siklus Hidup Status Serial 8-State | **Tersedia** | `available, reserved, sold, quarantined, returned, transferred, exchanged_out, returned_to_supplier` |
| **Phone** | Penerimaan PO Parsial & Kunci Duplikasi | **Tersedia** | Kuota item dijaga ketat; lock deterministik di `registeredImeis` |
| **Phone** | Penjualan Kasir Khusus Unit Tersedia | **Tersedia** | Menolak unit yang berstatus `sold` atau `quarantined` |
| **Phone** | Alur Tukar Garansi Resmi & Karantina | **Tersedia** | Unit cacat otomatis berstatus `quarantined`, unit baru `sold` |
| **Phone** | Histori Audit Dua Arah Pertukaran Unit | **Tersedia** | Mencatat referensi timbal balik di dokumen `imeiHistory` |
| **Phone** | Transfer Fisik IMEI Antar Cabang Toko | **Belum Tersedia** | Status `'transferred'` tersedia, namun formulir transfer cabang belum ada |
| **F&B** | Manajemen Meja & Denah Ruangan (Dine-in) | **Tersedia (Lokal/Demo)**| Layout meja visual dengan status kosong/terisi |
| **F&B** | Kitchen Display System (KDS) Antrean Tiket | **Tersedia (Lokal/Demo)**| Status pesanan dapur: *New -> Cooking -> Ready -> Served* |
| **F&B** | Checkout Meja & Billing Nota Resto | **Tersedia** | Perhitungan subtotal, pajak restoran (PB1), dan service charge |
| **F&B** | Opsi Tambahan / Modifier Menu (Es, Gula) | **Tersedia** | Skema `options` dan `modifiers` ada di antarmuka |
| **F&B** | Pemotongan Bahan Baku (*Recipe BOM*) | **Belum Tersedia** | Stok saat ini memotong item menu jadi, bukan bahan mentah |
| **F&B** | Pisah Tagihan Kasir (*Split Bill*) | **Belum Tersedia** | Satu meja dibayar dalam satu faktur transaksi penuh |

---

## 4. IDENTIFIKASI SUMBER KEBENARAN (*SOURCE OF TRUTH*)

| Entitas Data | Sumber Kebenaran Otoritatif (*Authoritative Store*) | Keterangan & Akses |
| :--- | :--- | :--- |
| **Identitas & Kredensial Akun** | Firebase Authentication + Firestore `users/{uid}` | Dikelola via Firebase Auth Engine |
| **Bisnis & Keanggotaan RBAC** | Firestore `businesses/{id}/members/{uid}` | Diverifikasi server-side via token claims & Admin SDK |
| **Registrasi Cabang** | Firestore `businesses/{id}/branches/{branchId}` | Dibuat dan dikelola eksklusif oleh Owner |
| **Katalog Produk & Harga Jual** | Firestore `businesses/{id}/products/{productId}` | Diupdate oleh Manager/Owner; dibaca oleh kasir |
| **Kuantitas Stok Produk (Ritel/F&B)** | Firestore `businesses/{id}/products/{productId}.stockQty` | Dimutasi atomik di dalam `runTransaction` `/api/sales/checkout` |
| **Buku Besar Mutasi Inventaris** | Firestore `businesses/{id}/stockMovements/{movementId}` | Append-only ledger mutasi stok tidak dapat diubah/dihapus |
| **Status Unit Berseri (IMEI)** | Firestore `businesses/{id}/imeiUnits/{unitId}` | Diperbarui atomik saat PO, penjualan, dan garansi |
| **Kunci Pencegah Duplikat IMEI** | Firestore `businesses/{id}/registeredImeis/{imei}` | Dokumen deterministik sebagai mutex lock konkurensi |
| **Faktur & Transaksi Penjualan** | Firestore `businesses/{id}/sales/{saleId}` | Diterbitkan hanya oleh endpoint checkout server |
| **Purchase Order Distributor** | Firestore `businesses/{id}/purchaseOrders/{poId}` | Sumber kebenaran kuota pemesanan & HPP vendor |
| **Sesi Kasir (Cash Shift)** | Firestore `businesses/{id}/cashSessions/{sessionId}` | Rekam jejak laci kasir per cabang dan kasir |

---

## 5. PENETAPAN KONTRAK DATA & STRUKTUR IDENTIFIER

### 5.1. Format Identifier Standar
- `businessId`: `biz_<timestamp>_<random4>` (contoh: `biz_1791857791689_j3t9`)
- `branchId`: `br_<timestamp>_<slug>` (contoh: `br_1791857791689_main`)
- `productId`: `prod_<timestamp>_<random4>`
- `imeiUnitId`: `imei_<timestamp>_<random4>`
- `saleId`: `sale_<timestamp>_<random5>`
- `saleNumber`: `TRX-<YYYYMMDD>-<4RANDOM_ALPHANUM>` (contoh: `TRX-20261014-7IXA`)
- `poId`: `po_<timestamp>_<random4>`
- `poNumber`: `PO-<YYYYMM>-<3DIGIT>` (contoh: `PO-202610-522`)
- `adjustmentId`: `adj_<timestamp>_<random4>`
- `cashSessionId`: `shift_<timestamp>_<random4>`
- `exchangeId`: `EXC-<timestamp>-<random4>`

### 5.2. Kontrak Invarian Stok (Stock Invariants)
1. `Product.stockQty` bernilai integer (>= 0).
2. Transaksi kasir dilarang menghasilkan stok negatif kecuali parameter bisnis `allowNegativeStock: true` aktif.
3. Setiap mutasi stok wajib menulis dokumen [StockMovement](file:///d:/TK%20R01/src/types/index.ts#L200):
   $$\text{newQty} = \text{previousQty} + \text{quantityDelta}$$
4. Untuk produk berseri gadget:
   $$\text{product.stockQty} = \sum \text{ImeiUnit} \text{ (berstatus 'available')}$$

### 5.3. Kontrak Pembayaran & Status Pesanan
- **Payment Status:** `'pending'` | `'paid'` | `'failed'` | `'refunded'`
- **Order Status:**
  - Ritel & Phone: Otomatis `'served'` saat checkout tuntas.
  - F&B: `'new'` -> `'cooking'` -> `'ready'` -> `'served'` -> `'completed'`
- **Cash Session:** `'open'` (shift aktif) | `'closed'` (shift ditutup dengan rekonsiliasi selisih kas).

### 5.4. Kontrak Unit IMEI
- Tepat 15 digit angka yang wajib lolos formula check digit Luhn.
- Hanya unit berstatus `'available'` yang diizinkan untuk dipilih dan dijual di kasir.
- Unit retur garansi rusak wajib masuk status `'quarantined'` dan **dilarang langsung berstatus `'available'`**.

---

## 6. ANALISIS STOK: TENANT-WIDE VS BRANCH-SPECIFIC

> [!IMPORTANT]
> **Klarifikasi Otoritatif:**  
> Berdasarkan audit mendalam terhadap skema data dan kode transaksi saat ini:
> 1. **Produk Retail dan F&B:** Stok kuantitas (`Product.stockQty`) tersimpan langsung pada dokumen produk di level bisnis (`businesses/{businessId}/products/{productId}`). **Tidak ada partisi stok per cabang pada dokumen produk saat ini.** Oleh karena itu, stok Retail & F&B adalah **TENANT-WIDE (Per Usaha)**. Meskipun transaksi checkout mencatat `branchId` untuk pelaporan lokasi penjualan, pengurangan stok fisik terjadi pada stok global bisnis.
> 2. **Unit Berseri Handphone (`ImeiUnit`):** Setiap unit fisik IMEI memiliki atribut `branchId` (`businesses/{businessId}/imeiUnits/{unitId}` -> `branchId: string`). Sehingga lokasi fisik unit IMEI bersifat **BRANCH-SPECIFIC (Per Cabang)**. Namun total stok induk `product.stockQty` tetap mencerminkan agregasi tenant-wide.
> 
> **Pernyataan Kontrak:** Jangan mengklaim sistem mendukung multi-cabang terisolasi penuh untuk kuantitas produk ritel non-serial sebelum skema partisi stok per cabang diimplementasikan secara resmi.

---

## 7. SPESIFIKASI DATA UJI TERISOLASI (BASELINE TEST FIXTURES)

Untuk mencegah kontaminasi data produksi, telah disiapkan fixture uji terisolasi minimal:

```typescript
// Tenant 1: Retail Business
export const FIXTURE_TENANT_RETAIL = {
  id: 'biz_retail_e2e_test',
  name: 'Retail E2E Testing',
  type: 'retail' as const,
  branches: [
    { id: 'br_retail_main', name: 'Toko Utama', isMain: true },
    { id: 'br_retail_cabang2', name: 'Cabang Pasar Baru', isMain: false }
  ],
  products: [
    {
      id: 'prod_mineral_600',
      name: 'Air Mineral 600ml',
      barcode: '8996001414002', // EAN-13 Valid check digit = 2
      barcodeType: 'EAN13' as const,
      costPrice: 3000,
      sellingPrice: 5000,
      stockQty: 10,
      trackStock: true,
      available: true
    },
    {
      id: 'prod_snack_custom',
      name: 'Keripik Tempe Super',
      barcode: 'SNK-TEMPE-01', // Internal Barcode Valid
      barcodeType: 'INTERNAL' as const,
      costPrice: 7000,
      sellingPrice: 10000,
      stockQty: 5,
      trackStock: true,
      available: true
    }
  ]
};

// Tenant 2: Phone Store Business
export const FIXTURE_TENANT_PHONE = {
  id: 'biz_phone_e2e_test',
  name: 'Konter HP E2E Testing',
  type: 'phone_store' as const,
  branches: [
    { id: 'br_phone_main', name: 'Konter Pusat', isMain: true },
    { id: 'br_phone_cabang2', name: 'Outlet Mall', isMain: false }
  ],
  products: [
    {
      id: 'prod_iphone_15_pro',
      name: 'iPhone 15 Pro 128GB',
      costPrice: 15000000,
      sellingPrice: 18000000,
      stockQty: 2,
      trackStock: true,
      available: true
    }
  ],
  dualSimDevices: [
    {
      imei1: '860123456789006', // Valid Luhn check digit 6
      imei2: '860123456789014', // Valid Luhn check digit 4
      serialNumber: 'SN-APPLE-15P-001',
      status: 'available' as const,
      branchId: 'br_phone_main'
    },
    {
      imei1: '358941091234560', // Valid Luhn check digit 0
      imei2: '356611095551206', // Valid Luhn check digit 6
      serialNumber: 'SN-SAMS-S24-002',
      status: 'available' as const,
      branchId: 'br_phone_cabang2'
    }
  ]
};
```

---

## 8. HASIL VERIFIKASI BASELINE SISTEM

1. **Typecheck TypeScript (`npx tsc --noEmit`):**
   * **Hasil:** `Exit Code: 0` (0 errors terdeteksi).
2. **Suite Pengujian Unit & Integrasi (`npx vitest run`):**
   * **Hasil:** `51 passed (51 total tests across 4 test files)`, `Exit Code: 0`.
   * `src/tests/onboarding-zero-demo.test.ts`: 5 tests passed
   * `src/tests/r02-stabilization.test.ts`: 19 tests passed
   * `src/tests/tokokoe.test.ts`: 14 tests passed
   * `src/tests/production-audit.test.ts`: 13 tests passed
3. **Kompilasi Produksi Turbopack (`npm run build`):**
   * **Hasil:** `Exit Code: 0` (34 rute Next.js App Router sukses teroptimasi).
4. **Smoke Test Staging Preview:**
   * URL: `https://tokokoe-saas-47v0q2z80-aping1.vercel.app`
   * Respons HTTP: `200 OK`
   * Alur Sell-In IMEI, proteksi HPP kasir, dan integrasi Firestore berjalan normal.

---

## 9. PANDUAN MIGRASI DATA AMAN (*ZERO DATA LOSS*)

Menjelang fase implementasi lanjutan:
1. **Dilarang Menghapus Data Lama:** Data penjualan, transaksi historis, dan unit IMEI merchant eksisting yang dibuat sebelum R02 tidak boleh dimodifikasi atau dihapus secara otomatis.
2. **Backward Compatibility Status:** Jika terdapat dokumen lama yang belum memiliki field baru (seperti `barcodeType`, `imei2`, atau `serialNumber`), kode backend dan frontend wajib memperlakukan field tersebut sebagai opsional (*nullable fallback*).
3. **Pemberian Flag Non-Destruktif:** Fungsi `getImeiRecordStatus` menandai unit apakah lolos Luhn atau memerlukan verifikasi fisik, tanpa mengunci atau menghapus riwayat penjualan masa lalu pedagang.

---

## 10. URUTAN PERUBAHAN TAHAPAN BERIKUTNYA

Agar stabilitas sistem tetap terjaga, perubahan pada fase berikutnya harus mengikuti urutan konsisten:
1. **Fase 1 (IMEI Hardening):** Integrasi ketat modul `imei.ts` ke seluruh titik sentuh input serial.
2. **Fase 2 (Barcode Engine):** Penguatan pemindaian barcode hardware dan deteksi EAN-13 vs internal.
3. **Fase 3 (Authoritative Stock):** Eksekusi transaksi atomik Firestore dan pencatatan buku besar `StockMovement`.
4. **Fase 4 (PO & Warranty):** Penguncian alur parsial PO dan penanganan garansi karantina unit rusak.
5. **Fase 5 (Security & Audit):** Validasi isolasi multi-tenant dan proteksi HPP kasir di level Firestore & API.
6. **Fase 6 (Staging Verification & Deployment):** Verifikasi browser E2E di lingkungan staging sebelum rilis produksi.
