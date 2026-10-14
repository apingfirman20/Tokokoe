'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { Branch } from '@/types';
import { 
  Building2, MapPin, Plus, Check, Edit2, Archive, 
  CreditCard, AlertCircle, Save, Loader2, CheckCircle2 
} from 'lucide-react';

export default function SettingsPage() {
  const { 
    activeBusiness, 
    branches, 
    activeBranch, 
    switchBranch, 
    createBranch, 
    updateBranch, 
    deactivateBranch, 
    updateBusinessProfile 
  } = useBusiness();

  const [businessName, setBusinessName] = useState(activeBusiness?.name || '');
  const [address, setAddress] = useState(activeBusiness?.address || '');
  const [phone, setPhone] = useState(activeBusiness?.phone || '');

  // Synchronize state when activeBusiness changes
  useEffect(() => {
    if (activeBusiness) {
      setBusinessName(activeBusiness.name || '');
      setAddress(activeBusiness.address || '');
      setPhone(activeBusiness.phone || '');
    }
  }, [activeBusiness]);

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Branch creation
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [newBranchPhone, setNewBranchPhone] = useState('');
  const [branchError, setBranchError] = useState<string | null>(null);
  const [isSavingBranch, setIsSavingBranch] = useState(false);

  // Branch editing
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editBranchName, setEditBranchName] = useState('');
  const [editBranchAddress, setEditBranchAddress] = useState('');
  const [editBranchPhone, setEditBranchPhone] = useState('');

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness) return;
    setProfileFeedback(null);
    setProfileError(null);

    const cleanName = businessName.trim();
    if (!cleanName) {
      setProfileError('Nama usaha wajib diisi.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const res = await updateBusinessProfile(activeBusiness.id, {
        name: cleanName,
        address: address.trim(),
        phone: phone.trim(),
      });

      if (res.success) {
        setProfileFeedback('✓ Profil usaha berhasil disimpan secara permanen di server.');
        setTimeout(() => setProfileFeedback(null), 4000);
      } else {
        setProfileError(res.error || 'Gagal menyimpan profil bisnis.');
      }
    } catch (err: any) {
      setProfileError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    setBranchError(null);
    setIsSavingBranch(true);

    try {
      const res = await createBranch(
        newBranchName.trim(), 
        newBranchAddress.trim(), 
        newBranchPhone.trim() || undefined
      );

      if (res.success) {
        setShowAddBranch(false);
        setNewBranchName('');
        setNewBranchAddress('');
        setNewBranchPhone('');
      } else {
        setBranchError(res.error || 'Gagal membuat cabang.');
      }
    } catch (err: any) {
      setBranchError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSavingBranch(false);
    }
  };

  const handleOpenEditBranch = (b: Branch) => {
    setEditingBranch(b);
    setEditBranchName(b.name);
    setEditBranchAddress(b.address || '');
    setEditBranchPhone(b.phone || '');
    setBranchError(null);
  };

  const handleSaveEditBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch) return;
    setBranchError(null);
    setIsSavingBranch(true);

    try {
      const res = await updateBranch(editingBranch.id, {
        name: editBranchName.trim(),
        address: editBranchAddress.trim(),
        phone: editBranchPhone.trim() || undefined,
      });

      if (res.success) {
        setEditingBranch(null);
      } else {
        setBranchError(res.error || 'Gagal memperbarui data cabang.');
      }
    } catch (err: any) {
      setBranchError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSavingBranch(false);
    }
  };

  const handleDeactivateBranch = async (b: Branch) => {
    if (b.isMainBranch) {
      alert('Cabang utama tidak boleh dinonaktifkan.');
      return;
    }
    if (!confirm(`Apakah Anda yakin ingin menonaktifkan cabang "${b.name}"? Riwayat transaksi lama tetap aman.`)) {
      return;
    }

    try {
      const res = await deactivateBranch(b.id);
      if (!res.success) {
        alert(res.error || 'Gagal menonaktifkan cabang.');
      }
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan sistem.');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Pengaturan Bisnis & Cabang
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Konfigurasi identitas entitas, daftar cabang fisik, dan gateway pembayaran
        </p>
      </div>

      {/* 1. Profil Bisnis */}
      <form onSubmit={handleSaveProfile} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-teal-600" />
          <span>Profil & Legalitas Usaha</span>
        </h2>

        {profileFeedback && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{profileFeedback}</span>
          </div>
        )}

        {profileError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>{profileError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Usaha <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
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
              placeholder="Contoh: 081234567890"
              className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
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
            placeholder="Alamat lengkap toko fisik..."
            className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
          />
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isSavingProfile}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-xs disabled:opacity-50 transition-colors"
          >
            {isSavingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{isSavingProfile ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
          </button>
        </div>
      </form>

      {/* 2. Manajemen Cabang */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-teal-600" />
            <span>Daftar Cabang & Outlet ({branches.length})</span>
          </h2>

          <button
            onClick={() => setShowAddBranch(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 font-semibold text-xs border border-teal-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Tambah Cabang</span>
          </button>
        </div>

        {branchError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>{branchError}</span>
          </div>
        )}

        <div className="space-y-2">
          {branches.map((b) => {
            const isActiveOutlet = activeBranch?.id === b.id;
            return (
              <div key={b.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-slate-900">{b.name}</span>
                    {b.isMainBranch && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800">
                        Cabang Utama
                      </span>
                    )}
                    {isActiveOutlet && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Aktif Saat Ini
                      </span>
                    )}
                    {b.active === false && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                        Dinonaktifkan
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{b.address || 'Alamat belum diatur'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-slate-400">{b.code}</span>
                  {!isActiveOutlet && b.active !== false && (
                    <button
                      onClick={() => switchBranch(b.id)}
                      className="px-2 py-1 rounded-lg bg-slate-200 hover:bg-teal-600 hover:text-white text-slate-700 text-[10px] font-semibold transition-colors"
                      title="Jadikan Cabang Aktif"
                    >
                      Pilih
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenEditBranch(b)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                    title="Edit Cabang"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {!b.isMainBranch && b.active !== false && (
                    <button
                      onClick={() => handleDeactivateBranch(b)}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Nonaktifkan Cabang"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal / Form Add Branch */}
        {showAddBranch && (
          <form onSubmit={handleAddBranch} className="p-4 rounded-xl bg-teal-50/50 border border-teal-200 space-y-3">
            <h3 className="font-bold text-xs text-teal-900">Form Cabang Baru</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="Nama Cabang (misal: Cabang Kemang)"
                className="text-xs p-2.5 rounded-xl bg-white border border-slate-300 outline-none"
              />
              <input
                type="text"
                value={newBranchAddress}
                onChange={(e) => setNewBranchAddress(e.target.value)}
                placeholder="Alamat Cabang..."
                className="text-xs p-2.5 rounded-xl bg-white border border-slate-300 outline-none"
              />
              <input
                type="text"
                value={newBranchPhone}
                onChange={(e) => setNewBranchPhone(e.target.value)}
                placeholder="Telepon Cabang..."
                className="text-xs p-2.5 rounded-xl bg-white border border-slate-300 outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={isSavingBranch}
                onClick={() => setShowAddBranch(false)}
                className="px-3 py-1.5 rounded-lg text-slate-600 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSavingBranch}
                className="px-4 py-1.5 rounded-lg bg-teal-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
              >
                {isSavingBranch && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Simpan Cabang</span>
              </button>
            </div>
          </form>
        )}

        {/* Modal / Form Edit Branch */}
        {editingBranch && (
          <form onSubmit={handleSaveEditBranch} className="p-4 rounded-xl bg-slate-100 border border-slate-300 space-y-3">
            <h3 className="font-bold text-xs text-slate-900">Edit Cabang: {editingBranch.code}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                value={editBranchName}
                onChange={(e) => setEditBranchName(e.target.value)}
                placeholder="Nama Cabang"
                className="text-xs p-2.5 rounded-xl bg-white border border-slate-300 outline-none"
              />
              <input
                type="text"
                value={editBranchAddress}
                onChange={(e) => setEditBranchAddress(e.target.value)}
                placeholder="Alamat Cabang"
                className="text-xs p-2.5 rounded-xl bg-white border border-slate-300 outline-none"
              />
              <input
                type="text"
                value={editBranchPhone}
                onChange={(e) => setEditBranchPhone(e.target.value)}
                placeholder="Telepon Cabang"
                className="text-xs p-2.5 rounded-xl bg-white border border-slate-300 outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={isSavingBranch}
                onClick={() => setEditingBranch(null)}
                className="px-3 py-1.5 rounded-lg text-slate-600 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSavingBranch}
                className="px-4 py-1.5 rounded-lg bg-teal-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
              >
                {isSavingBranch && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Update Cabang</span>
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
            <div className="font-semibold text-slate-800">Status: Adapter Siap Dikonfigurasi</div>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              Tokokoe telah menyediakan adapter payment gateway terisolasi. Untuk mengaktifkan pembayaran dinamis QRIS & Virtual Account secara live, masukkan <code>MIDTRANS_SERVER_KEY</code> dan <code>MIDTRANS_CLIENT_KEY</code> pada file konfigurasi environment server (<code>.env.local</code>).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
