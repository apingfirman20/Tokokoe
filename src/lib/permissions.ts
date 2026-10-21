import { UserRole, PermissionKey } from "@/types";

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  owner: [
    'products.read',
    'products.cost.read',
    'products.create',
    'products.update',
    'products.delete',
    'sales.create',
    'sales.read',
    'sales.refund',
    'inventory.read',
    'inventory.receive',
    'inventory.adjust',
    'approvals.manage',
    'employees.create',
    'employees.manage',
    'finance.read',
    'reports.read',
    'business.settings.manage',
    'shift.manage',
  ],
  manager: [
    'products.read',
    'products.cost.read',
    'products.create',
    'products.update',
    'sales.create',
    'sales.read',
    'sales.refund',
    'inventory.read',
    'inventory.receive',
    'inventory.adjust',
    'approvals.manage',
    'employees.create',
    'employees.manage',
    'finance.read',
    'reports.read',
    'shift.manage',
  ],
  cashier: [
    'products.read',
    'sales.create',
    'sales.read',
    'inventory.read',
    'inventory.adjust',
    'shift.manage',
  ],
  warehouse: [
    'products.read',
    'inventory.read',
    'inventory.receive',
    'inventory.adjust',
  ],
  kitchen: [
    'sales.read',
  ],
  waiter: [
    'products.read',
    'sales.create',
    'sales.read',
  ],
  accountant: [
    'sales.read',
    'finance.read',
    'reports.read',
    'products.cost.read',
  ],
  technician: [
    'products.read',
    'inventory.read',
    'sales.create',
  ],
  courier: [
    'sales.read',
  ],
};

export function hasPermission(
  role: UserRole,
  permission: PermissionKey,
  customPermissions?: PermissionKey[]
): boolean {
  if (role === 'owner') return true;

  // If customPermissions is explicitly provided as an array (even if empty []),
  // respect the explicit configuration without falling back to role defaults.
  if (Array.isArray(customPermissions)) {
    return customPermissions.includes(permission);
  }

  // Fall back to standard role defaults only when customPermissions is undefined/null
  const defaultList = DEFAULT_ROLE_PERMISSIONS[role] || [];
  return defaultList.includes(permission);
}
