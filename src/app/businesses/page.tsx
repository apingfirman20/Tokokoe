'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useBusiness } from '@/context/BusinessContext';
import { useAuth } from '@/context/AuthContext';
import { formatRupiah } from '@/lib/utils';
import { 
  Building2, Coffee, Smartphone, ShoppingBag, Plus, 
  MapPin, Users, Store, ArrowRight, Shield, CheckCircle2,
  TrendingUp, CircleDollarSign, ExternalLink, Settings, Sparkles, LogOut
} from 'lucide-react';

export default function BusinessesHubPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { businesses, branches, members, products, sales, switchBusiness } = useBusiness();

  // Aggregate stats across authenticated user's businesses only
  const userBizIds = new Set(businesses.map(b => b.id));
  const userBranches = branches.filter(br => userBizIds.has(br.businessId));
  const userMembers = members.filter(m => userBizIds.has(m.businessId));
  const userProducts = products.filter(p => userBizIds.has(p.businessId));
  const userSales = sales.filter(s => userBizIds.has(s.businessId));

  const totalBranches = userBranches.length;
  const totalMembers = userMembers.length;
  const totalProducts = userProducts.length;
  const totalRevenue = userSales.reduce((acc, s) => acc + s.grandTotal, 0);

  const getBusinessIcon = (type: string) => {
    switch (type) {
      case 'fnb': return <Coffee className="w-6 h-6 text-teal-600" />;
      case 'phone': return <Smartphone className="w-6 h-6 text-indigo-600" />;
      case 'retail': return <ShoppingBag className="w-6 h-6 text-emerald-600" />;
      default: return <Store className="w-6 h-6 text-teal-600" />;
    }
  };

  const getBusinessBadge = (type: string) => {
    switch (type) {
      case 'fnb': return { label: 'Food & Beverage', color: 'bg-teal-50 text-teal-700 border-teal-200' };
      case 'phone': return { label: 'Phone & Gadget', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'retail': return { label: 'Ritel Minimarket', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      default: return { label: 'General Retail', color: 'bg-slate-50 text-slate-700 border-slate-200' };
    }
  };

  const openBusiness = (businessId: string, targetPath: string = 'dashboard') => {
    switchBusiness(businessId);
    router.push(`/app/${businessId}/${targetPath}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Header */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-400 flex items-center justify-center text-white shadow-md">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-base text-slate-900 leading-tight">Tokokoe Hub</div>
            <div className="text-[11px] text-teal-700 font-semibold">Satu Platform, Semua Usaha</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {businesses.length > 0 && (
            <Link
              href="/businesses/new"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors text-xs font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>+ Buat Bisnis Baru</span>
            </Link>
          )}

          <div className="flex items-center gap-2 pl-3 border-l border-slate-200 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">{user?.displayName || user?.email?.split('@')[0] || 'Pemilik'}</span>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold uppercase">
              {user?.role === 'owner' ? 'Owner' : 'Staf'}
            </span>
            <button
              onClick={() => logout()}
              className="ml-2 text-slate-400 hover:text-rose-600 transition-colors p-1 rounded hover:bg-slate-100"
              title="Keluar Akun"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {businesses.length === 0 ? (
          /* Empty State for New Users Starting with ZERO Businesses */
          <div className="max-w-3xl mx-auto py-10 px-4">
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl p-8 sm:p-12 text-center relative overflow-hidden">
              <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-gradient-to-tr from-teal-500/10 via-emerald-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-500 text-white flex items-center justify-center mx-auto mb-6 shadow-lg shadow-teal-700/20">
                <Store className="w-10 h-10" />
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
                Selamat Datang di Tokokoe
              </h1>
              <p className="text-base font-semibold text-teal-700 mb-3">
                Kamu belum memiliki bisnis.
              </p>
              <p className="text-sm text-slate-500 max-w-lg mx-auto mb-8 leading-relaxed">
                Mulai bangun dan kelola entitas tokomu sekarang. Atur kasir POS modern, kelola katalog produk, pantau stok & inventori, dan lacak seluruh transaksi keuangan tokomu dalam satu akun terpusat.
              </p>

              <Link
                href="/businesses/new"
                id="btn-create-first-business"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-lg shadow-teal-700/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
                <span>+ Buat Bisnis Pertama</span>
              </Link>

              {/* Supported Business Types Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-10 pt-8 border-t border-slate-100 text-left">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100/80">
                  <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center mb-2.5">
                    <Coffee className="w-4 h-4" />
                  </div>
                  <div className="font-bold text-xs text-slate-900">Food & Beverage (F&B)</div>
                  <p className="text-[11px] text-slate-500 mt-1">Manajemen meja dine-in, Kitchen Display System (KDS), dan varian rasa/topping.</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100/80">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center mb-2.5">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="font-bold text-xs text-slate-900">Phone & Gadget Store</div>
                  <p className="text-[11px] text-slate-500 mt-1">Pelacakan unit IMEI unik, histori tukar unit garansi, dan pembelian Sell-In.</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100/80">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2.5">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div className="font-bold text-xs text-slate-900">Ritel & Minimarket</div>
                  <p className="text-[11px] text-slate-500 mt-1">Barcode scanner berkecepatan tinggi, multi-SKU, dan kontrol stok otomatis.</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Multi-Tenant Dashboard View for Users with Existing Businesses */
          <>
            {/* Banner Section */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-900 via-slate-900 to-slate-800 text-white p-6 sm:p-8 shadow-xl mb-8">
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-xs font-semibold border border-teal-500/30">
                      Multi-Tenant Hub
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {businesses.length} Bisnis Aktif Terdaftar
                    </span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                    Bisnis Saya & Entitas Operasional
                  </h1>
                  <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                    Kelola entitas bisnis, cabang operasional, konfigurasi modul spesifik industri, dan peran karyawan dalam satu akun terpusat Tokokoe Merchant OS.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="/businesses/new"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-950/50 transition-all active:scale-[0.98]"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Buat Bisnis Baru</span>
                  </Link>
                </div>
              </div>

              {/* Quick Metrics Bar */}
              <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-700/60">
                <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
                  <span className="text-[11px] text-slate-400 uppercase font-semibold">Total Omset</span>
                  <div className="text-lg font-bold text-teal-300 mt-0.5 tabular-nums">
                    {formatRupiah(totalRevenue)}
                  </div>
                </div>
                <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
                  <span className="text-[11px] text-slate-400 uppercase font-semibold">Cabang Beroperasi</span>
                  <div className="text-lg font-bold text-white mt-0.5">
                    {totalBranches} Outlet Fisik
                  </div>
                </div>
                <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
                  <span className="text-[11px] text-slate-400 uppercase font-semibold">Katalog Master Produk</span>
                  <div className="text-lg font-bold text-white mt-0.5">
                    {totalProducts} SKU Terdaftar
                  </div>
                </div>
                <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
                  <span className="text-[11px] text-slate-400 uppercase font-semibold">Total Staf & Kasir</span>
                  <div className="text-lg font-bold text-white mt-0.5">
                    {totalMembers} Akun Karyawan
                  </div>
                </div>
              </div>
            </div>

            {/* Business Grid Section */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Daftar Bisnis yang Sedang Berjalan</h2>
                <p className="text-xs text-slate-500">Pilih salah satu bisnis untuk masuk ke POS atau Backoffice</p>
              </div>
              <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                Semua Modul Tersinkronisasi
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {businesses.map((biz) => {
                const bizBadge = getBusinessBadge(biz.businessType);
                const bizBranches = branches.filter(br => br.businessId === biz.id);
                const bizMembers = members.filter(m => m.businessId === biz.id);
                const bizProducts = products.filter(p => p.businessId === biz.id);

                return (
                  <div 
                    key={biz.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
                  >
                    <div className="p-6">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200 group-hover:scale-105 transition-transform">
                            {getBusinessIcon(biz.businessType)}
                          </div>
                          <div>
                            <h3 className="font-bold text-base text-slate-900 group-hover:text-teal-700 transition-colors">
                              {biz.name}
                            </h3>
                            <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded border mt-0.5 ${bizBadge.color}`}>
                              {bizBadge.label}
                            </span>
                          </div>
                        </div>
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1" title="Aktif Online" />
                      </div>

                      <p className="text-xs text-slate-500 mb-4 line-clamp-2">
                        {biz.address || 'Alamat belum diatur'}
                      </p>

                      {/* Specific Stats */}
                      <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-100 text-center mb-4 bg-slate-50/60 rounded-xl">
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase font-semibold">Cabang</span>
                          <div className="text-sm font-bold text-slate-800">{bizBranches.length}</div>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase font-semibold">Produk</span>
                          <div className="text-sm font-bold text-slate-800">{bizProducts.length}</div>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase font-semibold">Karyawan</span>
                          <div className="text-sm font-bold text-slate-800">{bizMembers.length}</div>
                        </div>
                      </div>

                      {/* Modules summary */}
                      <div className="text-[11px] text-slate-500 flex flex-wrap gap-1 mb-2">
                        {biz.enabledModules.slice(0, 3).map((mId) => (
                          <span key={mId} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                            {mId.replace('core.', '').replace('fnb.', '').replace('phone.', '').replace('retail.', '')}
                          </span>
                        ))}
                        {biz.enabledModules.length > 3 && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                            +{biz.enabledModules.length - 3} lainnya
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                      <button
                        onClick={() => openBusiness(biz.id, 'pos')}
                        className="flex-1 py-2 px-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <CircleDollarSign className="w-3.5 h-3.5" />
                        <span>Buka POS Kasir</span>
                      </button>

                      <button
                        onClick={() => openBusiness(biz.id, 'dashboard')}
                        className="py-2 px-3 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold text-xs transition-colors flex items-center justify-center gap-1"
                      >
                        <span>Dashboard</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Create Business New Card Slot */}
              <Link
                href="/businesses/new"
                className="border-2 border-dashed border-slate-300 hover:border-teal-500 rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all bg-white/50 hover:bg-teal-50/20 group min-h-[280px]"
              >
                <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-base text-slate-900 group-hover:text-teal-700">
                  Tambah Bisnis Baru
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mt-1">
                  Buka unit usaha baru (F&B, Phone Store, atau Ritel) di bawah satu akun manajemen Tokokoe Anda.
                </p>
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
