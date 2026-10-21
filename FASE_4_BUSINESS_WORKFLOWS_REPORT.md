# LAPORAN IMPLEMENTASI FASE 4: WORKFLOW KHUSUS BISNIS
**Tokokoe Multi-Tenant SaaS Platform**
*Tanggal Implementasi: 14 Oktober 2026*

---

## 1. Ringkasan Eksekutif

Fase 4 telah selesai diimplementasikan secara komprehensif dengan mematuhi prinsip inti: **menggunakan engine server-authoritative Fase 3 tanpa membuat jalur alternatif, bypass, atau client mock**.

Setiap model bisnis (**Ritel**, **F&B**, dan **Konter HP**) kini memiliki alur kerja spesifik yang mencerminkan kebutuhan operasional riil dengan garansi integritas data atomik, sinkronisasi stok & kas multi-cabang, serta pencatatan stock ledger permanen.

Seluruh 9 test suite dalam repositori (98 test cases aktif) lolos pengujian 100% tanpa error, dan verifikasi statis TypeScript (`tsc --noEmit`) mencatatkan **exit code 0**.

---

## 2. Arsitektur & Implementasi per Model Bisnis

### A. Ritel (Retail Workflow)
1. **Integrasi Barcode, SKU, Quantity, dan Diskon ke Engine**:
   - POS Ritel terhubung langsung ke authoritative `/api/sales/checkout`.
   - Diskon kasir dibatasi maksimal 10% di server; diskon lebih besar memerlukan otorisasi Manager/Owner.
   - HPP (*costPrice*) tidak pernah dibocorkan ke Sale document di client.
