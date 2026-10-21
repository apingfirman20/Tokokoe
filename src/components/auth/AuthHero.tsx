import React from 'react';
import Image from 'next/image';
import { Store, Layers, TrendingUp, Receipt, ShieldCheck } from 'lucide-react';

interface AuthHeroProps {
  titlePrefix?: string;
  titleHighlight?: string;
  titleSuffix?: string;
  subtitle?: string;
}

export function AuthHero({
  titlePrefix = 'Kelola Bisnis',
  titleHighlight = 'Lebih Mudah',
  titleSuffix = 'dengan Tokokoe',
  subtitle = 'Sistem POS & Backoffice Multi-Tenant Terpadu untuk semua jenis usaha. Dari satu outlet hingga banyak cabang.',
}: AuthHeroProps) {
  const features = [
    {
      title: 'POS Kasir Modern',
      desc: 'Cepat, stabil, dan mudah digunakan',
      icon: Receipt,
      bgColor: 'bg-[#003d42]/70 text-[#00c49f] border-[#00c49f]/30',
      shadowColor: 'shadow-teal-950/40',
    },
    {
      title: 'Manajemen Stok',
      desc: 'Pantau persediaan real-time',
      icon: Layers,
      bgColor: 'bg-[#0e2c52]/70 text-[#3b82f6] border-[#3b82f6]/30',
      shadowColor: 'shadow-blue-950/40',
    },
    {
      title: 'Multi Outlet',
      desc: 'Kelola banyak cabang dalam satu akun',
      icon: Store,
      bgColor: 'bg-[#2e1854]/70 text-[#a855f7] border-[#a855f7]/30',
      shadowColor: 'shadow-purple-950/40',
    },
    {
      title: 'Laporan Lengkap',
      desc: 'Analitik bisnis yang akurat',
      icon: TrendingUp,
      bgColor: 'bg-[#452705]/70 text-[#f59e0b] border-[#f59e0b]/30',
      shadowColor: 'shadow-amber-950/40',
    },
  ];

  return (
    <div className="flex flex-col justify-between h-full py-2 lg:py-6 lg:pr-6">
      {/* Brand Header */}
      <div>
        <div className="flex items-center justify-between mb-6 lg:mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00bda5] to-[#00f2c4] flex items-center justify-center text-white shadow-md shadow-teal-950/50">
              <Store className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-black text-white tracking-tight">Tokokoe</span>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span>Satu Platform, Semua Usaha.</span>
            <div className="h-0.5 w-6 bg-[#00c49f] rounded-full" />
          </div>
        </div>

        {/* Hero Title */}
        <div className="mb-6 lg:mb-8">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.12]">
            {titlePrefix}{' '}
            <span className="bg-gradient-to-r from-[#00f2c4] via-[#00d2be] to-[#00aa9b] bg-clip-text text-transparent">
              {titleHighlight}
            </span>{' '}
            {titleSuffix}
          </h1>
          <p className="mt-3.5 text-sm sm:text-base text-slate-300/80 leading-relaxed max-w-xl">
            {subtitle}
          </p>
        </div>

        {/* Feature List & POS Showcase */}
        <div className="relative mt-6 lg:mt-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
            {/* Features (Left) */}
            <div className="md:col-span-5 space-y-3 z-10">
              {features.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3.5 p-2 rounded-xl transition-all duration-200 hover:bg-slate-800/40"
                  >
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border shadow-md ${item.bgColor} ${item.shadowColor}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-white tracking-tight">
                        {item.title}
                      </h4>
                      <p className="text-xs text-slate-400 truncate">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* POS Hardware Render (Right) */}
            <div className="md:col-span-7 relative flex items-center justify-center">
              {/* Subtle back glowing orb */}
              <div className="absolute inset-0 bg-gradient-to-tr from-teal-500/25 via-cyan-500/15 to-transparent rounded-full blur-3xl pointer-events-none transform -translate-y-2" />

              <div className="relative w-full max-w-[400px] aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl transition-transform duration-500 hover:scale-[1.02]">
                <Image
                  src="/images/pos-hardware-blended.png"
                  alt="Tokokoe POS Terminal & Printer"
                  fill
                  sizes="(max-width: 768px) 100vw, 400px"
                  className="object-contain drop-shadow-[0_20px_35px_rgba(0,0,0,0.7)]"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Footer Indicators & Trust Badge */}
      <div className="mt-8 pt-5 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-7 bg-[#00c49f] rounded-full shadow-sm shadow-teal-500/50" />
          <div className="h-1.5 w-1.5 bg-slate-700 rounded-full" />
          <div className="h-1.5 w-1.5 bg-slate-700 rounded-full" />
        </div>
        <p className="text-xs text-slate-400 text-center sm:text-right">
          Dipercaya oleh ratusan pelaku usaha di Indonesia
        </p>
      </div>
    </div>
  );
}
