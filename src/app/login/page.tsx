'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Store, User, Lock, Mail, ArrowRight, ShieldCheck, CheckCircle2, Coffee, Smartphone, ShoppingBag } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { loginAsOwner, loginAsEmployee, getIdToken } = useAuth();

  const [activeTab, setActiveTab] = useState<'owner' | 'employee'>('owner');

  // Owner Form States
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');

  // Employee Form States
  const [employeeUsername, setEmployeeUsername] = useState('');
  const [employeePassword, setEmployeePassword] = useState('');

  // Mandatory First-Time Password Change States
  const [forceChangeData, setForceChangeData] = useState<{
    uid: string;
    username: string;
    businessId: string;
  } | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    const res = await loginAsOwner(ownerEmail, ownerPassword);
    setLoading(false);
    if (res.success) {
      router.push('/businesses');
    } else {
      setErrorMsg(res.error || 'Gagal login.');
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
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Decorative Glow */}
      <div className="absolute top-0 -left-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-400 text-white shadow-xl shadow-teal-900/50 mb-4">
          <Store className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Tokokoe
        </h1>
        <p className="mt-1.5 text-sm font-medium text-teal-400">
          Satu Platform, Semua Usaha.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Sistem POS & Backoffice Multi-Tenant Terpadu
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-800/90 backdrop-blur-md py-8 px-6 shadow-2xl rounded-2xl border border-slate-700 sm:px-10">
          {forceChangeData ? (
            /* MANDATORY FIRST-TIME PASSWORD CHANGE */
            <form onSubmit={handleForceChangeSubmit} className="space-y-4">
              <div className="text-center pb-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 mb-2 border border-amber-500/40">
                  <Lock className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-white">Wajib Ganti Kata Sandi</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Akun Anda <strong className="text-teal-400 font-mono">{forceChangeData.username}</strong> memerlukan penggantian kata sandi pertama kali sebelum dapat mengakses sistem kasir.
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Kata Sandi Baru (Min. 6 Karakter)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full bg-slate-900 text-white text-sm pl-9 pr-3 py-2.5 rounded-lg border border-slate-700 focus:border-teal-500 outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Konfirmasi Kata Sandi Baru
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    placeholder="Ulangi kata sandi baru"
                    className="w-full bg-slate-900 text-white text-sm pl-9 pr-3 py-2.5 rounded-lg border border-slate-700 focus:border-teal-500 outline-none transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-3 py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm shadow-lg shadow-teal-900/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>{loading ? 'Menyimpan Kata Sandi...' : 'Simpan & Lanjutkan ke Kasir POS'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <>
              {/* Tab Selector */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900/80 rounded-xl mb-6 border border-slate-700/60">
                <button
                  type="button"
                  onClick={() => { setActiveTab('owner'); setErrorMsg(''); }}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'owner'
                      ? 'bg-teal-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Pemilik (Owner)</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('employee'); setErrorMsg(''); }}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'employee'
                      ? 'bg-teal-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>Kasir / Karyawan</span>
                </button>
              </div>

              {errorMsg && (
                <div className="mb-4 p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

          {activeTab === 'owner' ? (
            /* OWNER FORM */
            <form onSubmit={handleOwnerSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email Akun Pemilik
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="w-full bg-slate-900 text-white text-sm pl-9 pr-3 py-2.5 rounded-lg border border-slate-700 focus:border-teal-500 outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Kata Sandi
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-900 text-white text-sm pl-9 pr-3 py-2.5 rounded-lg border border-slate-700 focus:border-teal-500 outline-none transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm shadow-lg shadow-teal-900/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>{loading ? 'Memproses...' : 'Masuk ke Bisnis Saya'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="pt-3 border-t border-slate-700/60 text-center">
                <span className="text-xs text-slate-400">Belum punya akun pemilik? </span>
                <Link href="/register" className="text-xs font-semibold text-teal-400 hover:underline">
                  Daftar Sekarang
                </Link>
              </div>
            </form>
          ) : (
            /* EMPLOYEE FORM */
            <form onSubmit={handleEmployeeSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Username Staf / Kasir
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={employeeUsername}
                    onChange={(e) => setEmployeeUsername(e.target.value)}
                    placeholder="contoh: andi.kopisenja"
                    className="w-full bg-slate-900 text-white text-sm pl-9 pr-3 py-2.5 rounded-lg border border-slate-700 focus:border-teal-500 outline-none transition-colors"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Diberikan oleh Pemilik saat akun dibuat.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Kata Sandi
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={employeePassword}
                    onChange={(e) => setEmployeePassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-900 text-white text-sm pl-9 pr-3 py-2.5 rounded-lg border border-slate-700 focus:border-teal-500 outline-none transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm shadow-lg shadow-teal-900/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>{loading ? 'Memvalidasi Staf...' : 'Masuk ke Kasir POS'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Demo Fast Login Shortcuts (Development Only) */}
              {process.env.NODE_ENV !== 'production' && (
                <div className="pt-3 border-t border-slate-700/60">
                  <span className="block text-[11px] font-semibold text-slate-400 mb-2">
                    Akun Demo Kasir Cepat (Hanya Mode Dev):
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => fillDemoStaff('andi.kopisenja', 'kasir123')}
                      className="p-1.5 rounded-lg bg-slate-900 text-slate-300 hover:bg-slate-700 text-[10px] text-center border border-slate-700 flex flex-col items-center gap-0.5"
                    >
                      <Coffee className="w-3.5 h-3.5 text-teal-400" />
                      <span>Andi (F&B)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fillDemoStaff('rian.konter', 'staff123')}
                      className="p-1.5 rounded-lg bg-slate-900 text-slate-300 hover:bg-slate-700 text-[10px] text-center border border-slate-700 flex flex-col items-center gap-0.5"
                    >
                      <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Rian (Phone)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fillDemoStaff('siti.tokokita', 'kasir123')}
                      className="p-1.5 rounded-lg bg-slate-900 text-slate-300 hover:bg-slate-700 text-[10px] text-center border border-slate-700 flex flex-col items-center gap-0.5"
                    >
                      <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Siti (Retail)</span>
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}
        </>
      )}
    </div>

        <div className="mt-4 text-center">
          <p className="text-xs text-slate-500">
            Dilindungi enkripsi data tenant & isolasi izin peran • Tokokoe Security Shield
          </p>
        </div>
      </div>
    </div>
  );
}
