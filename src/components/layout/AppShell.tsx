'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { getNavigationForUser } from '@/lib/modules/registry';
import { DynamicIcon } from './DynamicIcon';
import { 
  Store, Coffee, Smartphone, ShoppingBag, 
  MapPin, Bell, Search, Cloud, LogOut, 
  RotateCcw, Menu, X, Plus, ChevronRight,
  CircleDollarSign, Building2, UserCheck
} from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { 
    businesses, 
    activeBusiness, 
    activeBranch, 
    branches, 
    switchBusiness, 
    switchBranch, 
    resetToDemoData 
  } = useBusiness();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const navItems = activeBusiness 
    ? getNavigationForUser(
        activeBusiness.id, 
        activeBusiness.businessType, 
        activeBusiness.enabledModules, 
        user?.memberRole || 'owner',
        user?.permissions
      ) 
    : [];

  const getBusinessIcon = (type: string) => {
    switch (type) {
      case 'fnb': return <Coffee className="w-5 h-5 text-teal-300" />;
      case 'phone': return <Smartphone className="w-5 h-5 text-indigo-300" />;
      case 'retail': return <ShoppingBag className="w-5 h-5 text-emerald-300" />;
      default: return <Store className="w-5 h-5 text-teal-300" />;
    }
  };

  const getBusinessBadge = (type: string) => {
    switch (type) {
      case 'fnb': return 'F&B';
      case 'phone': return 'Phone Store';
      case 'retail': return 'Retail';
      default: return 'Toko';
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased">
      {/* Mobile Top Nav Bar */}
      <div className="lg:hidden h-16 bg-slate-900 text-white flex items-center justify-between px-4 sticky top-0 z-50 shadow-md">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
            className="p-2 rounded-lg bg-slate-800 text-slate-200 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-teal-400">Tokokoe</span>
            <span className="text-[10px] bg-teal-800/80 text-teal-200 px-1.5 py-0.5 rounded uppercase font-semibold">
              {activeBusiness ? getBusinessBadge(activeBusiness.businessType) : 'OS'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={activeBusiness ? `/app/${activeBusiness.id}/pos` : '/businesses'}
            className="flex items-center gap-1 bg-teal-600 text-white text-xs px-2.5 py-1.5 rounded-md font-semibold"
          >
            <CircleDollarSign className="w-4 h-4" />
            <span>POS</span>
          </Link>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR NAVIGATION */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 w-72 bg-[#1e293b] text-slate-200 flex flex-col justify-between
          transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:h-screen lg:shrink-0
          ${mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-0 hidden lg:flex'}
        `}>
          <div className="flex flex-col flex-1 overflow-y-auto">
            {/* Brand Logo & Version Header */}
            <div className="px-5 pt-6 pb-4 flex items-center justify-between border-b border-slate-700/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-teal-900/30">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-lg text-white tracking-tight leading-tight">Tokokoe</div>
                  <div className="text-[11px] text-teal-400 font-medium">Satu Platform, Semua Usaha</div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] bg-teal-950 text-teal-300 border border-teal-800/60 font-semibold tracking-wider">
                v2.4
              </span>
            </div>

            {/* Active Business & Branch Switcher Card */}
            <div className="px-4 py-3 border-b border-slate-800">
              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {activeBusiness && getBusinessIcon(activeBusiness.businessType)}
                    <span className="font-semibold text-sm truncate text-white">
                      {activeBusiness?.name || 'Pilih Bisnis'}
                    </span>
                  </div>
                  <span className="text-[11px] bg-teal-900/80 text-teal-300 px-2 py-0.5 rounded font-medium">
                    {activeBusiness ? getBusinessBadge(activeBusiness.businessType) : ''}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-700/40">
                  <div className="flex items-center gap-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <span className="truncate">{activeBranch?.name || 'Semua Cabang'}</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-700 text-slate-300 uppercase font-semibold">
                    {user?.memberRole || 'Owner'}
                  </span>
                </div>
              </div>
            </div>

            {/* Main Navigation Links */}
            <nav className="px-3 py-3 flex flex-col gap-1 flex-1">
              <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Modul Operasional
              </div>

              {navItems.map((item) => {
                const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.id}
                    href={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                      ${isActive 
                        ? 'bg-teal-600 text-white shadow-md shadow-teal-900/40 font-semibold' 
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'}
                    `}
                  >
                    <DynamicIcon name={item.icon} className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}

              <div className="pt-3 mt-2 border-t border-slate-800">
                <Link
                  href="/businesses"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                    ${pathname === '/businesses' 
                      ? 'bg-teal-600 text-white font-semibold' 
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'}
                  `}
                >
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <span>Bisnis Saya (Hub)</span>
                </Link>
              </div>
            </nav>

            {/* Multi-Tenant Quick Swapper Footer */}
            <div className="p-3 border-t border-slate-800 bg-slate-900/60">
              <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/40 flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase font-semibold">
                  <span>Ganti Bisnis Aktif</span>
                  <Link 
                    href="/businesses/new"
                    className="text-teal-400 hover:underline flex items-center gap-0.5 lowercase"
                  >
                    <Plus className="w-3 h-3" /> baru
                  </Link>
                </div>
                <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
                  {businesses.map((biz) => {
                    const isCurrent = biz.id === activeBusiness?.id;
                    return (
                      <button
                        key={biz.id}
                        onClick={() => {
                          switchBusiness(biz.id);
                          router.push(`/app/${biz.id}/dashboard`);
                          setMobileMenuOpen(false);
                        }}
                        className={`
                          flex items-center justify-between py-1.5 px-2 rounded text-xs transition-colors text-left
                          ${isCurrent 
                            ? 'bg-teal-950/80 text-teal-200 font-semibold border border-teal-800/50' 
                            : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'}
                        `}
                      >
                        <span className="truncate">{biz.name}</span>
                        <span className="text-[10px] text-slate-400 shrink-0 ml-1">
                          {getBusinessBadge(biz.businessType)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN VIEWPORT CANVAS */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
          {/* TOP BACKOFFICE HEADER BAR */}
          <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between shrink-0 sticky top-0 z-30 shadow-xs">
            <div className="flex items-center gap-4">
              <div className="relative hidden md:block w-72 lg:w-96">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari transaksi, produk, barcode (Ctrl+K)..."
                  className="w-full bg-slate-100/90 text-sm pl-9 pr-3 py-1.5 rounded-lg border border-transparent focus:border-teal-500 focus:bg-white outline-none transition-all placeholder:text-slate-400"
                />
              </div>

              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                <Cloud className="w-3.5 h-3.5" />
                <span>Sinkron Cloud Online</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Quick POS Trigger */}
              {activeBusiness && (
                <Link
                  href={`/app/${activeBusiness.id}/pos`}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-sm text-sm font-semibold active:scale-[0.98]"
                >
                  <CircleDollarSign className="w-4 h-4" />
                  <span className="hidden sm:inline">Buka Kasir POS</span>
                </Link>
              )}

              {/* Reset Demo Data Button (Development Only) */}
              {process.env.NODE_ENV !== 'production' && (
                <button
                  onClick={() => {
                    if (confirm('Reset seluruh data ke status demo default? Seluruh transaksi baru akan direset.')) {
                      resetToDemoData();
                    }
                  }}
                  title="Reset Data Demo Awal (Dev Only)"
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}

              {/* Notification Bell */}
              <div className="relative">
                <button className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors relative">
                  <Bell className="w-4 h-4" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500"></span>
                </button>
              </div>

              {/* User Identity Menu */}
              <div className="relative pl-2 border-l border-slate-200">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2.5 text-left p-1 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-teal-700 text-white font-bold flex items-center justify-center text-xs">
                    {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="hidden md:flex flex-col">
                    <span className="text-xs font-semibold text-slate-800 leading-tight">
                      {user?.displayName || 'Pengguna'}
                    </span>
                    <span className="text-[11px] text-slate-500 capitalize">
                      {user?.role === 'owner' ? 'Super Admin • Owner' : `${user?.memberRole || 'Kasir'} • Staf`}
                    </span>
                  </div>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <div className="text-xs font-bold text-slate-900">{user?.displayName}</div>
                      <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
                    </div>
                    <Link
                      href="/businesses"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 font-medium"
                    >
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>Kelola Semua Bisnis</span>
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 font-medium text-left"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Keluar (Logout)</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* PAGE CONTENT CONTAINER */}
          <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
