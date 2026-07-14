export type Role = 'owner' | 'admin' | 'kasir';

export interface User {
  id: string;
  username: string;
  password?: string;
  name: string;
  role: Role;
  branchId?: string; // If undefined, usually means owner (has access to all)
  printerSetting?: 'bluetooth' | 'cable';
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  isActive: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  purchasePrice: number;
  sellingPrice: number;
  unit: string;
  imageUrl?: string;
  barcode?: string;
  isActive: boolean;
  variants?: string; // e.g. "Size: S, M, L"
  // Legacy fields kept for backward compat during migration
  branchId?: string;
  stock?: number;
  minStock?: number;
}

export interface BranchStock {
  id: string;
  productId: string;
  branchId: string;
  stock: number;
  minStock: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  branchId: string;
  type: 'in' | 'out' | 'adjustment';
  quantity: number;
  reason: string;
  date: string; // ISO String
  userId: string;
}

export interface TransactionItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface Transaction {
  id: string;
  receiptNumber: string;
  branchId: string;
  cashierId: string;
  shiftId: string;
  items: TransactionItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'qris';
  amountPaid: number;
  change: number;
  date: string; // ISO String
  status: 'completed' | 'held' | 'voided';
}

export interface Shift {
  id: string;
  branchId: string;
  cashierId: string;
  startTime: string; // ISO String
  endTime?: string; // ISO String, empty if shift still active
  startingCash: number;
  endingCashSystem?: number; // Calculated by system
  endingCashActual?: number; // Inputted by cashier
  status: 'active' | 'closed';
}

export interface StockTransfer {
  id: string;
  fromBranchId: string;
  toBranchId: string;
  items: { productId: string; name: string; quantity: number }[];
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  sentByUserId: string;
  receivedByUserId?: string;
  photoEvidenceUrl?: string;
  rejectionReason?: string;
  date: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  branchId: string;
  action: 'stock_transfer_sent' | 'stock_transfer_approved' | 'stock_transfer_rejected' | 'stock_transfer_cancelled' | 'stock_update' | 'shift_closed' | 'item_sold' | 'login' | 'user_created';
  description: string;
  timestamp: string; // ISO String
}
