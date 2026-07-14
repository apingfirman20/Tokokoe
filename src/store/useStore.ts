import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Branch, Product, Transaction, Shift, StockMovement, StockTransfer, ActivityLog, BranchStock } from '../types';
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
  branchStocks: BranchStock[];
  
  // Transactions, Shifts, Transfers & Logs
  transactions: Transaction[];
  shifts: Shift[];
  stockMovements: StockMovement[];
  stockTransfers: StockTransfer[];
  activityLogs: ActivityLog[];

  // Branch Actions
  addBranch: (branch: Branch) => void;
  updateBranch: (branchId: string, branch: Branch) => void;

  // Product Actions
  addProduct: (product: Product) => void;
  updateProduct: (product: Product) => void;
  
  // BranchStock Actions
  addBranchStock: (bs: BranchStock) => void;
  updateBranchStock: (bsId: string, updates: Partial<BranchStock>) => void;
  setBranchStocks: (stocks: BranchStock[]) => void;

  // Transaction & Shift Actions
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

// Helper: get stock for a product at a specific branch
export const getProductStock = (branchStocks: BranchStock[], productId: string, branchId: string): BranchStock | undefined => {
  return branchStocks.find(bs => bs.productId === productId && bs.branchId === branchId);
};

// Helper: get total stock across all branches
export const getTotalStock = (branchStocks: BranchStock[], productId: string): number => {
  return branchStocks.filter(bs => bs.productId === productId).reduce((sum, bs) => sum + bs.stock, 0);
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      branches: [],
      users: [],
      products: [],
      branchStocks: [],
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

      // BranchStock actions
      addBranchStock: (bs) => {
        firestoreService.add('branchStocks', bs, bs.id);
        set((state) => ({ branchStocks: [...state.branchStocks, bs] }));
      },
      updateBranchStock: (bsId, updates) => {
        firestoreService.update('branchStocks', bsId, updates);
        set((state) => ({
          branchStocks: state.branchStocks.map(bs => bs.id === bsId ? { ...bs, ...updates } : bs)
        }));
      },
      setBranchStocks: (stocks) => set({ branchStocks: stocks }),

      addTransaction: (transaction) => {
        firestoreService.add('transactions', transaction, transaction.id);
        set((state) => {
          // Reduce stock from branchStocks
          const updatedBranchStocks = state.branchStocks.map(bs => {
            if (bs.branchId === transaction.branchId) {
              const item = transaction.items.find(i => i.productId === bs.productId);
              if (item) {
                const newStock = bs.stock - item.quantity;
                firestoreService.update('branchStocks', bs.id, { stock: newStock });
                return { ...bs, stock: newStock };
              }
            }
            return bs;
          });

          // Also update legacy product.stock for backward compat
          const updatedProducts = state.products.map(p => {
            const item = transaction.items.find(i => i.productId === p.id);
            if (item && p.stock !== undefined) {
              return { ...p, stock: (p.stock || 0) - item.quantity };
            }
            return p;
          });

          return {
            transactions: [...state.transactions, transaction],
            branchStocks: updatedBranchStocks,
            products: updatedProducts
          };
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
      
      addBranch: (branch) => {
        firestoreService.add('branches', branch, branch.id);
        set((state) => ({ branches: [...state.branches, branch] }));
      },
      updateBranch: (branchId, branch) => {
        firestoreService.update('branches', branchId, branch);
        set((state) => ({
          branches: state.branches.map(b => b.id === branchId ? branch : b)
        }));
      },
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
            userId: updates.receivedByUserId || state.stockTransfers[index].sentByUserId,
            branchId: updated.toBranchId,
            action: logAction,
            description: desc,
            timestamp: new Date().toISOString()
          });
        }

        // Apply stock changes via branchStocks if approved
        let newBranchStocks = state.branchStocks;
        if (updates.status === 'approved') {
          newBranchStocks = state.branchStocks.map(bs => {
            const item = updated.items.find(i => i.productId === bs.productId);
            if (!item) return bs;
            
            // Decrease from sender branch
            if (bs.branchId === updated.fromBranchId) {
              const newStock = bs.stock - item.quantity;
              firestoreService.update('branchStocks', bs.id, { stock: newStock });
              return { ...bs, stock: newStock };
            }
            // Increase at receiver branch
            if (bs.branchId === updated.toBranchId) {
              const newStock = bs.stock + item.quantity;
              firestoreService.update('branchStocks', bs.id, { stock: newStock });
              return { ...bs, stock: newStock };
            }
            return bs;
          });
        }

        firestoreService.update('stockTransfers', transferId, updates);
        if (logAction) {
          firestoreService.add('activityLogs', logs[logs.length - 1], logs[logs.length - 1].id);
        }

        return { stockTransfers: newTransfers, activityLogs: logs, branchStocks: newBranchStocks };
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
