'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { useAuth } from '@/context/AuthContext';
import { UserRole, BusinessMember } from '@/types';
import { 
  Users, Plus, Shield, UserCheck, Key, 
  MapPin, X, Check, AlertCircle, RefreshCw, Edit2, Loader2, UserX 
} from 'lucide-react';

export default function EmployeesPage() {
  const { members, branches, addEmployee, updateEmployee, reloadMembers, activeBusiness } = useBusiness();
  const { user, getIdToken } = useAuth();

  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [usernamePrefix, setUsernamePrefix] = useState('');
  const [role, setRole] = useState<UserRole>('cashier');
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [tempPassword, setTempPassword] = useState('kasir123');

  const [errorMsg, setErrorMsg] = useState('');
  const [successInfo, setSuccessInfo] = useState<{ username: string; pass: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  // Edit Employee State
  const [editingMember, setEditingMember] = useState<BusinessMember | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('cashier');
  const [editBranches, setEditBranches] = useState<string[]>([]);
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');
  const [editErrorMsg, setEditErrorMsg] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Reset Password State for Staff
  const [resetTargetMember, setResetTargetMember] = useState<BusinessMember | null>(null);
  const [newPasswordForReset, setNewPasswordForReset] = useState('');
  const [resetErrorMsg, setResetErrorMsg] = useState('');
  const [resetSuccessMsg, setResetSuccessMsg] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const handleReload = async () => {
    setIsReloading(true);
    try {
      await reloadMembers();
    } finally {
      setIsReloading(false);
    }
  };

  const handleOpenEdit = (m: BusinessMember) => {
    setEditingMember(m);
    setEditDisplayName(m.displayName);
    setEditRole(m.role);
    setEditBranches(m.branchIds || []);
    setEditStatus(m.status);
    setEditErrorMsg('');
  };

  const handleSaveEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setEditErrorMsg('');

    if (!editDisplayName.trim()) {
      setEditErrorMsg('Nama tampilan wajib diisi.');
      return;
    }
    if (editBranches.length === 0) {
      setEditErrorMsg('Minimal pilih satu cabang penugasan.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const res = await updateEmployee(editingMember.id, {
        displayName: editDisplayName.trim(),
        role: editRole,
        branchIds: editBranches,
        status: editStatus,
      });

      if (res.success) {
        setEditingMember(null);
      } else {
        setEditErrorMsg(res.error || 'Gagal memperbarui data karyawan.');
      }
    } catch (err: any) {
      setEditErrorMsg(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetMember || !activeBusiness) return;
    setResetErrorMsg('');
    setResetSuccessMsg('');

    if (newPasswordForReset.length < 6) {
      setResetErrorMsg('Kata sandi baru minimal 6 karakter.');
      return;
    }

    setIsResettingPassword(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          uid: resetTargetMember.userId,
          username: resetTargetMember.username || resetTargetMember.displayName,
          newPassword: newPasswordForReset,
          businessId: activeBusiness.id,
        }),
      });

      const data = await res.json();
      setIsResettingPassword(false);
      if (data.success) {
        setResetSuccessMsg(`Kata sandi untuk ${resetTargetMember.displayName} berhasil direset. Sesi lama telah dicabut secara paksa.`);
      } else {
        setResetErrorMsg(data.message || 'Gagal mereset kata sandi.');
      }
    } catch (err: any) {
      setIsResettingPassword(false);
      setResetErrorMsg(err.message || 'Terjadi kesalahan sistem saat mereset kata sandi.');
    }
  };

  // Suggested business slug for username formatting
  const bizSlug = activeBusiness?.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'tokokoe';
  const fullUsername = usernamePrefix ? `${usernamePrefix.trim().toLowerCase()}.${bizSlug}` : '';

  const handleOpenAdd = () => {
    setName('');
    setUsernamePrefix('');
    setRole(activeBusiness?.businessType === 'fnb' ? 'waiter' : 'cashier');
    const defaultBranchIds = branches.length > 0 
      ? branches.map(b => b.id) 
      : ['CAB-01'];
    setSelectedBranches(defaultBranchIds);
    setTempPassword('kasir123');
    setErrorMsg('');
    setSuccessInfo(null);
    setIsSubmitting(false);
    setShowAddModal(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('Nama lengkap wajib diisi.');
      return;
    }
    if (!usernamePrefix.trim()) {
      setErrorMsg('Awalan username wajib diisi.');
      return;
    }
    if (tempPassword.length < 6) {
      setErrorMsg('Kata sandi minimal 6 karakter.');
      return;
    }

    const branchesToAssign = selectedBranches.length > 0 
      ? selectedBranches 
      : (branches.length > 0 ? [branches[0].id] : ['CAB-01']);

    setIsSubmitting(true);
    try {
      const res = await addEmployee(name.trim(), fullUsername, role, branchesToAssign, tempPassword);
      if (res.success) {
        setSuccessInfo({ username: fullUsername, pass: tempPassword });
      } else {
        setErrorMsg(res.error || 'Gagal menambahkan karyawan.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Manajemen Karyawan & Hak Akses
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kelola staf, peran vertikal, cabang penugasan, dan status aktif ({members.length} anggota tim terdaftar)
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleReload}
            disabled={isReloading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all disabled:opacity-50"
            title="Reload dari Database Server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReloading ? 'animate-spin' : ''}`} />
            <span>Reload</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tambah Akun Karyawan</span>
          </button>
        </div>
      </div>

      {/* Security Architecture Note */}
      <div className="p-4 rounded-xl bg-teal-50/60 border border-teal-200 text-xs text-teal-900 flex items-start gap-3">
        <Shield className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-sm">Otentikasi Karyawan Terpusat Tokokoe</div>
          <p className="text-slate-600 leading-relaxed text-[11px]">
            Karyawan masuk menggunakan <strong>Username unik</strong> (misal <code>andi.{bizSlug}</code>) pada halaman login utama tanpa perlu mendaftar sendiri. Kredensial dipetakan ke identitas Firebase Auth terisolasi tanpa pernah menyimpan kata sandi terbuka (plaintext) di Firestore.
          </p>
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Nama Lengkap</th>
                <th className="py-3 px-4">Username Login</th>
                <th className="py-3 px-4">Peran (Role)</th>
                <th className="py-3 px-4">Cabang Bertugas</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((mem) => {
                const assignedBranchNames = (mem.branchIds || [])
                  .map(bId => {
                    if (bId === '*' || bId === 'all') return 'Semua Cabang';
                    const br = branches.find(b => b.id === bId);
                    return br ? br.name : bId;
                  })
                  .join(', ') || 'Semua Cabang';

                const isActive = mem.status === 'active';

                return (
                  <tr key={mem.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{mem.displayName}</div>
                      <div className="text-[10px] text-slate-400">ID: {mem.userId}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-teal-800">
                      {mem.username || '-'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-700">
                        {mem.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{assignedBranchNames}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isActive ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Aktif
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          Nonaktif
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {mem.role !== 'owner' ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(mem)}
                            className="p-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold border border-slate-200 inline-flex items-center gap-1 transition-colors"
                            title="Edit Role, Cabang, dan Status"
                          >
                            <Edit2 className="w-3 h-3 text-slate-600" />
                            <span>Edit</span>
                          </button>

                          <button
                            onClick={() => {
                              setResetTargetMember(mem);
                              setNewPasswordForReset('');
                              setResetErrorMsg('');
                              setResetSuccessMsg('');
                            }}
                            className="p-1 px-2 rounded-lg bg-slate-100 hover:bg-teal-50 text-slate-600 hover:text-teal-700 text-[10px] font-semibold border border-slate-200 hover:border-teal-300 inline-flex items-center gap-1 transition-colors"
                            title="Reset Kata Sandi Karyawan"
                          >
                            <Key className="w-3 h-3 text-teal-600" />
                            <span>Reset Sandi</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Owner</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Employee Modal */}
      {editingMember && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-teal-600" />
                <h3 className="font-bold text-sm text-slate-900">Edit Data Staf: {editingMember.displayName}</h3>
              </div>
              <button 
                onClick={() => setEditingMember(null)} 
                disabled={isSavingEdit}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditSubmit} className="space-y-4">
              {editErrorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {editErrorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Tampilan Karyawan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Peran (Role)
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
                  >
                    <option value="cashier">Kasir (Cashier)</option>
                    <option value="waiter">Pramusaji (Waiter - F&B)</option>
                    <option value="kitchen">Dapur (Kitchen - F&B)</option>
                    <option value="manager">Manager Toko</option>
                    <option value="warehouse">Gudang (Warehouse)</option>
                    <option value="accountant">Akuntan / Finance</option>
                    <option value="technician">Teknisi Servis (Phone)</option>
                    <option value="courier">Kurir Pengantaran</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status Akun
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as 'active' | 'inactive')}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none font-semibold"
                  >
                    <option value="active">Aktif</option>
                    <option value="inactive">Nonaktif (Blokir Akses)</option>
                  </select>
                </div>
              </div>

              {editStatus === 'inactive' && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] leading-relaxed">
                  ⚠️ <strong>Perhatian:</strong> Menonaktifkan akun akan langsung mencabut sesi aktif staf ini di seluruh perangkat. Karyawan tidak akan dapat login lagi.
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tugaskan ke Cabang
                </label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 rounded-xl bg-slate-50 border border-slate-200">
                  {branches.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={editBranches.includes(b.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditBranches(prev => [...prev, b.id]);
                          } else {
                            setEditBranches(prev => prev.filter(id => id !== b.id));
                          }
                        }}
                        className="rounded text-teal-600"
                      />
                      <span>{b.name} ({b.code})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs disabled:opacity-60 flex items-center gap-1.5 shadow-xs"
                >
                  {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSavingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTargetMember && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-teal-600" />
                <h3 className="font-bold text-sm text-slate-900">Reset Kata Sandi Staf</h3>
              </div>
              <button 
                onClick={() => setResetTargetMember(null)} 
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetSuccessMsg ? (
              <div className="space-y-4 py-2">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{resetSuccessMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setResetTargetMember(null)}
                  className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs"
                >
                  Tutup
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  Target: <strong>{resetTargetMember.displayName}</strong> (<code className="text-teal-700">{resetTargetMember.username}</code>)
                  <p className="text-[11px] text-slate-500 mt-1">
                    Sesi aktif karyawan akan dicabut seketika untuk keamanan.
                  </p>
                </div>

                {resetErrorMsg && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                    {resetErrorMsg}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kata Sandi Baru (Min. 6 Karakter) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newPasswordForReset}
                    onChange={(e) => setNewPasswordForReset(e.target.value)}
                    placeholder="Masukkan sandi baru"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500 font-mono"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={isResettingPassword}
                    onClick={() => setResetTargetMember(null)}
                    className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold hover:bg-slate-100"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isResettingPassword}
                    className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs disabled:opacity-60 flex items-center gap-1.5"
                  >
                    {isResettingPassword ? 'Menyimpan...' : 'Reset & Cabut Sesi'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Buat Akun Karyawan Baru</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {successInfo ? (
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-2">
                  <div className="font-bold text-sm flex items-center gap-1.5 text-emerald-700">
                    <Check className="w-4 h-4" />
                    <span>Akun Staf Berhasil Dibuat!</span>
                  </div>
                  <p>Berikan kredensial berikut kepada karyawan Anda untuk login ke Tokokoe:</p>
                  <div className="p-3 bg-white rounded-lg border border-emerald-300 font-mono text-xs space-y-1">
                    <div>Username: <strong>{successInfo.username}</strong></div>
                    <div>Password: <strong>{successInfo.pass}</strong></div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs"
                >
                  Selesai
                </button>
              </div>
            ) : (
              <form onSubmit={handleAddSubmit} className="space-y-4">
                {errorMsg && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                    {errorMsg}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Lengkap Karyawan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Rian Pratama"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Username Login Staf <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      required
                      value={usernamePrefix}
                      onChange={(e) => setUsernamePrefix(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                      placeholder="rian"
                      className="flex-1 text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500 font-mono"
                    />
                    <span className="text-xs font-mono text-slate-500 font-semibold">
                      .{bizSlug}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Username lengkap: <code className="text-teal-700 font-bold">{fullUsername || `... .${bizSlug}`}</code>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Peran Kerja (Role)
                    </label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
                    >
                      <option value="cashier">Kasir (Cashier)</option>
                      <option value="waiter">Pramusaji (Waiter - F&B)</option>
                      <option value="kitchen">Dapur (Kitchen - F&B)</option>
                      <option value="manager">Manager Toko</option>
                      <option value="warehouse">Gudang (Warehouse)</option>
                      <option value="accountant">Akuntan / Finance</option>
                      <option value="technician">Teknisi Servis (Phone)</option>
                      <option value="courier">Kurir Pengantaran</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Kata Sandi Awal <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                      placeholder="kasir123"
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Tugaskan ke Cabang
                  </label>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 rounded-xl bg-slate-50 border border-slate-200">
                    {branches.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedBranches.includes(b.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBranches(prev => [...prev, b.id]);
                            } else {
                              setSelectedBranches(prev => prev.filter(id => id !== b.id));
                            }
                          }}
                          className="rounded text-teal-600"
                        />
                        <span>{b.name} ({b.code})</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-xs"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <span>Simpan & Buat Kredensial</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
