import { Product, ImeiUnit, PurchaseOrder, Sale, UserRole, PermissionKey } from "@/types";
import { hasPermission } from "../permissions";

/**
 * Evaluates whether a user has authoritative permission to read confidential cost prices (HPP).
 * Only owners, managers, accountants, or roles with explicit 'products.cost.read' are permitted.
 */
export function canReadCostPrice(role: UserRole, customPermissions?: PermissionKey[]): boolean {
  if (role === 'owner') return true;
  return hasPermission(role, 'products.cost.read', customPermissions);
}

/**
 * Sanitizes Product DTO, wiping costPrice and confidential supplier cost metrics
 * for unauthorized roles (cashiers, waiters, kitchen, warehouse, technicians).
 */
export function sanitizeProductDto<T extends Partial<Product>>(product: T, canReadCost: boolean): T {
  if (canReadCost) return product;
  return {
    ...product,
    costPrice: 0,
  };
}

/**
 * Sanitizes an array of Product DTOs.
 */
export function sanitizeProductDtos<T extends Partial<Product>>(products: T[], canReadCost: boolean): T[] {
  if (canReadCost) return products;
  return products.map(p => sanitizeProductDto(p, false));
}

/**
 * Sanitizes ImeiUnit DTO, wiping device serial acquisition cost (HPP) for unauthorized roles.
 */
export function sanitizeImeiUnitDto<T extends Partial<ImeiUnit>>(unit: T, canReadCost: boolean): T {
  if (canReadCost) return unit;
  return {
    ...unit,
    costPrice: 0,
  };
}

/**
 * Sanitizes an array of ImeiUnit DTOs.
 */
export function sanitizeImeiUnitDtos<T extends Partial<ImeiUnit>>(units: T[], canReadCost: boolean): T[] {
  if (canReadCost) return units;
  return units.map(u => sanitizeImeiUnitDto(u, false));
}

/**
 * Sanitizes PurchaseOrder DTO, masking totalCost and item cost prices for unauthorized roles.
 */
export function sanitizePurchaseOrderDto<T extends Partial<PurchaseOrder>>(po: T, canReadCost: boolean): T {
  if (canReadCost) return po;
  return {
    ...po,
    totalCost: 0,
    items: (po.items || []).map(item => ({
      ...item,
      costPrice: 0,
    })),
  };
}

/**
 * Sanitizes Sale DTO, stripping any costPrice or profit snapshots on line items.
 */
export function sanitizeSaleDto<T extends Partial<Sale>>(sale: T, canReadCost: boolean): T {
  if (canReadCost) return sale;
  return {
    ...sale,
    lineItems: (sale.lineItems || []).map(item => {
      const sanitized = { ...item };
      if ('costPrice' in sanitized) (sanitized as any).costPrice = 0;
      if ('profit' in sanitized) (sanitized as any).profit = 0;
      return sanitized;
    }),
  };
}
