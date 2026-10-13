# TOKOKOE SAAS — ROLES & PERMISSIONS MATRIX (RBAC)

## 1. Daftar Izin (Permission Keys)

| Permission Key | Keterangan |
|---|---|
| `products.read` | Melihat daftar produk & harga jual |
| `products.cost.read` | Melihat harga modal (HPP / Cost Price) produk |
| `products.create` | Menambah produk baru |
| `products.update` | Mengubah informasi & harga produk |
| `products.delete` | Menghapus produk dari katalog |
| `sales.create` | Membuat transaksi baru di kasir (POS) |
| `sales.read` | Melihat riwayat transaksi penjualan |
| `sales.refund` | Memproses retur atau pembatalan penjualan |
| `inventory.read` | Melihat stok produk & daftar IMEI |
| `inventory.receive` | Menerima barang masuk / Sell-In / Purchase Order |
| `inventory.adjust` | Mengajukan atau melakukan penyesuaian stok |
| `approvals.manage` | Menyetujui request tukar unit & penyesuaian stok |
| `employees.create` | Mendaftarkan staf/kasir baru |
| `employees.manage` | Mengedit hak akses, suspensi, & reset sandi staf |
| `finance.read` | Melihat ringkasan laba/rugi, omset bersih, & HPP |
| `reports.read` | Melihat laporan penjualan & analitik |
| `business.settings.manage` | Mengubah nama bisnis, modul, & cabang |
| `shift.manage` | Membuka dan menutup sesi kasir |

---

## 2. Pemetaan Peran Bawaan (Default Role Matrix)

| Peran | Izin Default |
|---|---|
| **Owner** | Semua izin (`*`) |
| **Manager** | `products.read`, `products.create`, `products.update`, `products.cost.read`, `sales.create`, `sales.read`, `inventory.read`, `inventory.receive`, `inventory.adjust`, `approvals.manage`, `employees.create`, `employees.manage`, `reports.read`, `shift.manage` |
| **Cashier** | `products.read`, `sales.create`, `sales.read`, `inventory.read`, `shift.manage` |
| **Warehouse** | `products.read`, `inventory.read`, `inventory.receive`, `inventory.adjust` |
| **Kitchen** | `sales.read` (khusus status dapur) |
| **Accountant**| `sales.read`, `finance.read`, `reports.read`, `products.cost.read` |
| **Technician**| `products.read`, `inventory.read`, `sales.create` |

---

## 3. Aturan Keamanan & Pembatasan Khusus
- **Cashier**: Dilarang keras melihat `costPrice` (HPP) produk dan laporan keuangan laba kotor / laba bersih pemilik.
- **Isolasi Tenant**: Tidak ada izin yang berlaku lintas bisnis. Izin hanya berlaku di dalam `businessId` tempat keanggotaan terdaftar.
- **Validasi Server-Side**: Semua route mutasi sensitif memvalidasi token otentikasi Firebase dan mencocokkan permission pengguna sebelum mengeksekusi operasi ke Firestore.
