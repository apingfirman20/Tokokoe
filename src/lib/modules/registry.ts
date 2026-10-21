import { Business, BusinessType, PermissionKey, UserRole } from "@/types";
import { hasPermission } from "../permissions";

export interface BusinessModule {
  id: string;
  name: string;
  description: string;
  category: 'core' | 'fnb' | 'phone' | 'retail';
  path: (businessId: string) => string;
  icon: string;
  requiredPermission?: PermissionKey;
  allowedBusinessTypes: BusinessType[];
}

export const MODULE_REGISTRY: Record<string, BusinessModule> = {
  // Core Modules
  'core.dashboard': {
    id: 'core.dashboard',
    name: 'Ringkasan & Dashboard',
    description: 'Analisis metrik bisnis, omset harian, dan ringkasan performa',
    category: 'core',
    path: (bId) => `/app/${bId}/dashboard`,
    icon: 'LayoutDashboard',
    requiredPermission: 'reports.read',
    allowedBusinessTypes: ['fnb', 'phone', 'retail'],
  },
  'core.pos': {
    id: 'core.pos',
    name: 'Kasir POS',
    description: 'Terminal penjualan dan pencatatan transaksi langsung',
    category: 'core',
    path: (bId) => `/app/${bId}/pos`,
    icon: 'CircleDollarSign',
    requiredPermission: 'sales.create',
    allowedBusinessTypes: ['fnb', 'phone', 'retail'],
  },
  'core.products': {
    id: 'core.products',
    name: 'Katalog Produk',
    description: 'Manajemen master produk, harga, kategori, dan stok',
    category: 'core',
    path: (bId) => `/app/${bId}/products`,
    icon: 'Package',
    requiredPermission: 'products.read',
    allowedBusinessTypes: ['fnb', 'phone', 'retail'],
  },
  'core.inventory': {
    id: 'core.inventory',
    name: 'Inventaris & Stok',
    description: 'Pemantauan kuantitas barang, mutasi, dan penyesuaian',
    category: 'core',
    path: (bId) => `/app/${bId}/inventory`,
    icon: 'Boxes',
    requiredPermission: 'inventory.read',
    allowedBusinessTypes: ['fnb', 'phone', 'retail'],
  },
  'core.employees': {
    id: 'core.employees',
    name: 'Manajemen Karyawan',
    description: 'Akun staf, peran kasir, username login, dan hak akses',
    category: 'core',
    path: (bId) => `/app/${bId}/employees`,
    icon: 'Users',
    requiredPermission: 'employees.manage',
    allowedBusinessTypes: ['fnb', 'phone', 'retail'],
  },
  'core.reports': {
    id: 'core.reports',
    name: 'Laporan Penjualan',
    description: 'Riwayat transaksi penjualan dan rekapitulasi',
    category: 'core',
    path: (bId) => `/app/${bId}/reports`,
    icon: 'FileBarChart',
    requiredPermission: 'sales.read',
    allowedBusinessTypes: ['fnb', 'phone', 'retail'],
  },
  'core.finance': {
    id: 'core.finance',
    name: 'Keuangan & Laba',
    description: 'Laporan laba kotor, HPP, estimasi margin operasional',
    category: 'core',
    path: (bId) => `/app/${bId}/finance`,
    icon: 'TrendingUp',
    requiredPermission: 'finance.read',
    allowedBusinessTypes: ['fnb', 'phone', 'retail'],
  },
  'core.settings': {
    id: 'core.settings',
    name: 'Pengaturan Bisnis',
    description: 'Profil toko, cabang operasional, dan modul aktif',
    category: 'core',
    path: (bId) => `/app/${bId}/settings`,
    icon: 'Settings',
    requiredPermission: 'business.settings.manage',
    allowedBusinessTypes: ['fnb', 'phone', 'retail'],
  },

  // F&B Specific Modules
  'fnb.tables': {
    id: 'fnb.tables',
    name: 'Manajemen Meja',
    description: 'Status meja dine-in, kapasitas, dan alokasi pesanan',
    category: 'fnb',
    path: (bId) => `/app/${bId}/fnb/tables`,
    icon: 'UtensilsCrossed',
    requiredPermission: 'sales.create',
    allowedBusinessTypes: ['fnb'],
  },
  'fnb.kitchen': {
    id: 'fnb.kitchen',
    name: 'Layar Dapur (KDS)',
    description: 'Kitchen Display System untuk status masak & saji pesanan',
    category: 'fnb',
    path: (bId) => `/app/${bId}/fnb/kitchen`,
    icon: 'ChefHat',
    requiredPermission: 'sales.read',
    allowedBusinessTypes: ['fnb'],
  },

  // Phone Store Specific Modules
  'phone.imei': {
    id: 'phone.imei',
    name: 'Pelacak & Histori IMEI',
    description: 'Pencarian unit, status garansi, dan riwayat mutasi IMEI',
    category: 'phone',
    path: (bId) => `/app/${bId}/phone/imei`,
    icon: 'Smartphone',
    requiredPermission: 'inventory.read',
    allowedBusinessTypes: ['phone'],
  },
  'phone.sellin': {
    id: 'phone.sellin',
    name: 'Sell In (Beli Gadget)',
    description: 'Penerimaan unit langsung dari customer/pelanggan',
    category: 'phone',
    path: (bId) => `/app/${bId}/phone/sell-in`,
    icon: 'ArrowDownToLine',
    requiredPermission: 'inventory.receive',
    allowedBusinessTypes: ['phone'],
  },
  'phone.exchange': {
    id: 'phone.exchange',
    name: 'Tukar Unit & Garansi',
    description: 'Klaim unit bermasalah, validasi garansi, & tukar tambah IMEI',
    category: 'phone',
    path: (bId) => `/app/${bId}/phone/exchange`,
    icon: 'RefreshCw',
    requiredPermission: 'approvals.manage',
    allowedBusinessTypes: ['phone'],
  },

  // Retail Specific Modules
  'retail.barcode': {
    id: 'retail.barcode',
    name: 'Scan Barcode Cepat',
    description: 'Mode kasir cepat optimalisasi barcode scanner & keyboard',
    category: 'retail',
    path: (bId) => `/app/${bId}/pos`,
    icon: 'ScanBarcode',
    requiredPermission: 'sales.create',
    allowedBusinessTypes: ['retail'],
  },
};

