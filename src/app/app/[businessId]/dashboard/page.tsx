'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useBusiness } from '@/context/BusinessContext';
import { INITIAL_BUSINESSES } from '@/lib/data/seed-data';
import { formatRupiah } from '@/lib/utils';
import { 
  TrendingUp, CircleDollarSign, Package, Users, 
  Coffee, Smartphone, ShoppingBag, Clock, CheckCircle2,
  AlertCircle, ArrowRight, Store, Plus, UtensilsCrossed,
  Calendar, ChevronDown, MoreHorizontal, BarChart2,
  ClipboardCheck, FileText, Zap, RotateCcw, AlertTriangle,
  Cloud, Info, ShoppingCart
} from 'lucide-react';

export default function DashboardPage() {
  const params = useParams();
  const routeBusinessId = params?.businessId as string;
  const { activeBusiness, activeBranch, sales, products, activeShift, tables, imeiUnits, businesses } = useBusiness();
  
  const currentBiz = 
    (routeBusinessId ? businesses.find(b => b.id === routeBusinessId) : null) || 
    activeBusiness || 
    INITIAL_BUSINESSES.find(b => b.id === routeBusinessId) || 
    INITIAL_BUSINESSES[0];

  const businessId = currentBiz?.id || routeBusinessId || 'biz_kopi_senja';

  // Metrics calculation: only settled paid sales count as verified revenue
  const businessSales = sales.filter(s => s.businessId === businessId);
  const paidSales = businessSales.filter(s => (s.paymentStatus || 'paid') === 'paid');
  const todayRevenue = paidSales.reduce((sum, s) => sum + s.grandTotal, 0);
  const completedOrdersCount = paidSales.length;

  const occupiedTables = tables.filter(t => t.status === 'occupied').length;
  const availableImeis = imeiUnits.filter(u => u.status === 'available').length;
  const lowStockProducts = products.filter(p => p.trackStock && p.stockQty <= 5).length;
  const soldProductsCount = paidSales.reduce((sum, s) => sum + s.lineItems.reduce((acc, item) => acc + item.quantity, 0), 0);

  // Formatted current date and time
  const todayFormatted = React.useMemo(() => {
    const d = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }, []);

  const currentTimeStr = React.useMemo(() => {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }, []);

  // 7-day sales calculation for chart and statistics
  const last7Days = React.useMemo(() => {
    const days: { label: string; dateStr: string; amount: number; count: number }[] = [];
    const now = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayNum = d.getDate();
      const monthStr = months[d.getMonth()];
      const label = `${dayNum} ${monthStr}`;
      
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const endOfDay = startOfDay + 86400000;

      const daySales = paidSales.filter(s => {
        const t = s.createdAt || 0;
        return t >= startOfDay && t < endOfDay;
      });

      const dayAmount = daySales.reduce((acc, s) => acc + s.grandTotal, 0);

      days.push({
        label,
        dateStr: d.toISOString().split('T')[0],
        amount: dayAmount,
        count: daySales.length,
      });
    }
    return days;
  }, [paidSales]);

  const total7DaysRevenue = last7Days.reduce((acc, d) => acc + d.amount, 0);
  const total7DaysTransactions = last7Days.reduce((acc, d) => acc + d.count, 0);
  const avgTransaction = total7DaysTransactions > 0 
    ? Math.round(total7DaysRevenue / total7DaysTransactions) 
    : (businessSales.length > 0 ? Math.round(todayRevenue / businessSales.length) : 0);

  // SVG Chart points calculation
  const maxSales = Math.max(100000, Math.ceil(Math.max(...last7Days.map(d => d.amount), 1) / 100000) * 100000);
  const chartPoints = last7Days.map((day, i) => {
    const x = 30 + i * 70; // 30, 100, 170, 240, 310, 380, 450
    const y = 135 - (day.amount / maxSales) * 105;
    return { x, y, day };
  });

  const linePath = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `M ${chartPoints[0]?.x.toFixed(1) || 30} 135 ${linePath} L ${chartPoints[chartPoints.length - 1]?.x.toFixed(1) || 450} 135 Z`;

  return (
    <div className="space-y-6">
      {/* 1. Page Header: Greeting, Title, Type Badge, Cabang, Date Filter & Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="text-xs text-slate-400 font-medium block mb-0.5">
            Selamat datang kembali,
          </span>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {currentBiz?.name || 'Terserah'}
            </h1>
            <span className="text-[11px] bg-teal-50 text-[#00a887] font-bold px-2.5 py-0.5 rounded-full border border-teal-200/80 uppercase tracking-wide">
              {currentBiz?.businessType === 'fnb' ? 'F&B' : currentBiz?.businessType === 'phone' ? 'Phone Store' : 'Retail'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5 text-slate-400" />
            <span>Cabang Aktif: <strong className="text-slate-700">{activeBranch?.name || 'Cabang Utama'}</strong></span>
            <span className="text-slate-300">•</span>
            <span>Ringkasan operasional real-time</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Date Selector Filter */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200/90 text-slate-700 text-xs shadow-xs">
            <Calendar className="w-4 h-4 text-slate-400" />
            <div className="flex flex-col text-left">
              <span className="text-[10px] text-slate-400 leading-tight">Hari ini</span>
              <span className="text-xs font-bold text-slate-800 leading-tight">{todayFormatted}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
          </div>

          {/* Primary Action Buttons */}
          <Link
            href={`/app/${businessId}/pos`}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#00897b] hover:bg-[#00796b] text-white font-semibold text-xs shadow-xs transition-all active:scale-[0.98]"
          >
            <CircleDollarSign className="w-4 h-4" />
            <span>Buka Kasir POS</span>
          </Link>
          <Link
            href={`/app/${businessId}/products`}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Produk</span>
          </Link>
        </div>
      </div>

      {/* 2. Primary KPI Metrics Grid (4 Cards Row with 3-dots menus) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Omset Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <BarChart2 className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Total Penjualan
              </span>
            </div>
            <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
                {formatRupiah(todayRevenue)}
              </div>
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                <TrendingUp className="w-3 h-3" />
                <span>0%</span>
              </span>
            </div>
            <div className="text-[11px] text-teal-700 font-medium mt-1.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
              <span>{businessSales.length} total transaksi tercatat</span>
            </div>
          </div>
        </div>

        {/* Pesanan Lunas */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Pesanan Lunas
              </span>
            </div>
            <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-2xl font-extrabold text-slate-900">
                {completedOrdersCount} Pesanan
              </div>
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                <TrendingUp className="w-3 h-3" />
                <span>0%</span>
              </span>
            </div>
            <div className="text-[11px] text-sky-700 font-medium mt-1.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
              <span>Tercatat pada database Firestore</span>
            </div>
          </div>
        </div>

        {/* Shift Kasir Status */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${activeShift ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                <Clock className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Status Shift Kasir
              </span>
            </div>
            <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900">
              {activeShift ? 'Shift Aktif' : 'Shift Belum Dibuka'}
            </div>
            <div className="text-[11px] font-medium mt-1.5 flex items-center gap-1 text-slate-500">
              <span className={`w-1.5 h-1.5 rounded-full ${activeShift ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>{activeShift ? `Kasir: ${activeShift.cashierName}` : 'Klik Buka Shift di menu POS'}</span>
            </div>
          </div>
        </div>

        {/* Industry Specific Metric Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                {currentBiz?.businessType === 'fnb' && <UtensilsCrossed className="w-4 h-4" />}
                {currentBiz?.businessType === 'phone' && <Smartphone className="w-4 h-4" />}
                {currentBiz?.businessType === 'retail' && <AlertCircle className="w-4 h-4" />}
              </div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {currentBiz?.businessType === 'fnb' && 'Status Meja'}
                {currentBiz?.businessType === 'phone' && 'Stok IMEI Siap Jual'}
                {currentBiz?.businessType === 'retail' && 'Peringatan Stok'}
              </span>
            </div>
            <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900">
              {currentBiz?.businessType === 'fnb' && `${occupiedTables} / ${tables.length} Terisi`}
              {currentBiz?.businessType === 'phone' && `${availableImeis} Unit`}
              {currentBiz?.businessType === 'retail' && `${lowStockProducts} SKU Menipis`}
            </div>
            <div className="text-[11px] font-medium mt-1.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              {currentBiz?.businessType === 'fnb' && (
                <Link href={`/app/${businessId}/fnb/tables`} className="text-teal-700 hover:underline">
                  Lihat layout denah meja →
                </Link>
              )}
              {currentBiz?.businessType === 'phone' && (
                <Link href={`/app/${businessId}/phone/imei`} className="text-indigo-700 hover:underline">
                  Pelacak & history IMEI →
                </Link>
              )}
              {currentBiz?.businessType === 'retail' && (
                <Link href={`/app/${businessId}/inventory`} className="text-emerald-700 hover:underline">
                  Cek stok menipis →
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Middle Section: Tren Penjualan & Ringkasan Operasional */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Tren Penjualan (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#00897b] text-white flex items-center justify-center">
                <BarChart2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Tren Penjualan</h2>
                <p className="text-xs text-slate-400">Grafik penjualan 7 hari terakhir</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-medium text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>7 Hari Terakhir</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>

          <div className="pt-4 flex flex-col md:flex-row gap-6 items-stretch">
            {/* Chart Area */}
            <div className="flex-1 flex flex-col justify-between">
              <div className="flex gap-2 items-stretch h-44">
                {/* Y-Axis Labels */}
                <div className="flex flex-col justify-between text-[11px] font-mono text-slate-400 text-right pr-2 py-1 select-none">
                  <span>{formatRupiah(maxSales)}</span>
                  <span>{formatRupiah(maxSales * 0.75)}</span>
                  <span>{formatRupiah(maxSales * 0.5)}</span>
                  <span>{formatRupiah(maxSales * 0.25)}</span>
                  <span>Rp 0</span>
                </div>

                {/* SVG Canvas */}
                <div className="flex-1 relative">
                  <svg viewBox="0 0 480 160" className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="sales-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00c49f" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#00c49f" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Grid Lines */}
                    <line x1="30" y1="30" x2="450" y2="30" stroke="#f1f5f9" strokeDasharray="3 3" />
                    <line x1="30" y1="56" x2="450" y2="56" stroke="#f1f5f9" strokeDasharray="3 3" />
                    <line x1="30" y1="82" x2="450" y2="82" stroke="#f1f5f9" strokeDasharray="3 3" />
                    <line x1="30" y1="108" x2="450" y2="108" stroke="#f1f5f9" strokeDasharray="3 3" />
                    <line x1="30" y1="135" x2="450" y2="135" stroke="#e2e8f0" strokeWidth="1" />

                    {/* Gradient Area */}
                    <path d={areaPath} fill="url(#sales-gradient)" />

                    {/* Trend Line */}
                    <path
                      d={linePath}
                      fill="none"
                      stroke="#00c49f"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Data Points */}
                    {chartPoints.map((pt, idx) => (
                      <g key={idx}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="4"
                          fill="#00c49f"
                          stroke="#ffffff"
                          strokeWidth="2"
                          className="transition-all hover:r-6 cursor-pointer"
                        />
                        <text
                          x={pt.x}
                          y="152"
                          textAnchor="middle"
                          className="text-[10px] fill-slate-400 font-medium select-none"
                        >
                          {pt.day.label}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>
            </div>

            {/* Right Mini Summary within Tren Penjualan */}
            <div className="w-full md:w-56 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Total Penjualan</span>
                  <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                    <BarChart2 className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-xl font-extrabold text-slate-900 mt-1 tabular-nums">
                  {formatRupiah(todayRevenue)}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">dari {businessSales.length} transaksi</p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-500">
                  <span>Rata-rata Transaksi</span>
                  <span className="font-bold text-slate-800 tabular-nums">{formatRupiah(avgTransaction)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Transaksi Hari Ini</span>
                  <span className="font-bold text-slate-800">{businessSales.length}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Transaksi Kemarin</span>
                  <span className="font-bold text-slate-800">0</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-500">Perubahan</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    ↗ 0%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Ringkasan Operasional (1 col) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#00897b] text-white flex items-center justify-center">
                  <ClipboardCheck className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-slate-900">Ringkasan Operasional</h2>
              </div>
              <span className="text-xs text-slate-400 font-medium">Hari ini</span>
            </div>

            {/* Metric List */}
            <div className="divide-y divide-slate-100 pt-1">
              <div className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Package className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">Produk Terjual</span>
                </div>
                <span className="text-xs font-bold text-slate-900">{soldProductsCount} item</span>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">Stok Menipis</span>
                </div>
                <span className="text-xs font-bold text-slate-900">{lowStockProducts} produk</span>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">Pelanggan Baru</span>
                </div>
                <span className="text-xs font-bold text-slate-900">0 pelanggan</span>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-red-50 text-red-500 flex items-center justify-center">
                    <RotateCcw className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">Retur / Pembatalan</span>
                </div>
                <span className="text-xs font-bold text-slate-900">0 transaksi</span>
              </div>
            </div>
          </div>

          {/* System Connected Banner */}
          <div className="mt-4 p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                <Cloud className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 leading-tight">Sistem Terhubung dengan Baik</div>
                <div className="text-[10px] text-slate-500 leading-tight mt-0.5">Data otomatis tersinkron ke cloud</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1.5 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Online</span>
            </span>
          </div>
        </div>
      </div>

      {/* 4. Bottom Section: Transaksi Terkini & Aktivitas Terbaru */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Transaksi Terkini (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#00897b] text-white flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Transaksi Terkini</h2>
                  <p className="text-xs text-slate-400">5 transaksi penjualan paling baru di cabang ini</p>
                </div>
              </div>
              <Link
                href={`/app/${businessId}/reports`}
                className="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1"
              >
                <span>Semua Laporan</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Table Header Row */}
            <div className="pt-3">
              <div className="grid grid-cols-6 text-[10px] uppercase font-bold text-slate-400 py-2 border-b border-slate-100 px-3 bg-slate-50/70 rounded-lg">
                <span>Waktu</span>
                <span>No. Transaksi</span>
                <span>Produk</span>
                <span className="text-right">Total</span>
                <span className="text-center">Metode</span>
                <span className="text-center">Status</span>
              </div>

              {businessSales.length === 0 ? (
                /* Empty state matching mockup */
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                    <FileText className="w-6 h-6 text-slate-300" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-800">Belum ada transaksi di cabang ini</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Buka kasir POS untuk memulai penjualan pertama!</p>
                  <Link
                    href={`/app/${businessId}/pos`}
                    className="mt-3.5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#00897b] hover:bg-[#00796b] text-white font-semibold text-xs shadow-xs transition-all active:scale-[0.98]"
                  >
                    <CircleDollarSign className="w-4 h-4" />
                    <span>Buka Kasir POS</span>
                  </Link>
                </div>
              ) : (
                /* Recent transactions list */
                <div className="divide-y divide-slate-100 text-xs">
                  {businessSales.slice(0, 5).map((sale) => {
                    const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
                    const timeStr = `${saleDate.getHours().toString().padStart(2, '0')}:${saleDate.getMinutes().toString().padStart(2, '0')}`;
                    return (
                      <div key={sale.id} className="grid grid-cols-6 items-center py-3 px-3 hover:bg-slate-50/80 transition-colors">
                        <span className="text-slate-500 font-mono text-[11px]">{timeStr}</span>
                        <span className="font-mono font-semibold text-slate-800 truncate pr-2">{sale.saleNumber}</span>
                        <span className="text-slate-600 truncate pr-2">
                          {sale.lineItems.length} produk ({sale.lineItems.map(i => i.productName).join(', ')})
                        </span>
                        <span className="text-right font-bold text-slate-900 tabular-nums">
                          {formatRupiah(sale.grandTotal)}
                        </span>
                        <span className="text-center uppercase font-medium text-slate-700 text-[11px]">
                          {sale.paymentMethod}
                        </span>
                        <div className="flex justify-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 uppercase">
                            {sale.paymentStatus || 'paid'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Aktivitas Terbaru (1 col) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#00897b] text-white flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-slate-900">Aktivitas Terbaru</h2>
              </div>
              <Link
                href={`/app/${businessId}/reports`}
                className="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1"
              >
                <span>Semua Aktivitas</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Activity Items with Timestamps */}
            <div className="divide-y divide-slate-100 pt-1">
              <div className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 leading-tight">Sinkronisasi data berhasil</div>
                    <div className="text-[11px] text-slate-400 leading-tight mt-0.5">Semua data sudah terbaru</div>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-slate-400 shrink-0">{currentTimeStr}</span>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 leading-tight">
                      {lowStockProducts === 0 ? 'Tidak ada stok menipis' : `${lowStockProducts} produk stok menipis`}
                    </div>
                    <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
                      {lowStockProducts === 0 ? 'Stok dalam status aman' : 'Periksa daftar inventaris'}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-slate-400 shrink-0">{currentTimeStr}</span>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                    <Info className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 leading-tight">
                      {businessSales.length === 0 ? 'Belum ada transaksi' : `${businessSales.length} transaksi tercatat`}
                    </div>
                    <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
                      {businessSales.length === 0 ? 'Mulai penjualan dari kasir POS' : 'Transaksi berhasil diproses'}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-slate-400 shrink-0">{currentTimeStr}</span>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 leading-tight">Sistem siap digunakan</div>
                    <div className="text-[11px] text-slate-400 leading-tight mt-0.5">Semua layanan berjalan normal</div>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-slate-400 shrink-0">{currentTimeStr}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
