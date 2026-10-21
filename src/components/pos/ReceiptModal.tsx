'use client';

import React, { useState, useEffect } from 'react';
import { Sale, ReceiptSettings } from '@/types';
import { formatRupiah, processReceiptLogoFile } from '@/lib/utils';
import { useBusiness } from '@/context/BusinessContext';
import { 
  getDefaultReceiptSettings, 
  getIndustryReceiptBadge, 
  PRESET_LOGOS 
} from '@/lib/receipt-presets';
import { 
  Printer, X, CheckCircle2, AlertTriangle, 
  HelpCircle, MonitorCheck, SlidersHorizontal,
  Copy, Check, Share2, Settings2, Image as ImageIcon,
  Save, Loader2, RotateCcw, ChevronDown, ChevronUp,
  Store, MapPin, Phone, MessageSquare, Upload, Link2,
  Sparkles, Coffee, Smartphone, ShoppingCart
} from 'lucide-react';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  businessName?: string;
  branchName?: string;
  branchAddress?: string;
  branchPhone?: string;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  sale,
  businessName = "Tokokoe Store",
  branchName = "Cabang Utama",
  branchAddress = "Jl. Sudirman No. 12, Jakarta",
  branchPhone = "0812-3456-7890",
}) => {
  const { activeBusiness, activeBranch, updateBusinessProfile } = useBusiness();
  const businessType = activeBusiness?.businessType || 'retail';
  const industryBadge = getIndustryReceiptBadge(businessType);

  const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>('80mm');
  const [printAttempted, setPrintAttempted] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);

  // Receipt Settings State
  const [settings, setSettings] = useState<ReceiptSettings>(() => {
    return getDefaultReceiptSettings(activeBusiness, activeBranch);
  });

  // Sync settings when modal opens or activeBusiness changes
  useEffect(() => {
    if (!isOpen) return;

    const defaults = getDefaultReceiptSettings(activeBusiness, activeBranch);
    const bizSettings = activeBusiness?.receiptSettings;
    const storageKey = activeBusiness ? `tokokoe_receipt_${activeBusiness.id}` : null;
    let localSaved: ReceiptSettings | null = null;
    
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) localSaved = JSON.parse(raw);
      } catch (e) {
        // ignore parse error
      }
    }

    const merged: ReceiptSettings = {
      showLogo: bizSettings?.showLogo ?? localSaved?.showLogo ?? defaults.showLogo,
      logoUrl: bizSettings?.logoUrl || localSaved?.logoUrl || activeBusiness?.logoUrl || defaults.logoUrl || '',
      storeName: bizSettings?.storeName || localSaved?.storeName || businessName || activeBusiness?.name || defaults.storeName,
      tagline: bizSettings?.tagline ?? localSaved?.tagline ?? defaults.tagline,
      address: bizSettings?.address || localSaved?.address || branchAddress || activeBranch?.address || activeBusiness?.address || defaults.address,
      phone: bizSettings?.phone || localSaved?.phone || branchPhone || activeBranch?.phone || activeBusiness?.phone || defaults.phone,
      footerMessage: bizSettings?.footerMessage || localSaved?.footerMessage || defaults.footerMessage,
      footerNotes: bizSettings?.footerNotes || localSaved?.footerNotes || defaults.footerNotes,
      customHeaderNote: bizSettings?.customHeaderNote || localSaved?.customHeaderNote || defaults.customHeaderNote,
      showCashier: bizSettings?.showCashier ?? localSaved?.showCashier ?? defaults.showCashier,
      showCustomer: bizSettings?.showCustomer ?? localSaved?.showCustomer ?? defaults.showCustomer,
      showTableOrService: bizSettings?.showTableOrService ?? localSaved?.showTableOrService ?? defaults.showTableOrService,
      showImeiDetails: bizSettings?.showImeiDetails ?? localSaved?.showImeiDetails ?? defaults.showImeiDetails,
      showItemBarcode: bizSettings?.showItemBarcode ?? localSaved?.showItemBarcode ?? defaults.showItemBarcode,
      showTax: bizSettings?.showTax ?? localSaved?.showTax ?? defaults.showTax,
      paperSize: bizSettings?.paperSize || localSaved?.paperSize || defaults.paperSize || '80mm',
    };

    setSettings(merged);
    if (merged.paperSize) {
      setPaperSize(merged.paperSize);
    }
  }, [isOpen, activeBusiness?.id, activeBusiness?.businessType, activeBranch?.id, businessName, branchAddress, branchPhone]);

  if (!isOpen || !sale) return null;

  const handleFileLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingLogo(true);
    try {
      const dataUrl = await processReceiptLogoFile(file);
      setSettings(prev => ({
        ...prev,
        showLogo: true,
        logoUrl: dataUrl,
      }));
    } catch (err: any) {
      alert(err.message || 'Gagal memproses file gambar logo.');
    } finally {
      setIsUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handlePrint = () => {
    setPrintAttempted(true);
    window.print();
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setSaveSuccessMsg(null);
    try {
      // 1. Save to localStorage specifically for this business ID
      if (activeBusiness) {
        localStorage.setItem(`tokokoe_receipt_${activeBusiness.id}`, JSON.stringify(settings));
      }

      // 2. Persist to server in business profile
      if (activeBusiness && updateBusinessProfile) {
        await updateBusinessProfile(activeBusiness.id, {
          name: activeBusiness.name,
          logoUrl: settings.logoUrl,
          receiptSettings: settings,
        });
      }

      setSaveSuccessMsg(`Pengaturan nota khusus bisnis "${activeBusiness?.name || 'Toko'}" berhasil disimpan!`);
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    } catch (err: any) {
      alert('Gagal menyimpan ke server: ' + (err.message || 'Error'));
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleResetToIndustryDefaults = () => {
    const defaults = getDefaultReceiptSettings(activeBusiness, activeBranch);
    setSettings(defaults);
    if (defaults.paperSize) setPaperSize(defaults.paperSize);
  };

  const handleCopyText = async () => {
    try {
      const activeStoreName = settings.storeName || businessName || activeBusiness?.name || 'TOKOKOE STORE';
      const activeAddr = settings.address || branchAddress || activeBranch?.address || '';
      const activePhone = settings.phone || branchPhone || activeBranch?.phone || '';

      const itemsList = sale.lineItems.map(item => {
        let line = `• ${item.productName}\n  ${item.quantity} x ${formatRupiah(item.unitPrice)} = ${formatRupiah(item.subtotal)}`;
        if (item.imei && settings.showImeiDetails !== false) {
          line += `\n  (IMEI: ${item.imei} - Garansi 1 Thn)`;
        }
        if (item.selectedOptions && Object.keys(item.selectedOptions).length > 0) {
          const opts = Object.entries(item.selectedOptions).map(([k, v]) => `${k}: ${v}`).join(', ');
          line += `\n  [${opts}]`;
        }
        if (item.selectedModifiers && item.selectedModifiers.length > 0) {
          line += `\n  + ${item.selectedModifiers.join(', ')}`;
        }
        return line;
      }).join('\n');

      const totalQty = sale.lineItems.reduce((acc, it) => acc + it.quantity, 0);

      const textReceipt = `================================\n` +
        `       ${activeStoreName.toUpperCase()}\n` +
        (settings.tagline ? `       ${settings.tagline}\n` : '') +
        (settings.customHeaderNote ? `       [${settings.customHeaderNote}]\n` : '') +
        `       ${branchName}\n` +
        (activeAddr ? `       ${activeAddr}\n` : '') +
        (activePhone ? `       Telp: ${activePhone}\n` : '') +
        `================================\n` +
        `No. Struk : ${sale.saleNumber}\n` +
        `Tanggal   : ${new Date(sale.createdAt).toLocaleDateString('id-ID')} ${new Date(sale.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}\n` +
        (settings.showCashier ? `Kasir     : ${sale.cashierName || 'Kasir'}\n` : '') +
        (settings.showCustomer ? `Pelanggan : ${sale.customerName || 'Umum'}\n` : '') +
        (settings.showTableOrService !== false && sale.tableNumber ? `Meja      : #${sale.tableNumber}\n` : '') +
        `Layanan   : ${sale.orderType.toUpperCase().replace('_', ' ')}\n` +
        (businessType === 'retail' ? `Total Item: ${sale.lineItems.length} Macam (${totalQty} Pcs)\n` : '') +
        `--------------------------------\n` +
        `${itemsList}\n` +
        `--------------------------------\n` +
        `Subtotal  : ${formatRupiah(sale.subtotal)}\n` +
        (sale.discount > 0 ? `Diskon    : -${formatRupiah(sale.discount)}\n` : '') +
        (sale.tradeIn && sale.tradeIn.estimatedValue > 0 ? `Tukar Tambah (${sale.tradeIn.deviceModel}) : -${formatRupiah(sale.tradeIn.estimatedValue)}\n` : '') +
        (settings.showTax && sale.tax > 0 ? `Pajak (${businessType === 'fnb' ? 'PB1 Resto' : 'PPN'}) : ${formatRupiah(sale.tax)}\n` : '') +
        (sale.serviceCharge > 0 ? `Service Charge : ${formatRupiah(sale.serviceCharge)}\n` : '') +
        `TOTAL     : ${formatRupiah(sale.grandTotal)}\n` +
        `Bayar (${sale.paymentMethod.toUpperCase()}) : ${formatRupiah(sale.paidAmount || sale.grandTotal)}\n` +
        (sale.changeAmount > 0 ? `Kembalian : ${formatRupiah(sale.changeAmount)}\n` : '') +
        `Status    : ${sale.paymentStatus ? sale.paymentStatus.toUpperCase() : 'LUNAS'}\n` +
        `================================\n` +
        `${settings.footerMessage || 'Terima kasih atas kunjungan Anda!'}\n` +
        (settings.footerNotes ? `${settings.footerNotes}\n` : '') +
        `Powered by Tokokoe Cloud POS\n` +
        `================================`;

      await navigator.clipboard.writeText(textReceipt);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      alert("Gagal menyalin struk ke clipboard.");
    }
  };

  const paymentMethodLabel = {
    cash: 'TUNAI (CASH)',
    transfer: 'TRANSFER BANK',
    midtrans_qris: 'QRIS (MIDTRANS)',
  }[sale.paymentMethod] || sale.paymentMethod.toUpperCase();

  const paymentStatusLabel = {
    paid: 'LUNAS (SETTLED)',
    pending: 'PENDING (MENUNGGU PEMBAYARAN)',
    failed: 'GAGAL / EXPIRED',
    cancelled: 'DIBATALKAN',
    refunded: 'DIREFUND / DIKEMBALIKAN',
  }[sale.paymentStatus || 'paid'] || (sale.paymentStatus || 'PAID').toUpperCase();

  const totalItemQty = sale.lineItems.reduce((acc, it) => acc + it.quantity, 0);

  return (
    <div className="receipt-modal-backdrop fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="receipt-modal-dialog bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 flex flex-col gap-4 my-8 max-h-[92vh] overflow-y-auto">
        
        {/* Modal Header */}
        <div className="receipt-hide-on-print flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-slate-900">
                Pratinjau & Cetak Struk Kasir
              </h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${industryBadge.colorClass}`}>
                {industryBadge.badgeText}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Format thermal roll printer 80mm & 58mm khusus bisnis <strong>{activeBusiness?.name || 'Anda'}</strong>
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                showSettings 
                  ? 'bg-teal-600 text-white border-teal-600 shadow-xs' 
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
              title="Kustomisasi logo, alamat, telepon, dan catatan nota khusus bisnis ini"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>{showSettings ? 'Tutup Setting' : 'Setting Nota Khusus'}</span>
              {showSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SETTINGS DRAWER / ACCORDION */}
        {showSettings && (
          <div className="receipt-hide-on-print bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-teal-600" />
                <div>
                  <h4 className="font-bold text-xs text-slate-900">
                    Kustomisasi Nota Khusus: {activeBusiness?.name}
                  </h4>
                  <p className="text-[10.5px] text-slate-500">
                    Pengaturan ini independen dan hanya berlaku untuk bisnis <strong>{activeBusiness?.name}</strong>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetToIndustryDefaults}
                className="text-[10.5px] font-semibold text-slate-600 hover:text-teal-700 bg-white border border-slate-200 hover:border-teal-300 px-2 py-1 rounded-lg flex items-center gap-1 shadow-2xs transition-all"
                title="Kembalikan teks & logo ke standar industri bisnis ini"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Standar {businessType.toUpperCase()}</span>
              </button>
            </div>

            {saveSuccessMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            {/* Section 1: Logo Toko Khusus */}
            <div className="space-y-3 bg-white p-3.5 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-teal-600" />
                  <span>Logo Toko di Nota Struk</span>
                </label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showLogo ?? false}
                    onChange={(e) => setSettings({ ...settings, showLogo: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
                </label>
              </div>

              {settings.showLogo && (
                <div className="space-y-3 pt-1">
                  {/* Primary: File Upload Dropzone */}
                  <div>
                    <label className="w-full cursor-pointer flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 border-dashed border-teal-300 hover:border-teal-500 bg-teal-50/50 hover:bg-teal-50/80 transition-all text-center">
                      <div className="flex items-center gap-2 font-bold text-xs text-teal-900">
                        {isUploadingLogo ? <Loader2 className="w-4 h-4 animate-spin text-teal-600" /> : <Upload className="w-4 h-4 text-teal-600" />}
                        <span>{isUploadingLogo ? 'Sedang memproses logo...' : 'Unggah File Gambar Logo dari HP / Laptop'}</span>
                      </div>
                      <span className="text-[10px] text-teal-700 font-medium">
                        Mendukung PNG, JPG, WebP, SVG (Otomatis dikompres & dioptimalkan monokrom printer thermal)
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileLogoUpload}
                        className="hidden"
                        disabled={isUploadingLogo}
                      />
                    </label>
                  </div>

                  {/* Thumbnail & Actions if logo exists */}
                  {settings.logoUrl && (
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-24 bg-white border border-slate-200 rounded-lg flex items-center justify-center p-1 overflow-hidden shrink-0">
                          <img 
                            src={settings.logoUrl} 
                            alt="Preview Logo" 
                            className="max-h-8 max-w-full object-contain filter grayscale contrast-125"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-[11px] font-bold text-slate-800">Logo Khusus Terpasang</div>
                          <div className="text-[9.5px] text-slate-500">Khusus bisnis: {activeBusiness?.name}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, logoUrl: '' })}
                        className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors"
                      >
                        Hapus
                      </button>
                    </div>
                  )}

                  {/* Secondary: Sample Presets & URL Option */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-100">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-slate-500 font-medium text-[10.5px]">Preset Bawaan:</span>
                        {PRESET_LOGOS.map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSettings({ ...settings, logoUrl: preset.url, showLogo: true })}
                            className={`px-2 py-0.5 rounded-md border transition-colors font-medium text-[10.5px] ${
                              preset.type === businessType
                                ? 'bg-teal-50 text-teal-800 border-teal-300 font-bold'
                                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowUrlInput(!showUrlInput)}
                        className="text-[10.5px] font-medium text-slate-500 hover:text-teal-600 flex items-center gap-1 underline underline-offset-2"
                      >
                        <Link2 className="w-3 h-3" />
                        <span>{showUrlInput ? 'Sembunyikan URL' : 'Gunakan URL'}</span>
                      </button>
                    </div>

                    {showUrlInput && (
                      <div className="pt-1">
                        <input
                          type="text"
                          value={settings.logoUrl || ''}
                          onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                          placeholder="Tempel tautan URL gambar (https://...)"
                          className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-teal-500"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Section 2: Identitas & Kontak Khusus */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white p-3 rounded-xl border border-slate-200">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Nama Toko di Struk
                </label>
                <input
                  type="text"
                  value={settings.storeName || ''}
                  onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                  placeholder="Nama toko khusus bisnis ini..."
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-teal-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Tagline / Sub-judul Khusus
                </label>
                <input
                  type="text"
                  value={settings.tagline || ''}
                  onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
                  placeholder="Contoh: Freshly Brewed Everyday"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Label Header Struk
                </label>
                <input
                  type="text"
                  value={settings.customHeaderNote || ''}
                  onChange={(e) => setSettings({ ...settings, customHeaderNote: e.target.value })}
                  placeholder="Contoh: BILL MEJA & DINE IN / NOTA ELEKTRONIK"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  No. Telepon / WhatsApp Toko
                </label>
                <input
                  type="text"
                  value={settings.phone || ''}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  placeholder="Contoh: 0812-3456-7890"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Alamat Lengkap Toko / Outlet
                </label>
                <textarea
                  rows={2}
                  value={settings.address || ''}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  placeholder="Alamat fisik toko ini..."
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>
            </div>

            {/* Section 3: Pesan Footer & Kebijakan Khusus */}
            <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200">
              <label className="block text-[11px] font-bold text-slate-700">
                Pesan Penutup Struk
              </label>
              <input
                type="text"
                value={settings.footerMessage || ''}
                onChange={(e) => setSettings({ ...settings, footerMessage: e.target.value })}
                placeholder="Pesan penutup..."
                className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-teal-500"
              />
              <label className="block text-[11px] font-bold text-slate-700 pt-1">
                Catatan Garansi / Kebijakan Toko / Info Wifi
              </label>
              <textarea
                rows={2}
                value={settings.footerNotes || ''}
                onChange={(e) => setSettings({ ...settings, footerNotes: e.target.value })}
                placeholder="Syarat garansi, password wifi, atau catatan retur..."
                className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-teal-500"
              />
            </div>

            {/* Section 4: Print Details Toggles (Specialized) */}
            <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 text-xs">
              <label className="flex items-center gap-1.5 text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showCashier ?? true}
                  onChange={(e) => setSettings({ ...settings, showCashier: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span>Tampilkan Kasir</span>
              </label>

              <label className="flex items-center gap-1.5 text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showCustomer ?? true}
                  onChange={(e) => setSettings({ ...settings, showCustomer: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span>Tampilkan Pelanggan</span>
              </label>

              {businessType === 'fnb' && (
                <label className="flex items-center gap-1.5 text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showTableOrService ?? true}
                    onChange={(e) => setSettings({ ...settings, showTableOrService: e.target.checked })}
                    className="rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span>Tampilkan Meja & Dine In</span>
                </label>
              )}

              {businessType === 'phone' && (
                <label className="flex items-center gap-1.5 text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showImeiDetails ?? true}
                    onChange={(e) => setSettings({ ...settings, showImeiDetails: e.target.checked })}
                    className="rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span>Tampilkan Nomor IMEI</span>
                </label>
              )}

              <label className="flex items-center gap-1.5 text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showTax ?? true}
                  onChange={(e) => setSettings({ ...settings, showTax: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span>Tampilkan Pajak ({businessType === 'fnb' ? 'PB1' : 'PPN'})</span>
              </label>
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-500">
                Disimpan ganda ke database cloud & browser kasir
              </span>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs disabled:opacity-50 transition-all active:scale-95"
              >
                {isSavingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>{isSavingSettings ? 'Menyimpan...' : `Simpan Nota ${activeBusiness?.name || ''}`}</span>
              </button>
            </div>
          </div>
        )}

        {/* Paper Size & Quick Copy Controls */}
        <div className="receipt-hide-on-print flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
          <span className="font-semibold text-slate-700 flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-teal-600" />
            Ukuran Kertas Thermal:
          </span>
          <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => {
                setPaperSize('80mm');
                setSettings(prev => ({ ...prev, paperSize: '80mm' }));
              }}
              className={`px-3 py-1 rounded-md font-medium text-xs transition-colors ${
                paperSize === '80mm'
                  ? 'bg-teal-600 text-white font-bold'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              80 mm (Standar)
            </button>
            <button
              onClick={() => {
                setPaperSize('58mm');
                setSettings(prev => ({ ...prev, paperSize: '58mm' }));
              }}
              className={`px-3 py-1 rounded-md font-medium text-xs transition-colors ${
                paperSize === '58mm'
                  ? 'bg-teal-600 text-white font-bold'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              58 mm (Kompak)
            </button>
          </div>
        </div>

        {/* Layout Notification */}
        <div className="receipt-hide-on-print">
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-medium">
            <MonitorCheck className="w-4 h-4 text-teal-600 shrink-0" />
            <span>
              <strong>Layout Khusus {businessType.toUpperCase()}:</strong> Format disesuaikan dengan jenis usaha {industryBadge.label.toLowerCase()}.
            </span>
          </div>
        </div>

        {/* RECEIPT PAPER CONTAINER (Targeted by @media print) */}
        <div className="flex justify-center p-4 bg-slate-100 rounded-xl border border-slate-200 overflow-x-auto print:p-0 print:bg-transparent print:border-none">
          <div
            id="thermal-receipt-area"
            className={`bg-white shadow-sm border border-slate-300 p-4 font-mono text-slate-900 text-xs print:border-none print:shadow-none print:p-0 ${
              paperSize === '80mm' ? 'paper-80mm w-[300px]' : 'paper-58mm w-[230px]'
            }`}
          >
            {/* Header Toko */}
            <div className="text-center space-y-0.5 pb-2">
              {settings.showLogo && settings.logoUrl && (
                <div className="flex justify-center pb-1.5">
                  <img
                    src={settings.logoUrl}
                    alt="Logo Toko"
                    className="max-h-12 max-w-[130px] object-contain filter grayscale contrast-150 mx-auto"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="font-bold text-sm tracking-wider uppercase">
                {settings.storeName || businessName || activeBusiness?.name || 'Tokokoe Store'}
              </div>
              {settings.tagline && (
                <div className="text-[9.5px] italic text-slate-600 font-sans leading-tight">
                  {settings.tagline}
                </div>
              )}
              {settings.customHeaderNote && (
                <div className="text-[8.5px] font-bold text-slate-700 tracking-wider uppercase pt-0.5 font-sans">
                  [{settings.customHeaderNote}]
                </div>
              )}
              <div className="text-[10px] text-slate-600 font-sans">{branchName}</div>
              <div className="text-[9px] text-slate-500 font-sans">
                {settings.address || branchAddress || activeBranch?.address || 'Jl. Sudirman No. 12, Jakarta'}
              </div>
              {(settings.phone || branchPhone || activeBranch?.phone) && (
                <div className="text-[9px] text-slate-500 font-sans">
                  Telp: {settings.phone || branchPhone || activeBranch?.phone}
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-slate-400 my-2"></div>

            {/* Metadata Transaksi */}
            <div className="text-[10px] space-y-0.5 text-slate-700">
              <div className="flex justify-between">
                <span>No. Struk:</span>
                <span className="font-bold">{sale.saleNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Tanggal:</span>
                <span>{new Date(sale.createdAt).toLocaleDateString('id-ID')} {new Date(sale.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {settings.showCashier !== false && (
                <div className="flex justify-between">
                  <span>{businessType === 'fnb' ? 'Kasir/Waiter:' : 'Kasir:'}</span>
                  <span>{sale.cashierName || 'Kasir'}</span>
                </div>
              )}
              {settings.showCustomer !== false && (
                <div className="flex justify-between">
                  <span>Pelanggan:</span>
                  <span>{sale.customerName || 'Pelanggan Umum'}</span>
                </div>
              )}
              {settings.showTableOrService !== false && sale.tableNumber && (
                <div className="flex justify-between font-bold text-slate-900 bg-slate-100 px-1 py-0.5 rounded my-0.5">
                  <span>Nomor Meja:</span>
                  <span>MEJA #{sale.tableNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Layanan:</span>
                <span className="uppercase font-semibold">{sale.orderType.replace('_', ' ')}</span>
              </div>
              {businessType === 'retail' && (
                <div className="flex justify-between text-[9px] text-slate-600">
                  <span>Total Belanja:</span>
                  <span>{sale.lineItems.length} Macam ({totalItemQty} Pcs)</span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-slate-400 my-2"></div>

            {/* Daftar Produk / Item */}
            <div className="space-y-2 py-1">
              {sale.lineItems.map((item, idx) => (
                <div key={idx} className="space-y-0.5 text-[10px]">
                  <div className="font-semibold text-slate-900 leading-tight">
                    {item.productName}
                  </div>
                  <div className="flex justify-between text-slate-600 pl-1">
                    <span>{item.quantity} x {formatRupiah(item.unitPrice)}</span>
                    <span className="tabular-nums font-semibold text-slate-900">{formatRupiah(item.subtotal)}</span>
                  </div>

                  {/* Serial Number & Warranty (Khusus Gadget/Phone) */}
                  {item.imei && settings.showImeiDetails !== false && (
                    <div className="text-[9px] text-slate-800 bg-slate-50 px-1 py-0.5 rounded border border-slate-300 mt-0.5 space-y-0.5 font-sans">
                      <div>IMEI: <strong>{item.imei}</strong></div>
                      <div className="text-[8.5px] text-slate-600">
                        Garansi Unit Resmi 1 Tahun • Segel Utuh
                      </div>
                    </div>
                  )}

                  {/* Modifiers & Options (Khusus FnB / Resto) */}
                  {item.selectedOptions && Object.keys(item.selectedOptions).length > 0 && (
                    <div className="text-[8.5px] text-slate-500 pl-1 font-sans">
                      {Object.entries(item.selectedOptions).map(([k, v]) => `${k}: ${v}`).join(', ')}
                    </div>
                  )}
                  {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                    <div className="text-[8.5px] text-slate-500 pl-1 font-sans">
                      + {item.selectedModifiers.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-slate-400 my-2"></div>

            {/* Perhitungan Tagihan, Pajak, Diskon */}
            <div className="space-y-1 text-[10px] text-slate-700">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="tabular-nums">{formatRupiah(sale.subtotal)}</span>
              </div>

              {sale.discount > 0 && (
                <div className="flex justify-between text-rose-700 font-medium">
                  <span>Diskon Penjualan:</span>
                  <span className="tabular-nums">-{formatRupiah(sale.discount)}</span>
                </div>
              )}

              {/* Tukar Tambah (Khusus Phone Store) */}
              {sale.tradeIn && sale.tradeIn.estimatedValue > 0 && (
                <div className="flex justify-between text-amber-900 font-semibold bg-amber-50 px-1 py-0.5 rounded">
                  <span>Tukar Tambah ({sale.tradeIn.deviceModel}):</span>
                  <span className="tabular-nums">-{formatRupiah(sale.tradeIn.estimatedValue)}</span>
                </div>
              )}

              {settings.showTax !== false && sale.tax > 0 && (
                <div className="flex justify-between">
                  <span>Pajak ({businessType === 'fnb' ? 'PB1 Resto' : 'PPN'}):</span>
                  <span className="tabular-nums">{formatRupiah(sale.tax)}</span>
                </div>
              )}

              {sale.serviceCharge > 0 && (
                <div className="flex justify-between">
                  <span>Biaya Layanan (Service):</span>
                  <span className="tabular-nums">{formatRupiah(sale.serviceCharge)}</span>
                </div>
              )}

              <div className="border-t border-slate-400 pt-1 flex justify-between font-bold text-xs text-slate-900">
                <span>TOTAL:</span>
                <span className="tabular-nums">{formatRupiah(sale.grandTotal)}</span>
              </div>

              {businessType === 'retail' && sale.discount > 0 && (
                <div className="text-center font-bold text-[9px] text-slate-800 bg-slate-100 py-0.5 rounded mt-0.5">
                  *** ANDA HEMAT {formatRupiah(sale.discount)} ***
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-slate-400 my-2"></div>

            {/* Metode Pembayaran & Penyelesaian */}
            <div className="space-y-1 text-[10px] text-slate-700">
              <div className="flex justify-between">
                <span>Metode Bayar:</span>
                <span className="font-bold">{paymentMethodLabel}</span>
              </div>

              <div className="flex justify-between">
                <span>Status Bayar:</span>
                <span className={`font-bold ${
                  sale.paymentStatus === 'paid' ? 'text-teal-700' :
                  sale.paymentStatus === 'pending' ? 'text-amber-700' :
                  sale.paymentStatus === 'refunded' ? 'text-purple-700' : 'text-rose-700'
                }`}>
                  {paymentStatusLabel}
                </span>
              </div>

              {sale.paidAmount > 0 && (
                <div className="flex justify-between">
                  <span>Jumlah Diterima:</span>
                  <span className="tabular-nums">{formatRupiah(sale.paidAmount)}</span>
                </div>
              )}

              {sale.changeAmount > 0 && (
                <div className="flex justify-between font-medium">
                  <span>Kembalian:</span>
                  <span className="tabular-nums">{formatRupiah(sale.changeAmount)}</span>
                </div>
              )}

              {sale.transferReferenceNumber && (
                <div className="text-[9px] text-slate-500 pt-0.5">
                  Ref Transfer: {sale.transferReferenceNumber}
                </div>
              )}

              {sale.midtransTransactionId && (
                <div className="text-[9px] text-slate-500 pt-0.5">
                  Ref Midtrans: {sale.midtransTransactionId}
                </div>
              )}
            </div>

            {/* Footer Struk Khusus Industri */}
            <div className="border-t border-dashed border-slate-400 my-2 pt-2 text-center text-[9px] text-slate-600 space-y-0.5 whitespace-pre-line">
              <div className="font-semibold text-slate-800">{settings.footerMessage}</div>
              {settings.footerNotes && <div className="text-slate-500">{settings.footerNotes}</div>}
              <div className="text-[8px] text-slate-400 pt-0.5">Powered by Tokokoe Cloud POS</div>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="receipt-hide-on-print flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                isCopied 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
              title="Salin rincian nota untuk dikirim ke WhatsApp / SMS pelanggan"
            >
              {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
              <span>{isCopied ? "Struk Tersalin!" : "Salin Struk (WhatsApp)"}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
            >
              Tutup
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-sm transition-all active:scale-[0.98]"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Struk ({paperSize})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
