'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { 
  Store, 
  User, 
  Lock, 
  Mail, 
  ArrowRight, 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  AlertCircle,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { AuthHero } from '@/components/auth/AuthHero';
import { GoogleIcon } from '@/components/auth/GoogleIcon';

export default function RegisterPage() {
  const router = useRouter();
  const { registerOwner, loginWithGoogle } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);

  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('Nama lengkap pemilik wajib diisi.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Kata sandi minimal 6 karakter.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    if (!agreeTerms) {
      setErrorMsg('Silakan setujui Ketentuan Layanan & Kebijakan Privasi.');
      return;
    }

    setLoading(true);
    const res = await registerOwner(name, email, password);
    setLoading(false);

    if (res.success) {
      router.push('/businesses');
    } else {
      setErrorMsg(res.error || 'Pendaftaran gagal.');
    }
  };

  const handleGoogleSubmit = async () => {
    if (!loginWithGoogle) return;
    setErrorMsg('');
    setGoogleLoading(true);

    const res = await loginWithGoogle();
    setGoogleLoading(false);
    if (res.success) {
      router.push('/businesses');
    } else {
      setErrorMsg(res.error || 'Gagal mendaftar dengan Google.');
    }
  };

  return (
    <div className="min-h-screen bg-[#07131e] text-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* Dynamic Background Atmosphere */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-teal-500/15 via-cyan-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-[600px] h-[600px] bg-gradient-to-tr from-emerald-500/15 via-teal-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-cyan-900/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-7xl mx-auto relative z-10">
        {/* Mobile-only Top Brand Header */}
        <div className="lg:hidden text-center mb-5">
          <div className="inline-flex items-center gap-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#00bda5] to-[#00f2c4] flex items-center justify-center text-white shadow-md shadow-teal-950/50">
              <Store className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-black text-white tracking-tight">Tokokoe</span>
          </div>
          <p className="text-xs font-semibold text-[#00c49f]">
            Satu Platform, Semua Usaha.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Left Hero Showcase (Desktop / Laptop) */}
          <div className="hidden lg:block lg:col-span-7 xl:col-span-7">
            <AuthHero 
              titlePrefix="Mulai Bisnis Anda"
              titleHighlight="Lebih Praktis"
              titleSuffix="bersama Tokokoe"
              subtitle="Daftarkan akun pemilik usaha Anda dalam hitungan detik. Kelola transaksi kasir, inventori stok, multi-outlet, dan laporan omset secara terpadu."
            />
          </div>

          {/* Right Floating Card (Form) */}
          <div className="lg:col-span-5 xl:col-span-5 w-full max-w-md mx-auto lg:max-w-none">
            <div className="bg-[#122338]/85 backdrop-blur-2xl border border-slate-700/60 rounded-[28px] p-6 sm:p-8 lg:p-9 shadow-2xl shadow-cyan-950/40 relative overflow-hidden transition-all duration-300">
              
              {/* Subtle Card Glow Accents */}
              <div className="absolute -top-16 -right-16 w-36 h-36 bg-teal-400/20 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-cyan-400/15 rounded-full blur-2xl pointer-events-none" />

              {/* Card Header */}
              <div className="text-center mb-6 relative z-10">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#00bda5] to-[#00f2c4] text-white shadow-lg shadow-teal-950/60 mb-3.5 transform hover:scale-105 transition-transform duration-200">
                  <Store className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight">Daftar Akun Pemilik</h2>
                <p className="text-xs font-semibold text-[#00c49f] mt-1">
                  Satu Platform, Semua Usaha.
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Buat akun untuk mengelola unit usaha dan cabang Anda
                </p>
              </div>

              {/* Error Alert */}
              {errorMsg && (
                <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center gap-2.5 relative z-10 animate-shake">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Register Form */}
              <form onSubmit={handleSubmit} className="space-y-3.5 relative z-10">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nama Lengkap Pemilik
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Contoh: Budi Pratama"
                      className="w-full bg-[#081421] text-white text-sm pl-10 pr-4 py-2.5 rounded-xl border border-slate-700/80 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 outline-none transition-all placeholder:text-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Alamat Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@email.com"
                      className="w-full bg-[#081421] text-white text-sm pl-10 pr-4 py-2.5 rounded-xl border border-slate-700/80 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 outline-none transition-all placeholder:text-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Kata Sandi (Min. 6 Karakter)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimal 6 karakter"
                      className="w-full bg-[#081421] text-white text-sm pl-10 pr-10 py-2.5 rounded-xl border border-slate-700/80 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 outline-none transition-all placeholder:text-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-400 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Konfirmasi Kata Sandi
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ulangi kata sandi"
                      className="w-full bg-[#081421] text-white text-sm pl-10 pr-10 py-2.5 rounded-xl border border-slate-700/80 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 outline-none transition-all placeholder:text-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-400 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Agreement Checkbox */}
                <div className="pt-1">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded bg-[#081421] border-slate-700 text-teal-500 accent-teal-500 focus:ring-0 cursor-pointer shrink-0"
                    />
                    <span className="text-[11px] leading-snug text-slate-400">
                      Saya menyetujui Ketentuan Layanan & Kebijakan Privasi Tokokoe.
                    </span>
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#00c49f] to-[#00a884] hover:from-[#00bba6] hover:to-[#009876] text-white font-bold text-sm shadow-lg shadow-teal-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span>{loading ? 'Mendaftarkan Akun...' : 'Daftar & Buka Bisnis Saya'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {/* Divider */}
                <div className="relative my-3 flex items-center justify-center">
                  <div className="border-t border-slate-800 w-full" />
                  <span className="bg-[#122338] px-3 text-[11px] text-slate-400 uppercase tracking-wider absolute">
                    atau
                  </span>
                </div>

                {/* Google Sign-Up */}
                <button
                  type="button"
                  onClick={handleGoogleSubmit}
                  disabled={loading || googleLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#081421] hover:bg-[#0c1d2e] border border-slate-700/80 text-white font-semibold text-xs shadow-sm hover:border-slate-600 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
                >
                  <GoogleIcon className="w-4 h-4" />
                  <span>{googleLoading ? 'Menghubungkan Google...' : 'Daftar dengan Google'}</span>
                </button>

                {/* Back to Login */}
                <div className="pt-3 border-t border-slate-800 text-center text-xs">
                  <span className="text-slate-400">Sudah memiliki akun pemilik? </span>
                  <Link href="/login" className="font-bold text-[#00c49f] hover:text-[#00dfb6] transition-colors">
                    Masuk di Sini
                  </Link>
                </div>
              </form>
            </div>

            {/* Bottom Security Note */}
            <div className="mt-4 text-center">
              <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-500/80" />
                <span>Pendaftaran instan • Multi-bisnis & cabang dalam satu akun</span>
              </p>
            </div>
          </div>

        </div>

        {/* Mobile-only Feature Highlights */}
        <div className="lg:hidden mt-8 pt-6 border-t border-slate-800/80 max-w-md mx-auto">
          <div className="text-center mb-4">
            <h3 className="text-sm font-bold text-white">
              Mulai Bisnis Anda <span className="bg-gradient-to-r from-[#00f2c4] to-[#00aa9b] bg-clip-text text-transparent">Lebih Praktis</span> bersama Tokokoe
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Daftarkan akun pemilik usaha Anda dalam hitungan detik.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-left">
            <div className="p-2.5 rounded-xl bg-[#081421] border border-slate-800/80">
              <span className="text-xs font-bold text-emerald-400 block">POS Modern</span>
              <span className="text-[10px] text-slate-400">Cepat & stabil</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#081421] border border-slate-800/80">
              <span className="text-xs font-bold text-blue-400 block">Manajemen Stok</span>
              <span className="text-[10px] text-slate-400">Real-time update</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#081421] border border-slate-800/80">
              <span className="text-xs font-bold text-purple-400 block">Multi Outlet</span>
              <span className="text-[10px] text-slate-400">Banyak cabang 1 akun</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#081421] border border-slate-800/80">
              <span className="text-xs font-bold text-amber-400 block">Laporan Lengkap</span>
              <span className="text-[10px] text-slate-400">Analitik akurat</span>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 text-center mt-3.5">
            Dipercaya oleh ratusan pelaku usaha di Indonesia
          </p>
        </div>
      </div>
    </div>
  );
}
