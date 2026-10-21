'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { Branch, ReceiptSettings } from '@/types';
import { processReceiptLogoFile } from '@/lib/utils';
import { 
  getDefaultReceiptSettings, 
  getIndustryReceiptBadge, 
  getIndustrySampleReceipt, 
  PRESET_LOGOS 
} from '@/lib/receipt-presets';
import { 
  Building2, MapPin, Plus, Check, Edit2, Archive, 
  CreditCard, AlertCircle, Save, Loader2, CheckCircle2,
  Receipt, Image as ImageIcon, SlidersHorizontal, Printer,
  Store, Sparkles, X, Upload, Link2, RotateCcw,
  Coffee, Smartphone, ShoppingCart
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

  const businessType = activeBusiness?.businessType || 'retail';
  const industryBadge = getIndustryReceiptBadge(businessType);

  const [businessName, setBusinessName] = useState(activeBusiness?.name || '');
  const [address, setAddress] = useState(activeBusiness?.address || '');
  const [phone, setPhone] = useState(activeBusiness?.phone || '');

  // Receipt Settings State - initialized specialized per business type
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(() => {
    return getDefaultReceiptSettings(activeBusiness, activeBranch);
  });
  const [isSavingReceipt, setIsSavingReceipt] = useState(false);
  const [receiptFeedback, setReceiptFeedback] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [isUploadingReceiptLogo, setIsUploadingReceiptLogo] = useState(false);
  const [showReceiptUrlInput, setShowReceiptUrlInput] = useState(false);

  // Synchronize state when activeBusiness or activeBranch changes
  useEffect(() => {
    if (activeBusiness) {
      setBusinessName(activeBusiness.name || '');
      setAddress(activeBusiness.address || '');
      setPhone(activeBusiness.phone || '');

      const defaults = getDefaultReceiptSettings(activeBusiness, activeBranch);
      const s = activeBusiness.receiptSettings;
      const storageKey = `tokokoe_receipt_${activeBusiness.id}`;
      let local: ReceiptSettings | null = null;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) local = JSON.parse(raw);
      } catch (e) {
        // ignore storage parse error
      }

      setReceiptSettings({
        showLogo: s?.showLogo ?? local?.showLogo ?? defaults.showLogo,
        logoUrl: s?.logoUrl || local?.logoUrl || activeBusiness.logoUrl || defaults.logoUrl || '',
        storeName: s?.storeName || local?.storeName || activeBusiness.name || defaults.storeName,
        tagline: s?.tagline ?? local?.tagline ?? defaults.tagline,
        address: s?.address || local?.address || activeBranch?.address || activeBusiness.address || defaults.address,
        phone: s?.phone || local?.phone || activeBranch?.phone || activeBusiness.phone || defaults.phone,
        footerMessage: s?.footerMessage || local?.footerMessage || defaults.footerMessage,
        footerNotes: s?.footerNotes || local?.footerNotes || defaults.footerNotes,
        customHeaderNote: s?.customHeaderNote || local?.customHeaderNote || defaults.customHeaderNote,
        showCashier: s?.showCashier ?? local?.showCashier ?? defaults.showCashier,
        showCustomer: s?.showCustomer ?? local?.showCustomer ?? defaults.showCustomer,
        showTableOrService: s?.showTableOrService ?? local?.showTableOrService ?? defaults.showTableOrService,
        showImeiDetails: s?.showImeiDetails ?? local?.showImeiDetails ?? defaults.showImeiDetails,
        showItemBarcode: s?.showItemBarcode ?? local?.showItemBarcode ?? defaults.showItemBarcode,
        showTax: s?.showTax ?? local?.showTax ?? defaults.showTax,
        paperSize: s?.paperSize || local?.paperSize || defaults.paperSize || '80mm',
      });
    }
  }, [activeBusiness, activeBranch]);

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

  const handleReceiptLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingReceiptLogo(true);
    try {
      const dataUrl = await processReceiptLogoFile(file);
      setReceiptSettings(prev => ({
        ...prev,
        showLogo: true,
        logoUrl: dataUrl,
      }));
    } catch (err: any) {
      alert(err.message || 'Gagal memproses file gambar logo.');
    } finally {
      setIsUploadingReceiptLogo(false);
      e.target.value = '';
    }
  };

  const handleSaveReceiptSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness) return;
    setIsSavingReceipt(true);
    setReceiptFeedback(null);
    setReceiptError(null);

    try {
      // 1. Save to localStorage immediately
      localStorage.setItem(`tokokoe_receipt_${activeBusiness.id}`, JSON.stringify(receiptSettings));

      // 2. Persist to server
      const res = await updateBusinessProfile(activeBusiness.id, {
        name: businessName.trim() || activeBusiness.name,
        address: address.trim(),
        phone: phone.trim(),
        logoUrl: receiptSettings.logoUrl,
        receiptSettings: receiptSettings,
      });

      if (res.success) {
        setReceiptFeedback('✓ Pengaturan nota dan logo toko berhasil disimpan permanen di server & lokal.');
        setTimeout(() => setReceiptFeedback(null), 4000);
      } else {
        setReceiptError(res.error || 'Gagal menyimpan pengaturan nota.');
      }
    } catch (err: any) {
      setReceiptError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSavingReceipt(false);
    }
  };

  const handleResetToIndustryDefault = () => {
    if (!confirm(`Reset pengaturan struk kembali ke standar bawaan ${industryBadge.badgeText}?`)) return;
    const defs = getDefaultReceiptSettings(activeBusiness, activeBranch);
    setReceiptSettings(defs);
    if (activeBusiness) {
      localStorage.setItem(`tokokoe_receipt_${activeBusiness.id}`, JSON.stringify(defs));
    }
    setReceiptFeedback(`✓ Pengaturan struk berhasil direset ke format standar khusus ${industryBadge.badgeText}.`);
    setTimeout(() => setReceiptFeedback(null), 4000);
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

      {/* 2. Pengaturan Nota & Desain Struk Kasir */}
      <form onSubmit={handleSaveReceiptSettings} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-5">
        {/* Header Section 2 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-teal-600" />
                <span>Desain & Pengaturan Nota Kasir (Thermal Receipt)</span>
              </h2>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${industryBadge.colorClass}`}>
                {industryBadge.badgeText}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {industryBadge.label} — {industryBadge.featuresText}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetToIndustryDefault}
              className="text-xs font-semibold text-slate-600 hover:text-teal-700 bg-slate-100 hover:bg-teal-50 border border-slate-200 hover:border-teal-300 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 active:scale-95 shadow-2xs"
              title="Reset ke format bawaan industri ini"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Standar {industryBadge.badgeText.replace(/^[^\s]+\s/, '')}</span>
            </button>
            <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span>Khusus {activeBusiness?.name || 'Bisnis Ini'}</span>
            </span>
          </div>
        </div>

        {receiptFeedback && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{receiptFeedback}</span>
          </div>
        )}

        {receiptError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{receiptError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Controls Column */}
          <div className="lg:col-span-7 space-y-4">
            {/* Logo Settings */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-teal-600" />
                  <span>Logo Toko di Atas Struk</span>
                </label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={receiptSettings.showLogo ?? false}
                    onChange={(e) => setReceiptSettings({ ...receiptSettings, showLogo: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
                </label>
              </div>

              {receiptSettings.showLogo && (
                <div className="space-y-3 pt-1">
                  {/* Primary: File Upload Dropzone */}
                  <div>
                    <label className="w-full cursor-pointer flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-teal-300 hover:border-teal-500 bg-teal-50/40 hover:bg-teal-50/80 transition-all text-center">
                      <div className="flex items-center gap-2 font-bold text-xs text-teal-900">
                        {isUploadingReceiptLogo ? <Loader2 className="w-4 h-4 animate-spin text-teal-600" /> : <Upload className="w-4 h-4 text-teal-600" />}
                        <span>{isUploadingReceiptLogo ? 'Sedang memproses logo...' : 'Unggah Gambar Logo dari Perangkat (Galeri / Komputer)'}</span>
                      </div>
                      <span className="text-[11px] text-teal-700 font-medium">
                        Klik untuk memilih file PNG, JPG, WebP, atau SVG (otomatis dioptimasi untuk printer thermal)
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleReceiptLogoUpload}
                        className="hidden"
                        disabled={isUploadingReceiptLogo}
                      />
                    </label>
                  </div>

                  {/* Thumbnail & Actions if logo exists */}
                  {receiptSettings.logoUrl && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-28 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center p-1 overflow-hidden shrink-0">
                          <img 
                            src={receiptSettings.logoUrl} 
                            alt="Preview Logo" 
                            className="max-h-9 max-w-full object-contain filter grayscale contrast-125"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-slate-800">Logo Struk Aktif</div>
                          <div className="text-[10px] text-slate-500">Khusus disimpan untuk bisnis {activeBusiness?.name}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReceiptSettings({ ...receiptSettings, logoUrl: '' })}
                        className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200 transition-colors"
                      >
                        Hapus Logo
                      </button>
                    </div>
                  )}

                  {/* Secondary: Sample Presets & URL Option */}
                  <div className="space-y-2 pt-1 border-t border-slate-200/60">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-slate-500 font-medium">Contoh Logo Industri:</span>
                        {PRESET_LOGOS.map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setReceiptSettings({ ...receiptSettings, logoUrl: preset.url, showLogo: true })}
                            className={`px-2.5 py-1 rounded-lg border font-semibold text-[11px] shadow-2xs transition-all ${
                              preset.type === businessType
                                ? 'bg-teal-50 border-teal-300 text-teal-800 font-bold'
                                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            {preset.name} {preset.type === businessType ? '★ Cocok' : ''}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowReceiptUrlInput(!showReceiptUrlInput)}
                        className="text-[11px] font-medium text-slate-500 hover:text-teal-600 flex items-center gap-1 underline underline-offset-2"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>{showReceiptUrlInput ? 'Sembunyikan URL' : 'Input URL Gambar'}</span>
                      </button>
                    </div>

                    {showReceiptUrlInput && (
                      <div className="pt-1">
                        <input
                          type="text"
                          value={receiptSettings.logoUrl || ''}
                          onChange={(e) => setReceiptSettings({ ...receiptSettings, logoUrl: e.target.value })}
                          placeholder="Tempel tautan URL gambar (https://...)"
                          className="w-full text-xs p-2.5 rounded-xl bg-white border border-slate-300 outline-none focus:border-teal-500"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Nama & Detail Kontak Toko */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Toko di Struk
                </label>
                <input
                  type="text"
                  value={receiptSettings.storeName || ''}
                  onChange={(e) => setReceiptSettings({ ...receiptSettings, storeName: e.target.value })}
                  placeholder="Nama toko..."
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tagline / Slogan (Opsional)
                </label>
                <input
                  type="text"
                  value={receiptSettings.tagline || ''}
                  onChange={(e) => setReceiptSettings({ ...receiptSettings, tagline: e.target.value })}
                  placeholder="Contoh: Freshly Brewed Everyday"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alamat Lengkap di Struk
                </label>
                <textarea
                  rows={2}
                  value={receiptSettings.address || ''}
                  onChange={(e) => setReceiptSettings({ ...receiptSettings, address: e.target.value })}
                  placeholder="Alamat lengkap toko / cabang..."
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  No. Telepon / WhatsApp di Struk
                </label>
                <input
                  type="text"
                  value={receiptSettings.phone || ''}
                  onChange={(e) => setReceiptSettings({ ...receiptSettings, phone: e.target.value })}
                  placeholder="Contoh: 0812-3456-7890"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Catatan Header / Tipe Nota</span>
                  <span className="text-[10px] text-slate-400 font-normal">Muncul di bawah kontak toko</span>
                </label>
                <input
                  type="text"
                  value={receiptSettings.customHeaderNote || ''}
                  onChange={(e) => setReceiptSettings({ ...receiptSettings, customHeaderNote: e.target.value })}
                  placeholder={
                    businessType === 'fnb' 
                      ? 'Contoh: BILL MEJA & DINE IN' 
                      : businessType === 'phone' 
                        ? 'Contoh: NOTA ELEKTRONIK & GARANSI RESMI' 
                        : 'Contoh: STRUK BELANJA KASIR RESMI'
                  }
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>
            </div>

            {/* Footer & Garansi */}
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pesan Penutup (Footer Message)
                </label>
                <input
                  type="text"
                  value={receiptSettings.footerMessage || ''}
                  onChange={(e) => setReceiptSettings({ ...receiptSettings, footerMessage: e.target.value })}
                  placeholder="Contoh: Terima kasih atas kunjungan Anda!"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Syarat Garansi / Catatan Kaki Nota</span>
                  <span className="text-[10px] text-slate-400 font-normal">Mendukung multi-baris enter</span>
                </label>
                <textarea
                  rows={2}
                  value={receiptSettings.footerNotes || ''}
                  onChange={(e) => setReceiptSettings({ ...receiptSettings, footerNotes: e.target.value })}
                  placeholder={
                    businessType === 'phone'
                      ? 'Klaim garansi wajib menunjukkan nota ini dan segel mesin utuh.'
                      : businessType === 'fnb'
                        ? 'Wifi: Tokokoe-Guest | Password: kopienak123'
                        : 'Barang yang telah dibeli tidak dapat ditukar/dikembalikan kecuali cacat pabrik.'
                  }
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500 font-mono"
                />
              </div>
            </div>

            {/* Print Options */}
            <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                Elemen Cetak Struk
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 text-slate-700 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={receiptSettings.showCashier ?? true}
                    onChange={(e) => setReceiptSettings({ ...receiptSettings, showCashier: e.target.checked })}
                    className="rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span>Tampilkan Kasir</span>
                </label>

                <label className="flex items-center gap-1.5 text-slate-700 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={receiptSettings.showCustomer ?? true}
                    onChange={(e) => setReceiptSettings({ ...receiptSettings, showCustomer: e.target.checked })}
                    className="rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span>Tampilkan Pelanggan</span>
                </label>

                {businessType === 'fnb' && (
                  <label className="flex items-center gap-1.5 text-slate-700 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={receiptSettings.showTableOrService ?? true}
                      onChange={(e) => setReceiptSettings({ ...receiptSettings, showTableOrService: e.target.checked })}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>Tampilkan No. Meja & Servis</span>
                  </label>
                )}

                {businessType === 'phone' && (
                  <label className="flex items-center gap-1.5 text-slate-700 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={receiptSettings.showImeiDetails ?? true}
                      onChange={(e) => setReceiptSettings({ ...receiptSettings, showImeiDetails: e.target.checked })}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>Tampilkan IMEI & Garansi</span>
                  </label>
                )}

                {businessType === 'retail' && (
                  <label className="flex items-center gap-1.5 text-slate-700 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={receiptSettings.showItemBarcode ?? true}
                      onChange={(e) => setReceiptSettings({ ...receiptSettings, showItemBarcode: e.target.checked })}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>Tampilkan Barcode/SKU</span>
                  </label>
                )}

                <label className="flex items-center gap-1.5 text-slate-700 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={receiptSettings.showTax ?? true}
                    onChange={(e) => setReceiptSettings({ ...receiptSettings, showTax: e.target.checked })}
                    className="rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span>Tampilkan Pajak (PB1/PPN)</span>
                </label>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={isSavingReceipt}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs disabled:opacity-50 transition-all active:scale-95"
              >
                {isSavingReceipt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>{isSavingReceipt ? 'Menyimpan...' : 'Simpan Pengaturan Nota'}</span>
              </button>
            </div>
          </div>

          {/* Live Preview Column */}
          {(() => {
            const sampleReceipt = getIndustrySampleReceipt(activeBusiness?.businessType, receiptSettings);
            return (
              <div className="lg:col-span-5 bg-slate-100 p-4 rounded-2xl border border-slate-200 flex flex-col items-center">
                <div className="text-[11px] font-bold text-slate-600 mb-2 flex items-center justify-between w-full px-1">
                  <div className="flex items-center gap-1.5">
                    <Printer className="w-3.5 h-3.5 text-teal-600" />
                    <span>Pratinjau Struk (Live Preview)</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${industryBadge.colorClass}`}>
                    {industryBadge.badgeText}
                  </span>
                </div>

                <div className="bg-white shadow-md border border-slate-300 rounded-lg p-3.5 font-mono text-slate-900 text-[10px] w-full max-w-[270px] space-y-1">
                  {/* Header */}
                  <div className="text-center space-y-0.5 pb-1.5">
                    {receiptSettings.showLogo && receiptSettings.logoUrl && (
                      <div className="flex justify-center pb-1">
                        <img
                          src={receiptSettings.logoUrl}
                          alt="Logo Toko"
                          className="max-h-10 max-w-[130px] object-contain filter grayscale contrast-150 mx-auto"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    <div className="font-bold text-xs tracking-wider uppercase">
                      {receiptSettings.storeName || activeBusiness?.name || 'TOKOKOE STORE'}
                    </div>
                    {receiptSettings.tagline && (
                      <div className="text-[9px] italic text-slate-500 font-sans leading-tight">
                        {receiptSettings.tagline}
                      </div>
                    )}
                    <div className="text-[9px] text-slate-500 font-sans">
                      {receiptSettings.address || activeBusiness?.address || 'Jl. Operasional Utama No. 12'}
                    </div>
                    {receiptSettings.phone && (
                      <div className="text-[9px] text-slate-500 font-sans">
                        Telp/WA: {receiptSettings.phone}
                      </div>
                    )}
                    {(receiptSettings.customHeaderNote || sampleReceipt.orderTypeLabel) && (
                      <div className="text-[9px] font-bold text-slate-700 tracking-wider uppercase border-y border-dashed border-slate-300 py-0.5 mt-1">
                        {receiptSettings.customHeaderNote || sampleReceipt.orderTypeLabel}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-dashed border-slate-400 my-1"></div>

                  {/* Sample Meta Details */}
                  <div className="space-y-0.5 text-[9px] text-slate-600">
                    {sampleReceipt.metaDetails.map((meta, idx) => {
                      if (meta.label.includes('Kasir') && receiptSettings.showCashier === false) return null;
                      if ((meta.label.includes('Pelanggan') || meta.label.includes('Tamu')) && receiptSettings.showCustomer === false) return null;
                      if (meta.label.includes('Meja') && receiptSettings.showTableOrService === false) return null;
                      if (meta.label.includes('Garansi') && receiptSettings.showImeiDetails === false) return null;
                      return (
                        <div key={idx} className="flex justify-between">
                          <span>{meta.label}:</span>
                          <span className="font-semibold text-slate-800">{meta.value}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-dashed border-slate-400 my-1"></div>

                  {/* Sample Items tailored per industry */}
                  <div className="space-y-1.5 py-0.5 text-[9px]">
                    {sampleReceipt.items.map((item: any, idx: number) => (
                      <div key={idx} className="space-y-0.5">
                        <div className="font-semibold text-slate-800 leading-tight">{item.name}</div>
                        {item.barcode && receiptSettings.showItemBarcode !== false && (
                          <div className="text-[8px] text-slate-500 font-mono">SKU: {item.barcode}</div>
                        )}
                        {item.imei && receiptSettings.showImeiDetails !== false && (
                          <div className="text-[8px] font-semibold text-blue-700">IMEI: {item.imei}</div>
                        )}
                        {item.options && (
                          <div className="text-[8px] text-slate-500 italic">{item.options}</div>
                        )}
                        {item.note && (
                          <div className="text-[8px] text-teal-700 italic">{item.note}</div>
                        )}
                        <div className="flex justify-between text-slate-500">
                          <span>{item.qty} x Rp {item.price.toLocaleString('id-ID')}</span>
                          <span className="font-semibold text-slate-800">Rp {item.subtotal.toLocaleString('id-ID')}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-dashed border-slate-400 my-1"></div>

                  {/* Totals */}
                  <div className="space-y-0.5 text-[9px]">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>Rp {sampleReceipt.subtotal.toLocaleString('id-ID')}</span>
                    </div>

                    {sampleReceipt.discount > 0 && (
                      <div className="flex justify-between text-emerald-600 font-medium">
                        <span>Diskon Promosi:</span>
                        <span>-Rp {sampleReceipt.discount.toLocaleString('id-ID')}</span>
                      </div>
                    )}

                    {businessType === 'fnb' && receiptSettings.showTableOrService !== false && sampleReceipt.serviceCharge > 0 && (
                      <div className="flex justify-between">
                        <span>Biaya Layanan (5%):</span>
                        <span>Rp {sampleReceipt.serviceCharge.toLocaleString('id-ID')}</span>
                      </div>
                    )}

                    {receiptSettings.showTax !== false && sampleReceipt.tax > 0 && (
                      <div className="flex justify-between">
                        <span>Pajak (PB1 Resto 10%):</span>
                        <span>Rp {sampleReceipt.tax.toLocaleString('id-ID')}</span>
                      </div>
                    )}

                    {sampleReceipt.tradeIn && (
                      <div className="flex justify-between text-amber-700 font-medium">
                        <span>Tukar Tambah ({sampleReceipt.tradeIn.deviceModel}):</span>
                        <span>-Rp {sampleReceipt.tradeIn.estimatedValue.toLocaleString('id-ID')}</span>
                      </div>
                    )}

                    <div className="border-t border-slate-400 pt-0.5 flex justify-between font-bold text-[10px] text-slate-900">
                      <span>TOTAL:</span>
                      <span>Rp {sampleReceipt.total.toLocaleString('id-ID')}</span>
                    </div>

                    <div className="flex justify-between text-[8px] text-slate-500 pt-0.5">
                      <span>Metode: {sampleReceipt.paymentMethod}</span>
                      <span className="font-semibold text-emerald-700">{sampleReceipt.paymentStatus}</span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="border-t border-dashed border-slate-400 my-1.5 pt-1 text-center text-[8.5px] text-slate-500 space-y-0.5">
                    {receiptSettings.footerMessage && (
                      <div className="font-semibold text-slate-700">{receiptSettings.footerMessage}</div>
                    )}
                    {receiptSettings.footerNotes && (
                      <div className="text-[8px] whitespace-pre-line leading-tight text-slate-600">{receiptSettings.footerNotes}</div>
                    )}
                    <div className="text-[8px] font-medium text-teal-700 pt-0.5">{sampleReceipt.footerHighlight}</div>
                    <div className="text-[7.5px] text-slate-400 pt-0.5">Powered by Tokokoe Cloud POS</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </form>

      {/* 3. Manajemen Cabang */}
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
