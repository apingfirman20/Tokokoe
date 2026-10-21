'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { useAuth } from '@/context/AuthContext';
import { Sale } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { ReceiptModal } from '@/components/pos/ReceiptModal';
import { 
  FileBarChart, Search, Printer, Calendar, 
  ArrowUpRight, CreditCard, Banknote, X,
  ChevronLeft, ChevronRight, RefreshCw, Filter,
  Download, Clock, CheckCircle2, RotateCcw, AlertCircle
} from 'lucide-react';

export default function ReportsPage() {
  const { sales: contextSales, activeBusiness, activeBranch, branches } = useBusiness();
  const { getIdToken } = useAuth();
  const businessId = activeBusiness?.id || 'biz_kopi_senja';

  const [search, setSearch] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(15);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  
  // Financial metrics from server
  const [grossRevenue, setGrossRevenue] = useState<number>(0);
  const [paidRevenue, setPaidRevenue] = useState<number>(0);
  const [pendingRevenue, setPendingRevenue] = useState<number>(0);
  const [refundedTotal, setRefundedTotal] = useState<number>(0);
  const [netRevenue, setNetRevenue] = useState<number>(0);
  const [grossProfit, setGrossProfit] = useState<number>(0);
  const [cashSales, setCashSales] = useState<number>(0);
  const [nonCashSales, setNonCashSales] = useState<number>(0);

  const [serverSales, setServerSales] = useState<Sale[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const fetchSalesHistory = useCallback(async (targetPage = 1) => {
    if (!businessId) return;
    setIsLoading(true);
    try {
      const token = await getIdToken();
      const params = new URLSearchParams({
        businessId,
        page: targetPage.toString(),
        limit: limit.toString(),
      });
      if (selectedBranchId) params.append('branchId', selectedBranchId);
      if (selectedPaymentMethod) params.append('paymentMethod', selectedPaymentMethod);
      if (selectedPaymentStatus) params.append('paymentStatus', selectedPaymentStatus);
      if (startDate) params.append('startDate', new Date(startDate).getTime().toString());
      if (endDate) params.append('endDate', (new Date(endDate).getTime() + 86399999).toString());
      if (search.trim()) params.append('search', search.trim());

      const res = await fetch(`/api/sales/history?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success) {
        setServerSales(data.sales || []);
        setPage(data.pagination.page);
        setTotalPages(data.pagination.totalPages);
        setTotalCount(data.summary.totalSalesCount);
        setGrossRevenue(data.summary.grossRevenue ?? data.summary.totalRevenue ?? 0);
        setPaidRevenue(data.summary.paidRevenue ?? data.summary.totalRevenue ?? 0);
        setPendingRevenue(data.summary.pendingRevenue ?? 0);
        setRefundedTotal(data.summary.refundedTotal ?? 0);
        setNetRevenue(data.summary.netRevenue ?? data.summary.totalRevenue ?? 0);
        setGrossProfit(data.summary.grossProfit ?? 0);
        setCashSales(data.summary.cashSales ?? 0);
        setNonCashSales(data.summary.nonCashSales ?? 0);
      } else {
        setServerSales(null);
      }
    } catch {
      setServerSales(null);
    } finally {
      setIsLoading(false);
    }
  }, [businessId, limit, selectedBranchId, selectedPaymentMethod, selectedPaymentStatus, startDate, endDate, search, getIdToken]);

  useEffect(() => {
    fetchSalesHistory(1);
  }, [fetchSalesHistory]);

  const handleExportCsv = async () => {
    if (!businessId) return;
    setIsExporting(true);
    try {
      const token = await getIdToken();
      const params = new URLSearchParams({
        businessId,
        export: 'csv',
      });
      if (selectedBranchId) params.append('branchId', selectedBranchId);
      if (selectedPaymentMethod) params.append('paymentMethod', selectedPaymentMethod);
      if (selectedPaymentStatus) params.append('paymentStatus', selectedPaymentStatus);
      if (startDate) params.append('startDate', new Date(startDate).getTime().toString());
      if (endDate) params.append('endDate', (new Date(endDate).getTime() + 86399999).toString());
      if (search.trim()) params.append('search', search.trim());

      const res = await fetch(`/api/sales/history?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        alert("Gagal mengunduh laporan CSV.");
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `laporan-penjualan-${businessId}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("Terjadi kesalahan saat mengekspor data: " + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  // Fallback calculation from context if backend API is not yet loaded
  const businessContextSales = contextSales.filter(s => s.businessId === businessId);
  const displaySales = serverSales !== null ? serverSales : businessContextSales.filter(s => {
    const matchSearch = !search || 
      s.saleNumber.toLowerCase().includes(search.toLowerCase()) ||
      s.cashierName.toLowerCase().includes(search.toLowerCase()) ||
      (s.customerName && s.customerName.toLowerCase().includes(search.toLowerCase()));
    const matchBranch = !selectedBranchId || s.branchId === selectedBranchId;
    const matchMethod = !selectedPaymentMethod || s.paymentMethod === selectedPaymentMethod;
    const matchStatus = !selectedPaymentStatus || (s.paymentStatus || 'paid') === selectedPaymentStatus;
    return matchSearch && matchBranch && matchMethod && matchStatus;
  });

  const effectiveNetRevenue = serverSales !== null 
    ? netRevenue 
    : displaySales.filter(s => (s.paymentStatus || 'paid') === 'paid').reduce((acc, s) => acc + s.grandTotal, 0);

  const effectiveCount = serverSales !== null 
    ? totalCount 
    : displaySales.length;

  const effectivePending = serverSales !== null
    ? pendingRevenue
    : displaySales.filter(s => s.paymentStatus === 'pending').reduce((acc, s) => acc + s.grandTotal, 0);

  const effectiveRefunded = serverSales !== null
    ? refundedTotal
    : displaySales.filter(s => s.paymentStatus === 'refunded').reduce((acc, s) => acc + s.grandTotal, 0);

  const avgTicket = effectiveCount > 0 ? Math.round(effectiveNetRevenue / effectiveCount) : 0;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Laporan Transaksi & Keuangan
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Rekonsiliasi transaksi, laba HPP historis, dan pemisahan status pembayaran ({effectiveCount} transaksi)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchSalesHistory(page)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Muat Ulang</span>
          </button>
          <button
            onClick={handleExportCsv}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? "Mengekspor..." : "Ekspor CSV"}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Omset Bersih (Net Revenue)</span>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {formatRupiah(effectiveNetRevenue)}
          </div>
          <span className="text-[11px] text-teal-700 font-medium">Hanya transaksi lunas terverifikasi</span>
        </div>

        {/* Gross Profit */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Laba Kotor (Gross Profit)</span>
          <div className="text-2xl font-bold text-emerald-600 mt-1 tabular-nums">
            {formatRupiah(grossProfit)}
          </div>
          <span className="text-[11px] text-slate-500">Berbasis HPP historis terlindungi</span>
        </div>

        {/* Pending Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Pesanan Pending (Non-Lunas)</span>
          <div className="text-2xl font-bold text-amber-600 mt-1 tabular-nums">
            {formatRupiah(effectivePending)}
          </div>
          <span className="text-[11px] text-amber-700">Reservasi stok belum diakui omset</span>
        </div>

        {/* Refunded Total */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Total Retur / Refund</span>
          <div className="text-2xl font-bold text-rose-600 mt-1 tabular-nums">
            {formatRupiah(effectiveRefunded)}
          </div>
          <span className="text-[11px] text-rose-700">Dana & stok dikompensasikan</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari TRX-..., nama kasir, atau pelanggan..."
            className="w-full bg-transparent border-0 outline-none text-xs text-slate-900"
          />
        </div>

        {/* Branch Filter */}
        {branches.length > 0 && (
          <select
            value={selectedBranchId}
            onChange={(e) => {
              setSelectedBranchId(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 text-slate-700 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none font-medium"
          >
            <option value="">Semua Cabang</option>
            {branches.map(br => (
              <option key={br.id} value={br.id}>{br.name}</option>
            ))}
          </select>
        )}

        {/* Payment Method Filter */}
        <select
          value={selectedPaymentMethod}
          onChange={(e) => {
            setSelectedPaymentMethod(e.target.value);
            setPage(1);
          }}
          className="bg-slate-50 text-slate-700 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none font-medium"
        >
          <option value="">Semua Metode</option>
          <option value="cash">Tunai (Cash)</option>
          <option value="qris">QRIS (Toko Fisik)</option>
          <option value="midtrans_qris">QRIS (Midtrans)</option>
          <option value="transfer">Transfer Bank</option>
        </select>

        {/* Payment Status Filter */}
        <select
          value={selectedPaymentStatus}
          onChange={(e) => {
            setSelectedPaymentStatus(e.target.value);
            setPage(1);
          }}
          className="bg-slate-50 text-slate-700 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none font-medium"
        >
          <option value="">Semua Status</option>
          <option value="paid">Lunas (Paid)</option>
          <option value="pending">Pending</option>
          <option value="failed">Gagal / Expired</option>
          <option value="refunded">Direfund</option>
          <option value="cancelled">Dibatalkan</option>
        </select>

        {/* Date Range Filters */}
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 text-slate-700 text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 outline-none font-medium"
          />
          <span>s/d</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 text-slate-700 text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 outline-none font-medium"
          />
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">No. Transaksi</th>
                <th className="py-3 px-4">Waktu</th>
                <th className="py-3 px-4">Kasir / Pelanggan</th>
                <th className="py-3 px-4">Metode Bayar</th>
                <th className="py-3 px-4">Status Bayar</th>
                <th className="py-3 px-4 text-right">Total Tagihan</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displaySales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <FileBarChart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <span>Tidak ada catatan transaksi penjualan sesuai kriteria filter.</span>
                  </td>
                </tr>
              ) : (
                displaySales.map((sale) => {
                  const status = sale.paymentStatus || 'paid';
                  const statusBadgeClass = {
                    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    pending: 'bg-amber-50 text-amber-700 border-amber-200',
                    failed: 'bg-rose-50 text-rose-700 border-rose-200',
                    cancelled: 'bg-slate-100 text-slate-700 border-slate-200',
                    refunded: 'bg-purple-50 text-purple-700 border-purple-200',
                  }[status] || 'bg-slate-50 text-slate-600 border-slate-200';

                  const statusText = {
                    paid: 'LUNAS',
                    pending: 'PENDING',
                    failed: 'GAGAL',
                    cancelled: 'BATAL',
                    refunded: 'REFUNDED',
                  }[status] || status.toUpperCase();

                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                        {sale.saleNumber}
                        {sale.tableNumber && (
                          <div className="text-[10px] text-slate-400 font-sans">
                            Meja #{sale.tableNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-[11px]">
                        <div>{new Date(sale.createdAt).toLocaleDateString('id-ID')}</div>
                        <div className="text-slate-400">{new Date(sale.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        <div className="font-medium text-slate-900">{sale.customerName || 'Umum'}</div>
                        <div className="text-[10px] text-slate-400">Kasir: {sale.cashierName || 'Kasir'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800 uppercase text-[11px]">
                          {sale.paymentMethod === 'midtrans_qris' || sale.paymentMethod === 'qris' ? 'QRIS' : sale.paymentMethod}
                        </span>
                        {sale.transferReferenceNumber && (
                          <div className="text-[9px] text-slate-400">Ref: {sale.transferReferenceNumber}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${statusBadgeClass}`}>
                          {statusText}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                        {formatRupiah(sale.grandTotal)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedSale(sale)}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-[11px] transition-colors"
                        >
                          Lihat Struk
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Menampilkan {displaySales.length} dari {totalCount} transaksi
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchSalesHistory(page - 1)}
                disabled={page <= 1 || isLoading}
                className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-slate-700" />
              </button>
              <span className="px-2 font-semibold text-slate-700 font-mono">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => fetchSalesHistory(page + 1)}
                disabled={page >= totalPages || isLoading}
                className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-100 transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-slate-700" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full Thermal Receipt Modal */}
      <ReceiptModal
        isOpen={!!selectedSale}
        onClose={() => setSelectedSale(null)}
        sale={selectedSale}
        businessName={activeBusiness?.name}
        branchName={activeBranch?.name}
      />
    </div>
  );
}