export const DEFAULT_MODULES_BY_TYPE: Record<BusinessType, string[]> = {
  fnb: [
    'core.pos',
    'core.dashboard',
    'fnb.tables',
    'fnb.kitchen',
    'core.products',
    'core.inventory',
    'core.employees',
    'core.reports',
    'core.finance',
    'core.settings',
  ],
  phone: [
    'core.pos',
    'core.dashboard',
    'phone.imei',
    'phone.sellin',
    'phone.exchange',
    'core.products',
    'core.inventory',
    'core.employees',
    'core.reports',
    'core.settings',
  ],
  retail: [
    'core.pos',
    'core.dashboard',
    'retail.barcode',
    'core.products',
    'core.inventory',
    'core.employees',
    'core.reports',
    'core.finance',
    'core.settings',
  ],
};

export interface NavigationItem {
  id: string;
  name: string;
  path: string;
  icon: string;
}

export function getNavigationForUser(
  businessId: string,
  businessType: BusinessType,
  enabledModules: string[],
  userRole: UserRole,
  customPermissions?: PermissionKey[]
): NavigationItem[] {
  const items: NavigationItem[] = [];

  for (const modId of enabledModules) {
    const mod = MODULE_REGISTRY[modId];
    if (!mod) continue;
    if (!mod.allowedBusinessTypes.includes(businessType)) continue;

    if (mod.requiredPermission) {
      if (!hasPermission(userRole, mod.requiredPermission, customPermissions)) {
        continue;
      }
    }

    items.push({
      id: mod.id,
      name: mod.name,
      path: mod.path(businessId),
      icon: mod.icon,
    });
  }

  return items;
}

/**
 * Authoritatively validates whether a specific URL route is permitted for
 * the current business vertical, active modules, and user role/permissions.
 */
export function evaluateRouteAccess(
  pathname: string,
  business: Business | null,
  userRole: UserRole,
  customPermissions?: PermissionKey[]
): { allowed: boolean; reason?: string } {
  if (!business) return { allowed: true };

  // Match current route to module definition in MODULE_REGISTRY
  for (const [modId, mod] of Object.entries(MODULE_REGISTRY)) {
    const modPath = mod.path(business.id);
    if (pathname === modPath || (modPath !== `/app/${business.id}` && pathname.startsWith(`${modPath}/`))) {
      // 1. Business vertical check
      if (!mod.allowedBusinessTypes.includes(business.businessType)) {
        return {
          allowed: false,
          reason: `Modul '${mod.name}' hanya tersedia untuk unit bisnis bertipe ${mod.allowedBusinessTypes.join(', ').toUpperCase()}. Unit bisnis Anda saat ini bertipe ${business.businessType.toUpperCase()}.`,
        };
      }

      // 2. Active enabled modules check
      if (business.enabledModules && !business.enabledModules.includes(modId)) {
        return {
          allowed: false,
          reason: `Modul '${mod.name}' sedang dinonaktifkan pada pengaturan unit bisnis ini.`,
        };
      }

      // 3. User permission check
      if (mod.requiredPermission) {
        if (!hasPermission(userRole, mod.requiredPermission, customPermissions)) {
          return {
            allowed: false,
            reason: `Akses ditolak: Peran '${userRole}' tidak memiliki izin '${mod.requiredPermission}' yang diperlukan untuk mengakses fitur '${mod.name}'.`,
          };
        }
      }

      return { allowed: true };
    }
  }

  return { allowed: true };
}
