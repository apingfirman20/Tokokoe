import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { Sale, StockMovement, ImeiHistory } from "@/types";
import { 
  requireAuthenticatedUser, 
  requireBusinessPermission, 
  requireBranchAccess, 
  handleAuthApiError 
} from "@/lib/server/auth-guard";

const refundSchema = z.object({
  businessId: z.string().min(1),
  branchId: z.string().min(1),
  saleId: z.string().min(1),
  reason: z.string().min(3, "Alasan retur / refund wajib diisi minimal 3 karakter."),
  refundPaymentMethod: z.enum(['cash', 'transfer', 'midtrans_qris', 'qris']).optional(),
});

export async function POST(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const parsed = refundSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data pengajuan refund tidak valid." },
        { status: 400 }
      );
    }

    const { businessId, branchId, saleId, reason, refundPaymentMethod } = parsed.data;

    // RBAC: require sales.refund permission
    const membership = await requireBusinessPermission(businessId, authUser.uid, 'sales.refund');
    await requireBranchAccess(businessId, authUser.uid, branchId);

    const now = Date.now();
    let updatedSaleResult: Sale | null = null;

    await adminDb.runTransaction(async (transaction) => {
      // ----------------------------------------------------
      // PHASE A: ALL READS FIRST
      // ----------------------------------------------------
      const saleRef = adminDb.doc(`businesses/${businessId}/sales/${saleId}`);
      const saleDoc = await transaction.get(saleRef);

      if (!saleDoc.exists) {
        throw new Error("Transaksi penjualan tidak ditemukan.");
      }

      const saleData = saleDoc.data() as Sale;
      if (saleData.businessId !== businessId || saleData.branchId !== branchId) {
        throw new Error("Transaksi tidak cocok dengan tenant atau cabang yang diakses.");
      }

      if (saleData.paymentStatus === 'refunded') {
        throw new Error("Transaksi ini sudah pernah direfund sebelumnya.");
      }

      if (saleData.paymentStatus !== 'paid') {
        throw new Error("Hanya transaksi dengan status 'paid' (lunas) yang dapat direfund.");
      }

      // Read all products involved in line items
      const productDocsMap = new Map<string, any>();
      for (const item of saleData.lineItems) {
        if (!productDocsMap.has(item.productId)) {
          const pRef = adminDb.doc(`businesses/${businessId}/products/${item.productId}`);
          const pDoc = await transaction.get(pRef);
          productDocsMap.set(item.productId, pDoc);
        }
      }

      // Read serialized units if any
      const unitDocsMap = new Map<string, { ref: any; data: any }>();
      for (const item of saleData.lineItems) {
        if (item.imei) {
          const regRef = adminDb.doc(`businesses/${businessId}/registeredImeis/${item.imei}`);
          const regDoc = await transaction.get(regRef);
          const resolvedUnitId = regDoc.exists && regDoc.data()?.unitId ? regDoc.data()!.unitId : item.imei;
          const uRef = adminDb.doc(`businesses/${businessId}/imeiUnits/${resolvedUnitId}`);
          const uDoc = await transaction.get(uRef);
          if (uDoc.exists) {
            unitDocsMap.set(item.imei, { ref: uRef, data: uDoc.data() });
          }
        }
      }

      // Read cash session if exists
      let sessionDoc: any = null;
      let sessionRef: any = null;
      if (saleData.cashSessionId) {
        sessionRef = adminDb.doc(`businesses/${businessId}/cashSessions/${saleData.cashSessionId}`);
        sessionDoc = await transaction.get(sessionRef);
      }

      // ----------------------------------------------------
      // PHASE B: ALL WRITES SECOND
      // ----------------------------------------------------
      const resolvedRefundMethod = refundPaymentMethod || saleData.paymentMethod;

      const updatedSaleData: Sale = {
        ...saleData,
        paymentStatus: 'refunded',
        orderStatus: 'completed',
        refundedAt: now,
        refundReason: reason,
        refundedBy: authUser.uid,
        refundedByName: membership.displayName,
        refundMethod: resolvedRefundMethod,
        updatedAt: now,
      };

      transaction.update(saleRef, {
        paymentStatus: 'refunded',
        orderStatus: 'completed',
        refundedAt: now,
        refundReason: reason,
        refundedBy: authUser.uid,
        refundedByName: membership.displayName,
        refundMethod: resolvedRefundMethod,
        updatedAt: now,
      });

      updatedSaleResult = updatedSaleData;

      // Restore physical product stock and record authoritative StockMovement
      for (const item of saleData.lineItems) {
        const pDoc = productDocsMap.get(item.productId);
        if (pDoc && pDoc.exists) {
          const currentQty = pDoc.data()?.stockQty || 0;
          const newQty = currentQty + item.quantity;
          const pRef = adminDb.doc(`businesses/${businessId}/products/${item.productId}`);
          transaction.update(pRef, {
            stockQty: newQty,
            updatedAt: now,
          });

          // Stock Movement ledger entry
          const movRef = adminDb.collection(`businesses/${businessId}/stockMovements`).doc();
          const movData: StockMovement = {
            id: movRef.id,
            businessId,
            branchId,
            productId: item.productId,
            productName: item.productName,
            type: 'refund',
            quantityDelta: item.quantity,
            previousQty: currentQty,
            newQty,
            referenceId: saleData.saleNumber,
            operatorId: authUser.uid,
            operatorName: membership.displayName,
            notes: `Retur / Refund penjualan ${saleData.saleNumber}: ${reason}`,
            timestamp: now,
          };
          transaction.set(movRef, movData);
        }

        // Restore serialized unit
        if (item.imei) {
          const unitEntry = unitDocsMap.get(item.imei);
          if (unitEntry) {
            transaction.update(unitEntry.ref, {
              status: 'available',
              soldAtSaleId: '',
              notes: `Unit dikembalikan dari retur transaksi ${saleData.saleNumber} (${reason})`,
              updatedAt: now,
            });

            const histRef = adminDb.collection(`businesses/${businessId}/imeiHistory`).doc();
            const histData: ImeiHistory = {
              id: histRef.id,
              businessId,
              imei: item.imei,
              unitId: unitEntry.data.id || item.imei,
              action: 'returned',
              referenceId: saleData.saleNumber,
              branchId,
              operatorId: authUser.uid,
              operatorName: membership.displayName,
              notes: `Retur unit ke stok dari transaksi ${saleData.saleNumber}: ${reason}`,
              timestamp: now,
            };
            transaction.set(histRef, histData);
          }
        }
      }

      // Cash drawer adjustment if cash sale / refund
      if (sessionDoc && sessionDoc.exists && sessionDoc.data()?.status === 'open') {
        const sData = sessionDoc.data();
        const currentCashOut = sData.cashOutTotal || 0;
        const currentExpected = sData.expectedClosingCash || 0;
        const currentDrawer = typeof sData.currentCashDrawer === 'number' ? sData.currentCashDrawer : currentExpected;
        const refundAmount = saleData.grandTotal;

        transaction.update(sessionRef, {
          cashOutTotal: currentCashOut + refundAmount,
          expectedClosingCash: Math.max(0, currentExpected - refundAmount),
          currentCashDrawer: Math.max(0, currentDrawer - refundAmount),
          updatedAt: now,
        });
      }

      // Permanent Audit Log
      const auditRef = adminDb.collection(`businesses/${businessId}/auditLogs`).doc();
      transaction.set(auditRef, {
        id: auditRef.id,
        action: 'sale_refund',
        businessId,
        branchId,
        referenceId: saleData.saleNumber,
        saleId,
        refundAmount: saleData.grandTotal,
        reason,
        refundMethod: resolvedRefundMethod,
        operatorId: authUser.uid,
        operatorName: membership.displayName,
        timestamp: now,
      });
    });

    return NextResponse.json({
      success: true,
      sale: updatedSaleResult,
      message: `Transaksi ${(updatedSaleResult as Sale | null)?.saleNumber || saleId} berhasil direfund dan stok telah dipulihkan.`,
    });
  } catch (error: any) {
    if (error.message?.includes('sudah pernah direfund')) {
      return NextResponse.json({ success: false, message: error.message }, { status: 409 });
    }
    if (
      error.message?.includes('tidak ditemukan') || 
      error.message?.includes('tidak cocok') ||
      error.message?.includes('Hanya transaksi dengan status')
    ) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return handleAuthApiError(error);
  }
}
