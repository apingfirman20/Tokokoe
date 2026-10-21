'use client';

import React, { useState } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { formatRupiah } from '@/lib/utils';
import { PurchaseOrder, PurchaseOrderItem } from '@/types';
import { validateDualSimDevice, validateImei } from '@/lib/validation/imei';
import { 
  ArrowDownToLine, Check, Smartphone, ArrowRight, 
  FileText, Plus, PackageCheck, AlertCircle, Barcode, X 
} from 'lucide-react';

export default function SellInPage() {
  const { 
    sellInDevice, 
    purchaseOrders, 
    createPurchaseOrder, 
    receivePurchaseOrder 
  } = useBusiness();

  const [activeTab, setActiveTab] = useState<'po_receiving' | 'direct_sell_in'>('po_receiving');

  // Direct Sell-In Form State
  const [imei, setImei] = useState('');
  const [imei2, setImei2] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [brand, setBrand] = useState('Apple');
  const [model, setModel] = useState('');
  const [storage, setStorage] = useState('128GB');
  const [color, setColor] = useState('Hitam');
  const [condition, setCondition] = useState<'new' | 'second_grade_a' | 'second_grade_b'>('second_grade_a');
  const [costPrice, setCostPrice] = useState<number>(5000000);
  const [sellingPrice, setSellingPrice] = useState<number>(6200000);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');

  // PO Receiving Modal State
  const [receivingModal, setReceivingModal] = useState<{
    po: PurchaseOrder;
    item: PurchaseOrderItem;
  } | null>(null);
  const [scanImeiInput, setScanImeiInput] = useState('');
  const [scanImei2Input, setScanImei2Input] = useState('');
  const [scanSnInput, setScanSnInput] = useState('');
  const [poError, setPoError] = useState('');

  // Create PO Modal State
  const [showCreatePoModal, setShowCreatePoModal] = useState(false);
  const [poSupplier, setPoSupplier] = useState('PT Erajaya Swasembada Tbk');
  const [poBrand, setPoBrand] = useState('Apple');
  const [poModel, setPoModel] = useState('iPhone 15 128GB');
  const [poStorage, setPoStorage] = useState('128GB');
  const [poColor, setPoColor] = useState('Black');
  const [poCost, setPoCost] = useState(12000000);
  const [poSell, setPoSell] = useState(13999000);
  const [poQty, setPoQty] = useState(2);

  const [successMsg, setSuccessMsg] = useState('');

  const [isSubmittingDirect, setIsSubmittingDirect] = useState(false);

  const handleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imei.trim() || !model.trim() || !customerName.trim()) {
      alert('IMEI 1, Model, dan Nama Pelanggan wajib diisi.');
      return;
    }

    const val = validateDualSimDevice({
      imei1: imei.trim(),
      imei2: imei2.trim(),
      serialNumber: serialNumber.trim(),
    });

    if (!val.valid) {
      alert(val.error || 'Format nomor IMEI tidak valid (gagal Luhn checksum).');
      return;
    }

    setIsSubmittingDirect(true);
    try {
      const res = await sellInDevice({
        imei: val.imei1,
        imei2: val.imei2,
        serialNumber: val.serialNumber,
        brand,
        model: model.trim(),
        storage,
        color,
        condition,
        costPrice,
        sellingPrice,
        customerName: customerName.trim(),
        notes,
      });

      if (res.success) {
        setSuccessMsg(`✓ Berhasil! Unit ${brand} ${model} dengan IMEI ${val.imei1}${val.imei2 ? ` & ${val.imei2}` : ''} telah didaftarkan ke inventaris toko.`);
        setImei('');
        setImei2('');
        setSerialNumber('');
        setModel('');
        setCustomerName('');
        setTimeout(() => setSuccessMsg(''), 5000);
      } else {
        alert(res.error || 'Gagal mendaftarkan unit Sell-In.');
      }
    } finally {
      setIsSubmittingDirect(false);
    }
  };

  const handleOpenReceive = (po: PurchaseOrder, item: PurchaseOrderItem) => {
    setReceivingModal({ po, item });
    setScanImeiInput('');
    setScanImei2Input('');
    setScanSnInput('');
    setPoError('');
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingModal) return;
    setPoError('');

    const val = validateDualSimDevice({
      imei1: scanImeiInput.trim(),
      imei2: scanImei2Input.trim(),
      serialNumber: scanSnInput.trim(),
    });

    if (!val.valid) {
      setPoError(val.error || 'Format IMEI tidak valid (gagal Luhn checksum).');
      return;
    }

    const res = await receivePurchaseOrder({
      poId: receivingModal.po.id,
      poItemId: receivingModal.item.id,
      scannedImeis: [val.imei1],
      imeiDetails: [{
        imei: val.imei1,
        imei2: val.imei2,
        serialNumber: val.serialNumber,
      }],
    });

    if (!res.success) {
      setPoError(res.error || 'Gagal memproses penerimaan barang.');
      return;
    }

    setSuccessMsg(`✓ Unit IMEI ${val.imei1}${val.imei2 ? ` (Dual-SIM: ${val.imei2})` : ''} berhasil diterima ke inventaris toko.`);
    setReceivingModal(null);
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  const handleCreatePoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await createPurchaseOrder({
      supplierName: poSupplier,
      items: [{
        brand: poBrand,
        model: poModel,
        storage: poStorage,
        color: poColor,
        condition: 'new',
        costPrice: poCost,
        expectedSellingPrice: poSell,
        quantityOrdered: poQty,
      }]
    });

    if (res.success) {
      setSuccessMsg(`✓ Purchase Order baru berhasil diterbitkan.`);
      setShowCreatePoModal(false);
      setTimeout(() => setSuccessMsg(''), 5000);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-2">
          <ArrowDownToLine className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Sell In & Penerimaan Barang Gadget
          </h1>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Penerimaan unit baru dari Purchase Order supplier maupun akuisisi unit seken dari customer
        </p>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('po_receiving')}
          className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'po_receiving'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Penerimaan PO Supplier ({purchaseOrders.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('direct_sell_in')}
          className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'direct_sell_in'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>Beli dari Customer (Sell In Langsung)</span>
        </button>
      </div>

      {/* Tab 1: PO Supplier Receiving */}
      {activeTab === 'po_receiving' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">
              Daftar Pesanan Pembelian ke Distributor:
            </span>
            <button
              onClick={() => setShowCreatePoModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Terbitkan PO Baru</span>
            </button>
          </div>

          <div className="space-y-3">
            {purchaseOrders.map((po) => (
              <div key={po.id} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-sm text-slate-900">{po.poNumber}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        po.status === 'received' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : po.status === 'partially_received'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {po.status === 'received' ? 'Selesai Diterima' : po.status === 'partially_received' ? 'Diterima Sebagian' : 'Menunggu Pengiriman'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Supplier: <strong className="text-slate-800">{po.supplierName}</strong> • Total Nilai: {formatRupiah(po.totalCost)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 divide-y divide-slate-100">
                  {po.items.map((item) => {
                    const isFullyReceived = item.quantityReceived >= item.quantityOrdered;
                    return (
                      <div key={item.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-xs text-slate-900">
                            {item.brand} {item.model} ({item.storage} - {item.color})
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            HPP: {formatRupiah(item.costPrice)} • Target Jual: {formatRupiah(item.expectedSellingPrice)}
                          </div>
                          <div className="text-[11px] font-medium text-slate-600 mt-1 flex items-center gap-2">
                            <span>Status: {item.quantityReceived} / {item.quantityOrdered} unit diterima</span>
                            {item.receivedImeis?.length > 0 && (
                              <span className="text-[10px] font-mono text-slate-400">
                                (IMEI: {item.receivedImeis.slice(-2).join(', ')})
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          {isFullyReceived ? (
                            <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[11px] font-semibold rounded-lg inline-flex items-center gap-1">
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Lengkap</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => handleOpenReceive(po, item)}
                              className="px-3.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 flex items-center gap-1.5 transition-colors"
                            >
                              <Barcode className="w-3.5 h-3.5" />
                              <span>Scan / Terima IMEI</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Direct Sell-In */}
      {activeTab === 'direct_sell_in' && (
        <form onSubmit={handleDirectSubmit} className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4 max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nomor IMEI 1 (Utama) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={15}
                value={imei}
                onChange={(e) => setImei(e.target.value.replace(/\D/g, ''))}
                placeholder="Contoh: 356611095551206"
                className="w-full text-sm font-mono font-bold p-2.5 rounded-xl border border-slate-300 outline-none focus:border-indigo-500"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Wajib 15 digit angka (Luhn valid)</span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nomor IMEI 2 (Opsional Dual SIM)
              </label>
              <input
                type="text"
                maxLength={15}
                value={imei2}
                onChange={(e) => setImei2(e.target.value.replace(/\D/g, ''))}
                placeholder="Contoh: 356611095551214 (Opsional)"
                className="w-full text-sm font-mono p-2.5 rounded-xl border border-slate-300 outline-none focus:border-indigo-500"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Kosongkan jika bukan Dual SIM</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Serial Number Perangkat (SN Hardware)
            </label>
            <input
              type="text"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="Contoh: F2LM80V9N6R4 (Terpisah dari nomor IMEI)"
              className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-300 outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Merek</label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300"
              >
                <option value="Apple">Apple iPhone</option>
                <option value="Samsung">Samsung</option>
                <option value="Xiaomi">Xiaomi</option>
                <option value="Oppo">Oppo</option>
                <option value="Vivo">Vivo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Model / Tipe Perangkat</label>
              <input
                type="text"
                required
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Contoh: iPhone 12 Pro Max"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kapasitas</label>
              <select value={storage} onChange={(e) => setStorage(e.target.value)} className="w-full text-xs p-2.5 rounded-xl border border-slate-300">
                <option value="64GB">64GB</option>
                <option value="128GB">128GB</option>
                <option value="256GB">256GB</option>
                <option value="512GB">512GB</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Warna</label>
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kondisi</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as any)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300"
              >
                <option value="second_grade_a">Second Mulus (A)</option>
                <option value="second_grade_b">Second Wajar (B)</option>
                <option value="new">Baru / Segel</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Harga Beli / Keluar Kas (Rp)</label>
              <input
                type="number"
                required
                value={costPrice}
                onChange={(e) => setCostPrice(Number(e.target.value))}
                className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Rencana Harga Jual (Rp)</label>
              <input
                type="number"
                required
                value={sellingPrice}
                onChange={(e) => setSellingPrice(Number(e.target.value))}
                className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-300 text-indigo-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Pelanggan / Penjual <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nama lengkap penjual..."
              className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
            >
              <span>Terima Gadget ke Inventaris</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* PO Receiving Modal */}
      {receivingModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Penerimaan Unit IMEI dari PO</h3>
              <button onClick={() => setReceivingModal(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReceiveSubmit} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs text-slate-600">
                <div>No. PO: <strong className="text-slate-900">{receivingModal.po.poNumber}</strong></div>
                <div>Item: <strong className="text-slate-900">{receivingModal.item.brand} {receivingModal.item.model}</strong></div>
                <div>Sisa Belum Diterima: <strong>{receivingModal.item.quantityOrdered - receivingModal.item.quantityReceived} unit</strong></div>
              </div>

              {poError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{poError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Scan atau Masukkan 15-Digit IMEI 1 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={15}
                  value={scanImeiInput}
                  onChange={(e) => setScanImeiInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="Contoh: 356611095551206"
                  className="w-full text-sm font-mono font-bold p-2.5 rounded-xl border border-slate-300 outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Karakter: {scanImeiInput.length} / 15 digit (Wajib Luhn valid)
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor IMEI 2 (Opsional untuk Dual SIM)
                </label>
                <input
                  type="text"
                  maxLength={15}
                  value={scanImei2Input}
                  onChange={(e) => setScanImei2Input(e.target.value.replace(/\D/g, ''))}
                  placeholder="Contoh: 356611095551214 (Opsional)"
                  className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-300 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Serial Number Perangkat (Opsional)
                </label>
                <input
                  type="text"
                  value={scanSnInput}
                  onChange={(e) => setScanSnInput(e.target.value)}
                  placeholder="Contoh: F2LM80V9N6R4 (Terpisah dari IMEI)"
                  className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-300 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReceivingModal(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={scanImeiInput.length !== 15}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs"
                >
                  Simpan IMEI ke Inventaris
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create PO Modal */}
      {showCreatePoModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Terbitkan Purchase Order Supplier</h3>
              <button onClick={() => setShowCreatePoModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePoSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Supplier / Distributor</label>
                <input
                  type="text"
                  required
                  value={poSupplier}
                  onChange={(e) => setPoSupplier(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Merek</label>
                  <select value={poBrand} onChange={(e) => setPoBrand(e.target.value)} className="w-full text-xs p-2.5 rounded-xl border border-slate-300">
                    <option value="Apple">Apple</option>
                    <option value="Samsung">Samsung</option>
                    <option value="Xiaomi">Xiaomi</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Model</label>
                  <input
                    type="text"
                    required
                    value={poModel}
                    onChange={(e) => setPoModel(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Harga Beli Satuan (HPP)</label>
                  <input
                    type="number"
                    required
                    value={poCost}
                    onChange={(e) => setPoCost(Number(e.target.value))}
                    className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jumlah Pesan</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={poQty}
                    onChange={(e) => setPoQty(Number(e.target.value))}
                    className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreatePoModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                >
                  Terbitkan PO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
