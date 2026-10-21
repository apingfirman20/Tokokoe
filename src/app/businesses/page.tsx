'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useBusiness } from '@/context/BusinessContext';
import { useAuth } from '@/context/AuthContext';
import { formatRupiah } from '@/lib/utils';
import { 
  Building2, 
  Coffee, 
  Smartphone, 
  ShoppingBag, 
  Plus, 
  MapPin, 
  Users, 
  Store, 
  ArrowRight, 
  ShieldCheck, 
  CheckCircle2,
  TrendingUp, 
  CircleDollarSign, 
  Settings, 
  LogOut, 
  Search, 
  Bell, 
  ChevronDown, 
  LayoutDashboard, 
  FileText, 
  Package, 
  Receipt,
  Check
} from 'lucide-react';

export default function BusinessesHubPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { businesses, branches, members, products, sales, switchBusiness } = useBusiness();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeNavTab, setActiveNavTab] = useState<'beranda' | 'bisnis' | 'laporan' | 'pengaturan'>('bisnis');
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Aggregate stats across authenticated user's businesses
  const userBizIds = useMemo(() => new Set(businesses.map(b => b.id)), [businesses]);
  const userBranches = useMemo(() => branches.filter(br => userBizIds.has(br.businessId)), [branches, userBizIds]);
  const userMembers = useMemo(() => members.filter(m => userBizIds.has(m.businessId)), [members, userBizIds]);
  const userProducts = useMemo(() => products.filter(p => userBizIds.has(p.businessId)), [products, userBizIds]);
  const userSales = useMemo(() => sales.filter(s => userBizIds.has(s.businessId)), [sales, userBizIds]);

  const totalBranches = userBranches.length;
  const totalMembers = userMembers.length;
  const totalProducts = userProducts.length;
  const totalRevenue = userSales.reduce((acc, s) => acc + s.grandTotal, 0);

  // Filtered businesses based on search
  const filteredBusinesses = useMemo(() => {
    if (!searchQuery.trim()) return businesses;
    const q = searchQuery.toLowerCase().trim();
    return businesses.filter(b => 
      b.name.toLowerCase().includes(q) || 
      (b.address && b.address.toLowerCase().includes(q)) ||
      b.businessType.toLowerCase().includes(q)
    );
  }, [businesses, searchQuery]);

  const getBusinessIcon = (type: string) => {
    switch (type) {
      case 'fnb': return <Coffee className="w-5 h-5 text-[#00a884]" />;
      case 'phone': return <Smartphone className="w-5 h-5 text-indigo-600" />;
      case 'retail': return <ShoppingBag className="w-5 h-5 text-emerald-600" />;
      default: return <Store className="w-5 h-5 text-teal-600" />;
    }
  };

  const getBusinessBadge = (type: string) => {
    switch (type) {
      case 'fnb': return { label: 'Food & Beverage', color: 'bg-teal-50 text-teal-700 border-teal-200' };
      case 'phone': return { label: 'Phone & Gadget', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'retail': return { label: 'Ritel & Minimarket', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      default: return { label: 'General Retail', color: 'bg-slate-50 text-slate-700 border-slate-200' };
    }
  };

  const openBusiness = (businessId: string, targetPath: string = 'dashboard') => {
    switchBusiness(businessId);
    router.push(`/app/${businessId}/${targetPath}`);
  };

  const userName = user?.displayName || user?.email?.split('@')[0] || 'aping';
  const userInitial = (userName.charAt(0) || 'A').toUpperCase();

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 pb-16">
      
      {/* 1. TOP NAVIGATION BAR */}
      <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#00bda5] to-[#00f2c4] flex items-center justify-center text-white shadow-sm shadow-teal-950/20">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-black text-base text-slate-900 tracking-tight leading-tight">Tokokoe Hub</div>
            <div className="text-[11px] text-[#00a884] font-semibold">Satu Platform, Semua Usaha</div>
          </div>
        </div>

        {/* Center: Nav Tabs (Desktop & Tablet) */}
        <nav className="hidden md:flex items-center bg-[#f1f5f9] p-1 rounded-xl border border-slate-200/60">
          <button
            onClick={() => setActiveNavTab('beranda')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeNavTab === 'beranda'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5 text-slate-500" />
            <span>Beranda</span>
          </button>

          <button
            onClick={() => setActiveNavTab('bisnis')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeNavTab === 'bisnis'
                ? 'bg-white text-[#00a884] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 text-[#00a884]" />
            <span>Bisnis Saya</span>
          </button>

          <button
            onClick={() => setActiveNavTab('laporan')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeNavTab === 'laporan'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
            <span>Laporan</span>
          </button>

          <button
            onClick={() => setActiveNavTab('pengaturan')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeNavTab === 'pengaturan'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span>Pengaturan</span>
          </button>
        </nav>

        {/* Right: Notifications & User Profile */}
        <div className="flex items-center gap-3">
          <button 
            type="button" 
            className="w-9 h-9 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-600 transition-colors"
            title="Notifikasi"
          >
            <Bell className="w-4 h-4" />
          </button>

          {/* User Profile Chip */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2.5 p-1 sm:pr-2.5 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#99f6e4] to-[#ccfbf1] text-teal-800 font-bold text-xs flex items-center justify-center border border-teal-200">
                {userInitial}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-bold text-slate-900 leading-tight">{userName}</div>
                <div className="text-[10px] font-black text-[#00a884] uppercase tracking-wider">
                  {user?.role === 'owner' ? 'OWNER' : 'KARYAWAN'}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            </button>

            {/* User Dropdown */}
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 z-40 animate-fadeIn">
                <div className="px-3.5 py-2 border-b border-slate-100 text-xs">
                  <p className="font-bold text-slate-900 truncate">{userName}</p>
                  <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                </div>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    logout();
                  }}
                  className="w-full px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Keluar Akun</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. MAIN CONTENT AREA */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
        
        {/* Breadcrumb & Page Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
              <span className="flex items-center gap-1">
                <span>🏠</span> Workspace
              </span>
              <span>/</span>
              <span className="text-[#00a884] font-semibold">Bisnis Saya</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Bisnis Saya
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Kelola seluruh unit usaha Anda dengan mudah, dari satu workspace.
            </p>
          </div>

          <Link
            href="/businesses/new"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#00a884] hover:bg-[#009173] text-white font-bold text-xs sm:text-sm shadow-md shadow-teal-900/20 active:scale-[0.99] transition-all self-start sm:self-center"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Buat Bisnis Baru</span>
          </Link>
        </div>

        {/* 3. HERO BANNER: "Semua bisnis Anda. Satu kendali penuh." */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#092b33] via-[#0c2235] to-[#0d1d2c] text-white p-6 sm:p-8 lg:p-10 shadow-xl shadow-slate-200/50 mb-6">
          {/* Subtle curved background glow */}
          <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-gradient-to-bl from-teal-500/20 via-cyan-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7">
              <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <span className="px-3 py-1 rounded-full bg-[#00a884]/25 text-[#00dfb6] text-[11px] font-bold border border-[#00a884]/40 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00dfb6]" />
                  <span>TOKOKOE MULTI-TENANT HUB</span>
                </span>
                <span className="px-3 py-1 rounded-full bg-slate-800/80 text-slate-300 text-[11px] font-semibold border border-slate-700/80 flex items-center gap-1.5">
                  <span>💼 {businesses.length} Bisnis Terdaftar</span>
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Semua bisnis Anda. Satu kendali penuh.
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-slate-300/85 leading-relaxed max-w-xl">
                Pantau performa, kelola cabang, atur produk, dan akses operasional kasir dengan sistem yang saling terhubung.
              </p>
            </div>

            {/* Right Connected Modules Diagram (matching screenshot!) */}
            <div className="lg:col-span-5 relative flex flex-col items-center justify-center pt-2 lg:pt-0">
              <span className="text-[11px] font-semibold text-slate-400 mb-3 tracking-wide">
                Satu sistem, semua terhubung
              </span>

              <div className="relative w-full max-w-xs h-32 flex items-center justify-center">
                {/* Center Hub Node */}
                <div className="w-14 h-14 rounded-2xl bg-[#00bda5] text-white flex items-center justify-center shadow-lg shadow-teal-500/30 z-20">
                  <Store className="w-7 h-7 text-white" />
                </div>

                {/* Left Node: POS Kasir */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md">
                    <Receipt className="w-3.5 h-3.5 text-teal-400" />
                    <span>POS Kasir</span>
                  </div>
                  <div className="w-6 border-t-2 border-dashed border-teal-500/40" />
                </div>

                {/* Right Node: Manajemen Stok */}
                <div className="absolute right-0 top-2 flex items-center gap-2">
                  <div className="w-6 border-t-2 border-dashed border-teal-500/40" />
                  <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md">
                    <Package className="w-3.5 h-3.5 text-blue-400" />
                    <span>Manajemen Stok</span>
                  </div>
                </div>

                {/* Bottom Node: Laporan */}
                <div className="absolute right-4 bottom-0 flex items-center gap-2">
                  <div className="w-4 border-t-2 border-dashed border-teal-500/40" />
                  <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md">
                    <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                    <span>Laporan</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. METRICS ROW (4 Cards) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Card 1: Total Omset */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                TOTAL OMSET
              </span>
              <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tabular-nums">
                {formatRupiah(totalRevenue)}
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Seluruh bisnis
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 shrink-0">
              <CircleDollarSign className="w-5 h-5" />
            </div>
          </div>

          {/* Card 2: Cabang Beroperasi */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                CABANG BEROPERASI
              </span>
              <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tabular-nums">
                {totalBranches} <span className="text-sm font-semibold text-slate-600">Outlet</span>
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Lokasi usaha aktif
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <Store className="w-5 h-5" />
            </div>
          </div>

          {/* Card 3: Produk Terdaftar */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                PRODUK TERDAFTAR
              </span>
              <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tabular-nums">
                {totalProducts} <span className="text-sm font-semibold text-slate-600">SKU</span>
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Katalog seluruh unit
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <Package className="w-5 h-5" />
            </div>
          </div>

          {/* Card 4: Total Karyawan */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                TOTAL KARYAWAN
              </span>
              <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tabular-nums">
                {totalMembers} <span className="text-sm font-semibold text-slate-600">Orang</span>
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Akun staf & kasir
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* 5. SECTION: "Daftar Bisnis Anda" */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              Daftar Bisnis Anda
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pilih bisnis untuk mulai mengelola POS dan backoffice.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 flex items-center gap-1.5 shrink-0">
              <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
              <span>{filteredBusinesses.length} Bisnis Aktif</span>
            </span>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama bisnis..."
                className="w-full bg-white text-slate-900 text-xs pl-9 pr-3.5 py-2.5 rounded-full border border-slate-200 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all placeholder:text-slate-400 font-medium"
              />
            </div>
          </div>
        </div>

        {/* 6. BUSINESS CARDS GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-10">
          
          {/* Active Business Cards */}
          {filteredBusinesses.map((biz) => {
            const bizBadge = getBusinessBadge(biz.businessType);
            const bizBranches = branches.filter(br => br.businessId === biz.id);
            const bizMembers = members.filter(m => m.businessId === biz.id);
            const bizProducts = products.filter(p => p.businessId === biz.id);

            return (
              <div 
                key={biz.id}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all p-5 sm:p-6 flex flex-col justify-between"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                        {getBusinessIcon(biz.businessType)}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-lg text-slate-900 tracking-tight leading-tight">
                          {biz.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${bizBadge.color}`}>
                            {bizBadge.label}
                          </span>
                          {biz.address && (
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              <span className="truncate max-w-[180px]">{biz.address}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200 flex items-center gap-1.5 shrink-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Aktif</span>
                    </span>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-2 py-3.5 px-4 bg-[#f8fafc] rounded-2xl border border-slate-100 text-center my-4">
                    <div>
                      <div className="text-base font-black text-slate-900 tabular-nums">
                        {bizBranches.length || 1}
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">
                        CABANG
                      </span>
                    </div>

                    <div className="border-x border-slate-200/60">
                      <div className="text-base font-black text-slate-900 tabular-nums">
                        {bizProducts.length}
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">
                        PRODUK
                      </span>
                    </div>

                    <div>
                      <div className="text-base font-black text-slate-900 tabular-nums">
                        {bizMembers.length}
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">
                        KARYAWAN
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Bottom Actions */}
                <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-emerald-600 font-semibold flex items-center gap-1.5 self-start sm:self-center">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Bisnis siap beroperasi</span>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => openBusiness(biz.id, 'dashboard')}
                      className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <span>Dashboard</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => openBusiness(biz.id, 'pos')}
                      className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-[#00a884] hover:bg-[#009173] text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-teal-900/15"
                    >
                      <Receipt className="w-3.5 h-3.5 text-white" />
                      <span>Buka POS Kasir</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add Business Card Slot (matching mock dashed card) */}
          <Link
            href="/businesses/new"
            className="rounded-3xl border-2 border-dashed border-teal-200/80 bg-gradient-to-br from-[#f0fdf9]/60 to-[#f8fafc] hover:border-teal-400 hover:bg-[#f0fdf9] p-6 sm:p-8 flex flex-col items-center justify-center text-center transition-all group min-h-[220px]"
          >
            <div className="w-12 h-12 rounded-2xl bg-teal-100 text-[#00a884] flex items-center justify-center mb-3.5 group-hover:scale-105 transition-transform shadow-xs">
              <Plus className="w-6 h-6 stroke-[3]" />
            </div>
            <h3 className="font-extrabold text-base text-slate-900 group-hover:text-[#00a884] transition-colors">
              Tambah Bisnis Baru
            </h3>
            <p className="text-xs text-slate-500 max-w-xs mt-1 leading-relaxed">
              Perluas usaha Anda dengan mengelola lebih banyak unit dalam satu akun Tokokoe.
            </p>
            <span className="text-xs font-bold text-[#00a884] flex items-center gap-1 mt-4 group-hover:gap-1.5 transition-all">
              <span>Buat Unit Usaha</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>

        </div>

        {/* 7. BOTTOM SECURITY FOOTER */}
        <div className="text-center py-4">
          <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            <span>Data bisnis Anda terlindungi dan dikelola secara terpisah untuk setiap unit usaha.</span>
          </p>
        </div>

      </main>
    </div>
  );
}