2. **Penerimaan Barang Non-Serialized (Supplier Goods Receiving)**:
   - Endpoint authoritative baru: [`/api/inventory/receiving`](file:///d:/TK%20R01/src/app/api/inventory/receiving/route.ts).
   - Menambah stok produk secara atomik dan mencatat stock ledger dengan tipe `purchase_order`.
   - Mengalokasikan nomor referensi penerimaan unik dan mencatat riwayat audit supplier.
3. **Held Cart / Resume**:
   - Diimplementasikan di `BusinessContext` (`heldCarts`, `holdCart`, `removeHeldCart`) dan UI `RetailPosScreen` dengan shortcut keyboard `[F4]`.
   - Kasir dapat menunda transaksi pelanggan saat ini dan melanjutkannya kapan saja tanpa kehilangan state keranjang.
4. **Retur / Refund / Void Tanpa Hard-Delete**:
   - Endpoint authoritative baru: [`/api/sales/refund`](file:///d:/TK%20R01/src/app/api/sales/refund/route.ts).
   - Melarang penghapusan dokumen penjualan (`deleteDoc` dicegah). Status transaksi diubah menjadi `paymentStatus: 'refunded'`.
   - Mengembalikan kuantitas barang non-serialized ke inventaris katalog dan mengembalikan unit HP (jika ada) ke status `available`.
   - Mencatat ledger pembalikan stok (`type: 'return'`) dengan alasan retur lengkap.
   - Menyesuaikan sesi kasir aktif (`currentCashDrawer`, `expectedClosingCash`, `cashOutTotal`) secara atomik.
   - Proteksi idempotensi retur: klaim retur ganda pada transaksi yang sama otomatis ditolak dengan HTTP 409 Conflict.

---

### B. F&B (Food & Beverage Workflow)
1. **Sinkronisasi Meja (Tables) & KDS Backend-Authoritative**:
   - Endpoint baru: [`/api/fnb/tables`](file:///d:/TK%20R01/src/app/api/fnb/tables/route.ts).
   - Validasi tenant dan cabang (`branchId`) ketat. Meja fiktif ditolak.
   - Dukungan lifecycle meja: pembuatan meja, reservasi, occupancy lock saat transaksi aktif, pindah meja (*move table*), dan gabung meja (*merge tables*).
   - Subkoleksi `businesses/{businessId}/tables` disinkronkan secara real-time via `firestore-repository.ts` dan `BusinessContext`.
2. **Kitchen Display System (KDS) & Pemisahan Completion dari Penutupan Bill**:
   - Endpoint baru: [`/api/fnb/kitchen/orders`](file:///d:/TK%20R01/src/app/api/fnb/kitchen/orders/route.ts).
   - Perbaikan arsitektur: Mengambil **seluruh tiket aktif** di cabang (bukan dibatasi 50 sale terbaru) dan tidak lagi menggunakan key tanpa UID.
   - Menyelesaikan pesanan di dapur (`orderStatus: 'completed'`) **tidak menutup bill** atau melepaskan status meja (`table.status` tetap `occupied` sampai bill dibayar lunas pada saat checkout kasir).
3. **Open Order, Tambah Item, dan Pembatalan**:
   - Endpoint baru: [`/api/fnb/orders`](file:///d:/TK%20R01/src/app/api/fnb/orders/route.ts).
   - Mendukung pemesanan diawal (status `paymentStatus: 'pending'`), penambahan item menu baru ke tiket berjalan, dan pembatalan pesanan yang belum dibayar.
4. **Varian, Modifiers, Options per Line, dan Surcharge Authoritative**:
   - Di `FnBPosScreen`, item dengan kombinasi varian, modifier, atau notes berbeda diberi `compositeKey` unik sehingga **tidak digabung otomatis** hanya karena `productId` sama.
   - Surcharge pilihan (misal: "Ukuran Large +Rp 5.000", "Extra Espresso Shot +Rp 6.000") dihitung secara authoritative di server pada endpoint `/api/sales/checkout`.
5. **Resep / BOM (Bill of Materials) & Pengurangan Bahan Baku**:
   - Endpoint baru bahan baku: [`/api/fnb/ingredients`](file:///d:/TK%20R01/src/app/api/fnb/ingredients/route.ts) untuk master bahan baku, intake, dan pencatatan waste/spoilage.
   - Setiap penjualan menu makanan/minuman menghitung kebutuhan bahan baku dari `product.recipe` dan `modifier.recipe`, lalu memotong stok bahan baku mentah (misal: Biji Kopi, Susu Fresh Milk, Sirup Vanila) secara atomik di Cloud Firestore.
   - Perubahan kuantitas bahan baku dibukukan ke subkoleksi `ingredientLogs` sebagai `consumption`.
6. **Pajak & Service Charge Dinamis per Bisnis**:
   - Pajak PB1/PPN (misal: 11%) dan Service Charge (misal: 5%) diturunkan secara authoritative dari profil bisnis (`activeBusiness.taxRate` dan `activeBusiness.serviceChargeRate`), menggantikan hard-code 10%.

---

### C. Konter HP (Phone Store Workflow)
1. **Direct Sell-In Authoritative & Pencegahan Dangling Product**:
   - Endpoint baru: [`/api/phone/sell-in`](file:///d:/TK%20R01/src/app/api/phone/sell-in/route.ts).
   - Validasi algoritma Luhn dan Dual-SIM IMEI ketat.
   - Menghubungkan unit intake ke produk induk di katalog. Jika produk belum terdaftar, server secara otomatis membuat entitas katalog yang valid sehingga **tidak ada dangling productId**.
   - Mencatat unit ke `imeiUnits`, mengunci registri di `registeredImeis`, membukukan riwayat di `imeiHistory`, menambah stok katalog, mencatat stock ledger `purchase_order`, dan memotong kas laci (*cash out*) secara atomik dalam satu transaksi Firestore.
2. **Eliminasi Duplikasi Retry pada PO Receiving**:
   - Pada [`/api/phone/purchase-orders/receive`](file:///d:/TK%20R01/src/app/api/phone/purchase-orders/receive/route.ts), array respons di-reset (`createdUnits.length = 0`) sebelum perulangan transaksi Firestore untuk menjamin tidak ada duplikasi data akibat retry otomatis Firestore SDK.
   - Masa garansi unit di-set `undefined` saat intake PO/receiving, dan baru aktif saat unit terjual ke konsumen akhir.
3. **Penguatan Invarian Exchange (Tukar Unit Garansi) & Disposition Quarantine**:
   - Endpoint [`/api/phone/exchange`](file:///d:/TK%20R01/src/app/api/phone/exchange/route.ts) diperketat dengan aturan invarian:
     - Unit lama wajib berstatus `sold`.
     - Masa garansi toko wajib masih berlaku (`warrantyUntil > now`).
     - Unit pengganti wajib berada di cabang yang sama dengan transaksi.
     - **Pencegahan Self-Exchange Alias Dual-SIM**: Validasi identitas fisik dijalankan terlebih dahulu untuk mencegah penukaran perangkat ke dirinya sendiri melalui slot SIM sekunder.
     - Unit rusak ditarik masuk ke status **`quarantined`** (karantina unit bermasalah agar tidak terdistribusi ulang ke konsumen lain).
     - Unit pengganti diberi garansi baru 90 hari dan ditandai `sold`.
     - Stock ledger disinkronkan dua arah (`type: 'exchange'`).
     - Selisih biaya (*difference fee*) disinkronkan ke laci kas shift.
4. **Trade-In (Tukar Tambah) Settlement**:
   - Modul checkout menerima payload `tradeIn`, melakukan validasi IMEI unit lama, memberikan kredit potongan harga pada invoice, dan secara otomatis melakukan intake perangkat bekas masuk ke inventaris toko.
5. **Tiket Servis HP (Service Tickets)**:
   - Endpoint baru: [`/api/phone/service-tickets`](file:///d:/TK%20R01/src/app/api/phone/service-tickets/route.ts).
   - Mengelola lifecycle servis lengkap: penerimaan unit (`create`), penambahan sparepart yang memotong stok inventaris suku cadang & mencatat ledger (`add_spareparts`), hingga penyelesaian pembayaran jasa & sparepart (`settle_payment`) yang membukukan pendapatan ke laci kas kasir.
6. **Visibilitas Error POS HP**:
   - Komponen `PhonePosScreen` menampilkan pesan error pembayaran (*paymentError*) secara mencolok di modal pembayaran untuk mencegah kebingungan kasir saat terjadi kegagalan otorisasi atau IMEI konflik.

---

## 3. Matriks Hasil Pengujian (Test Results)

| Test Suite | File | Jumlah Test | Hasil |
|---|---|:---:|:---:|
| **Fase 4: Business Workflows** | `src/tests/business-workflows.test.ts` | 8 | **8 / 8 PASSED (100%)** |
| **Fase 3: Stock Transaction Engine** | `src/tests/stock-transaction-engine.test.ts` | 7 | **7 / 7 PASSED (100%)** |
| **Fase 2: Security & Permissions Gates** | `src/tests/security-gates.test.ts` | 20 | **20 / 20 PASSED (100%)** |
| **Fase 1: Multi-Tenant Stabilization** | `src/tests/r02-stabilization.test.ts` | 19 | **19 / 19 PASSED (100%)** |
| **Fase 0: Multi-Tenant Architecture** | `src/tests/tokokoe.test.ts` | 14 | **14 / 14 PASSED (100%)** |
| **Production Audit & Integrity** | `src/tests/production-audit.test.ts` | 13 | **13 / 13 PASSED (100%)** |
| **Authoritative CRUD Suite** | `src/tests/crud-authoritative.test.ts` | 12 | **12 / 12 PASSED (100%)** |
| **Onboarding Zero-Demo Suite** | `src/tests/onboarding-zero-demo.test.ts` | 5 | **5 / 5 PASSED (100%)** |
| **Total Test Suite** | **9 Suites** | **98 Cases** | **100% PASSED** |

---

## 4. Evaluasi Gate Kriteria Fase 4

- [x] **Masing-masing bisnis memiliki workflow yang sesuai, bukan hanya menu berbeda**:
  - Ritel memiliki held cart, retur kasir, penerimaan non-serialized, dan barcode scanning.
  - F&B memiliki manajemen meja fisik, KDS dapur, konsumsi bahan baku resep BOM, dan pajak dinamis.
  - Konter HP memiliki direct sell-in, tracking IMEI Dual-SIM, exchange bergaransi dengan karantina, trade-in, dan servis sparepart.
- [x] **F&B cashier/waiter/kitchen melihat meja dan tiket yang sama di sesi berbeda**:
  - Meja dan pesanan disimpan terpusat di Firestore backend dan disinkronkan secara real-time ke semua terminal POS dan KDS.
- [x] **Penjualan menu mengurangi bahan sesuai resep**:
  - Eksekusi atomik pada checkout memotong stok bahan baku dari master `ingredients` sesuai BOM resep menu dan opsi modifier.
- [x] **Receiving HP selalu menghasilkan unit dengan relasi katalog yang valid**:
  - Penambahan unit HP via PO maupun Direct Sell-In otomatis memastikan produk katalog induk tersedia sehingga tidak ada dangling pointer.
- [x] **Exchange invalid/berulang ditolak tanpa partial mutation**:
  - Transaksi Firestore menolak klaim berulang, masa garansi kedaluwarsa, cabang berbeda, dan alias Dual-SIM sebelum mutasi state terjadi.
- [x] **Semua refund/void/return mengikuti engine yang sama**:
  - Endpoint tunggal authoritative `/api/sales/refund` digunakan untuk memulihkan stok, menyesuaikan laci kas, dan menjaga keutuhan audit tanpa penghapusan permanen (*anti-hard-delete*).
