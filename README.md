# Tokokoe SaaS — "Satu Platform, Semua Usaha."

**Tokokoe** adalah platform SaaS Multi-Tenant, Multi-Bisnis, dan Modular POS (Point of Sale) & Manajemen Operasional Bisnis terintegrasi di Indonesia. Dirancang khusus untuk mendukung berbagai model bisnis ritel dan jasa dalam satu akun pemilik (Owner):

1. **Food & Beverage (F&B)** — Kasir shift, manajemen meja (Dine-in / Takeaway), Kitchen Display System (KDS), nota termal.
2. **Phone & Gadget Store** — Pelacakan serial IMEI 15 digit per unit, Sell-In (tukar tambah / beli dari customer), Tukar Unit (garansi retur toko), riwayat klaim garansi.
3. **Retail Minimarket** — Input barcode cepat (scanner hardware / keyboard shortcut F2/F3/Esc), diskon instan, kalkulasi kembalian tunai, audit stok opname.

---

## 🚀 Fitur Utama

- **Multi-Tenant Scoping**: Satu pemilik dapat mengelola multi-bisnis (contoh: *Kopi Senja* F&B, *Konter Jaya* Phone Store, *Toko Kita* Retail Minimarket) dengan data, inventaris, cabang, dan karyawan yang terisolasi total.
- **Centralized Authentication**: Login tunggal untuk Owner (Email) dan Staff (Format Username seperti `budi.kopisenja`), dipetakan dengan aman melalui Firebase Admin SDK.
- **Role-Based Access Control (RBAC)**: 8 peran hierarkis (*Owner*, *Manager*, *Cashier*, *Warehouse*, *Accountant*, *Waiter*, *Kitchen*, *Technician*). Kasir dilarang melihat HPP (Cost Price) dan laporan finansial laba rugi.
- **Dynamic Business Module Engine**: Navigasi dan fitur POS beradaptasi otomatis berdasarkan kategori bisnis dan modul aktif.
- **Integer Rupiah Arithmetic**: Semua kalkulasi mata uang menggunakan integer Rupiah murni untuk mencegah galat floating-point.
- **Modular Monolith**: Dibangun di atas Next.js App Router (TypeScript Strict Mode), Tailwind CSS, Lucide React, Cloud Firestore, dan siap dideploy ke Vercel maupun Node.js hosting (seperti Hostinger VPS).

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router with Turbopack & Partial Prerendering)
- **Language**: TypeScript (Strict Mode)
- **Styling**: Tailwind CSS & Lucide Icons
- **Auth & Database**: Firebase Authentication, Cloud Firestore, Firebase Admin SDK
- **Testing**: Vitest (14 automated unit & integration tests)
- **Pembayaran**: Cash drawer session + Midtrans Sandbox Payment Adapter

---

## 📂 Dokumentasi Teknis

- [ARCHITECTURE.md](file:///d:/TK%20R01/ARCHITECTURE.md) — Arsitektur Multi-Tenant, Isolasi Data, & Desain Login Username.
- [DATABASE.md](file:///d:/TK%20R01/DATABASE.md) — Struktur Schema Koleksi dan Subkoleksi Cloud Firestore.
- [PERMISSIONS.md](file:///d:/TK%20R01/PERMISSIONS.md) — Matriks Hak Akses & Matriks Izin (RBAC).
- [firestore.rules](file:///d:/TK%20R01/firestore.rules) — Aturan Keamanan Firestore Tenant & Member Isolation.
- [firestore.indexes.json](file:///d:/TK%20R01/firestore.indexes.json) — Definisi Composite Index Firestore.

---

## ⚡ Panduan Instalasi & Menjalankan Aplikasi

### 1. Prasyarat
- Node.js versi 18.18+ atau 20+
- npm versi 9+

### 2. Kloning & Instal Dependensi
```bash
git clone <repo-url>
cd tokokoe-saas
npm install
```

### 3. Konfigurasi Environment (`.env.local`)
Salin file template `.env.example`:
```bash
cp .env.example .env.local
```

Isi variabel konfigurasi Firebase dan Midtrans Anda:
```env
# Firebase Client SDK
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Firebase Admin SDK (Server-Side)
FIREBASE_ADMIN_PROJECT_ID=your_project_id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your_project_id.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Payment Gateway (Midtrans Sandbox)
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxx
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxx
MIDTRANS_IS_PRODUCTION=false
```

### 4. Menjalankan Server Pengembangan
```bash
npm run dev
```
Buka browser di [http://localhost:3000](http://localhost:3000).

### 5. Menjalankan Pengujian Otomatis (Unit & Integration Tests)
```bash
npm test
```

### 6. Build Produksi
```bash
npm run build
npm start
```

---

## 🧪 Akun Demo Cepat

Aplikasi dilengkapi dengan mekanisme seed data otomatis untuk memvalidasi alur bisnis secara langsung:

| Tipe Akun | Identifier / Email | Password | Hak Akses |
|---|---|---|---|
| **Owner (Semua Bisnis)** | `owner@tokokoe.com` | `owner123` | Akses penuh 3 bisnis (Kopi Senja, Konter Jaya, Toko Kita) |
| **Kasir F&B** | `budi.kopisenja` | `kasir123` | Kopi Senja (F&B POS, Shift Kasir, Meja) |
| **Teknisi / Staff HP** | `andi.konter` | `andi123` | Konter Jaya (Phone POS, IMEI Tracker, Sell-In) |
| **Kasir Retail** | `siti.tokokita` | `siti123` | Toko Kita (Retail POS, Barcode Scanner, Stok) |

*Catatan: Tombol "Reset Demo Data" tersedia di pojok kanan bawah header aplikasi untuk mengembalikan state awal kapan saja.*

---

## 🔒 Keamanan & Produksi

1. **Firestore Security Rules**: Rule di [firestore.rules](file:///d:/TK%20R01/firestore.rules) membatasi akses subkoleksi secara ketat ke anggota bisnis terdaftar (`request.auth.uid in get(/databases/$(database)/documents/businesses/$(businessId)/members/$(request.auth.uid)).data.userId`).
2. **Server-Side Admin Operations**: Pendaftaran akun kasir dan reset password dilakukan melalui route API server terisolasi (`/api/auth/...`) yang memverifikasi identitas penyeru terlebih dahulu.
3. **No Plaintext Passwords**: Password staf tidak pernah disimpan di Firestore, melainkan langsung diverifikasi menggunakan hashing aman Firebase Authentication.
