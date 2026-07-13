import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Branch, Product, Transaction, Shift, StockMovement, StockTransfer, ActivityLog } from '../types';
import { firestoreService } from '../lib/firestore';

// Removed Dummy Data

interface AppState {
  // Auth
  currentUser: User | null;
  login: (username: string, password?: string) => boolean;
  logout: () => void;

  // Master Data
  branches: Branch[];
  users: User[];
  products: Product[];
  
  // Transactions, Shifts, Transfers & Logs
  transactions: Transaction[];
  shifts: Shift[];
  stockMovements: StockMovement[];
  stockTransfers: StockTransfer[];
  activityLogs: ActivityLog[];

  // Actions
  addProduct: (product: Product) => void;
  updateProduct: (product: Product) => void;
  addTransaction: (transaction: Transaction) => void;
  openShift: (shift: Shift) => void;
  closeShift: (shiftId: string, endingCashActual: number) => void;
  
  // User Actions
  addUser: (user: User) => void;
  updateUser: (user: User) => void;
  deleteUser: (userId: string) => void;
  updatePrinterSetting: (userId: string, setting: 'bluetooth' | 'cable') => void;

  // Transfer & Log Actions
  addStockTransfer: (transfer: StockTransfer) => void;
  updateStockTransfer: (transferId: string, updates: Partial<StockTransfer>) => void;
  addActivityLog: (log: ActivityLog) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      branches: [],
      users: [],
      products: [],
      transactions: [],
      shifts: [],
      stockMovements: [],
      stockTransfers: [],
      activityLogs: [],

      login: (username, password) => {
        const user = get().users.find((u) => u.username === username);
        if (user && user.password === password) {
          set({ currentUser: user });
          return true;
        }
        return false;
      },
      logout: () => set({ currentUser: null }),

      addProduct: (product) => {
        firestoreService.add('products', product, product.id);
        set((state) => ({ products: [...state.products, product] }));
      },
      updateProduct: (updated) => {
        firestoreService.update('products', updated.id, updated);
        set((state) => ({
          products: state.products.map(p => p.id === updated.id ? updated : p)
        }));
      },
      addTransaction: (transaction) => {
        firestoreService.add('transactions', transaction, transaction.id);
        set((state) => {
          // Reduce stock
          const updatedProducts = state.products.map(p => {
            const item = transaction.items.find(i => i.productId === p.id);
            if (item) {
              return { ...p, stock: p.stock - item.quantity };
            }
            return p;
          });
          return {
            transactions: [...state.transactions, transaction],
            products: updatedProducts
          };
        });
        
        // Update product stocks in firestore
        const state = get();
        transaction.items.forEach(item => {
          const product = state.products.find(p => p.id === item.productId);
          if (product) firestoreService.update('products', product.id, { stock: product.stock });
        });
      },
      openShift: (shift) => {
        firestoreService.add('shifts', shift, shift.id);
        set((state) => ({ shifts: [...state.shifts, shift] }));
      },
      closeShift: (shiftId, endingCashActual) => set((state) => {
        const shiftIndex = state.shifts.findIndex(s => s.id === shiftId);
        if (shiftIndex === -1) return state;

        const shift = state.shifts[shiftIndex];
        
        // Calculate system cash (Starting Cash + Cash Transactions in this shift)
        const shiftTransactions = state.transactions.filter(t => t.shiftId === shiftId && t.status === 'completed' && t.paymentMethod === 'cash');
        const cashSales = shiftTransactions.reduce((acc, t) => acc + t.total, 0);
        const endingCashSystem = shift.startingCash + cashSales;

        const updatedShift: Shift = {
          ...shift,
          endTime: new Date().toISOString(),
          endingCashSystem,
          endingCashActual,
          status: 'closed'
        };

        const newShifts = [...state.shifts];
        newShifts[shiftIndex] = updatedShift;

        // Auto log shift close
        const logId = `log${Date.now()}`;
        const newLog: ActivityLog = {
          id: logId,
          userId: shift.cashierId,
          branchId: shift.branchId,
          action: 'shift_closed',
          description: `Shift closed. Actual Cash: ${endingCashActual}`,
          timestamp: new Date().toISOString()
        };

        firestoreService.update('shifts', shift.id, updatedShift);
        firestoreService.add('activityLogs', newLog, newLog.id);

        return { shifts: newShifts, activityLogs: [...state.activityLogs, newLog] };
      }),
      
