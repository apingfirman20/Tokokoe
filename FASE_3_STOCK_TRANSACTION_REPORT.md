# LAPORAN IMPLEMENTASI FASE 3: ENGINE STOK DAN TRANSAKSI
**Tokokoe Multi-Tenant SaaS Platform**
*Tanggal Eksekusi: 14 Oktober 2026*
*Status: LULUS GATE AUDIT & VERIFIKASI (90 Tests Passed)*

---

## 1. Ringkasan Eksekutif

Fase 3 bertujuan mengamankan seluruh siklus pergerakan inventaris dan integritas transaksi finansial secara **Server-Authoritative**. Sebelum fase ini, mutasi stok rentan terhadap modifikasi langsung (`PUT /api/products`), diskon kasir dapat dimanipulasi di sisi client, approval penyesuaian stok dapat menimpa (stale overwrite) penjualan yang terjadi di sela-sela waktu pengajuan, sesi kasir (shift) hanya aktif di F&B tanpa proteksi double-session, dan unit perangkat berseri (IMEI/Dual-SIM) belum terisolasi secara kuat dari duplikasi kuantitas atau branch mismatch.

Semua celah tersebut kini telah ditutup dengan kontrol server-side yang ketat, idempotensi transaksi berbasis sidik jari request (*request fingerprinting*), pencatatan buku besar stok (*stock ledger*) komprehensif, dan verifikasi otomatis melewati 90 uji otomatis (*Vitest suite*).

---

## 2. Rincian Implementasi per Komponen

### A. Stock Ledger (Server-Authoritative Inventory Movement)
1. **Pergerakan Stok Terkatalog Lengkap**:
   - Mendukung tipe mutasi: `opening_balance`, `sale`, `receiving`, `adjustment`, `return`, `exchange`.
   - Menghubungkan setiap mutasi dengan `businessId`, `branchId`, `productId`, `deltaQty`, `balanceBefore`, `balanceAfter`, `referenceId`, `creatorId`, dan `timestamp`.
2. **Larangan Edit Stok Langsung Melalui `PUT /api/products`**:
   - Endpoint `PUT /api/products` kini secara eksplisit menolak upaya pengubahan `stockQty` langsung dengan status **HTTP 400 Bad Request**.
   - Perubahan stok hanya diizinkan melalui jalur audit: *Purchase Order Receiving*, *Stock Adjustment Approval*, *POS Checkout*, *Return/Exchange*.
   - Saat produk baru didaftarkan dengan saldo stok awal (`stockQty > 0`), sistem secara otomatis membukukan ledger bertipe `opening_balance`.
3. **Endpoint Buku Besar & Rekonsiliasi**:
   - `GET /api/inventory/ledger`: Menyajikan riwayat mutasi stok per cabang/produk yang dapat difilter dan dipaginasi.
   - Rekonsiliasi otomatis menghitung `openingBalance`, `totalInbound`, `totalOutbound`, dan `netDelta`.

### B. Stock Adjustment Lifecycle & Anti-Stale Protection
1. **Server-Generated Request ID & Pending State**:
   - Pengajuan adjustment (`POST /api/inventory/adjustments/request`) menghasilkan ID berformat `adj_{timestamp}_{random}`.
   - Stok **tidak berkurang atau bertambah** saat pengajuan dibuat (status `pending`).
   - Kasir diberi wewenang mengajukan (`inventory.adjust`), sementara manajer/owner berwenang menyetujui (`approvals.manage`).
2. **Pencegahan Overwrite Stale Request (HTTP 409 Conflict)**:
   - Request menyimpan snapshot stok saat pengajuan (`currentStockAtRequest`).
   - Saat approval (`POST /api/inventory/adjustments/review`), server mengecek apakah stok fisik saat ini masih sama dengan snapshot saat pengajuan.
   - Jika telah terjadi transaksi penjualan/mutasi lain di antara waktu pengajuan dan approval (*intervening sale*), server menolak approval dengan **HTTP 409 Conflict** tanpa mengubah stok sedikit pun.
