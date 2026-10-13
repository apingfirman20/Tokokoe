'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useBusiness } from '@/context/BusinessContext';
import { BusinessType } from '@/types';
import { 
  Building2, Coffee, Smartphone, ShoppingBag, 
  ArrowLeft, ArrowRight, Check, Store, Sparkles 
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
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <Link 
          href="/businesses" 
          className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Bisnis Saya</span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-teal-600 flex items-center justify-center text-white">
            <Store className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm text-slate-900">Tokokoe — Tambah Entitas Usaha</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-10">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10">
          <div className="mb-8">
            <span className="px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold border border-teal-200">
              Registrasi Entitas Baru
            </span>
            <h1 className="text-2xl font-bold text-slate-900 mt-2">
              Buka Unit Usaha Baru
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Pilih kategori usaha untuk mengaktifkan modul POS dan workflow operasional yang sesuai.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Bisnis / Toko <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Kopi Senja Kemang, Konter Jaya 2, Toko Makmur"
                className="w-full bg-slate-50 text-slate-900 text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-500 focus:bg-white outline-none transition-all"
              />
            </div>

            {/* Category Selection Cards */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Pilih Kategori Industri <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* F&B Card */}
                <div
                  onClick={() => setBusinessType('fnb')}
                  className={`
                    p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between
                    ${businessType === 'fnb'
                      ? 'border-teal-600 bg-teal-50/40 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 bg-white'}
                  `}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                        <Coffee className="w-5 h-5" />
                      </div>
                      {businessType === 'fnb' && (
                        <div className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="font-bold text-sm text-slate-900">Food & Beverage (F&B)</div>
                    <p className="text-xs text-slate-500 mt-1">
                      Kafe, Restoran, Kedai Kopi, Bakery.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-teal-800 font-semibold flex flex-col gap-0.5">
                    <span>✓ Meja & Dine-in</span>
                    <span>✓ Layar Dapur (KDS)</span>
                    <span>✓ Varian Rasa & Topping</span>
                  </div>
                </div>

                {/* Phone Store Card */}
                <div
                  onClick={() => setBusinessType('phone')}
                  className={`
                    p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between
                    ${businessType === 'phone'
                      ? 'border-indigo-600 bg-indigo-50/40 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 bg-white'}
                  `}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                        <Smartphone className="w-5 h-5" />
                      </div>
                      {businessType === 'phone' && (
                        <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="font-bold text-sm text-slate-900">Phone & Gadget Store</div>
                    <p className="text-xs text-slate-500 mt-1">
                      Konter HP, Aksesoris, Jasa Servis.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-indigo-800 font-semibold flex flex-col gap-0.5">
                    <span>✓ Pelacakan IMEI Unik</span>
                    <span>✓ Tukar Unit & Garansi</span>
                    <span>✓ Sell-In Beli Gadget</span>
                  </div>
                </div>

                {/* Retail Card */}
                <div
                  onClick={() => setBusinessType('retail')}
                  className={`
                    p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between
                    ${businessType === 'retail'
                      ? 'border-emerald-600 bg-emerald-50/40 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 bg-white'}
                  `}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <ShoppingBag className="w-5 h-5" />
                      </div>
                      {businessType === 'retail' && (
                        <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="font-bold text-sm text-slate-900">Ritel & Minimarket</div>
                    <p className="text-xs text-slate-500 mt-1">
                      Toko Kelontong, Supermarket, ATK.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-emerald-800 font-semibold flex flex-col gap-0.5">
                    <span>✓ Barcode Scanner Cepat</span>
                    <span>✓ Keyboard Shortcut Kasir</span>
                    <span>✓ Multi-SKU & Diskon</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Alamat Outlet / Cabang Utama
              </label>
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Jl. Nama Jalan No. XX, Kota / Kabupaten"
                className="w-full bg-slate-50 text-slate-900 text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-500 focus:bg-white outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nomor Telepon Operasional
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Contoh: 0812-3456-7890"
                className="w-full bg-slate-50 text-slate-900 text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-500 focus:bg-white outline-none transition-all"
              />
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
              <Link
                href="/businesses"
                className="px-4 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 text-xs font-semibold transition-colors"
              >
                Batal
              </Link>
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-md shadow-teal-900/30 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <span>{loading ? 'Menyiapkan Workspace...' : 'Buat & Buka Bisnis'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
