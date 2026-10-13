'use client';

import React, { useState, use } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { MODULE_REGISTRY } from '@/lib/modules/registry';
import { 
  Settings, Building2, MapPin, Plus, Check, 
  CreditCard, ShieldCheck, AlertCircle, Save 
} from 'lucide-react';

export default function SettingsPage() {
  const { activeBusiness, branches, createBranch } = useBusiness();

  const [businessName, setBusinessName] = useState(activeBusiness?.name || '');
  const [address, setAddress] = useState(activeBusiness?.address || '');
  const [phone, setPhone] = useState(activeBusiness?.phone || '');

  // Branch creation
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');

  const handleAddBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    createBranch(newBranchName.trim(), newBranchAddress.trim());
    setShowAddBranch(false);
    setNewBranchName('');
    setNewBranchAddress('');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Pengaturan Bisnis & Cabang
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Konfigurasi identitas entitas, daftar cabang fisik, modul aktif, dan gateway pembayaran
        </p>
      </div>

      {/* 1. Profil Bisnis */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-teal-600" />
          <span>Profil & Legalitas Usaha</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Usaha
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nomor Telepon Operasional
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Alamat Kantor / Toko Utama
          </label>
          <textarea
            rows={2}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
          />
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={() => alert('Profil bisnis berhasil disimpan!')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Simpan Perubahan</span>
          </button>
        </div>
      </div>

      {/* 2. Manajemen Cabang */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-teal-600" />
            <span>Daftar Cabang & Outlet ({branches.length})</span>
          </h2>

          <button
            onClick={() => setShowAddBranch(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 font-semibold text-xs border border-teal-200"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Tambah Cabang</span>
          </button>
        </div>

        <div className="space-y-2">
          {branches.map((b) => (
            <div key={b.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-slate-900">{b.name}</span>
                  {b.isMainBranch && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800">
                      Cabang Utama
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{b.address}</div>
              </div>
              <span className="text-xs font-mono font-semibold text-slate-400">{b.code}</span>
            </div>
          ))}
        </div>

        {showAddBranch && (
          <form onSubmit={handleAddBranch} className="p-4 rounded-xl bg-teal-50/50 border border-teal-200 space-y-3">
            <h3 className="font-bold text-xs text-teal-900">Form Cabang Baru</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="Nama Cabang (misal: Cabang Kemang)"
                className="text-xs p-2.5 rounded-xl bg-white border border-slate-300"
              />
              <input
                type="text"
                value={newBranchAddress}
                onChange={(e) => setNewBranchAddress(e.target.value)}
                placeholder="Alamat Cabang..."
                className="text-xs p-2.5 rounded-xl bg-white border border-slate-300"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddBranch(false)}
                className="px-3 py-1.5 rounded-lg text-slate-600 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-teal-600 text-white font-bold text-xs"
              >
                Simpan Cabang
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 3. Midtrans Payment Gateway Configuration */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-indigo-600" />
          <span>Integrasi Payment Gateway (Midtrans QRIS / Snap)</span>
        </h2>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <div className="font-semibold text-slate-800">Status: Sandbox Adapter Siap Dikonfigurasi</div>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              Tokokoe telah menyediakan adapter payment gateway terisolasi. Untuk mengaktifkan pembayaran dinamis QRIS & Virtual Account secara live, masukkan <code>MIDTRANS_SERVER_KEY</code> dan <code>MIDTRANS_CLIENT_KEY</code> pada file konfigurasi environment server (<code>.env.local</code>).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
