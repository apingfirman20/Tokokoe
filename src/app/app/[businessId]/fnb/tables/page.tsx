'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { TableItem } from '@/types';
import QRCode from 'qrcode';
import { generateQrWithLogo } from '@/lib/qr-generator';
import { 
  UtensilsCrossed, Users, CheckCircle2, Clock, X, User, Plus, 
  Trash2, LayoutGrid, QrCode, Printer, ExternalLink, Copy, Check, 
  Download, Sparkles, ChefHat, AlertCircle, ShoppingBag, Eye, Image as ImageIcon
} from 'lucide-react';

export default function TablesPage() {
  const { tables, updateTableStatus, addTable, deleteTable, activeBusiness } = useBusiness();

  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');

  // Add Table Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [newCapacity, setNewCapacity] = useState<number>(4);

  // QR Code Modal State for single table
  const [qrTable, setQrTable] = useState<TableItem | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [showPrintTent, setShowPrintTent] = useState(false);

  // Batch Print All Tables QR Modal
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [allQrMap, setAllQrMap] = useState<Record<string, string>>({});
  const [isGeneratingAllQr, setIsGeneratingAllQr] = useState(false);

  const currentTbl = tables.find(t => t.id === selectedTable);

  // Logo sesuai nota atau logo bisnis
  const storeLogo = activeBusiness?.receiptSettings?.logoUrl || activeBusiness?.logoUrl || null;

  // Generate QR Code for single selected table (with restaurant logo in center)
  useEffect(() => {
    if (qrTable && activeBusiness) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const orderUrl = `${origin}/order/${activeBusiness.id}?table=${encodeURIComponent(qrTable.tableNumber)}&tableId=${encodeURIComponent(qrTable.id)}`;
      
      generateQrWithLogo(orderUrl, storeLogo, {
        width: 380,
        margin: 2,
        badgeRatio: 0.24,
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => {
          console.error('Failed to generate QR code with logo:', err);
          QRCode.toDataURL(orderUrl, { width: 360, margin: 2, errorCorrectionLevel: 'H' })
            .then(u => setQrDataUrl(u));
        });
    } else {
      setQrDataUrl('');
      setShowPrintTent(false);
    }
  }, [qrTable, activeBusiness, storeLogo]);

  // Generate QR Code for all tables (Batch Print) with restaurant logo in center
  const handleOpenBatchPrint = async () => {
    if (!activeBusiness) return;
    setIsGeneratingAllQr(true);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const map: Record<string, string> = {};

    try {
      for (const tbl of tables) {
        const orderUrl = `${origin}/order/${activeBusiness.id}?table=${encodeURIComponent(tbl.tableNumber)}&tableId=${encodeURIComponent(tbl.id)}`;
        map[tbl.id] = await generateQrWithLogo(orderUrl, storeLogo, {
          width: 320,
          margin: 2,
          badgeRatio: 0.24,
        });
      }
      setAllQrMap(map);
      setShowBatchModal(true);
    } catch (e) {
      console.error('Error generating batch QR:', e);
      alert('Gagal menghasilkan QR code untuk semua meja.');
    } finally {
      setIsGeneratingAllQr(false);
    }
  };

  const handleUpdate = (status: 'available' | 'occupied' | 'reserved') => {
    if (!selectedTable) return;
    updateTableStatus(selectedTable, status, customerName);
    setSelectedTable(null);
    setCustomerName('');
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNumber.trim()) return;
    addTable(newTableNumber.trim(), newCapacity || 4);
    setNewTableNumber('');
    setNewCapacity(4);
    setShowAddModal(false);
  };

  const handleInitDefaultTables = () => {
    for (let i = 1; i <= 8; i++) {
      addTable(`Meja 0${i}`, i % 2 === 0 ? 4 : 2);
    }
  };

  const handleDelete = () => {
    if (!selectedTable) return;
    deleteTable(selectedTable);
    setSelectedTable(null);
  };

  const handleCopyLink = () => {
    if (!qrTable || !activeBusiness) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const orderUrl = `${origin}/order/${activeBusiness.id}?table=${encodeURIComponent(qrTable.tableNumber)}&tableId=${encodeURIComponent(qrTable.id)}`;
    navigator.clipboard.writeText(orderUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl || !qrTable) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `QR_${qrTable.tableNumber.replace(/\s+/g, '_')}_${activeBusiness?.name || 'Tokokoe'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintTent = () => {
    window.print();
  };

  // Exclusivity Guard: Table Management & QR Ordering is exclusive to F&B businesses
  if (activeBusiness && activeBusiness.businessType !== 'fnb') {
    return (
      <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center max-w-lg mx-auto my-12 space-y-4 shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
          <UtensilsCrossed className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-200 uppercase">
            Fitur Khusus Kuliner & Kafe
          </span>
          <h2 className="text-lg font-extrabold text-slate-900 pt-1">
            Modul Meja & QR Self-Order F&B
          </h2>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Fitur generate QR Code meja dan pemesanan mandiri oleh pelanggan dari smartphone dirancang khusus untuk jenis usaha <strong>Restoran & Kafe (F&B)</strong>.
        </p>
        <p className="text-[11px] text-slate-500">
          Bisnis aktif Anda saat ini (<strong>{activeBusiness.name}</strong>) terdaftar sebagai jenis <span className="uppercase font-bold text-slate-800">{activeBusiness.businessType}</span>.
        </p>
        <div className="pt-2">
          <a
            href="/businesses"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md transition-all"
          >
            <span>Beralih ke Usaha F&B</span>
          </a>
        </div>
      </div>
    );
  }

  const availableCount = tables.filter(t => t.status === 'available').length;
  const occupiedCount = tables.filter(t => t.status === 'occupied').length;
  const reservedCount = tables.filter(t => t.status === 'reserved').length;

  return (
    <div className="space-y-6">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Manajemen Meja & QR Self-Order
            </h1>
            <span className="text-[10px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-teal-600" />
              <span>Khusus F&B</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Setiap meja memiliki QR Code unik untuk discan pelanggan, memilih menu di smartphone, & mengirim pesanan langsung ke dapur.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tables.length > 0 && (
            <button
              onClick={handleOpenBatchPrint}
              disabled={isGeneratingAllQr}
              className="py-2 px-3.5 rounded-xl bg-white hover:bg-teal-50 text-teal-800 border border-teal-200 font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
            >
              <Printer className="w-3.5 h-3.5 text-teal-600" />
              <span>{isGeneratingAllQr ? 'Menyiapkan QR...' : 'Cetak Semua QR Meja'}</span>
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="py-2 px-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Tambah Meja Baru</span>
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="grid grid-cols-3 gap-3 p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs text-xs">
        <div className="flex items-center gap-2.5 px-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
          <div>
            <div className="font-extrabold text-sm text-slate-900">{availableCount} Meja</div>
            <div className="text-[11px] text-slate-500">Tersedia (Kosong)</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-2 border-x border-slate-100">
          <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
          <div>
            <div className="font-extrabold text-sm text-slate-900">{occupiedCount} Meja</div>
            <div className="text-[11px] text-slate-500">Terisi (Sedang Makan)</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-2">
          <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
          <div>
            <div className="font-extrabold text-sm text-slate-900">{reservedCount} Meja</div>
            <div className="text-[11px] text-slate-500">Reservasi Tamu</div>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {tables.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mb-4 border border-teal-100">
            <QrCode className="w-7 h-7" />
          </div>
          <h3 className="font-bold text-slate-900 text-base">Belum Ada Meja Restoran</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1 mb-6 leading-relaxed">
            Buat nomor meja restoran Anda untuk otomatis menghasilkan stiker QR Code yang dapat discan oleh pelanggan untuk memesan makanan mandiri.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Meja Pertama</span>
            </button>
            <button
              onClick={handleInitDefaultTables}
              className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300 transition-all"
            >
              Inisialisasi Standar (Meja 01 - 08)
            </button>
          </div>
        </div>
      ) : (
        /* Tables Grid Layout */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {tables.map((tbl) => {
            let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            let statusText = 'Tersedia';

            if (tbl.status === 'occupied') {
              badgeColor = 'bg-rose-50 text-rose-700 border-rose-200';
              statusText = 'Terisi';
            } else if (tbl.status === 'reserved') {
              badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
              statusText = 'Reservasi';
            }

            return (
              <div
                key={tbl.id}
                className={`p-4 rounded-2xl border-2 transition-all flex flex-col justify-between gap-3 bg-white hover:shadow-md ${
                  tbl.status === 'occupied' 
                    ? 'border-rose-200 bg-rose-50/20' 
                    : tbl.status === 'reserved'
                    ? 'border-amber-200 bg-amber-50/20'
                    : 'border-slate-200 hover:border-teal-400'
                }`}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900">{tbl.tableNumber}</h3>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <Users className="w-3 h-3 text-slate-400" />
                      <span>Kapasitas {tbl.capacity} Kursi</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${badgeColor}`}>
                    {statusText}
                  </span>
                </div>

                {/* Card Body / Customer Info */}
                <div className="py-1">
                  {tbl.customerName ? (
                    <div className="p-2 rounded-xl bg-white border border-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-between">
                      <div className="truncate">
                        👤 {tbl.customerName}
                      </div>
                      <span className="text-[10px] text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded font-bold">
                        Dine In
                      </span>
                    </div>
                  ) : (
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-400 italic">
                      Meja siap menerima pesanan
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQrTable(tbl)}
                    className="flex-1 py-2 px-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95"
                    title="Lihat & Cetak QR Code Meja Ini"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>QR Meja</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTable(tbl.id);
                      setCustomerName(tbl.customerName || '');
                    }}
                    className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
                    title="Ubah Status / Alokasi Meja"
                  >
                    Status
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Single Table QR Code Modal */}
      {qrTable && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <QrCode className="w-4 h-4 text-teal-600" />
                <span>QR Code Pesan Mandiri</span>
              </div>
              <button
                onClick={() => setQrTable(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* QR Card Presentation */}
            <div id="single-qr-print-area" className="bg-white p-4 rounded-2xl border-2 border-slate-900 shadow-md space-y-2 text-center">
              <div className="font-extrabold text-sm tracking-wider uppercase text-slate-900">
                {activeBusiness?.name || 'TOKOKOE RESTO'}
              </div>

              <div className="flex justify-center p-2 bg-white rounded-xl">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR Code ${qrTable.tableNumber}`}
                    className="w-48 h-48 object-contain mx-auto"
                  />
                ) : (
                  <div className="w-48 h-48 bg-slate-100 animate-pulse rounded-xl flex items-center justify-center text-xs text-slate-400">
                    Membuat QR Code...
                  </div>
                )}
              </div>

              <div className="bg-slate-900 text-white py-1.5 px-3 rounded-xl font-extrabold text-sm tracking-wider uppercase">
                {qrTable.tableNumber}
              </div>

              <p className="text-[10px] text-slate-600 leading-tight pt-1">
                📱 Buka kamera HP Anda & scan QR Code di atas untuk memilih menu & memesan langsung dari meja.
              </p>
            </div>

            {/* Actions for QR */}
            <div className="space-y-2 pt-1 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`/order/${activeBusiness?.id}?table=${encodeURIComponent(qrTable.tableNumber)}&tableId=${encodeURIComponent(qrTable.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold border border-teal-200 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka Menu</span>
                </a>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Tersalin!' : 'Salin Link'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadQr}
                  className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-300 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PNG</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintTent}
                  className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center justify-center gap-1.5 shadow-md transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Stiker</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Print All Tables Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                  <Printer className="w-5 h-5 text-teal-600" />
                  <span>Cetak Stiker QR Semua Meja ({tables.length} Meja)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Siap dicetak pada kertas A4 atau kertas stiker meja restoran
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="py-2 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Halaman Ini</span>
                </button>
                <button
                  onClick={() => setShowBatchModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Print Grid Area */}
            <div className="p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 flex-1">
              {tables.map((tbl) => (
                <div
                  key={tbl.id}
                  className="bg-white p-3.5 rounded-2xl border-2 border-slate-900 text-center space-y-1.5 shadow-sm"
                >
                  <div className="font-extrabold text-[11px] tracking-wider uppercase text-slate-900 truncate">
                    {activeBusiness?.name || 'TOKOKOE RESTO'}
                  </div>

                  <div className="flex justify-center p-1 bg-white">
                    {allQrMap[tbl.id] ? (
                      <img
                        src={allQrMap[tbl.id]}
                        alt={`QR ${tbl.tableNumber}`}
                        className="w-28 h-28 object-contain mx-auto"
                      />
                    ) : (
                      <div className="w-28 h-28 bg-slate-100 rounded-lg" />
                    )}
                  </div>

                  <div className="bg-slate-900 text-white py-1 px-2 rounded-lg font-extrabold text-xs uppercase">
                    {tbl.tableNumber}
                  </div>

                  <p className="text-[8.5px] text-slate-600 leading-tight">
                    Scan untuk pesan menu via HP
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Table Status Change Modal */}
      {selectedTable && currentTbl && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-base text-slate-900">Ubah Status {currentTbl.tableNumber}</h3>
              <button onClick={() => setSelectedTable(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Tamu / Keterangan Meja
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: Bpk. Hendra (4 org)"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleUpdate('available')}
                  className="py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-200"
                >
                  Tersedia
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdate('occupied')}
                  className="py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs border border-rose-200"
                >
                  Terisi
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdate('reserved')}
                  className="py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs border border-amber-200"
                >
                  Reservasi
                </button>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="text-rose-600 hover:text-rose-700 text-xs font-semibold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Meja</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTable(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Table Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-base text-slate-900">Tambah Meja Baru</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor / Nama Meja
                </label>
                <input
                  type="text"
                  required
                  value={newTableNumber}
                  onChange={(e) => setNewTableNumber(e.target.value)}
                  placeholder="Contoh: Meja 01, Meja Bar, Meja VIP"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kapasitas Kursi (Orang)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  required
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(Number(e.target.value))}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md"
                >
                  Simpan Meja
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
