import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import type { Product } from '../types';
import { TrendingUp, TrendingDown, Package, Users, Store, ArrowRightLeft, Star, Bell, Calendar, Moon, Sun, AlertTriangle, Clock, ShoppingCart, DollarSign, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { isToday, isThisWeek, isThisMonth, subDays, subWeeks, subMonths } from 'date-fns';
import clsx from 'clsx';

const COLORS = ['#0f172a', '#d4af37', '#f97316', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

const TrendIndicator = ({ trend }: { trend?: { value: number; isUp: boolean } }) => {
  if (!trend) return null;
  return (
    <div className={clsx("flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full shrink-0", trend.isUp ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
      {trend.isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {trend.value}%
    </div>
  );
};

const Dashboard = () => {
  const { currentUser, branches, products, users, transactions, stockTransfers, shifts, branchStocks } = useStore();
  
  const [dateFilter, setDateFilter] = useState<'today'|'week'|'month'>('today');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const isOwner = currentUser?.role === 'owner';
  const selectedBranchId = isOwner ? branchFilter : currentUser?.branchId;

  // Filtered Base Data
  const branchTransactions = useMemo(() => {
    return selectedBranchId === 'all' 
      ? transactions 
      : transactions.filter(t => t.branchId === selectedBranchId);
  }, [transactions, selectedBranchId]);

  const branchProducts = useMemo(() => {
    if (selectedBranchId === 'all') return products;
    // Products that have stock at this branch
    const productIdsAtBranch = branchStocks.filter(bs => bs.branchId === selectedBranchId).map(bs => bs.productId);
    return products.filter(p => productIdsAtBranch.includes(p.id) || p.branchId === selectedBranchId);
  }, [products, selectedBranchId, branchStocks]);

  // Alert/Notifications - use branchStocks for low stock detection
  const lowStockProducts = useMemo(() => {
    const relevantStocks = selectedBranchId === 'all'
      ? branchStocks
      : branchStocks.filter(bs => bs.branchId === selectedBranchId);
    const criticalProductIds = relevantStocks.filter(bs => bs.stock <= bs.minStock).map(bs => bs.productId);
    const uniqueIds = [...new Set(criticalProductIds)];
    return uniqueIds.map(id => {
      const p = products.find(pr => pr.id === id);
      const bs = relevantStocks.find(s => s.productId === id);
      return p ? { ...p, stock: bs?.stock ?? 0, minStock: bs?.minStock ?? 0 } : null;
    }).filter(Boolean) as (Product & { stock: number; minStock: number })[];
  }, [branchStocks, selectedBranchId, products]);
  const pendingTransfers = useMemo(() => stockTransfers.filter(t => t.status === 'pending' && (isOwner || t.fromBranchId === selectedBranchId || t.toBranchId === selectedBranchId)), [stockTransfers, isOwner, selectedBranchId]);
  const activeShifts = useMemo(() => {
    return shifts.filter(s => s.status === 'active' && (selectedBranchId === 'all' || s.branchId === selectedBranchId));
  }, [shifts, selectedBranchId]);
  const alertCount = lowStockProducts.length + pendingTransfers.length;

  // Main KPI Calculations
  const { current, trends, categoryData, chartData, topSellingItems } = useMemo(() => {
    const now = new Date();
    
    const filterByDate = (dateString: string, filterType: 'today'|'week'|'month', isPrev = false) => {
      const d = new Date(dateString);
      if (!isPrev) {
        if (filterType === 'today') return isToday(d);
        if (filterType === 'week') return isThisWeek(d);
        return isThisMonth(d);
      } else {
        if (filterType === 'today') return d.toDateString() === subDays(now, 1).toDateString();
        if (filterType === 'week') return d >= subWeeks(now, 2) && d < subWeeks(now, 1);
        return d >= subMonths(now, 2) && d < subMonths(now, 1);
      }
    };

    const currentTxs = branchTransactions.filter(t => filterByDate(t.date, dateFilter, false));
    const prevTxs = branchTransactions.filter(t => filterByDate(t.date, dateFilter, true));

    const calcMetrics = (txs: typeof transactions) => {
      const revenue = txs.reduce((sum, t) => sum + t.total, 0);
      const count = txs.length;
      const itemsSold = txs.reduce((sum, t) => sum + t.items.reduce((s, i) => s + i.quantity, 0), 0);
      
      let cogs = 0;
      txs.forEach(t => {
        t.items.forEach(item => {
          const product = products.find(p => p.id === item.productId);
          if (product) cogs += (product.purchasePrice * item.quantity);
        });
      });
      const grossProfit = revenue - cogs;
      const avgBasketSize = count > 0 ? revenue / count : 0;
      
      return { revenue, count, grossProfit, avgBasketSize, itemsSold };
    };

    const currentMetrics = calcMetrics(currentTxs);
    const prevMetrics = calcMetrics(prevTxs);

    const calcTrend = (curr: number, prev: number) => {
      if (prev === 0) return { value: curr > 0 ? 100 : 0, isUp: curr >= 0 };
      const diff = curr - prev;
      return {
        value: Math.abs(Math.round((diff / prev) * 100)),
        isUp: diff >= 0
      };
    };

    // Category Composition & Top Items
    const catData: Record<string, number> = {};
    const itemSales: Record<string, {name: string, quantity: number, revenue: number}> = {};
    
    currentTxs.forEach(t => {
      t.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (product) {
           catData[product.category || 'Lainnya'] = (catData[product.category || 'Lainnya'] || 0) + item.subtotal;
        }
        if (!itemSales[item.productId]) itemSales[item.productId] = { name: item.name, quantity: 0, revenue: 0 };
        itemSales[item.productId].quantity += item.quantity;
        itemSales[item.productId].revenue += item.subtotal;
      });
    });
    
    const formattedCatData = Object.entries(catData).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 5);
    const topItems = Object.values(itemSales).sort((a, b) => b.quantity - a.quantity).slice(0, 5);

    // Dynamic Chart Data based on Date Filter
    const generateChartData = () => {
      let periods: { name: string, match: (d: Date) => boolean }[] = [];
      
      if (dateFilter === 'today') {
        periods = [
          { name: 'Pagi (06-12)', match: (d) => isToday(d) && d.getHours() >= 6 && d.getHours() < 12 },
          { name: 'Siang (12-15)', match: (d) => isToday(d) && d.getHours() >= 12 && d.getHours() < 15 },
          { name: 'Sore (15-18)', match: (d) => isToday(d) && d.getHours() >= 15 && d.getHours() < 18 },
          { name: 'Malam (18-06)', match: (d) => isToday(d) && (d.getHours() >= 18 || d.getHours() < 6) },
        ];
      } else if (dateFilter === 'week') {
        periods = Array.from({ length: 7 }).map((_, i) => {
          const target = subDays(now, 6 - i);
          return {
            name: target.toLocaleDateString('id-ID', { weekday: 'short' }),
            match: (d) => d.toDateString() === target.toDateString()
          };
        });
      } else {
        periods = Array.from({ length: 4 }).map((_, i) => {
          return {
            name: `Minggu ${i + 1}`,
            match: (d) => {
               const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
               const weekStart = new Date(monthStart);
               weekStart.setDate(weekStart.getDate() + (i * 7));
               const weekEnd = new Date(weekStart);
               weekEnd.setDate(weekEnd.getDate() + 7);
               return d >= weekStart && (i === 3 ? isThisMonth(d) : d < weekEnd);
            }
          }
        });
      }

      return periods.map(p => {
        const dataPoint: any = { name: p.name, Total: 0 };
        const relevantTxs = branchTransactions.filter(t => p.match(new Date(t.date)));
        
        dataPoint.Total = relevantTxs.reduce((sum, t) => sum + t.total, 0);

        if (selectedBranchId === 'all' && branches.length > 0) {
          branches.forEach(b => {
             const bTotal = relevantTxs.filter(t => t.branchId === b.id).reduce((sum, t) => sum + t.total, 0);
             dataPoint[b.name] = bTotal;
          });
        }
        return dataPoint;
      });
    };

    return {
      current: currentMetrics,
      trends: {
        revenue: calcTrend(currentMetrics.revenue, prevMetrics.revenue),
        count: calcTrend(currentMetrics.count, prevMetrics.count),
        grossProfit: calcTrend(currentMetrics.grossProfit, prevMetrics.grossProfit),
        avgBasketSize: calcTrend(currentMetrics.avgBasketSize, prevMetrics.avgBasketSize),
        itemsSold: calcTrend(currentMetrics.itemsSold, prevMetrics.itemsSold)
      },
      categoryData: formattedCatData,
      chartData: generateChartData(),
      topSellingItems: topItems
    };
  }, [branchTransactions, dateFilter, products, selectedBranchId, branches]);

  // Branch Performance
  const branchPerformanceData = useMemo(() => {
    return branches.map(b => {
      const revenue = transactions.filter(t => t.branchId === b.id && (
         dateFilter === 'today' ? isToday(new Date(t.date)) : 
         dateFilter === 'week' ? isThisWeek(new Date(t.date)) : 
         isThisMonth(new Date(t.date))
      )).reduce((sum, t) => sum + t.total, 0);
      return { name: b.name, revenue };
    }).sort((a,b) => b.revenue - a.revenue);
  }, [branches, transactions, dateFilter]);

  const stats = [
    { label: 'Total Penjualan', value: `Rp ${current.revenue.toLocaleString('id-ID')}`, icon: TrendingUp, color: 'text-brand-green', bg: 'bg-green-100', trend: trends.revenue },
    { label: 'Laba Kotor', value: `Rp ${current.grossProfit.toLocaleString('id-ID')}`, icon: DollarSign, color: 'text-brand-dark', bg: 'bg-slate-200', trend: trends.grossProfit },
    { label: 'Jml Transaksi', value: current.count.toString(), icon: ShoppingCart, color: 'text-brand-orange', bg: 'bg-orange-100', trend: trends.count },
    { label: 'Avg Transaksi', value: `Rp ${Math.round(current.avgBasketSize).toLocaleString('id-ID')}`, icon: Activity, color: 'text-blue-500', bg: 'bg-blue-100', trend: trends.avgBasketSize },
    { label: 'Produk Terjual', value: current.itemsSold.toString(), icon: Package, color: 'text-purple-500', bg: 'bg-purple-100', trend: trends.itemsSold },
    { label: 'Stok Kritis', value: lowStockProducts.length.toString(), icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-100' },
  ];

  return (
    <div className={clsx("min-h-screen p-4 md:p-8 transition-colors duration-300", isDarkMode ? "bg-slate-900 text-slate-100" : "bg-brand-light text-brand-dark")}>
      
      {/* 1. Header & Actions (Filters moved here) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className={clsx("mt-1", isDarkMode ? "text-slate-400" : "text-gray-500")}>Ringkasan analitik operasional</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Pro-style Filter Bar */}
          <div className={clsx("flex items-center p-1 rounded-xl border transition-colors", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200 shadow-sm")}>
            <div className="flex items-center px-3 border-r border-gray-200 dark:border-slate-700">
              <Calendar className="w-4 h-4 text-brand-green mr-2" />
              <select 
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as any)}
                className={clsx("bg-transparent outline-none cursor-pointer text-sm font-semibold py-1.5", isDarkMode ? "text-slate-200" : "text-brand-dark")}
              >
                <option value="today" className="text-gray-900">Hari Ini</option>
                <option value="week" className="text-gray-900">Minggu Ini</option>
                <option value="month" className="text-gray-900">Bulan Ini</option>
              </select>
            </div>
            
            {isOwner && (
              <div className="flex items-center px-3">
                <Store className="w-4 h-4 text-brand-green mr-2" />
                <select 
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className={clsx("bg-transparent outline-none cursor-pointer text-sm font-semibold py-1.5 max-w-[130px] truncate", isDarkMode ? "text-slate-200" : "text-brand-dark")}
                >
                  <option value="all" className="text-gray-900">Semua Cabang</option>
                  {branches.map(b => <option key={b.id} value={b.id} className="text-gray-900">{b.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="relative">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className={clsx("p-2.5 rounded-xl border transition-colors relative shadow-sm", isDarkMode ? "bg-slate-800 border-slate-700 hover:bg-slate-700" : "bg-white border-gray-200 hover:bg-gray-50")}
            >
              <Bell className="w-5 h-5" />
              {alertCount > 0 && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[11px] font-bold flex items-center justify-center rounded-full border-2 border-white dark:border-slate-800">{alertCount}</span>}
            </button>
            {showNotifications && (
              <div className={clsx("absolute right-0 mt-2 w-72 rounded-xl shadow-lg border z-50", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-100")}>
                <div className="p-4 border-b border-gray-100 dark:border-slate-700 font-bold">Notifikasi</div>
                <div className="max-h-64 overflow-y-auto">
                  {lowStockProducts.length > 0 && (
                    <div className="p-4 border-b border-gray-100 dark:border-slate-700">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-red-500">{lowStockProducts.length} Stok Kritis</p>
                          <p className="text-xs mt-1 text-gray-500 dark:text-slate-400">Segera lakukan re-stock.</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {pendingTransfers.length > 0 && (
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <ArrowRightLeft className="w-5 h-5 text-blue-500 shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-blue-500">{pendingTransfers.length} Transfer Pending</p>
                          <p className="text-xs mt-1 text-gray-500 dark:text-slate-400">Menunggu persetujuan.</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {alertCount === 0 && <div className="p-4 text-center text-sm text-gray-500">Tidak ada notifikasi</div>}
                </div>
              </div>
            )}
          </div>

          {/* Dark Mode Toggle */}
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={clsx("p-2.5 rounded-xl border transition-colors shadow-sm", isDarkMode ? "bg-slate-800 border-slate-700 hover:bg-slate-700 text-brand-green" : "bg-white border-gray-200 hover:bg-gray-50 text-brand-dark")}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Active Shift Info */}
      {activeShifts.length > 0 && (
        <div className={clsx("mb-6 p-4 rounded-xl flex items-center gap-4 border shadow-sm", isDarkMode ? "bg-slate-800 border-brand-green/30 text-white" : "bg-green-50 border-brand-green text-brand-dark")}>
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-brand-green animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold">Shift Sedang Aktif</h3>
            <p className="text-sm opacity-90">Ada {activeShifts.length} shift berjalan. Kasir: <span className="font-medium text-brand-green">{activeShifts.map(s => users.find(u => u.id === s.cashierId)?.name || 'Unknown').join(', ')}</span></p>
          </div>
        </div>
      )}

      {/* 2. KPI Cards (Grid of 6) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {stats.map((stat, idx) => (
          <div key={idx} className={clsx("rounded-xl p-4 shadow-sm border flex flex-col justify-between transition-colors", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-100")}>
            <div className="flex justify-between items-start mb-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${stat.bg} ${stat.color} dark:bg-opacity-20`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <TrendIndicator trend={stat.trend} />
            </div>
            <div>
              <p className={clsx("text-xs font-medium mb-1", isDarkMode ? "text-slate-400" : "text-gray-500")}>{stat.label}</p>
              <p className="text-lg font-bold">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 3. Charts Section (Sales Bar + Category Pie) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Main Chart */}
        <div className={clsx("lg:col-span-2 rounded-xl p-6 shadow-sm border", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-100")}>
          <h3 className="font-bold text-lg mb-6">
            Grafik Penjualan ({dateFilter === 'today' ? 'Hari Ini' : dateFilter === 'week' ? 'Minggu Ini' : 'Bulan Ini'})
          </h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#f3f4f6'} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: isDarkMode ? '#94a3b8' : '#6b7280', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: isDarkMode ? '#94a3b8' : '#6b7280', fontSize: 12}} dx={-10} tickFormatter={(value) => `Rp ${(value/1000)}k`} />
                <RechartsTooltip 
                  cursor={{fill: isDarkMode ? '#1e293b' : '#f3f4f6'}}
                  contentStyle={{backgroundColor: isDarkMode ? '#0f172a' : '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', color: isDarkMode ? '#fff' : '#000'}}
                  formatter={(value: number) => [`Rp ${value.toLocaleString('id-ID')}`, '']}
                />
                
                {/* Dynamically render bars depending on selection */}
                {selectedBranchId === 'all' && branches.length > 0 ? (
                  <>
                    <Bar dataKey="Total" fill="#d4af37" radius={[4, 4, 0, 0]} name="Total Semua Cabang" />
                    {branches.map((b, idx) => (
                      <Bar key={b.id} dataKey={b.name} fill={COLORS[(idx + 3) % COLORS.length]} radius={[4, 4, 0, 0]} />
                    ))}
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '12px', paddingBottom: '20px', color: isDarkMode ? '#e2e8f0' : '#475569' }} />
                  </>
                ) : (
                  <Bar dataKey="Total" fill="#d4af37" radius={[4, 4, 0, 0]} name="Total Penjualan" />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Pie Chart */}
        <div className={clsx("rounded-xl p-6 shadow-sm border", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-100")}>
          <h3 className="font-bold text-lg mb-2">Komposisi Kategori</h3>
          <div className="h-72 w-full pt-4">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="45%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {categoryData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => `Rp ${value.toLocaleString('id-ID')}`} contentStyle={{backgroundColor: isDarkMode ? '#0f172a' : '#fff', color: isDarkMode ? '#fff' : '#000', borderRadius: '8px', border: 'none'}} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', color: isDarkMode ? '#e2e8f0' : '#475569' }}/>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">Belum ada transaksi</div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Branch Performance */}
      {isOwner && (
        <div className={clsx("mb-8 rounded-xl p-6 shadow-sm border", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-100")}>
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
            <Store className="w-5 h-5 text-brand-green" /> Performa Antar Cabang
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            {branchPerformanceData.map(b => (
              <div key={b.name}>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium">{b.name}</span>
                  <span className="font-bold text-brand-green">Rp {b.revenue.toLocaleString('id-ID')}</span>
                </div>
                <div className={clsx("w-full h-3 rounded-full overflow-hidden", isDarkMode ? "bg-slate-700" : "bg-gray-100")}>
                  <div 
                    className="h-full bg-brand-dark transition-all duration-500" 
                    style={{ width: `${branchPerformanceData[0].revenue === 0 ? 0 : (b.revenue / branchPerformanceData[0].revenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {branchPerformanceData.length === 0 && <p className="text-sm text-gray-500 col-span-2">Belum ada data cabang</p>}
          </div>
        </div>
      )}

      {/* 5. Three Columns: Top Items, Critical Stock, Pending Transfers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Top Selling Items */}
        <div className={clsx("rounded-xl p-6 shadow-sm border h-[400px] flex flex-col", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-100")}>
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" /> Produk Terlaris
          </h3>
          <div className="space-y-4 overflow-y-auto pr-2 flex-1 scrollbar-thin">
            {topSellingItems.map((item, idx) => (
              <div key={idx} className={clsx("flex justify-between items-center p-3 rounded-lg border", isDarkMode ? "bg-slate-700/30 border-slate-600" : "bg-gray-50 border-gray-100")}>
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Terjual: {item.quantity}</p>
                </div>
                <span className="text-sm font-bold text-brand-green">Rp {item.revenue.toLocaleString('id-ID')}</span>
              </div>
            ))}
            {topSellingItems.length === 0 && <p className="text-sm text-gray-500 text-center py-8">Belum ada penjualan</p>}
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className={clsx("rounded-xl p-6 shadow-sm border h-[400px] flex flex-col", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-100")}>
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" /> Stok Menipis (Kritis)
          </h3>
          <div className="space-y-3 overflow-y-auto pr-2 flex-1 scrollbar-thin">
            {lowStockProducts.map(p => (
              <div key={p.id} className={clsx("flex justify-between items-center p-3 rounded-lg border", isDarkMode ? "bg-slate-700/50 border-slate-600" : "bg-red-50 border-red-100")}>
                <div>
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Min: {p.minStock}</p>
                </div>
                <span className="font-bold text-red-500 text-lg">{p.stock}</span>
              </div>
            ))}
            {lowStockProducts.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-50">
                <Package className="w-12 h-12 mb-2" />
                <p className="text-sm">Semua stok aman</p>
              </div>
            )}
          </div>
        </div>

        {/* Pending Transfers */}
        <div className={clsx("rounded-xl p-6 shadow-sm border h-[400px] flex flex-col", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-100")}>
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-blue-500" /> Pending Transfer
          </h3>
          <div className="space-y-3 overflow-y-auto pr-2 flex-1 scrollbar-thin">
            {pendingTransfers.map(t => (
              <div key={t.id} className={clsx("p-3 rounded-lg border text-sm", isDarkMode ? "bg-slate-700/30 border-slate-600" : "bg-blue-50 border-blue-100")}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold">{branches.find(b => b.id === t.fromBranchId)?.name || 'Cabang'} &rarr; {branches.find(b => b.id === t.toBranchId)?.name || 'Cabang'}</span>
                </div>
                <p className="text-xs opacity-75">{t.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}</p>
              </div>
            ))}
            {pendingTransfers.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-50">
                <ArrowRightLeft className="w-12 h-12 mb-2" />
                <p className="text-sm">Tidak ada transfer pending</p>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

export default Dashboard;
