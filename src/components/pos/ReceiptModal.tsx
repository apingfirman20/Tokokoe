'use client';

import React, { useState } from 'react';
import { Sale } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { 
  Printer, X, CheckCircle2, AlertTriangle, 
  HelpCircle, MonitorCheck, SlidersHorizontal,
  Copy, Check, Share2
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
  const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>('80mm');
  const [printAttempted, setPrintAttempted] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  if (!isOpen || !sale) return null;

  const handlePrint = () => {
    setPrintAttempted(true);
    // Trigger native browser print which uses @media print styling
    window.print();
  };

  const handleCopyText = async () => {
    try {
      const itemsList = sale.lineItems.map(item => 
        `• ${item.productName}\n  ${item.quantity} x ${formatRupiah(item.unitPrice)} = ${formatRupiah(item.subtotal)}` +
        (item.imei ? `\n  (IMEI: ${item.imei})` : '')
      ).join('\n');

      const textReceipt = `================================\n` +
        `       ${businessName.toUpperCase()}\n` +
        `       ${branchName}\n` +
        `       ${branchAddress}\n` +
        `================================\n` +
        `No. Struk : ${sale.saleNumber}\n` +
        `Tanggal   : ${new Date(sale.createdAt).toLocaleDateString('id-ID')} ${new Date(sale.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}\n` +
        `Kasir     : ${sale.cashierName || 'Kasir'}\n` +
        `Pelanggan : ${sale.customerName || 'Umum'}\n` +
        (sale.tableNumber ? `Meja      : #${sale.tableNumber}\n` : '') +
        `Layanan   : ${sale.orderType.toUpperCase()}\n` +
        `--------------------------------\n` +
        `${itemsList}\n` +
        `--------------------------------\n` +
        `Subtotal  : ${formatRupiah(sale.subtotal)}\n` +
        (sale.discount > 0 ? `Diskon    : -${formatRupiah(sale.discount)}\n` : '') +
        (sale.tax > 0 ? `Pajak     : ${formatRupiah(sale.tax)}\n` : '') +
        `TOTAL     : ${formatRupiah(sale.grandTotal)}\n` +
        `Bayar (${sale.paymentMethod.toUpperCase()}) : ${formatRupiah(sale.paidAmount || sale.grandTotal)}\n` +
        (sale.changeAmount > 0 ? `Kembalian : ${formatRupiah(sale.changeAmount)}\n` : '') +
        `Status    : ${sale.paymentStatus ? sale.paymentStatus.toUpperCase() : 'LUNAS'}\n` +
        `================================\n` +
        `Terima kasih atas kunjungan Anda!\n` +
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
      <div className="receipt-modal-dialog bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 flex flex-col gap-4 my-8 max-h-[90vh] overflow-y-auto">
        
        {/* Modal Header */}
        <div className="receipt-hide-on-print flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-base text-slate-900">
              Pratinjau & Cetak Struk Kasir
            </h3>
            <p className="text-xs text-slate-500">
              Format nota thermal roll printer 80mm & 58mm standar kasir
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Paper Size & Quick Copy Controls */}
        <div className="receipt-hide-on-print flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
          <span className="font-semibold text-slate-700 flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-teal-600" />
            Ukuran Kertas:
          </span>
          <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setPaperSize('80mm')}
              className={`px-3 py-1 rounded-md font-medium text-xs transition-colors ${
                paperSize === '80mm'
                  ? 'bg-teal-600 text-white font-bold'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              80 mm (Standar)
            </button>
            <button
              onClick={() => setPaperSize('58mm')}
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

        {/* Preview Status & Transparency */}
        <div className="receipt-hide-on-print space-y-2">
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-medium">
            <MonitorCheck className="w-4 h-4 text-teal-600 shrink-0" />
            <span>
              <strong>Layout Thermal Terisolasi:</strong> Siap dicetak langsung ke printer kasir USB / Bluetooth tanpa margin web browser.
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
              <div className="font-bold text-sm tracking-wider uppercase">{businessName}</div>
              <div className="text-[10px] text-slate-600 font-sans">{branchName}</div>
              <div className="text-[9px] text-slate-500 font-sans">{branchAddress}</div>
              <div className="text-[9px] text-slate-500 font-sans">Telp: {branchPhone}</div>
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
              <div className="flex justify-between">
                <span>Kasir:</span>
                <span>{sale.cashierName || 'Kasir'}</span>
              </div>
              <div className="flex justify-between">
                <span>Pelanggan:</span>
                <span>{sale.customerName || 'Pelanggan Umum'}</span>
              </div>
              {sale.tableNumber && (
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

              {sale.tax > 0 && (
                <div className="flex justify-between">
                  <span>Pajak (PPN):</span>
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
              <div>Terima kasih atas kepercayaan Anda!</div>
              <div>Barang yang telah dibeli sesuai syarat garansi resmi.</div>
              <div>Powered by Tokokoe Cloud POS</div>
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