3. **Rejection Bersih Tanpa Mutasi**:
   - Penolakan permintaan penyesuaian dapat dilakukan kapan saja (bahkan pada request stale) dengan memperbarui status menjadi `rejected` tanpa menyentuh saldo stok.

### C. Server-Authoritative Checkout & Financial Integrity
1. **Kalkulasi Harga, Pajak, dan Biaya Layanan di Server**:
   - Client hanya mengirimkan `productId`, `quantity`, dan opsional `unitId`.
   - Server mengambil harga katalog asli (`product.price`) dari database, mengalikan subtotal, dan menerapkan konfigurasi pajak restoran (PB1) serta service charge sesuai profil bisnis.
2. **Pembatasan Wewenang Diskon**:
   - Diskon kasir dibatasi maksimal 10%.
   - Diskon di atas 10% wajib menyertakan otorisasi manajer/owner. Pelanggaran aturan ini langsung dibatalkan dengan **HTTP 403 Forbidden**.
3. **Validasi Uang Tunai & Bilangan Bulat (Integer Money)**:
   - Validasi bahwa pembayaran tunai mencukupi (`paidAmount >= total`).
   - Mencegah pecahan desimal pada mata uang Rupiah.
4. **Proteksi Kerahasiaan HPP**:
   - Field `costPrice` (HPP) tidak disertakan dalam dokumen `Sale` publik yang dapat diakses kasir, mencegah kebocoran margin keuntungan.

### D. Idempotency Engine
1. **Sidik Jari Request Kredensial**:
   - Header/body `idempotencyKey` diikat secara kriptografis/deterministik terhadap `businessId`, `branchId`, `operatorId`, `lineItems`, `paidAmount`, dan `paymentMethod`.
2. **Replay Aman**:
   - Jika koneksi terputus saat checkout dan client mengulang request dengan idempotency key dan payload yang sama, server mengembalikan data transaksi `Sale` yang telah dibuat sebelumnya tanpa melakukan double-deduction stok atau pencatatan ganda.
3. **Penolakan Konflik Key Reuse**:
   - Jika key yang sama digunakan dengan payload transaksi yang berbeda, server menolak dengan **HTTP 409 Conflict**.

### E. Shift Management & Drawer Reconciliation
1. **Backend Persistence & Anti-Double-Open**:
   - Endpoint `POST /api/shifts/open`: Membuka sesi kasir di backend dengan `openingCash` dan memvalidasi bahwa kasir/cabang tersebut belum memiliki shift yang sedang aktif (menolak pembukaan ganda dengan **HTTP 409 Conflict**).
   - Endpoint `POST /api/shifts/close`: Menutup sesi, menghitung uang kas aktual vs ekspektasi kas (penjualan tunai + cash-in - cash-out), dan mencatat selisih (*discrepancy*).
   - Endpoint `POST /api/shifts/cash-movement`: Mencatat mutasi kas masuk/keluar beralasan secara atomik.
2. **Validasi Checkout**:
   - Pembayaran tunai pada checkout POS mewajibkan `cashSessionId` yang aktif dan valid untuk cabang terkait.
3. **Universal POS Shift Controls**:
   - Kontrol shift (Buka/Tutup Shift, Mutasi Kas, dan Indikator Status Kasir) diintegrasikan ke seluruh POS mode: **Retail POS**, **Phone Store POS**, dan **F&B POS**.

### F. Serialized Unit Invariants (HP & Gadget Store)
1. **Normalisasi IMEI & Identitas Unit Tunggal**:
   - Normalisasi Luhn 15-digit dan deduplikasi IMEI1/IMEI2.
   - Pendaftaran alias dual-SIM memastikan perangkat fisik yang sama tidak dapat dijual dua kali dengan IMEI yang berbeda.
2. **Invarian Kuantitas**:
   - Kuantitas untuk unit serialized terkunci mutlak di angka `1`. Permintaan kuantitas `> 1` untuk unit berseri ditolak (**HTTP 400 Bad Request**).
