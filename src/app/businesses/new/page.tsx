'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useBusiness } from '@/context/BusinessContext';
import { BusinessType } from '@/types';
import { 
  Building2, 
  Coffee, 
  Smartphone, 
  ShoppingBag, 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  Store, 
  MapPin, 
  Phone,
  AlertCircle,
  Sparkles
} from 'lucide-react';

export default function NewBusinessPage() {
  const router = useRouter();
  const { createBusiness } = useBusiness();

  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('fnb');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const newBiz = await createBusiness(name.trim(), businessType, address.trim(), phone.trim());
      router.push(`/app/${newBiz.id}/dashboard`);
    } catch (err: any) {
      console.error("Gagal membuat bisnis:", err);
      setErrorMsg(err?.message || 'Terjadi kesalahan saat membuat bisnis.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f1f8fa] via-[#f7fbfc] to-[#edf6f9] text-slate-900 pb-16 relative overflow-hidden">
      {/* Soft Ambient Background Glows */}
      <div className="absolute top-16 -left-32 w-96 h-96 bg-cyan-200/35 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-28 -right-32 w-[520px] h-[520px] bg-teal-200/35 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-1/3 w-[600px] h-[300px] bg-sky-200/20 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="h-16 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <Link 
          href="/businesses" 
          className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-600" />
          <span>Kembali ke Bisnis Saya</span>
        </Link>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-tr from-[#00bda5] to-[#00f2c4] flex items-center justify-center text-white shadow-sm shadow-teal-950/20">
            <Store className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-xs sm:text-sm text-slate-900">
            Tokokoe — Tambah Entitas Usaha
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 pt-6 sm:pt-10 relative z-10">
        <div className="bg-white rounded-3xl border border-slate-200/70 shadow-xl shadow-slate-200/40 p-6 sm:p-10 transition-all">
          
          {/* Header Title */}
          <div className="mb-7">
            <span className="px-3 py-1 rounded-full bg-teal-50 text-[#008f7e] text-xs font-semibold border border-teal-200/80 inline-flex items-center gap-1.5 mb-2.5 shadow-2xs">
              <Store className="w-3.5 h-3.5 text-[#00a895]" />
              <span>Registrasi Entitas Baru</span>
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Buka Unit Usaha Baru
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed">
              Pilih kategori usaha untuk mengaktifkan modul POS dan workflow operasional yang sesuai.
            </p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="mb-6 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Nama Bisnis */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nama Bisnis / Toko <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Store className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Kopi Senja Kemang, Konter Jaya 2, Toko Makmur"
                  className="w-full bg-[#f8fafc] text-slate-900 text-sm pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/20 outline-none transition-all placeholder:text-slate-400 font-medium"
                />
              </div>
            </div>

            {/* Category Selection Cards */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2.5">
                Pilih Kategori Industri <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                
                {/* 1. F&B Card */}
                <div
                  onClick={() => setBusinessType('fnb')}
                  className={`
                    p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between select-none relative
                    ${businessType === 'fnb'
                      ? 'border-[#00a884] bg-[#f0fdf9] shadow-md shadow-teal-900/5 ring-2 ring-teal-500/15'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 bg-white'}
                  `}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3.5">
                      <div className="w-10 h-10 rounded-xl bg-teal-100/80 text-teal-700 flex items-center justify-center shadow-2xs">
                        <Coffee className="w-5 h-5 text-[#00a884]" />
                      </div>
                      {businessType === 'fnb' && (
                        <div className="w-5 h-5 rounded-full bg-[#00a884] text-white flex items-center justify-center shadow-xs">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="font-extrabold text-sm text-slate-900 tracking-tight">
                      Food & Beverage (F&B)
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Kafe, Restoran, Kedai Kopi, Bakery.
                    </p>
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-slate-100 text-xs text-slate-600 font-medium flex flex-col gap-1.5">
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[10px] font-bold">✓</span>
                      <span>Meja & Dine-in</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[10px] font-bold">✓</span>
                      <span>Layar Dapur (KDS)</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[10px] font-bold">✓</span>
                      <span>Varian Rasa & Topping</span>
                    </span>
                  </div>
                </div>

                {/* 2. Phone Store Card */}
                <div
                  onClick={() => setBusinessType('phone')}
                  className={`
                    p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between select-none relative
                    ${businessType === 'phone'
                      ? 'border-[#6366f1] bg-[#f5f3ff] shadow-md shadow-indigo-900/5 ring-2 ring-indigo-500/15'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 bg-white'}
                  `}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3.5">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100/80 text-indigo-700 flex items-center justify-center shadow-2xs">
                        <Smartphone className="w-5 h-5 text-indigo-600" />
                      </div>
                      {businessType === 'phone' && (
                        <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="font-extrabold text-sm text-slate-900 tracking-tight">
                      Phone & Gadget Store
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Konter HP, Aksesoris, Jasa Servis.
                    </p>
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-slate-100 text-xs text-slate-600 font-medium flex flex-col gap-1.5">
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">✓</span>
                      <span>Pelacakan IMEI Unik</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">✓</span>
                      <span>Tukar Unit & Garansi</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">✓</span>
                      <span>Jual-Beli Gadget</span>
                    </span>
                  </div>
                </div>

                {/* 3. Retail Card */}
                <div
                  onClick={() => setBusinessType('retail')}
                  className={`
                    p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between select-none relative
                    ${businessType === 'retail'
                      ? 'border-[#10b981] bg-[#ecfdf5] shadow-md shadow-emerald-900/5 ring-2 ring-emerald-500/15'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 bg-white'}
                  `}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3.5">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center shadow-2xs">
                        <ShoppingBag className="w-5 h-5 text-emerald-600" />
                      </div>
                      {businessType === 'retail' && (
                        <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="font-extrabold text-sm text-slate-900 tracking-tight">
                      Ritel & Minimarket
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Toko Kelontong, Supermarket, ATK.
                    </p>
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-slate-100 text-xs text-slate-600 font-medium flex flex-col gap-1.5">
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">✓</span>
                      <span>Barcode Scanner Cepat</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">✓</span>
                      <span>Keyboard Shortcut Kasir</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">✓</span>
                      <span>Multi-SKU & Diskon</span>
                    </span>
                  </div>
                </div>

              </div>
            </div>

            {/* Alamat Outlet */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Alamat Outlet / Cabang Utama
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Jl. Nama Jalan No. XX, Kota / Kabupaten"
                  className="w-full bg-[#f8fafc] text-slate-900 text-sm pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/20 outline-none transition-all placeholder:text-slate-400 font-medium resize-none"
                />
              </div>
            </div>

            {/* Nomor Telepon */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nomor Telepon Operasional
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Contoh: 0812-3456-7890"
                  className="w-full bg-[#f8fafc] text-slate-900 text-sm pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/20 outline-none transition-all placeholder:text-slate-400 font-medium"
                />
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 flex flex-col-reverse sm:flex-row items-center justify-end gap-3 border-t border-slate-100">
              <Link
                href="/businesses"
                className="w-full sm:w-auto text-center px-5 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 text-xs sm:text-sm font-bold transition-colors"
              >
                Batal
              </Link>
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="w-full sm:w-auto px-7 py-3 rounded-xl bg-gradient-to-r from-[#00bba6] to-[#009b88] hover:from-[#00a895] hover:to-[#008f7b] text-white font-bold text-xs sm:text-sm shadow-md shadow-teal-600/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>{loading ? 'Menyiapkan Workspace...' : 'Siapkan Workspace'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>

        </div>
      </main>
    </div>
  );
}
