'use client';

import React, { useState, useEffect } from 'react';
import { Sale, ReceiptSettings } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { useBusiness } from '@/context/BusinessContext';
import { 
  Printer, X, CheckCircle2, AlertTriangle, 
  HelpCircle, MonitorCheck, SlidersHorizontal,
  Copy, Check, Share2, Settings2, Image as ImageIcon,
  Save, Loader2, RotateCcw, ChevronDown, ChevronUp,
  Store, MapPin, Phone, MessageSquare
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

const PRESET_LOGOS = [
  {
    name: '☕ Kafe & FnB',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="130" height="38" viewBox="0 0 130 38"><rect width="130" height="38" rx="6" fill="%23111827"/><path d="M22 13h14v8a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-8zm14 2h4a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-4v-8z" fill="%23ffffff"/><text x="48" y="24" fill="%23ffffff" font-family="monospace" font-weight="bold" font-size="13">CAFE POS</text></svg>'
  },
  {
    name: '📱 Gadget Store',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="130" height="38" viewBox="0 0 130 38"><rect width="130" height="38" rx="6" fill="%230f172a"/><rect x="20" y="9" width="13" height="21" rx="2.5" fill="none" stroke="%23ffffff" stroke-width="2"/><circle cx="26.5" cy="25.5" r="1.5" fill="%23ffffff"/><text x="42" y="24" fill="%23ffffff" font-family="monospace" font-weight="bold" font-size="12">GADGET ID</text></svg>'
  },
  {
    name: '🛒 Retail Mart',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="130" height="38" viewBox="0 0 130 38"><rect width="130" height="38" rx="6" fill="%231e293b"/><path d="M18 12h4l3 11h10l3-8H24" fill="none" stroke="%23ffffff" stroke-width="2" stroke-linecap="round"/><circle cx="26" cy="27" r="2" fill="%23ffffff"/><circle cx="34" cy="27" r="2" fill="%23ffffff"/><text x="44" y="24" fill="%23ffffff" font-family="monospace" font-weight="bold" font-size="13">MART POS</text></svg>'
  }
];

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
  
  const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>('80mm');
  const [printAttempted, setPrintAttempted] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Receipt Settings State
  const [settings, setSettings] = useState<ReceiptSettings>({
    showLogo: true,
    logoUrl: '',
    storeName: businessName,
    tagline: '',
    address: branchAddress,
    phone: branchPhone,
    footerMessage: 'Terima kasih atas kepercayaan Anda!',
    footerNotes: 'Barang yang telah dibeli sesuai syarat garansi resmi.',
    showCashier: true,
    showCustomer: true,
    showTax: true,
    paperSize: '80mm',
  });

  // Sync settings on mount / modal open
  useEffect(() => {
    if (!isOpen) return;

    const bizSettings = activeBusiness?.receiptSettings;
    const storageKey = activeBusiness ? `tokokoe_receipt_${activeBusiness.id}` : null;
    let localSaved: ReceiptSettings | null = null;
    
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) localSaved = JSON.parse(raw);
      } catch (e) {
        // ignore storage parse error
      }
    }

    const merged: ReceiptSettings = {
      showLogo: bizSettings?.showLogo ?? localSaved?.showLogo ?? (!!activeBusiness?.logoUrl),
      logoUrl: bizSettings?.logoUrl || localSaved?.logoUrl || activeBusiness?.logoUrl || '',
      storeName: bizSettings?.storeName || localSaved?.storeName || businessName || activeBusiness?.name || 'Tokokoe Store',
      tagline: bizSettings?.tagline || localSaved?.tagline || '',
      address: bizSettings?.address || localSaved?.address || branchAddress || activeBranch?.address || activeBusiness?.address || 'Jl. Sudirman No. 12, Jakarta',
      phone: bizSettings?.phone || localSaved?.phone || branchPhone || activeBranch?.phone || activeBusiness?.phone || '0812-3456-7890',
      footerMessage: bizSettings?.footerMessage || localSaved?.footerMessage || 'Terima kasih atas kepercayaan Anda!',
      footerNotes: bizSettings?.footerNotes || localSaved?.footerNotes || 'Barang yang telah dibeli sesuai syarat garansi resmi.',
      showCashier: bizSettings?.showCashier ?? localSaved?.showCashier ?? true,
      showCustomer: bizSettings?.showCustomer ?? localSaved?.showCustomer ?? true,
      showTax: bizSettings?.showTax ?? localSaved?.showTax ?? true,
      paperSize: bizSettings?.paperSize || localSaved?.paperSize || '80mm',
    };

    setSettings(merged);
    if (merged.paperSize) {
      setPaperSize(merged.paperSize);
    }
  }, [isOpen, activeBusiness, activeBranch, businessName, branchAddress, branchPhone]);

  if (!isOpen || !sale) return null;

  const handlePrint = () => {
    setPrintAttempted(true);
    window.print();
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setSaveSuccessMsg(null);
    try {
      // 1. Save to localStorage immediately
      if (activeBusiness) {
        localStorage.setItem(`tokokoe_receipt_${activeBusiness.id}`, JSON.stringify(settings));
      }

      // 2. Persist to server if activeBusiness available
      if (activeBusiness && updateBusinessProfile) {
        await updateBusinessProfile(activeBusiness.id, {
          name: activeBusiness.name,
          logoUrl: settings.logoUrl,
          receiptSettings: settings,
        });
      }

      setSaveSuccessMsg('Pengaturan nota berhasil disimpan permanen!');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: any) {
      alert('Gagal menyimpan ke server: ' + (err.message || 'Error'));
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCopyText = async () => {
    try {
      const itemsList = sale.lineItems.map(item => 
        `• ${item.productName}\n  ${item.quantity} x ${formatRupiah(item.unitPrice)} = ${formatRupiah(item.subtotal)}` +
        (item.imei ? `\n  (IMEI: ${item.imei})` : '')
      ).join('\n');

      const activeStoreName = settings.storeName || businessName || activeBusiness?.name || 'TOKOKOE STORE';
      const activeAddr = settings.address || branchAddress || activeBranch?.address || '';
      const activePhone = settings.phone || branchPhone || activeBranch?.phone || '';

      const textReceipt = `================================\n` +
        `       ${activeStoreName.toUpperCase()}\n` +
        (settings.tagline ? `       ${settings.tagline}\n` : '') +
        `       ${branchName}\n` +
        (activeAddr ? `       ${activeAddr}\n` : '') +
        (activePhone ? `       Telp: ${activePhone}\n` : '') +
        `================================\n` +
        `No. Struk : ${sale.saleNumber}\n` +
        `Tanggal   : ${new Date(sale.createdAt).toLocaleDateString('id-ID')} ${new Date(sale.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}\n` +
        (settings.showCashier ? `Kasir     : ${sale.cashierName || 'Kasir'}\n` : '') +
        (settings.showCustomer ? `Pelanggan : ${sale.customerName || 'Umum'}\n` : '') +
        (settings.showCustomer && sale.tableNumber ? `Meja      : #${sale.tableNumber}\n` : '') +
        `Layanan   : ${sale.orderType.toUpperCase()}\n` +
        `--------------------------------\n` +
        `${itemsList}\n` +
        `--------------------------------\n` +
        `Subtotal  : ${formatRupiah(sale.subtotal)}\n` +
        (sale.discount > 0 ? `Diskon    : -${formatRupiah(sale.discount)}\n` : '') +
        (settings.showTax && sale.tax > 0 ? `Pajak     : ${formatRupiah(sale.tax)}\n` : '') +
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

  return (
    <div className="receipt-modal-backdrop fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="receipt-modal-dialog bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 flex flex-col gap-4 my-8 max-h-[92vh] overflow-y-auto">
        
        {/* Modal Header */}
        <div className="receipt-hide-on-print flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <span>Pratinjau & Cetak Struk Kasir</span>
            </h3>
            <p className="text-xs text-slate-500">
              Format thermal roll printer 80mm & 58mm standar kasir modern
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
              title="Atur logo toko, alamat, no telepon, dan catatan nota"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>{showSettings ? 'Tutup Setting' : 'Setting Nota'}</span>
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
                <h4 className="font-bold text-xs text-slate-900">Kustomisasi Desain Struk & Identitas Toko</h4>
              </div>
              <span className="text-[10px] text-teal-700 bg-teal-100 font-semibold px-2 py-0.5 rounded-full">
                Live Preview
              </span>
            </div>

            {saveSuccessMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            {/* Section 1: Logo Toko */}
            <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-teal-600" />
                  <span>Logo Toko di Atas Nota</span>
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
                <div className="space-y-2 pt-1">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={settings.logoUrl || ''}
                      onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                      placeholder="Masukkan URL Logo (https://... atau SVG/PNG)"
                      className="flex-1 text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-teal-500"
                    />
                    {settings.logoUrl && (
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, logoUrl: '' })}
                        className="px-2.5 py-1 text-[11px] text-slate-500 hover:text-rose-600 bg-slate-100 rounded-lg hover:bg-rose-50"
                        title="Hapus Logo"
                      >
                        Hapus
                      </button>
                    )}
                  </div>

                  {/* Preset Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-500 font-medium">Contoh Logo Instan:</span>
                    {PRESET_LOGOS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSettings({ ...settings, logoUrl: preset.url, showLogo: true })}
                        className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-700 border border-slate-200 transition-colors font-medium text-[10.5px]"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>

                  {/* Thumbnail Preview */}
                  {settings.logoUrl && (
                    <div className="p-2 bg-slate-50 rounded-lg border border-dashed border-slate-300 flex items-center gap-3">
                      <div className="h-10 w-24 bg-white border border-slate-200 rounded flex items-center justify-center p-1 overflow-hidden shrink-0">
                        <img 
                          src={settings.logoUrl} 
                          alt="Preview Logo" 
                          className="max-h-8 max-w-full object-contain filter grayscale contrast-125"
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 leading-tight">
                        Logo otomatis dioptimasi warna monokrom grayscale agar cetak di thermal printer tidak bleber.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Section 2: Store Identity & Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white p-3 rounded-xl border border-slate-200">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Nama Toko di Struk
                </label>
                <input
                  type="text"
                  value={settings.storeName || ''}
                  onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                  placeholder="Contoh: Kopi Senja Coffee"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Tagline / Sub-judul (Opsional)
                </label>
                <input
                  type="text"
                  value={settings.tagline || ''}
                  onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
                  placeholder="Contoh: Artisan Coffee & Eatery"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Alamat Lengkap Toko
                </label>
                <input
                  type="text"
                  value={settings.address || ''}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  placeholder="Contoh: Jl. Senopati No. 45, Kebayoran Baru, Jakarta Selatan"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Nomor Telepon / WhatsApp Toko
                </label>
                <input
                  type="text"
                  value={settings.phone || ''}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  placeholder="Contoh: 0812-9988-7766 / @tokokoe"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>
            </div>

            {/* Section 3: Footer Message & Terms */}
            <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200">
              <label className="block text-[11px] font-bold text-slate-700">
                Pesan Kaki Struk (Footer Message)
              </label>
              <input
                type="text"
                value={settings.footerMessage || ''}
                onChange={(e) => setSettings({ ...settings, footerMessage: e.target.value })}
                placeholder="Contoh: Terima kasih atas kunjungan Anda!"
                className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-teal-500"
              />
              <textarea
                rows={2}
                value={settings.footerNotes || ''}
                onChange={(e) => setSettings({ ...settings, footerNotes: e.target.value })}
                placeholder="Syarat garansi / catatan tambahan (misal: Barang yg dibeli tidak dapat ditukar kecuali rusak pabrik)."
                className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-teal-500"
              />
            </div>

            {/* Section 4: Print Details Toggles */}
            <div className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-xl border border-slate-200 text-xs">
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
                <span>Tampilkan Pelanggan / Meja</span>
              </label>

              <label className="flex items-center gap-1.5 text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showTax ?? true}
                  onChange={(e) => setSettings({ ...settings, showTax: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span>Tampilkan Pajak (PB1)</span>
              </label>
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-500">
                Otomatis disinkronkan ke cloud & browser kasir
              </span>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs disabled:opacity-50 transition-all active:scale-95"
              >
                {isSavingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>{isSavingSettings ? 'Menyimpan...' : 'Simpan Pengaturan Nota'}</span>
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
              <strong>Siap Cetak Thermal:</strong> Margin browser otomatis dinonaktifkan saat cetak (Print Dialog).
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
                  <span>Kasir:</span>
                  <span>{sale.cashierName || 'Kasir'}</span>
                </div>
              )}
              {settings.showCustomer !== false && (
                <div className="flex justify-between">
                  <span>Pelanggan:</span>
                  <span>{sale.customerName || 'Pelanggan Umum'}</span>
                </div>
              )}
              {settings.showCustomer !== false && sale.tableNumber && (
                <div className="flex justify-between">
                  <span>Meja:</span>
                  <span className="font-bold">Meja #{sale.tableNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Layanan:</span>
                <span className="uppercase">{sale.orderType.replace('_', ' ')}</span>
              </div>
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

                  {/* Serial Number & Warranty */}
                  {item.imei && (
                    <div className="text-[9px] text-teal-800 bg-teal-50 px-1 py-0.5 rounded border border-teal-200 mt-0.5">
                      IMEI: <strong>{item.imei}</strong>
                      <div className="text-[8.5px] text-teal-600">
                        Garansi Aktif Resmi: 1 Tahun
                      </div>
                    </div>
                  )}

                  {/* Modifiers & Options */}
                  {item.selectedOptions && Object.keys(item.selectedOptions).length > 0 && (
                    <div className="text-[8.5px] text-slate-500 pl-1">
                      {Object.entries(item.selectedOptions).map(([k, v]) => `${k}: ${v}`).join(', ')}
                    </div>
                  )}
                  {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                    <div className="text-[8.5px] text-slate-500 pl-1">
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

              {settings.showTax !== false && sale.tax > 0 && (
                <div className="flex justify-between">
                  <span>Pajak (PB1/PPN):</span>
                  <span className="tabular-nums">{formatRupiah(sale.tax)}</span>
                </div>
              )}

              {sale.serviceCharge > 0 && (
                <div className="flex justify-between">
                  <span>Biaya Layanan:</span>
                  <span className="tabular-nums">{formatRupiah(sale.serviceCharge)}</span>
                </div>
              )}

              {sale.tradeIn && sale.tradeIn.estimatedValue > 0 && (
                <div className="flex justify-between text-amber-700 font-medium">
                  <span>Tukar Tambah ({sale.tradeIn.deviceModel}):</span>
                  <span className="tabular-nums">-{formatRupiah(sale.tradeIn.estimatedValue)}</span>
                </div>
              )}

              <div className="border-t border-slate-400 pt-1 flex justify-between font-bold text-xs text-slate-900">
                <span>TOTAL:</span>
                <span className="tabular-nums">{formatRupiah(sale.grandTotal)}</span>
              </div>
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

            {/* Footer Struk */}
            <div className="border-t border-dashed border-slate-400 my-2 pt-2 text-center text-[9px] text-slate-500 space-y-0.5">
              <div className="font-semibold text-slate-700">{settings.footerMessage || 'Terima kasih atas kepercayaan Anda!'}</div>
              {settings.footerNotes && <div>{settings.footerNotes}</div>}
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
