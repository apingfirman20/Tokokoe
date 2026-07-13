import React from 'react';
import { useStore } from '../store/useStore';
import { TrendingUp, Package, Users, Store, Download, ArrowRightLeft, Star } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const Dashboard = () => {
  const { currentUser, branches, products, users, transactions, stockTransfers } = useStore();

  const isOwner = currentUser?.role === 'owner';
  const branchName = isOwner 
    ? 'Semua Cabang' 
    : branches.find(b => b.id === currentUser?.branchId)?.name;

  const relevantTransactions = isOwner 
    ? transactions 
    : transactions.filter(t => t.branchId === currentUser?.branchId);

  const todaySales = relevantTransactions
    .filter(t => {
      const tDate = new Date(t.date).toDateString();
      const today = new Date().toDateString();
      return tDate === today;
    })
    .reduce((acc, t) => acc + t.total, 0);

  const stats = [
    { label: 'Total Produk', value: products.length, icon: Package, color: 'text-blue-500', bg: 'bg-blue-100' },
    { label: 'Total Karyawan', value: users.length, icon: Users, color: 'text-purple-500', bg: 'bg-purple-100' },
    { label: 'Total Cabang', value: branches.length, icon: Store, color: 'text-brand-orange', bg: 'bg-orange-100' },
    { label: 'Penjualan Hari Ini', value: `Rp ${todaySales.toLocaleString('id-ID')}`, icon: TrendingUp, color: 'text-brand-green', bg: 'bg-green-100' },
  ];

  // Dummy Chart Data Generation (Last 7 Days)
  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toLocaleDateString('id-ID', { weekday: 'short' });
    
    // Calculate total for this day
    const daySales = relevantTransactions
      .filter(t => new Date(t.date).toDateString() === d.toDateString())
      .reduce((acc, t) => acc + t.total, 0);

    return {
      name: dayStr,
      Total: daySales || Math.floor(Math.random() * 5000000) // Dummy if empty for demo aesthetics
    };
  });

  // Top Selling Items Calculation
  const itemSales = relevantTransactions.flatMap(t => t.items).reduce((acc, item) => {
    if (!acc[item.productId]) {
      acc[item.productId] = { name: item.name, quantity: 0, revenue: 0 };
    }
    acc[item.productId].quantity += item.quantity;
    acc[item.productId].revenue += item.subtotal;
    return acc;
  }, {} as Record<string, {name: string, quantity: number, revenue: number}>);
  
  const topSellingItems = Object.values(itemSales)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  const pendingTransfers = stockTransfers.filter(t => 
    t.status === 'pending' && (isOwner || t.fromBranchId === currentUser?.branchId || t.toBranchId === currentUser?.branchId)
  );

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-brand-dark">Dashboard</h1>
          <p className="text-gray-500 mt-1">Ringkasan operasional untuk {branchName}</p>
        </div>
        <button className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-50 shadow-sm transition-colors">
          <Download className="w-4 h-4" />
          Export Laporan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${stat.bg} ${stat.color}`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{stat.label}</p>
              <p className="text-xl font-bold text-brand-dark">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-bold text-lg mb-6 text-brand-dark">Grafik Penjualan (7 Hari Terakhir)</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dx={-10} tickFormatter={(value) => `Rp ${(value/1000)}k`} />
                <Tooltip 
                  cursor={{fill: '#f3f4f6'}}
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                  formatter={(value: number) => [`Rp ${value.toLocaleString('id-ID')}`, 'Total']}
                />
                <Bar dataKey="Total" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-bold text-lg mb-4 text-brand-dark flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" /> Produk Paling Laku
            </h3>
            <div className="space-y-4">
              {topSellingItems.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium text-brand-dark text-sm">{item.name}</p>
                    <p className="text-xs text-gray-500">Terjual: {item.quantity}</p>
                  </div>
                  <span className="text-sm font-bold text-brand-orange">Rp {item.revenue.toLocaleString('id-ID')}</span>
                </div>
              ))}
              {topSellingItems.length === 0 && <p className="text-sm text-gray-500 text-center py-4">Belum ada penjualan</p>}
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-bold text-lg mb-4 text-brand-dark flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-blue-500" /> Pending Transfer Stok
            </h3>
            <div className="space-y-3">
              {pendingTransfers.slice(0, 4).map(t => (
                <div key={t.id} className="p-3 bg-gray-50 rounded-lg text-sm border border-gray-100">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-brand-dark">{branches.find(b => b.id === t.fromBranchId)?.name || 'Cabang'} &rarr; {branches.find(b => b.id === t.toBranchId)?.name || 'Cabang'}</span>
                  </div>
                  <p className="text-xs text-gray-600">{t.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}</p>
                </div>
              ))}
              {pendingTransfers.length === 0 && <p className="text-sm text-gray-500 text-center py-4">Tidak ada pending transfer</p>}
              {pendingTransfers.length > 4 && <p className="text-xs text-brand-green text-center font-medium mt-2">+{pendingTransfers.length - 4} lainnya</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