3. **Validasi Branch & Product Scoping**:
   - Unit wajib berstatus `in_stock`, berasosiasi dengan `productId` yang sesuai, dan berada di `branchId` tempat transaksi berlangsung. Unit cabang lain ditolak (**HTTP 400 Bad Request**).
4. **Harga Server Unit**:
   - Harga jual unit diambil langsung dari database server, bukan fallback ke nilai kiriman client.

---

## 3. Hasil Verifikasi Gate Fase 3

| Kriteria Gate | Status | Keterangan Verifikasi |
|---|---|---|
| **Two Cashiers Race on Last Stock** | **LULUS** | Simulasi dua transaksi paralel pada unit stok terakhir: tepat 1 kasir berhasil, kasir kedua menerima HTTP 400 (Insufficient stock). |
| **Response Lost & Retry** | **LULUS** | Replay idempotency key mengembalikan transaksi sale yang sama; stok tidak terpotong dua kali. |
| **Adjustment vs Intervening Sale** | **LULUS** | Approval penyesuaian stok setelah terjadi transaksi penjualan ditolak dengan HTTP 409 tanpa menimpa stok. |
| **Dual-SIM & Quantity > 1 Invariants** | **LULUS** | Upaya checkout dual-SIM alias atau quantity > 1 ditolak dengan HTTP 400. Unit branch mismatch ditolak. |
| **Shift & Drawer Totals Reconciliation** | **LULUS** | Perhitungan opening cash, cash sales, cash-in/cash-out, and closing discrepancy terverifikasi authoritative. |
| **TypeScript Compilation & Build** | **LULUS** | `npx tsc --noEmit` & `npm run build` sukses 100% tanpa error. |
| **Full Vitest Suite** | **LULUS** | **90 test lulus** dari 8 file tes (1 skipped emulator check). |

---

## 4. File-File yang Dimodifikasi & Ditambahkan

1. `src/types/index.ts`: Menambahkan `'opening_balance'` ke `StockMovementType`.
2. `src/lib/permissions.ts`: Menetapkan hak pengajuan penyesuaian inventaris (`inventory.adjust`) pada kasir.
3. `src/app/api/products/route.ts`: Menolak perubahan stok langsung via `PUT` dan mencatat `opening_balance` otomatis pada create.
4. `src/app/api/inventory/ledger/route.ts` *(Baru)*: Endpoint buku besar mutasi stok per cabang dan rekonsiliasi ringkasan.
5. `src/app/api/inventory/adjustments/request/route.ts`: Pengajuan stok non-mutating dengan ID server dan validasi produk/cabang.
6. `src/app/api/inventory/adjustments/review/route.ts`: Approval atomik dengan deteksi stale intervening sale (HTTP 409) dan rejection bersih.
7. `src/app/api/shifts/open/route.ts` *(Baru)*: Registrasi shift kasir backend dengan proteksi anti-double open.
8. `src/app/api/shifts/close/route.ts` *(Baru)*: Penutupan shift dan rekonsiliasi selisih kas.
9. `src/app/api/shifts/cash-movement/route.ts` *(Baru)*: Mutasi kas masuk/keluar beralasan dalam sesi aktif.
10. `src/app/api/sales/checkout/route.ts`: Engine checkout server-authoritative lengkap (idempotensi, diskon, IMEI, shift validation).
11. `src/components/pos/RetailPosScreen.tsx`: Integrasi shift kasir dan modal mutasi kas pada Retail POS.
12. `src/components/pos/PhonePosScreen.tsx`: Integrasi shift kasir dan modal mutasi kas pada Phone Store POS.
13. `src/components/pos/FnBPosScreen.tsx`: Upgrade manajemen shift F&B ke backend API dan mutasi kas.
14. `src/context/BusinessContext.tsx`: Penyelarasan shift, mutasi kas, dan adjustment ke backend server-authoritative.
15. `src/tests/stock-transaction-engine.test.ts` *(Baru)*: Test suite komprehensif menguji seluruh invariant Fase 3.
