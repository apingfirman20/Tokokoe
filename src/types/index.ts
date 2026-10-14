export type BusinessType = 'fnb' | 'phone' | 'retail';

export type UserRole = 
  | 'owner' 
  | 'manager' 
  | 'cashier' 
  | 'warehouse' 
  | 'accountant' 
  | 'waiter' 
  | 'kitchen' 
  | 'technician';

export type PermissionKey =
  | 'products.read'
  | 'products.cost.read'
  | 'products.create'
  | 'products.update'
  | 'products.delete'
  | 'sales.create'
  | 'sales.read'
  | 'sales.refund'
  | 'inventory.read'
  | 'inventory.receive'
  | 'inventory.adjust'
  | 'approvals.manage'
  | 'employees.create'
  | 'employees.manage'
  | 'finance.read'
  | 'reports.read'
  | 'business.settings.manage'
  | 'shift.manage';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'owner' | 'employee';
  ownedBusinessIds: string[];
  assignedBusinessIds: string[];
  createdAt: number;
}

export interface Business {
  id: string;
  name: string;
  businessType: BusinessType;
  ownerId: string;
  logoUrl?: string;
  currency: 'IDR';
  timezone: string;
  address: string;
  phone: string;
  enabledModules: string[];
  status: 'active' | 'suspended' | 'inactive';
  createdAt: number;
  updatedAt: number;
}

export interface Branch {
  id: string;
  businessId: string;
  name: string;
  code: string;
  address: string;
  isMainBranch: boolean;
  active: boolean;
}

export interface BusinessMember {
  id: string;
  userId: string;
  businessId: string;
  displayName: string;
  username: string;
  role: UserRole;
  branchIds: string[];
  permissions: PermissionKey[];
  status: 'active' | 'inactive';
  joinedAt: number;
}

export interface ProductOption {
  name: string;
  choices: Array<{ label: string; extraPrice: number }>;
}

export interface ProductModifier {
  name: string;
  price: number;
}

export interface Product {
  id: string;
  businessId: string;
  name: string;
  category: string;
  sellingPrice: number; // Integer Rupiah
  costPrice: number;    // Integer Rupiah
  barcode?: string;
  barcodeType?: 'EAN13' | 'EAN8' | 'UPC_A' | 'CODE128' | 'INTERNAL';
  sku?: string;
  imageUrl?: string;
  available: boolean;
  trackStock: boolean;
  stockQty: number;
  options?: ProductOption[];
  modifiers?: ProductModifier[];
  // Phone store specific
  brand?: string;
  model?: string;
  storage?: string;
  color?: string;
  condition?: 'new' | 'second_grade_a' | 'second_grade_b';
  updatedAt?: number;
}

export type ImeiStatus = 
  | 'available' 
  | 'reserved' 
  | 'sold' 
  | 'quarantined' 
  | 'returned' 
  | 'transferred'
  | 'exchanged_out' 
  | 'returned_to_supplier';

export interface ImeiUnit {
  id: string;
  businessId: string;
  branchId: string;
  imei: string; // Primary IMEI (IMEI 1)
  imei2?: string; // Optional Secondary IMEI (Dual SIM)
  serialNumber?: string; // Hardware Serial Number distinct from IMEI
  productId: string;
  productName: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  condition: 'new' | 'second_grade_a' | 'second_grade_b';
  costPrice: number;
  sellingPrice: number;
  status: ImeiStatus;
  soldAtSaleId?: string;
  warrantyUntil?: number;
  source: 'purchase_order' | 'direct_sell_in' | 'exchange_in';
  supplierOrCustomerName?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ImeiHistory {
  id: string;
  businessId: string;
  imei: string;
  imei2?: string;
  serialNumber?: string;
  unitId: string;
  action: 
    | 'received' 
    | 'sold' 
    | 'exchanged_in' 
    | 'exchanged_out' 
    | 'warranty_claimed' 
    | 'stock_adjusted'
    | 'reserved'
    | 'quarantined'
    | 'returned'
    | 'transferred';
  referenceId: string;
  branchId: string;
  operatorId: string;
  operatorName: string;
  notes?: string;
  timestamp: number;
}

export type StockMovementType = 'sale' | 'purchase_order' | 'adjustment' | 'exchange' | 'refund' | 'return';

export interface StockMovement {
  id: string;
  businessId: string;
  branchId: string;
  productId: string;
  productName: string;
  type: StockMovementType;
  quantityDelta: number;
  previousQty: number;
  newQty: number;
  referenceId: string;
  operatorId: string;
  operatorName: string;
  notes?: string;
  timestamp: number;
}

export interface CartLineItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  notes?: string;
  imei?: string;
  selectedOptions?: Record<string, string>;
  selectedModifiers?: string[];
}

export type OrderType = 'dine_in' | 'takeaway' | 'delivery' | 'retail_pos' | 'phone_pos';
export type PaymentMethod = 'cash' | 'transfer' | 'midtrans_qris';
export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'refunded';
export type KitchenOrderStatus = 'new' | 'preparing' | 'ready' | 'served' | 'completed';

export interface Sale {
  id: string;
  saleNumber: string;
  businessId: string;
  branchId: string;
  cashierId: string;
  cashierName: string;
  customerName?: string;
  orderType: OrderType;
  tableNumber?: string;
  lineItems: CartLineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  serviceCharge: number;
  grandTotal: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: KitchenOrderStatus;
  cashSessionId?: string;
  idempotencyKey?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CashSession {
  id: string;
  businessId: string;
  branchId: string;
  cashierId: string;
  cashierName: string;
  openedAt: number;
  openingCash: number;
  closedAt?: number;
  cashSalesTotal: number;
  cashInTotal: number;
  cashOutTotal: number;
  expectedClosingCash: number;
  actualClosingCash?: number;
  discrepancy?: number;
  status: 'open' | 'closed';
  notes?: string;
}

export interface TableItem {
  id: string;
  businessId: string;
  branchId: string;
  tableNumber: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved';
  activeSaleId?: string;
  customerName?: string;
}

export interface StockAdjustment {
  id: string;
  businessId: string;
  branchId: string;
  productId: string;
  productName: string;
  imei?: string;
  previousQty: number;
  adjustedQty: number;
  diff: number;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  createdAt: number;
  reviewedAt?: number;
}

export interface PurchaseOrderItem {
  id: string;
  productId?: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  condition: 'new' | 'second_grade_a' | 'second_grade_b';
  costPrice: number;
  expectedSellingPrice: number;
  quantityOrdered: number;
  quantityReceived: number;
  receivedImeis: string[];
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  businessId: string;
  branchId: string;
  supplierName: string;
  items: PurchaseOrderItem[];
  totalCost: number;
  status: 'ordered' | 'partially_received' | 'received' | 'cancelled';
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
}
