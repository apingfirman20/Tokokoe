/**
 * Authoritative Inventory Reconciliation Service
 * Reconciles Firestore product stock against underlying StockMovements and serialized IMEI units.
 */

import { adminDb } from '@/lib/firebase/admin';
import { Product, StockMovement, ImeiUnit } from '@/types';

export interface InventoryReconciliationReport {
  productId: string;
  productName: string;
  currentStockQty: number;
  totalMovementsCount: number;
  calculatedStockFromMovements: number;
  movementsDiscrepancy: number;
  isMovementsConsistent: boolean;
  serializedImeiReport?: {
    availableImeiCount: number;
    soldImeiCount: number;
    quarantinedImeiCount: number;
    totalImeiCount: number;
    isSerializedConsistent: boolean;
    imeiDiscrepancy: number;
  };
}

/**
 * Performs authoritative inventory audit and reconciliation for a product in Firestore.
 */
export async function reconcileProductInventory(
  businessId: string, 
  productId: string
): Promise<InventoryReconciliationReport> {
  const prodRef = adminDb.doc(`businesses/${businessId}/products/${productId}`);
  const prodDoc = await prodRef.get();

  if (!prodDoc.exists) {
    throw new Error(`Produk dengan ID "${productId}" tidak ditemukan dalam bisnis "${businessId}".`);
  }

  const prodData = prodDoc.data() as Product;
  const currentStockQty = prodData.stockQty ?? 0;

  // 1. Fetch all stock movements for this product
  const movementsQuery = await adminDb
    .collection(`businesses/${businessId}/stockMovements`)
    .where('productId', '==', productId)
    .get();

  let calculatedStockFromMovements = 0;
  for (const doc of movementsQuery.docs) {
    const mov = doc.data() as StockMovement;
    calculatedStockFromMovements += mov.quantityDelta || 0;
  }

  const movementsDiscrepancy = currentStockQty - calculatedStockFromMovements;
  // If there are movements recorded, check if discrepancy is 0
  const isMovementsConsistent = movementsQuery.size === 0 || movementsDiscrepancy === 0;

  // 2. If serialized (phone store / smartphone category), reconcile against imeiUnits
  let serializedImeiReport: InventoryReconciliationReport['serializedImeiReport'] = undefined;

  const imeiQuery = await adminDb
    .collection(`businesses/${businessId}/imeiUnits`)
    .where('productId', '==', productId)
    .get();

  if (imeiQuery.size > 0 || prodData.category === 'Smartphone' || prodData.brand) {
    let availableCount = 0;
    let soldCount = 0;
    let quarantinedCount = 0;

    for (const doc of imeiQuery.docs) {
      const unit = doc.data() as ImeiUnit;
      if (unit.status === 'available') availableCount++;
      else if (unit.status === 'sold') soldCount++;
      else if (unit.status === 'quarantined') quarantinedCount++;
    }

    const imeiDiscrepancy = currentStockQty - availableCount;
    serializedImeiReport = {
      availableImeiCount: availableCount,
      soldImeiCount: soldCount,
      quarantinedImeiCount: quarantinedCount,
      totalImeiCount: imeiQuery.size,
      imeiDiscrepancy: imeiDiscrepancy,
      isSerializedConsistent: imeiDiscrepancy === 0,
    };
  }

  return {
    productId,
    productName: prodData.name || productId,
    currentStockQty,
    totalMovementsCount: movementsQuery.size,
    calculatedStockFromMovements,
    movementsDiscrepancy,
    isMovementsConsistent,
    serializedImeiReport,
  };
}
