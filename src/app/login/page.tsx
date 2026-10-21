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
  Coffee, 
  Smartphone, 
  ShoppingBag, 
  Eye, 
  EyeOff, 
  AlertCircle,
  X,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { AuthHero } from '@/components/auth/AuthHero';
import { GoogleIcon } from '@/components/auth/GoogleIcon';

export default function LoginPage() {
  const router = useRouter();
  const { loginAsOwner, loginAsEmployee, loginWithGoogle, resetPassword, getIdToken } = useAuth();

  const [activeTab, setActiveTab] = useState<'owner' | 'employee'>('owner');

  // Owner Form States
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showOwnerPassword, setShowOwnerPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Employee Form States
  const [employeeUsername, setEmployeeUsername] = useState('');
  const [employeePassword, setEmployeePassword] = useState('');
  const [showEmployeePassword, setShowEmployeePassword] = useState(false);

  // Mandatory First-Time Password Change States
  const [forceChangeData, setForceChangeData] = useState<{
    uid: string;
    username: string;
    businessId: string;
  } | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Reset Password Modal States
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    const res = await loginAsOwner(ownerEmail, ownerPassword);
    setLoading(false);
    if (res.success) {
      router.push('/businesses');
    } else {
      setErrorMsg(res.error || 'Gagal login pemilik.');
    }
  };

  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    const res = await loginAsEmployee(employeeUsername, employeePassword);
    setLoading(false);
    if (res.success && res.businessId) {
      if (res.mustChangePassword) {
        setForceChangeData({
          uid: res.user?.uid || '',
          username: employeeUsername,
          businessId: res.businessId,
        });
        return;
      }
      router.push(`/app/${res.businessId}/pos`);
    } else {
      setErrorMsg(res.error || 'Username atau kata sandi tidak cocok.');
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
      setErrorMsg(res.error || 'Gagal masuk dengan Google.');
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassword) return;
    setForgotMsg(null);
    setForgotLoading(true);

    const res = await resetPassword(forgotEmail);
    setForgotLoading(false);
    if (res.success) {
      setForgotMsg({
        type: 'success',
        text: 'Tautan reset kata sandi telah dikirim ke email Anda. Silakan periksa kotak masuk atau spam.',
      });
    } else {
      setForgotMsg({
        type: 'error',
        text: res.error || 'Gagal mengirim instruksi reset kata sandi.',
      });
    }
  };

  const handleForceChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forceChangeData) return;
    setErrorMsg('');

    if (newPasswordInput.length < 6) {
      setErrorMsg('Kata sandi baru minimal 6 karakter.');
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      setErrorMsg('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }

    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          uid: forceChangeData.uid,
          username: forceChangeData.username,
          newPassword: newPasswordInput,
          businessId: forceChangeData.businessId,
        }),
      });

      const data = await res.json();
      setLoading(false);
      if (data.success) {
        router.push(`/app/${forceChangeData.businessId}/pos`);
      } else {
        setErrorMsg(data.message || 'Gagal memperbarui kata sandi baru.');
      }
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'Terjadi kesalahan sistem saat mengganti kata sandi.');
    }
  };

  const fillDemoStaff = (user: string, pass: string) => {
    setEmployeeUsername(user);
    setEmployeePassword(pass);
    setErrorMsg('');
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
          
          {/* Left Hero Brand Showcase (Desktop / Laptop) */}
          <div className="hidden lg:block lg:col-span-7 xl:col-span-7">
            <AuthHero />
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
                <h2 className="text-2xl font-black text-white tracking-tight">Tokokoe</h2>
                <p className="text-xs font-semibold text-[#00c49f] mt-1">
                  Satu Platform, Semua Usaha.
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sistem POS & Backoffice Multi-Tenant Terpadu
                </p>
              </div>

              {/* Mandatory First-Time Password Change Mode */}
              {forceChangeData ? (
                <form onSubmit={handleForceChangeSubmit} className="space-y-4 relative z-10">
                  <div className="text-center pb-2">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 mb-2 border border-amber-500/40">
                      <Lock className="w-6 h-6" />
                    </div>
                    <h3 className="text-base font-bold text-white">Wajib Ganti Kata Sandi</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Akun staf <strong className="text-teal-400 font-mono">{forceChangeData.username}</strong> memerlukan pembaruan kata sandi awal untuk akses POS.
                    </p>
                  </div>

                  {errorMsg && (
                    <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center gap-2.5">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Kata Sandi Baru (Min. 6 Karakter)
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                        placeholder="Minimal 6 karakter"
                        className="w-full bg-[#081421] text-white text-sm pl-10 pr-10 py-3 rounded-xl border border-slate-700/80 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 outline-none transition-all placeholder:text-slate-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-400 transition-colors"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Konfirmasi Kata Sandi Baru
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={confirmPasswordInput}
                        onChange={(e) => setConfirmPasswordInput(e.target.value)}
                        placeholder="Ulangi kata sandi baru"
                        className="w-full bg-[#081421] text-white text-sm pl-10 pr-10 py-3 rounded-xl border border-slate-700/80 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 outline-none transition-all placeholder:text-slate-500"
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

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#00c49f] to-[#00a884] hover:from-[#00bba6] hover:to-[#009876] text-white font-bold text-sm shadow-lg shadow-teal-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <span>{loading ? 'Menyimpan...' : 'Simpan & Lanjutkan ke Kasir'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <>
                  {/* Segmented Tab Switcher (Owner vs Employee) */}
                  <div className="bg-[#08131e]/90 p-1.5 rounded-2xl border border-slate-800 grid grid-cols-2 gap-1.5 mb-6 relative z-10">
                    <button
                      type="button"
                      onClick={() => { setActiveTab('owner'); setErrorMsg(''); }}
                      className={`py-2.5 px-3 text-xs font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${
                        activeTab === 'owner'
                          ? 'bg-gradient-to-r from-[#00bba6] to-[#009b88] text-white shadow-md shadow-teal-950/60'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Pemilik (Owner)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setActiveTab('employee'); setErrorMsg(''); }}
                      className={`py-2.5 px-3 text-xs font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${
                        activeTab === 'employee'
                          ? 'bg-gradient-to-r from-[#00bba6] to-[#009b88] text-white shadow-md shadow-teal-950/60'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                      }`}
                    >
                      <User className="w-4 h-4" />
                      <span>Kasir / Karyawan</span>
                    </button>
                  </div>

                  {/* Error Notification */}
                  {errorMsg && (
                    <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center gap-2.5 relative z-10 animate-shake">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  {/* Owner Tab Form */}
                  {activeTab === 'owner' ? (
                    <form onSubmit={handleOwnerSubmit} className="space-y-4 relative z-10">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Email Akun Pemilik
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="email"
                            required
                            value={ownerEmail}
                            onChange={(e) => setOwnerEmail(e.target.value)}
                            placeholder="firmnekesetiawan178@gmail.com"
                            className="w-full bg-[#081421] text-white text-sm pl-10 pr-4 py-3 rounded-xl border border-slate-700/80 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 outline-none transition-all placeholder:text-slate-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Kata Sandi
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type={showOwnerPassword ? 'text' : 'password'}
                            required
                            value={ownerPassword}
                            onChange={(e) => setOwnerPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-[#081421] text-white text-sm pl-10 pr-10 py-3 rounded-xl border border-slate-700/80 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 outline-none transition-all placeholder:text-slate-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowOwnerPassword(!showOwnerPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-400 transition-colors"
                          >
                            {showOwnerPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Remember me & Forgot Password */}
                      <div className="flex items-center justify-between text-xs pt-1">
                        <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300">
                          <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="w-4 h-4 rounded bg-[#081421] border-slate-700 text-teal-500 accent-teal-500 focus:ring-0 cursor-pointer"
                          />
                          <span>Ingat saya</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setForgotEmail(ownerEmail);
                            setShowForgotModal(true);
                            setForgotMsg(null);
                          }}
                          className="text-[#00c49f] hover:text-[#00dfb6] transition-colors font-medium"
                        >
                          Lupa kata sandi?
                        </button>
                      </div>

                      {/* Submit Button */}
                      <button
                        type="submit"
                        disabled={loading || googleLoading}
                        className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#00c49f] to-[#00a884] hover:from-[#00bba6] hover:to-[#009876] text-white font-bold text-sm shadow-lg shadow-teal-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <span>{loading ? 'Memproses...' : 'Masuk ke Bisnis Saya'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      {/* Divider */}
                      <div className="relative my-4 flex items-center justify-center">
                        <div className="border-t border-slate-800 w-full" />
                        <span className="bg-[#122338] px-3 text-[11px] text-slate-400 uppercase tracking-wider absolute">
                          atau
                        </span>
                      </div>

                      {/* Google Sign-In */}
                      <button
                        type="button"
                        onClick={handleGoogleSubmit}
                        disabled={loading || googleLoading}
                        className="w-full py-3 px-4 rounded-xl bg-[#081421] hover:bg-[#0c1d2e] border border-slate-700/80 text-white font-semibold text-xs shadow-sm hover:border-slate-600 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
                      >
                        <GoogleIcon className="w-4 h-4" />
                        <span>{googleLoading ? 'Menghubungkan Google...' : 'Masuk dengan Google'}</span>
                      </button>

                      {/* Register Link */}
                      <div className="pt-3 border-t border-slate-800 text-center text-xs">
                        <span className="text-slate-400">Belum punya akun pemilik? </span>
                        <Link href="/register" className="font-bold text-[#00c49f] hover:text-[#00dfb6] transition-colors">
                          Daftar Sekarang
                        </Link>
                      </div>
                    </form>
                  ) : (
                    /* Employee Tab Form */
                    <form onSubmit={handleEmployeeSubmit} className="space-y-4 relative z-10">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Username Staf / Kasir
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            required
                            value={employeeUsername}
                            onChange={(e) => setEmployeeUsername(e.target.value)}
                            placeholder="contoh: andi.kopisenja"
                            className="w-full bg-[#081421] text-white text-sm pl-10 pr-4 py-3 rounded-xl border border-slate-700/80 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 outline-none transition-all placeholder:text-slate-500"
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">
                          Diberikan oleh Pemilik saat akun dibuat.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Kata Sandi
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type={showEmployeePassword ? 'text' : 'password'}
                            required
                            value={employeePassword}
                            onChange={(e) => setEmployeePassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-[#081421] text-white text-sm pl-10 pr-10 py-3 rounded-xl border border-slate-700/80 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 outline-none transition-all placeholder:text-slate-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowEmployeePassword(!showEmployeePassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-400 transition-colors"
                          >
                            {showEmployeePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center text-xs pt-1">
                        <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300">
                          <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="w-4 h-4 rounded bg-[#081421] border-slate-700 text-teal-500 accent-teal-500 focus:ring-0 cursor-pointer"
                          />
                          <span>Ingat saya di perangkat ini</span>
                        </label>
                      </div>

                      {/* Submit Button */}
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#00c49f] to-[#00a884] hover:from-[#00bba6] hover:to-[#009876] text-white font-bold text-sm shadow-lg shadow-teal-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <span>{loading ? 'Memvalidasi Staf...' : 'Masuk ke Kasir POS'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      {/* Demo Fast Login Shortcuts (Dev Only) */}
                      {process.env.NODE_ENV !== 'production' && (
                        <div className="pt-3 border-t border-slate-800">
                          <span className="block text-[11px] font-semibold text-slate-400 mb-2">
                            Akun Demo Kasir Cepat (Development Only):
                          </span>
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              type="button"
                              onClick={() => fillDemoStaff('andi.kopisenja', 'kasir123')}
                              className="p-2 rounded-xl bg-[#081421] text-slate-300 hover:bg-slate-800 text-[10px] text-center border border-slate-700/60 flex flex-col items-center gap-1 transition-all"
                            >
                              <Coffee className="w-3.5 h-3.5 text-teal-400" />
                              <span className="font-medium">Andi (F&B)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => fillDemoStaff('rian.konter', 'staff123')}
                              className="p-2 rounded-xl bg-[#081421] text-slate-300 hover:bg-slate-800 text-[10px] text-center border border-slate-700/60 flex flex-col items-center gap-1 transition-all"
                            >
                              <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
                              <span className="font-medium">Rian (Phone)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => fillDemoStaff('siti.tokokita', 'kasir123')}
                              className="p-2 rounded-xl bg-[#081421] text-slate-300 hover:bg-slate-800 text-[10px] text-center border border-slate-700/60 flex flex-col items-center gap-1 transition-all"
                            >
                              <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="font-medium">Siti (Retail)</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </form>
                  )}
                </>
              )}

              {/* Forgot Password Modal */}
              {showForgotModal && (
                <div className="absolute inset-0 bg-[#0c1825]/95 backdrop-blur-md rounded-[28px] p-6 z-30 flex flex-col justify-center animate-fadeIn">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Lock className="w-4 h-4 text-teal-400" />
                      <span>Reset Kata Sandi</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                    Masukkan alamat email akun pemilik Anda. Kami akan mengirimkan tautan untuk mengatur ulang kata sandi.
                  </p>

                  {forgotMsg && (
                    <div
                      className={`p-3 rounded-xl mb-4 text-xs flex items-center gap-2.5 ${
                        forgotMsg.type === 'success'
                          ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-200'
                          : 'bg-rose-950/80 border border-rose-800 text-rose-200'
                      }`}
                    >
                      {forgotMsg.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span>{forgotMsg.text}</span>
                    </div>
                  )}

                  <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Alamat Email Terdaftar
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="email"
                          required
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          placeholder="nama@email.com"
                          className="w-full bg-[#081421] text-white text-sm pl-10 pr-4 py-3 rounded-xl border border-slate-700 focus:border-teal-400 outline-none transition-all placeholder:text-slate-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowForgotModal(false)}
                        className="w-1/2 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={forgotLoading}
                        className="w-1/2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#00c49f] to-[#00a884] hover:from-[#00bba6] text-white text-xs font-bold shadow-md shadow-teal-500/20 disabled:opacity-50 transition-all"
                      >
                        {forgotLoading ? 'Mengirim...' : 'Kirim Tautan'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

            {/* Bottom Security Note */}
            <div className="mt-4 text-center">
              <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-500/80" />
                <span>Dilindungi enkripsi data tenant & isolasi izin peran • Tokokoe Shield</span>
              </p>
            </div>
          </div>

        </div>

        {/* Mobile-only Feature Highlights */}
        <div className="lg:hidden mt-8 pt-6 border-t border-slate-800/80 max-w-md mx-auto">
          <div className="text-center mb-4">
            <h3 className="text-sm font-bold text-white">
              Kelola Bisnis <span className="bg-gradient-to-r from-[#00f2c4] to-[#00aa9b] bg-clip-text text-transparent">Lebih Mudah</span> dengan Tokokoe
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Satu platform untuk kasir POS, stok barang, cabang, dan analitik.
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
