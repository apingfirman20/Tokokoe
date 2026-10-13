'use client';

import React, { use } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { useAuth } from '@/context/AuthContext';
import { CashSession } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { hasPermission } from '@/lib/permissions';
import { 
  TrendingUp, CircleDollarSign, AlertCircle, 
  ShieldAlert, ArrowUpRight, Scale, PieChart, Banknote 
} from 'lucide-react';

export default function FinancePage() {
  const { sales, products, cashSessions, activeBusiness } = useBusiness();
  const businessId = activeBusiness?.id || 'biz_kopi_senja';
  const { user } = useAuth();

  const canReadFinance = hasPermission(user?.memberRole || 'owner', 'finance.read', user?.permissions);

  if (!canReadFinance) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900">Akses Terbatas (Restricted)</h2>
        <p className="text-xs text-slate-500 mt-1">
          Hanya peran Pemilik (Owner) dan Akuntan yang memiliki izin untuk melihat laporan keuangan & laba HPP.
        </p>
      </div>
    );
  }

  const bizSales = sales.filter(s => s.businessId === businessId);

  // Revenue calculation
  const grossRevenue = bizSales.reduce((acc, s) => acc + s.grandTotal, 0);

  // Cost of Goods Sold (HPP) calculation from line items matching product cost prices
  let totalCOGS = 0;
  for (const s of bizSales) {
    for (const item of s.lineItems) {
      const prod = products.find(p => p.id === item.productId);
      const cost = prod ? prod.costPrice : Math.round(item.unitPrice * 0.5);
      totalCOGS += cost * item.quantity;
    }
  }

  const grossProfit = grossRevenue - totalCOGS;
  const marginPercent = grossRevenue > 0 ? Math.round((grossProfit / grossRevenue) * 100) : 0;

  // Total cash in drawer across sessions
  const totalCashDrawer = cashSessions
    .filter((s: CashSession) => s.businessId === businessId)
    .reduce((acc: number, s: CashSession) => acc + (s.actualClosingCash ?? s.expectedClosingCash), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Laporan Keuangan & Analisis Laba
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Pemisahan ketat antara Omset Bruto, HPP (Biaya Pokok Penjualan), dan Laba Kotor estimasi operasional
        </p>
      </div>

      {/* Accounting Clarification Banner */}
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-sm">Transparansi Pembukuan Keuangan Tokokoe</div>
          <p className="text-amber-800 leading-relaxed text-[11px]">
            Sistem membedakan secara tegas antara <strong>Omset (Revenue)</strong>, <strong>Laba Kotor (Gross Profit)</strong>, dan <strong>Saldo Kas Laci</strong>. Nilai laba bersih operasional berstatus estimasi berbasis HPP dan belum memperhitungkan biaya sewa ruko atau beban pajak tahunan entitas.
          </p>
        </div>
      </div>

      {/* Financial Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Omset Bruto */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Omset Bruto (Gross Revenue)</span>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {formatRupiah(grossRevenue)}
          </div>
          <span className="text-[11px] text-teal-700 font-medium">Total seluruh pembayaran masuk</span>
        </div>

        {/* HPP (COGS) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Total HPP / Modal Pokok</span>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {formatRupiah(totalCOGS)}
          </div>
          <span className="text-[11px] text-slate-500">Biaya pengadaan bahan & unit terjual</span>
        </div>

        {/* Laba Kotor */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Estimasi Laba Kotor</span>
          <div className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">
            {formatRupiah(grossProfit)}
          </div>
          <span className="text-[11px] text-emerald-600 font-semibold">Margin Kotor: ~{marginPercent}%</span>
        </div>

        {/* Saldo Kas Kasir */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Saldo Kas Laci (Drawer)</span>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {formatRupiah(totalCashDrawer)}
          </div>
          <span className="text-[11px] text-slate-500">Akumulasi modal awal + penjualan tunai</span>
        </div>
      </div>

      {/* Detailed Shift Sessions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-sm text-slate-900">Rekap Sesi Kasir & Selisih Laci Tunai</h2>
          <span className="text-xs text-slate-500">Shift audit trail</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Kasir / Shift</th>
                <th className="py-3 px-4">Waktu Buka</th>
                <th className="py-3 px-4 text-right">Modal Awal</th>
                <th className="py-3 px-4 text-right">Penjualan Tunai</th>
                <th className="py-3 px-4 text-right">Kas Diharapkan</th>
                <th className="py-3 px-4 text-right">Fisik Dihitung</th>
                <th className="py-3 px-4 text-center">Selisih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cashSessions.filter((s: CashSession) => s.businessId === businessId).map((s: CashSession) => (
                <tr key={s.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {s.cashierName} ({s.notes})
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {new Date(s.openedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums">
                    {formatRupiah(s.openingCash)}
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-emerald-700 tabular-nums">
                    +{formatRupiah(s.cashSalesTotal)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold tabular-nums">
                    {formatRupiah(s.expectedClosingCash)}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                    {s.actualClosingCash !== undefined ? formatRupiah(s.actualClosingCash) : '(Masih Buka)'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {s.discrepancy !== undefined ? (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        s.discrepancy === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {formatRupiah(s.discrepancy)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Aktif</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
