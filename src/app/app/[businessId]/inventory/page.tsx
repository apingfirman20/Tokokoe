'use client';

import React, { useState } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { useAuth } from '@/context/AuthContext';
import { Product, StockAdjustment } from '@/types';
import { 
  Boxes, Search, AlertTriangle, ArrowUpDown, 
  CheckCircle2, X, Plus, ShieldCheck, Check, Clock, ShieldAlert 
} from 'lucide-react';

export default function InventoryPage() {
  const { 
    products, 
    activeBusiness, 
    updateProduct, 
    stockAdjustments, 
    requestStockAdjustment, 
    reviewStockAdjustment 
  } = useBusiness();
  const { user } = useAuth();

  const isOwnerOrManager = user?.role === 'owner' || user?.memberRole === 'owner' || user?.memberRole === 'manager';

  const [search, setSearch] = useState('');
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [newStock, setNewStock] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState('Stock opname fisik bulanan');
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode && p.barcode.includes(search)) ||
    (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
  );

  const pendingAdjustments = (stockAdjustments || []).filter(a => a.status === 'pending');

  const handleOpenAdjust = (p: Product) => {
    setSelectedProduct(p);
    setNewStock(p.stockQty);
    setAdjustReason('Stock opname fisik bulanan');
    setShowAdjustModal(true);
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    if (isOwnerOrManager) {
      // Owner/Manager submits request and approves via authoritative review
      const reqRes = await requestStockAdjustment({
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        previousQty: selectedProduct.stockQty,
        adjustedQty: newStock,
        reason: adjustReason,
      });

      if (reqRes.success && reqRes.adjustment) {
        const revRes = await reviewStockAdjustment(reqRes.adjustment.id, 'approved');
        if (revRes.success) {
          setFeedbackMsg({
            type: 'success',
            text: `Stok "${selectedProduct.name}" berhasil disesuaikan menjadi ${newStock} unit.`
          });
        } else {
          setFeedbackMsg({
            type: 'error',
            text: revRes.error || 'Gagal menyetujui penyesuaian stok di server.'
          });
        }
      } else {
        setFeedbackMsg({
          type: 'error',
          text: reqRes.error || 'Gagal mengajukan penyesuaian stok ke server.'
        });
      }
    } else {
      // Staff submits for owner approval
      const reqRes = await requestStockAdjustment({
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        previousQty: selectedProduct.stockQty,
        adjustedQty: newStock,
        reason: adjustReason,
      });
      if (reqRes.success) {
        setFeedbackMsg({
          type: 'success',
          text: `Permintaan penyesuaian stok "${selectedProduct.name}" diajukan ke antrean persetujuan Owner.`
        });
      } else {
        setFeedbackMsg({
          type: 'error',
          text: reqRes.error || 'Gagal mengajukan penyesuaian stok.'
        });
      }
    }

    setShowAdjustModal(false);
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  const handleApprove = async (adj: StockAdjustment) => {
    const res = await reviewStockAdjustment(adj.id, 'approved');
    if (res.success) {
      setFeedbackMsg({
        type: 'success',
        text: `Penyesuaian stok "${adj.productName}" disetujui. Stok produk diperbarui.`
      });
    } else {
      setFeedbackMsg({
        type: 'error',
        text: res.error || 'Gagal menyetujui penyesuaian stok.'
      });
    }
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  const handleReject = async (adj: StockAdjustment) => {
    const res = await reviewStockAdjustment(adj.id, 'rejected');
    if (res.success) {
      setFeedbackMsg({
        type: 'success',
        text: `Permintaan penyesuaian stok "${adj.productName}" ditolak.`
      });
    } else {
      setFeedbackMsg({
        type: 'error',
        text: res.error || 'Gagal menolak penyesuaian stok.'
      });
    }
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Inventaris & Penyesuaian Stok
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Pantau pergerakan fisik barang, stok menipis, dan audit opname dengan persetujuan bertingkat
          </p>
        </div>
      </div>

      {feedbackMsg && (
        <div className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between ${
          feedbackMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          <span>{feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Owner Approval Queue */}
      {isOwnerOrManager && pendingAdjustments.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            <h2 className="text-sm font-bold text-amber-900">
              Menunggu Persetujuan Owner ({pendingAdjustments.length} Permintaan)
            </h2>
          </div>
          <p className="text-xs text-amber-700 mb-4">
            Penyesuaian stok yang diajukan oleh staf kasir memerlukan otorisasi Anda sebelum mengubah jumlah kuantitas riil produk di database.
          </p>
          <div className="space-y-2.5">
            {pendingAdjustments.map((adj) => (
              <div key={adj.id} className="bg-white p-3.5 rounded-xl border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-xs">{adj.productName}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      adj.diff > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}>
                      {adj.diff > 0 ? `+${adj.diff}` : adj.diff} unit
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Stok lama: {adj.previousQty} → Diusulkan: {adj.adjustedQty} • Diajukan oleh: <strong className="text-slate-700">{adj.requestedByName}</strong>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5 italic">
                    Alasan: &ldquo;{adj.reason}&rdquo;
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleReject(adj)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold"
                  >
                    Tolak
                  </button>
                  <button
                    onClick={() => handleApprove(adj)}
                    className="px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Setujui</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari produk inventaris berdasarkan nama, barcode, atau SKU..."
          className="w-full bg-transparent border-0 outline-none text-xs text-slate-900"
        />
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Nama Item</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4">Barcode / SKU</th>
                <th className="py-3 px-4 text-center">Status Stok</th>
                <th className="py-3 px-4 text-right">Kuantitas Fisik</th>
                <th className="py-3 px-4 text-center">Aksi Penyesuaian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((prod) => (
                <tr key={prod.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {prod.name}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {prod.category}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500">
                    {prod.barcode || prod.sku || '-'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {prod.stockQty <= 5 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Menipis</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Aman
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                    {prod.trackStock ? `${prod.stockQty} unit` : 'Unlimited'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => handleOpenAdjust(prod)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] transition-colors"
                    >
                      {isOwnerOrManager ? 'Sesuaikan Stok' : 'Ajukan Penyesuaian'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Modal */}
      {showAdjustModal && selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">
                {isOwnerOrManager ? 'Penyesuaian Stok Produk' : 'Pengajuan Opname Stok'}
              </h3>
              <button onClick={() => setShowAdjustModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              <div>
                <span className="text-xs text-slate-500">Nama Produk:</span>
                <div className="font-bold text-sm text-slate-900 mt-0.5">{selectedProduct.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">Stok Saat Ini di Sistem: {selectedProduct.stockQty} unit</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Stok Fisik Baru (Hasil Hitung Opname) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  value={newStock}
                  onChange={(e) => setNewStock(Number(e.target.value))}
                  className="w-full text-base font-bold text-slate-900 p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                />
                <div className="text-[11px] text-slate-500 mt-1">
                  Selisih: <strong className={newStock - selectedProduct.stockQty >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    {newStock - selectedProduct.stockQty > 0 ? `+${newStock - selectedProduct.stockQty}` : newStock - selectedProduct.stockQty} unit
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan Penyesuaian
                </label>
                <textarea
                  rows={2}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Contoh: 2 pcs kemasan bocor saat display toko..."
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>

              {!isOwnerOrManager && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
                  <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <span>
                    Sebagai staf kasir, pengajuan Anda akan masuk ke antrean persetujuan Owner dan tidak langsung mengubah stok riil sebelum disetujui.
                  </span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs"
                >
                  {isOwnerOrManager ? 'Terapkan Penyesuaian' : 'Kirim Pengajuan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
