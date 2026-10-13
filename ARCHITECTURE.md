# TOKOKOE SAAS — ARCHITECTURE DESIGN
"Satu Platform, Semua Usaha."

## 1. Ringkasan Eksekutif
Tokokoe adalah platform SaaS multi-tenant, multi-bisnis, dan modular Point of Sale (POS) & Business Management yang dirancang untuk Usaha Mikro, Kecil, dan Menengah (UMKM) serta enterprise ritel di Indonesia.

Sistem ini memungkinkan satu pemilik (Owner) mengelola banyak tipe unit usaha (F&B, Toko Ponsel/Gadget, Ritel Minimarket) di bawah satu akun terpusat, dengan pemisahan data (tenant isolation), alur kasir khusus industri, serta manajemen hak akses staf yang ketat.

---

## 2. Diagram Arsitektur Tingkat Tinggi

```mermaid
graph TD
    Client[Browser / POS Terminal / Mobile] --> AppRouter[Next.js App Router]
    
    subgraph Frontend Layer
        AppRouter --> AuthGuard[Centralized Auth & Tenant Guard]
        AuthGuard --> Hub[Bisnis Saya - Multi-Tenant Hub]
        AuthGuard --> Shell[Industry App Shell & Module Nav]
        Shell --> FnBPOS[F&B POS Engine & KDS]
        Shell --> PhonePOS[Phone Store POS & IMEI Engine]
        Shell --> RetailPOS[Retail Fast Barcode POS]
    end

    subgraph Server API & Authorization
        AppRouter --> ApiAuth[/api/auth/employee-login]
        AppRouter --> ApiSales[/api/sales/checkout]
        AppRouter --> ApiIMEI[/api/phone/imei]
        AppRouter --> ApiSeed[/api/seed]
        ApiAuth --> FirebaseAuthAdmin[Firebase Admin SDK]
        ApiSales --> FirestoreAdmin[Cloud Firestore with Transactions]
    end

    subgraph Database Layer
        FirestoreAdmin --> UsersColl[(users)]
        FirestoreAdmin --> StaffLogins[(staffLogins)]
        FirestoreAdmin --> Businesses[(businesses / subcollections)]
    end
```

---

## 3. Strategi Otentikasi Terpusat (Centralized Authentication)

### 3.1 Registrasi Pemilik (Owner)
- Form registrasi: Nama lengkap, email, password, konfirmasi password.
- Pemilik mendaftar melalui Firebase Authentication standar.
- Setelah registrasi, akun tersimpan di koleksi `users/{userId}` dengan `role: "owner"`.
- Akun pemilik TIDAK diminta memilih jenis bisnis saat registrasi. Pemilik diarahkan ke `/businesses` ("Bisnis Saya") untuk membuat satu atau beberapa unit usaha.

### 3.2 Otentikasi Staf / Karyawan (Username-Based Staff Login)
Tantangan: Firebase Authentication tidak mendukung login murni username tanpa email secara bawaan.
Solusi Aman Tokokoe:
1. **Pembuatan Akun Staf (Server-Side):**
   - Pemilik/Manajer membuat staf melalui backoffice dengan format username unik yang dinormalisasi (contoh: `andi.kopisenja`).
   - Server route memetakan username menjadi email internal terproteksi: `andi.kopisenja@staff.tokokoe.internal`.
   - Menggunakan `firebase-admin/auth`, server mendaftarkan identitas Auth dengan email internal tersebut dan kata sandi sementara yang ditentukan.
   - Dibuat dokumen indeks di koleksi `staffLogins/{normalizedUsername}` yang berisi:
     `{ uid, businessId, branchIds, role, active: true, mustChangePassword: true }`.
   - Password plaintext **TIDAK PERNAH** disimpan di Firestore.
2. **Proses Login Staf:**
   - Staf memasukkan username (misal `andi.kopisenja`) dan kata sandi pada halaman login terpusat yang sama.
   - Client memanggil endpoint aman `/api/auth/employee-login`.
   - Server memverifikasi username pada indeks `staffLogins`, memeriksa status keaktifan akun.
   - Server memverifikasi kata sandi langsung terhadap Firebase Auth menggunakan Firebase Identity Toolkit API (tanpa komparasi manual).
   - Setelah kredensial valid, server menerbitkan **Firebase Custom Token** melalui `firebaseAdmin.auth().createCustomToken(uid, claims)`.
   - Client menerima custom token dan memanggil `signInWithCustomToken(auth, customToken)`.
   - Client terotentikasi penuh dengan Firebase SDK standar, memiliki UID valid, ID Token, dan hak akses yang tersinkronisasi.
   - Jika `mustChangePassword` aktif, sistem menampilkan modal penggantian sandi pertama kali.

---

## 4. Multi-Tenant Business Engine

### 4.1 Isolasi Tenant
- Setiap entitas bisnis memiliki `businessId` unik.
- Semua data operasional (cabang, produk, inventaris, transaksi penjualan, sesi kasir, IMEI) disimpan di subkoleksi `businesses/{businessId}/...`.
- Client context `BusinessProvider` menyimpan state bisnis aktif, cabang aktif, dan sesi kasir aktif.
- API route dan Firestore Rules memverifikasi kepemilikan (`ownerId == request.auth.uid`) atau keanggotaan staf (`businesses/{businessId}/members/{userId}`).
- Staf Bisnis A secara mutlak tidak dapat membaca atau menulis data Bisnis B.

### 4.2 Dynamic Business Module Registry
Setiap kategori bisnis mengaktifkan sekumpulan modul default:
- **fnb (Food & Beverage - Kopi Senja):**
  `core.dashboard`, `core.pos`, `core.products`, `core.inventory`, `fnb.tables`, `fnb.kitchen`, `core.employees`, `core.reports`, `core.finance`, `core.settings`.
- **phone (Phone & Gadget Store - Konter Jaya):**
  `core.dashboard`, `core.pos`, `phone.imei`, `phone.sellin`, `phone.exchange`, `core.inventory`, `core.purchases`, `core.employees`, `core.reports`, `core.settings`.
- **retail (Toko Kita - Retail & Minimarket):**
  `core.dashboard`, `core.pos`, `retail.barcode`, `core.products`, `core.inventory`, `core.employees`, `core.reports`, `core.settings`.

Navigasi sidebar dihasilkan secara dinamis berdasarkan:
1. `business.businessType`
2. `business.enabledModules`
3. Izin pengguna (`userPermissions`)

---

## 5. Mesin POS & Transaksi Terpadu

Meskipun antarmuka POS berbeda untuk tiap industri, mesin transaksi mendasar (`Sales & Payment Engine`) memiliki format seragam:
- Satuan mata uang: Integer Rupiah (IDR) tanpa koma pecahan desimal.
- Operasi inventaris dilakukan secara atomik menggunakan Firestore Transactions untuk mencegah *overselling* saat ada beberapa kasir bersamaan.
- Dukungan *Idempotency Key* pada checkout untuk mencegah transaksi ganda akibat klik berulang atau koneksi lambat.
- Status pembayaran (`pending`, `paid`, `refunded`, `failed`) dipisahkan dari status pesanan dapur (`new`, `preparing`, `ready`, `served`).