      addUser: (user) => {
        firestoreService.add('users', user, user.id);
        set((state) => ({ users: [...state.users, user] }));
      },
      updateUser: (updated) => {
        firestoreService.update('users', updated.id, updated);
        set((state) => ({
          users: state.users.map(u => u.id === updated.id ? updated : u)
        }));
      },
      deleteUser: (userId) => {
        firestoreService.delete('users', userId);
        set((state) => ({
          users: state.users.filter(u => u.id !== userId)
        }));
      },
      updatePrinterSetting: (userId, setting) => {
        firestoreService.update('users', userId, { printerSetting: setting });
        set((state) => ({
          users: state.users.map(u => u.id === userId ? { ...u, printerSetting: setting } : u)
        }));
      },

      addStockTransfer: (transfer) => {
        firestoreService.add('stockTransfers', transfer, transfer.id);
        
        const logId = `log${Date.now()}`;
        const newLog: ActivityLog = {
          id: logId,
          userId: transfer.sentByUserId,
          branchId: transfer.fromBranchId,
          action: 'stock_transfer_sent',
          description: `Initiated transfer to ${transfer.toBranchId}`,
          timestamp: new Date().toISOString()
        };
        firestoreService.add('activityLogs', newLog, newLog.id);

        set((state) => ({ 
          stockTransfers: [...state.stockTransfers, transfer],
          activityLogs: [...state.activityLogs, newLog]
        }));
      },
      
      updateStockTransfer: (transferId, updates) => set((state) => {
        const index = state.stockTransfers.findIndex(t => t.id === transferId);
        if (index === -1) return state;
        const updated = { ...state.stockTransfers[index], ...updates };
        const newTransfers = [...state.stockTransfers];
        newTransfers[index] = updated;

        // Auto log status changes
        let logAction: ActivityLog['action'] | null = null;
        let desc = '';
        if (updates.status === 'approved') { logAction = 'stock_transfer_approved'; desc = 'Approved stock transfer'; }
        else if (updates.status === 'rejected') { logAction = 'stock_transfer_rejected'; desc = `Rejected stock transfer: ${updates.rejectionReason}`; }
        else if (updates.status === 'cancelled') { logAction = 'stock_transfer_cancelled'; desc = 'Cancelled stock transfer'; }

        const logs = [...state.activityLogs];
        if (logAction) {
          logs.push({
            id: `log${Date.now()}`,
            userId: updates.receivedByUserId || state.stockTransfers[index].sentByUserId, // Might be sender cancelling
            branchId: updated.toBranchId,
            action: logAction,
            description: desc,
            timestamp: new Date().toISOString()
          });
        }

        // Apply stock changes if approved
        let newProducts = state.products;
        if (updates.status === 'approved') {
          newProducts = state.products.map(p => {
             // Decrease from sender
             if (p.branchId === updated.fromBranchId) {
                const item = updated.items.find(i => i.productId === p.id);
                if (item) {
                  const newStock = p.stock - item.quantity;
                  firestoreService.update('products', p.id, { stock: newStock });
                  return { ...p, stock: newStock };
                }
             }
             // Increase to receiver
             if (p.branchId === updated.toBranchId) {
                const item = updated.items.find(i => i.productId === p.id); // By ID directly for simplicity
                const sourceItemProduct = state.products.find(sp => sp.id === item?.productId);
                if (sourceItemProduct && sourceItemProduct.sku === p.sku) {
                  const newStock = p.stock + (item?.quantity || 0);
                  firestoreService.update('products', p.id, { stock: newStock });
                  return { ...p, stock: newStock };
                }
             }
             return p;
          });
        }

        firestoreService.update('stockTransfers', transferId, updates);
        if (logAction) {
          firestoreService.add('activityLogs', logs[logs.length - 1], logs[logs.length - 1].id);
        }

        return { stockTransfers: newTransfers, activityLogs: logs, products: newProducts };
      }),
      
      addActivityLog: (log) => {
        firestoreService.add('activityLogs', log, log.id);
        set((state) => ({ activityLogs: [...state.activityLogs, log] }));
      },
    }),
    {
      name: 'tokokoe-storage',
    }
  )
);
