'use client';

import React from 'react';
import Link from 'next/link';
import { useBusiness } from '@/context/BusinessContext';
import { formatRupiah } from '@/lib/utils';
import { 
  TrendingUp, CircleDollarSign, Package, Users, 
  Coffee, Smartphone, ShoppingBag, Clock, CheckCircle2,
  AlertCircle, ArrowRight, Store, Plus, UtensilsCrossed
} from 'lucide-react';

export default function DashboardPage() {
  const { activeBusiness, activeBranch, sales, products, activeShift, tables, imeiUnits } = useBusiness();
  const businessId = activeBusiness?.id || 'biz_kopi_senja';

  // Metrics calculation
  const businessSales = sales.filter(s => s.businessId === businessId);
  const todayRevenue = businessSales.reduce((sum, s) => sum + s.grandTotal, 0);
  const completedOrdersCount = businessSales.filter(s => s.paymentStatus === 'paid').length;

  const occupiedTables = tables.filter(t => t.status === 'occupied').length;
  const availableImeis = imeiUnits.filter(u => u.status === 'available').length;
  const lowStockProducts = products.filter(p => p.trackStock && p.stockQty <= 5).length;

  return (
    <div className="space-y-6">
      {/* Page Title & Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {activeBusiness?.name || 'Dashboard'}
            </h1>
            <span className="text-xs bg-teal-100 text-teal-800 font-semibold px-2.5 py-0.5 rounded-full border border-teal-200 uppercase">
              {activeBusiness?.businessType}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Cabang Aktif: <strong className="text-slate-700">{activeBranch?.name || 'Cabang Utama'}</strong> • Ringkasan operasional real-time
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href={`/app/${businessId}/pos`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-sm transition-all"
          >
            <CircleDollarSign className="w-4 h-4" />
            <span>Buka Kasir POS</span>
          </Link>
          <Link
            href={`/app/${businessId}/products`}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Produk</span>
          </Link>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Omset Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Penjualan</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">
              {formatRupiah(todayRevenue)}
            </div>
            <div className="text-[11px] text-teal-700 font-medium mt-1 flex items-center gap-1">
              <span>● {businessSales.length} total transaksi tercatat</span>
            </div>
          </div>
        </div>

        {/* Transaksi Berhasil */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Pesanan Lunas</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">
              {completedOrdersCount} Pesanan
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Tercatat pada database Firestore
            </div>
          </div>
        </div>

        {/* Shift Kasir Status */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Status Shift Kasir</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeShift ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${activeShift ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>{activeShift ? 'Shift Aktif' : 'Shift Belum Dibuka'}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {activeShift ? `Kasir: ${activeShift.cashierName}` : 'Klik Buka Shift di menu POS'}
            </div>
          </div>
        </div>

        {/* Industry Specific Metric Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {activeBusiness?.businessType === 'fnb' && 'Status Meja'}
              {activeBusiness?.businessType === 'phone' && 'Stok IMEI Siap Jual'}
              {activeBusiness?.businessType === 'retail' && 'Peringatan Stok'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              {activeBusiness?.businessType === 'fnb' && <UtensilsCrossed className="w-4 h-4" />}
              {activeBusiness?.businessType === 'phone' && <Smartphone className="w-4 h-4" />}
              {activeBusiness?.businessType === 'retail' && <AlertCircle className="w-4 h-4" />}
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">
              {activeBusiness?.businessType === 'fnb' && `${occupiedTables} / ${tables.length} Terisi`}
              {activeBusiness?.businessType === 'phone' && `${availableImeis} Unit`}
              {activeBusiness?.businessType === 'retail' && `${lowStockProducts} SKU Menipis`}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {activeBusiness?.businessType === 'fnb' && (
                <Link href={`/app/${businessId}/fnb/tables`} className="text-teal-700 hover:underline">
                  Lihat layout denah meja →
                </Link>
              )}
              {activeBusiness?.businessType === 'phone' && (
                <Link href={`/app/${businessId}/phone/imei`} className="text-indigo-700 hover:underline">
                  Pelacak & history IMEI →
                </Link>
              )}
              {activeBusiness?.businessType === 'retail' && (
                <Link href={`/app/${businessId}/inventory`} className="text-emerald-700 hover:underline">
                  Cek stok menipis →
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base text-slate-900">Transaksi Terkini</h2>
            <p className="text-xs text-slate-500">5 transaksi penjualan paling baru di cabang ini</p>
          </div>
          <Link
            href={`/app/${businessId}/reports`}
            className="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1"
          >
            <span>Semua Laporan</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {businessSales.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            Belum ada transaksi di cabang ini. Buka kasir POS untuk memulai penjualan pertama!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">No. Transaksi</th>
                  <th className="py-3 px-4">Kasir</th>
                  <th className="py-3 px-4">Tipe / Meja</th>
                  <th className="py-3 px-4">Item</th>
                  <th className="py-3 px-4">Metode Bayar</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {businessSales.slice(0, 5).map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-slate-800">
                      {sale.saleNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {sale.cashierName}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {sale.tableNumber ? (
                        <span className="font-semibold text-teal-700">{sale.tableNumber}</span>
                      ) : (
                        <span className="capitalize">{sale.orderType.replace('_', ' ')}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {sale.lineItems.length} produk ({sale.lineItems.map(i => i.productName).join(', ').slice(0, 30)}...)
                    </td>
                    <td className="py-3 px-4 font-medium uppercase text-slate-700">
                      {sale.paymentMethod}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                      {formatRupiah(sale.grandTotal)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {sale.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
