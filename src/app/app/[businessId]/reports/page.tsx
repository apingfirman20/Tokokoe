'use client';

import React, { useState, use } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { Sale } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { 
  FileBarChart, Search, Printer, Calendar, 
  ArrowUpRight, CreditCard, Banknote, X 
} from 'lucide-react';

export default function ReportsPage() {
  const { sales, activeBusiness } = useBusiness();
  const businessId = activeBusiness?.id || 'biz_kopi_senja';

  const [search, setSearch] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const businessSales = sales.filter(s => s.businessId === businessId);

  const filteredSales = businessSales.filter(s => 
    s.saleNumber.toLowerCase().includes(search.toLowerCase()) ||
    s.cashierName.toLowerCase().includes(search.toLowerCase()) ||
    (s.customerName && s.customerName.toLowerCase().includes(search.toLowerCase()))
  );

  const totalRevenue = businessSales.reduce((acc, s) => acc + s.grandTotal, 0);
  const avgTicket = businessSales.length > 0 ? Math.round(totalRevenue / businessSales.length) : 0;
  const cashSales = businessSales.filter(s => s.paymentMethod === 'cash').reduce((acc, s) => acc + s.grandTotal, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Laporan Transaksi Penjualan
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Rekapitulasi seluruh bukti transaksi kasir terpusat ({businessSales.length} transaksi)
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white font-semibold text-xs transition-colors self-start sm:self-auto"
        >
          <Printer className="w-4 h-4" />
          <span>Cetak Rekap Laporan</span>
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Omset Total Terverifikasi</span>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {formatRupiah(totalRevenue)}
          </div>
          <span className="text-[11px] text-teal-700 font-medium">Berdasarkan data penjualan lunas</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Rata-rata Transaksi (AOV)</span>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {formatRupiah(avgTicket)}
          </div>
          <span className="text-[11px] text-slate-500">Nilai keranjang rata-rata</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Porsi Pembayaran Tunai</span>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {formatRupiah(cashSales)}
          </div>
          <span className="text-[11px] text-slate-500">Tersimpan dalam sesi laci kasir</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nomor struk (TRX-...), nama kasir, atau pelanggan..."
          className="w-full bg-transparent border-0 outline-none text-xs text-slate-900"
        />
      </div>

      {/* Sales Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">No. Transaksi</th>
                <th className="py-3 px-4">Waktu</th>
                <th className="py-3 px-4">Kasir</th>
                <th className="py-3 px-4">Tipe / Info</th>
                <th className="py-3 px-4">Metode</th>
                <th className="py-3 px-4 text-right">Total Tagihan</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">
                    {sale.saleNumber}
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {new Date(sale.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    {sale.cashierName}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {sale.tableNumber || sale.customerName || sale.orderType}
                  </td>
                  <td className="py-3 px-4 uppercase font-semibold text-slate-700">
                    {sale.paymentMethod}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                    {formatRupiah(sale.grandTotal)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => setSelectedSale(sale)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] transition-colors"
                    >
                      Detail Struk
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sale Detail / Receipt Modal */}
      {selectedSale && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <span className="font-bold text-sm text-slate-900">Detail Nota Penjualan</span>
              <button onClick={() => setSelectedSale(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-slate-300 font-mono text-[11px] space-y-2">
              <div className="text-center font-bold text-sm text-slate-900">
                {activeBusiness?.name}
              </div>
              <div className="text-center text-[10px] text-slate-500">
                {selectedSale.saleNumber} • {new Date(selectedSale.createdAt).toLocaleString('id-ID')}
              </div>
              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
                {selectedSale.lineItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <div>
                      <div>{item.productName}</div>
                      <div className="text-[10px] text-slate-400">{item.quantity} x {formatRupiah(item.unitPrice)}</div>
                      {item.imei && <div className="text-[10px] text-indigo-700">IMEI: {item.imei}</div>}
                    </div>
                    <span className="tabular-nums font-semibold">{formatRupiah(item.subtotal)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 text-right space-y-0.5">
                <div className="flex justify-between font-bold text-xs pt-1">
                  <span>TOTAL:</span>
                  <span className="tabular-nums">{formatRupiah(selectedSale.grandTotal)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Metode:</span>
                  <span className="uppercase">{selectedSale.paymentMethod}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setSelectedSale(null)}
                className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-semibold text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
