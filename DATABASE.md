# TOKOKOE SAAS — DATABASE SCHEMA & FIRESTORE DESIGN

## 1. Hierarchy & Collections

### Top-Level Collections
- `users/{userId}`: Profil pengguna platform (Owner & Pegawai).
- `staffLogins/{normalizedUsername}`: Indeks lookup username staf untuk otentikasi aman tanpa bocor data.
- `businesses/{businessId}`: Entitas bisnis independen (Tenant).

---

## 2. Struktur Koleksi & Dokumen Detail

### 2.1 `users/{userId}`
```typescript
interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  role: 'owner' | 'employee';
  ownedBusinessIds: string[]; // Khusus owner
  assignedBusinessIds: string[]; // Khusus staff
  createdAt: number; // epoch ms
  updatedAt: number;
}
```

### 2.2 `staffLogins/{normalizedUsername}`
```typescript
interface StaffLoginDoc {
  username: string; // misal "andi.kopisenja"
  internalEmail: string; // misal "andi.kopisenja@staff.tokokoe.internal"
  uid: string;
  businessId: string;
  branchIds: string[];
  role: string;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: number;
}
```

### 2.3 `businesses/{businessId}`
```typescript
interface BusinessDoc {
  id: string;
  name: string;
  businessType: 'fnb' | 'phone' | 'retail';
  ownerId: string;
  logoUrl?: string;
  currency: 'IDR';
  timezone: 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura';
  address: string;
  phone: string;
  enabledModules: string[];
  status: 'active' | 'suspended';
  createdAt: number;
  updatedAt: number;
}
```

---

## 3. Subkoleksi Tenant: `businesses/{businessId}/...`

### 3.1 `branches/{branchId}`
```typescript
interface BranchDoc {
  id: string;
  businessId: string;
  name: string; // misal "Cabang Senopati"
  code: string; // misal "CAB-01"
  address: string;
  isMainBranch: boolean;
  active: boolean;
}
```

### 3.2 `members/{userId}`
```typescript
interface BusinessMemberDoc {
  userId: string;
  businessId: string;
  displayName: string;
  username?: string;
  role: 'owner' | 'manager' | 'cashier' | 'warehouse' | 'accountant' | 'waiter' | 'kitchen' | 'technician';
  branchIds: string[];
  permissions: string[];
  status: 'active' | 'inactive';
  joinedAt: number;
}
```

### 3.3 `products/{productId}`
```typescript
interface ProductDoc {
  id: string;
  businessId: string;
  name: string;
  category: string;
  sellingPrice: number; // Integer Rupiah
  costPrice: number;    // Integer Rupiah
  barcode?: string;
  sku?: string;
  imageUrl?: string;
  available: boolean;
  trackStock: boolean;
  stockQty: number; // Total / fallback stock
  options?: Array<{
    name: string;
    choices: Array<{ label: string; extraPrice: number }>;
  }>;
  modifiers?: Array<{ name: string; price: number }>;
  // Khusus Phone Store:
  brand?: string;
  model?: string;
  storage?: string;
  color?: string;
  condition?: 'new' | 'second_grade_a' | 'second_grade_b';
}
```

### 3.4 `imeiUnits/{unitId}` (Khusus Phone Store)
```typescript
interface ImeiUnitDoc {
  id: string;
  businessId: string;
  branchId: string;
  imei: string; // Unik per unit
  productId: string;
  productName: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  condition: 'new' | 'second_grade_a' | 'second_grade_b';
  costPrice: number;
  sellingPrice: number;
  status: 'available' | 'reserved' | 'sold' | 'exchanged_out' | 'returned_to_supplier' | 'quarantined';
  soldAtSaleId?: string;
  warrantyUntil?: number; // epoch ms
  source: 'purchase_order' | 'direct_sell_in' | 'exchange_in';
  supplierOrCustomerName?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}
```

### 3.5 `sales/{saleId}`
```typescript
interface SaleDoc {
  id: string;
  businessId: string;
  branchId: string;
  cashierId: string;
  cashierName: string;
  customerName?: string;
  orderType?: 'dine_in' | 'takeaway' | 'delivery' | 'retail_pos' | 'phone_pos';
  tableNumber?: string;
  lineItems: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    notes?: string;
    imei?: string; // Jika produk serial
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  serviceCharge: number;
  grandTotal: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: 'cash' | 'transfer' | 'midtrans_qris';
  paymentStatus: 'paid' | 'pending' | 'failed' | 'refunded';
  orderStatus: 'new' | 'preparing' | 'ready' | 'served' | 'completed';
  cashSessionId?: string;
  idempotencyKey?: string;
  createdAt: number;
  updatedAt: number;
}
```

### 3.6 `cashSessions/{sessionId}` (Shift Kasir)
```typescript
interface CashSessionDoc {
  id: string;
  businessId: string;
  branchId: string;
  cashierId: string;
  cashierName: string;
  openedAt: number;
  openingCash: number; // Saldo awal kasir
  closedAt?: number;
  cashSalesTotal: number;
  cashInTotal: number;
  cashOutTotal: number;
  expectedClosingCash: number;
  actualClosingCash?: number;
  discrepancy?: number; // actual - expected
  status: 'open' | 'closed';
  notes?: string;
}
```

### 3.7 `imeiHistory/{historyId}` (Khusus Phone Store)
```typescript
interface ImeiHistoryDoc {
  id: string;
  businessId: string;
  imei: string;
  unitId: string;
  action: 'received' | 'sold' | 'exchanged_in' | 'exchanged_out' | 'warranty_claimed' | 'stock_adjusted';
  referenceId: string; // saleId / purchaseOrderId / exchangeId
  branchId: string;
  operatorId: string;
  operatorName: string;
  notes?: string;
  timestamp: number;
}
```

### 3.8 `tables/{tableId}` (Khusus F&B)
```typescript
interface TableDoc {
  id: string;
  businessId: string;
  branchId: string;
  tableNumber: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved';
  activeSaleId?: string;
}
```

---

## 4. Konkurensi & Integritas Data
- Setiap pengurangan inventaris atau penjualan unit IMEI wajib dijalankan dalam **Firestore Transaction** atomik.
- Validasi status IMEI memastikan bahwa unit yang telah berstatus `sold` atau `quarantined` tidak dapat dijual untuk kedua kalinya.
- Transaksi POS menggunakan `idempotencyKey` yang diperiksa di awal transaksi untuk mencegah pemrosesan duplikat.
