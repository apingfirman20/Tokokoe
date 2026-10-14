'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useBusiness } from '@/context/BusinessContext';
import { ImeiUnit, Product, CartLineItem, Sale } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { 
  Smartphone, Search, Plus, Minus, Trash2, Banknote, 
  CheckCircle2, ArrowDownToLine, RefreshCw, Shield, 
  Wrench, Printer, X, Tag, Clock, ArrowDownLeft
} from 'lucide-react';

export function PhonePosScreen() {
  const { 
    activeBusiness, 
    activeBranch, 
    imeiUnits, 
    products, 
    processCheckout, 
    sellInDevice, 
    exchangeImei,
    activeShift,
    openShift,
    closeShift,
    recordCashMovement
  } = useBusiness();

  const [searchImeiOrName, setSearchImeiOrName] = useState('');
  const [cart, setCart] = useState<CartLineItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Modals
  const [showSellInModal, setShowSellInModal] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  // Shift & Cash Drawer Modals
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showCashMovementModal, setShowCashMovementModal] = useState(false);
  const [shiftOpeningCash, setShiftOpeningCash] = useState<number>(300000);
  const [shiftActualClosingCash, setShiftActualClosingCash] = useState<number>(0);
  const [shiftNotes, setShiftNotes] = useState('');
  const [movementType, setMovementType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [movementAmount, setMovementAmount] = useState<number>(100000);
  const [movementReason, setMovementReason] = useState('');
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftError, setShiftError] = useState('');

  // Sell In Form State
  const [sellInImei, setSellInImei] = useState('');
  const [sellInBrand, setSellInBrand] = useState('Apple');
  const [sellInModel, setSellInModel] = useState('iPhone 12');
  const [sellInStorage, setSellInStorage] = useState('128GB');
  const [sellInColor, setSellInColor] = useState('Blue');
  const [sellInCondition, setSellInCondition] = useState<'new' | 'second_grade_a' | 'second_grade_b'>('second_grade_a');
  const [sellInCostPrice, setSellInCostPrice] = useState<number>(6500000);
  const [sellInSellingPrice, setSellInSellingPrice] = useState<number>(7500000);
  const [sellInCustName, setSellInCustName] = useState('');
  const [sellInNotes, setSellInNotes] = useState('');

  // Exchange Form State
  const [exchangeOldImei, setExchangeOldImei] = useState('');
  const [exchangeNewImei, setExchangeNewImei] = useState('');
  const [exchangeReason, setExchangeReason] = useState('Layar kendala touchscreen / cacat pabrik');
  const [exchangeFee, setExchangeFee] = useState<number>(0);

  // Payment Calculation
  const subtotal = cart.reduce((acc, item) => acc + item.subtotal, 0);
  const grandTotal = subtotal; // No PB1 on phone devices by default
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentError, setPaymentError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Available devices
  const availableUnits = imeiUnits.filter(u => {
    const isAvail = u.status === 'available';
    const cleanSearch = searchImeiOrName.trim().toLowerCase();
    const matchSearch = !cleanSearch ||
      u.imei.includes(cleanSearch) || 
      (u.imei2 && u.imei2.includes(cleanSearch)) ||
      (u.serialNumber && u.serialNumber.toLowerCase().includes(cleanSearch)) ||
      u.productName.toLowerCase().includes(cleanSearch) ||
      u.brand.toLowerCase().includes(cleanSearch);
    return isAvail && matchSearch;
  });

  // Accessories & Service products (non-IMEI, active only)
  const accessoryProducts = products.filter(p => 
    (p.category === 'Aksesoris' || p.category === 'Servis') &&
    p.isActive !== false &&
    p.available !== false
  );

  const addImeiToCart = (unit: ImeiUnit) => {
    // Check if already in cart
    if (cart.some(item => item.imei === unit.imei)) {
      alert(`Unit IMEI ${unit.imei} sudah ada di keranjang.`);
      return;
    }

    setCart(prev => [
      ...prev,
      {
        productId: unit.productId,
        productName: `${unit.brand} ${unit.model} ${unit.storage} (${unit.color})`,
        quantity: 1,
        unitPrice: unit.sellingPrice,
        subtotal: unit.sellingPrice,
        imei: unit.imei,
        notes: `Kondisi: ${unit.condition === 'new' ? 'Baru' : 'Second Grade A'} • IMEI: ${unit.imei}`,
      }
    ]);
  };

  const addAccessoryToCart = (prod: Product) => {
    if (prod.isActive === false || prod.available === false) {
      alert(`Produk "${prod.name}" sedang nonaktif / diarsipkan.`);
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.productId === prod.id && !item.imei);
      if (existing) {
        return prev.map(item => 
          item.productId === prod.id && !item.imei
            ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.unitPrice }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: prod.id,
          productName: prod.name,
          quantity: 1,
          unitPrice: prod.sellingPrice,
          subtotal: prod.sellingPrice,
        }
      ];
    });
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleOpenShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShiftLoading(true);
    setShiftError('');
    try {
      await openShift(shiftOpeningCash, shiftNotes);
      setShowShiftModal(false);
      setShiftNotes('');
    } catch (err: any) {
      setShiftError(err.message || 'Gagal membuka shift kasir.');
    } finally {
      setShiftLoading(false);
    }
  };

  const handleCloseShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShiftLoading(true);
    setShiftError('');
    try {
      await closeShift(shiftActualClosingCash, shiftNotes);
      setShowShiftModal(false);
      setShiftNotes('');
      setShiftActualClosingCash(0);
    } catch (err: any) {
      setShiftError(err.message || 'Gagal menutup shift kasir.');
    } finally {
      setShiftLoading(false);
    }
  };

  const handleCashMovementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movementReason.trim()) {
      alert('Alasan mutasi kas kasir wajib diisi.');
      return;
    }
    setShiftLoading(true);
    try {
      const res = await recordCashMovement(movementType, movementAmount, movementReason);
      if (res.success) {
        setShowCashMovementModal(false);
        setMovementReason('');
        setMovementAmount(100000);
      } else {
        alert(res.error || 'Gagal mencatat mutasi kas kasir.');
      }
    } finally {
      setShiftLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (isProcessing) return;
    if (cart.length === 0) return;
    if (paidAmount < grandTotal) {
      setPaymentError('Nominal pembayaran kurang dari total harga.');
      return;
    }

    if (!activeShift) {
      setPaymentError('Sesi kasir (shift) belum dibuka. Buka sesi shift kasir terlebih dahulu untuk transaksi tunai.');
      setShowShiftModal(true);
      return;
    }

    setIsProcessing(true);
    setPaymentError('');

    try {
      const res = await processCheckout({
        lineItems: cart,
        subtotal,
        discount: 0,
        tax: 0,
        serviceCharge: 0,
        grandTotal,
        paidAmount,
        changeAmount: paidAmount - grandTotal,
        paymentMethod: 'cash',
        orderType: 'phone_pos',
        customerName: customerName ? `${customerName} (${customerPhone || '-'})` : undefined,
      });

      if (res.success && res.sale) {
        setLastSale(res.sale);
        setShowPaymentModal(false);
        setShowReceiptModal(true);
        setCart([]);
      } else {
        setPaymentError(res.error || 'Terjadi kendala.');
      }
    } finally {
      setIsProcessing(false);
    }
  };


  const handleSellInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellInImei.trim() || !sellInCustName.trim()) {
      alert('IMEI dan Nama Pelanggan wajib diisi.');
      return;
    }

    const res = sellInDevice({
      imei: sellInImei.trim(),
      brand: sellInBrand,
      model: sellInModel,
      storage: sellInStorage,
      color: sellInColor,
      condition: sellInCondition,
      costPrice: sellInCostPrice,
      sellingPrice: sellInSellingPrice,
      customerName: sellInCustName.trim(),
      notes: sellInNotes,
    });

    if (res.success) {
      alert(`Perangkat IMEI ${sellInImei} berhasil diterima ke inventaris aktif!`);
      setShowSellInModal(false);
      setSellInImei('');
      setSellInCustName('');
    } else {
      alert(res.error);
    }
  };

  const handleExchangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exchangeOldImei.trim() || !exchangeNewImei.trim()) {
      alert('IMEI unit lama dan IMEI pengganti wajib diisi.');
      return;
    }

    const res = await exchangeImei(exchangeOldImei.trim(), exchangeNewImei.trim(), exchangeReason, exchangeFee);
    if (res.success) {
      alert(`Tukar unit berhasil! Riwayat kedua unit IMEI telah dicatat secara atomik di server.`);
      setShowExchangeModal(false);
      setExchangeOldImei('');
      setExchangeNewImei('');
    } else {
      alert(res.error);
    }
  };


  return (
    <div className="flex flex-col gap-4 -m-4 md:-m-6 lg:-m-8">
      {/* 1. PHONE STORE OPERATIONS SUB-BAR */}
      <section className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-16 z-20 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-200">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-slate-900">{activeBusiness?.name || 'Kasir POS'}</h2>
              <span className="text-xs text-slate-400">• {activeBranch?.name || 'Outlet Roxy'}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
              <span>{activeShift ? `Kasir: ${activeShift.cashierName}` : 'Kasir: Belum Buka Shift'}</span>
              <span>•</span>
              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                {activeShift?.notes || 'Phone POS'}
              </span>
              <span>•</span>
              <span className="text-indigo-700 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                {availableUnits.length} Unit Siap Jual
              </span>
            </div>
          </div>
        </div>

        {/* Specialized Fast Action Triggers & Shift Control */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowShiftModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors shadow-2xs ${
              activeShift 
                ? 'bg-teal-50 hover:bg-teal-100 text-teal-800 border-teal-200' 
                : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{activeShift ? 'Tutup Shift' : 'Buka Shift Kasir'}</span>
          </button>

          {activeShift && (
            <button
              type="button"
              onClick={() => setShowCashMovementModal(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
            >
              <ArrowDownLeft className="w-3.5 h-3.5 text-teal-600" />
              <span>Mutasi Kas</span>
            </button>
          )}

          <button
            onClick={() => setShowSellInModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold border border-indigo-200 transition-colors shadow-2xs"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Sell In (Beli Gadget)</span>
          </button>

          <button
            onClick={() => setShowExchangeModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-200 transition-colors shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Tukar Unit / Garansi</span>
          </button>

          <Link
            href={`/app/${activeBusiness?.id}/phone/imei`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Pelacak IMEI</span>
          </Link>
        </div>
      </section>

      {/* 2. SPLIT STAGE */}
      <div className="grid grid-cols-12 gap-6 px-6 pb-8 items-start">
        {/* LEFT 7 COLS: Serialized Inventory & Accessories */}
        <div className="col-span-12 lg:col-span-7 xl:col-span-8 flex flex-col gap-5">
          {/* Scan IMEI / Search Bar */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchImeiOrName}
              onChange={(e) => setSearchImeiOrName(e.target.value)}
              placeholder="Scan barcode IMEI (15 digit) atau ketik nama model iPhone / Samsung..."
              className="w-full bg-transparent border-0 outline-none text-xs text-slate-900 placeholder:text-slate-400"
            />
          </div>

          {/* Section: Unit Smartphone Serialized */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-indigo-600" />
                <span>Unit Smartphone Tersedia ({availableUnits.length})</span>
              </h3>
              <span className="text-xs text-slate-400">Pilih unit untuk masuk ke invoice penjualan</span>
            </div>

            {availableUnits.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-dashed border-slate-300 text-center text-slate-400 text-xs">
                Tidak ada unit IMEI yang cocok. Gunakan tombol Sell In untuk menambah unit baru.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {availableUnits.map((unit) => (
                  <div
                    key={unit.id}
                    onClick={() => addImeiToCart(unit)}
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-3 group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-xs text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {unit.brand} {unit.model} {unit.storage}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 uppercase font-bold">
                          {unit.condition === 'new' ? 'Baru' : 'Second A'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Warna: {unit.color} • {unit.supplierOrCustomerName || 'Distributor'}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 uppercase font-mono">IMEI: {unit.imei}</span>
                        <span className="font-bold text-sm text-slate-900 tabular-nums">
                          {formatRupiah(unit.sellingPrice)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white text-xs font-semibold transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Pilih Unit</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Aksesoris & Jasa Servis */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Tag className="w-4 h-4 text-slate-600" />
                <span>Aksesoris & Jasa Servis Tambahan</span>
              </h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {accessoryProducts.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => addAccessoryToCart(prod)}
                  className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <h4 className="font-semibold text-xs text-slate-900 line-clamp-1">{prod.name}</h4>
                    <span className="text-[10px] text-slate-400">{prod.category}</span>
                  </div>
                  <div className="mt-2 pt-1 border-t border-slate-100 flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-800 tabular-nums">{formatRupiah(prod.sellingPrice)}</span>
                    <Plus className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT 5 COLS: Cart & Invoice Slip */}
        <div className="col-span-12 lg:col-span-5 xl:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col sticky top-36 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">Invoice Penjualan Gadget</h3>
            {cart.length > 0 && (
              <button onClick={() => setCart([])} className="text-xs text-rose-600 hover:underline">
                Batal
              </button>
            )}
          </div>

          {/* Customer Input */}
          <div className="p-4 border-b border-slate-100 space-y-2 bg-slate-50/20">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nama Pelanggan (untuk garansi nota)..."
              className="w-full text-xs p-2 rounded-lg border border-slate-200 outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Nomor WhatsApp Pelanggan..."
              className="w-full text-xs p-2 rounded-lg border border-slate-200 outline-none focus:border-indigo-500"
            />
          </div>

          {/* Items */}
          <div className="p-4 flex flex-col gap-3 max-h-[320px] overflow-y-auto divide-y divide-slate-100">
            {cart.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Belum ada produk atau unit IMEI yang dipilih.
              </div>
            ) : (
              cart.map((item, idx) => (
                <div key={idx} className="pt-2 first:pt-0 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs text-slate-900">{item.productName}</div>
                    {item.imei && (
                      <div className="text-[10px] text-indigo-700 font-mono mt-0.5">
                        IMEI: {item.imei}
                      </div>
                    )}
                  </div>
                  <div className="font-bold text-xs text-slate-900 tabular-nums">
                    {formatRupiah(item.subtotal)}
                  </div>
                  <button onClick={() => removeFromCart(idx)} className="text-slate-400 hover:text-rose-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Checkout Bar */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-2">
            <div className="flex items-center justify-between text-base font-bold text-slate-900">
              <span>Total Transaksi</span>
              <span className="text-indigo-700 text-lg tabular-nums">{formatRupiah(grandTotal)}</span>
            </div>

            <button
              onClick={() => {
                setPaidAmount(grandTotal);
                setShowPaymentModal(true);
              }}
              disabled={cart.length === 0}
              className="w-full mt-3 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Banknote className="w-4 h-4" />
              <span>Bayar Transaksi Gadget</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. SELL IN MODAL (Beli Perangkat dari Customer) */}
      {showSellInModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-900">Sell In (Penerimaan Gadget dari Customer)</h3>
              </div>
              <button onClick={() => setShowSellInModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSellInSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Merek</label>
                  <select
                    value={sellInBrand}
                    onChange={(e) => setSellInBrand(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  >
                    <option value="Apple">Apple</option>
                    <option value="Samsung">Samsung</option>
                    <option value="Xiaomi">Xiaomi</option>
                    <option value="Oppo">Oppo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Model & Tipe</label>
                  <input
                    type="text"
                    required
                    value={sellInModel}
                    onChange={(e) => setSellInModel(e.target.value)}
                    placeholder="Contoh: iPhone 12"
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Memori</label>
                  <input
                    type="text"
                    value={sellInStorage}
                    onChange={(e) => setSellInStorage(e.target.value)}
                    placeholder="128GB"
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Warna</label>
                  <input
                    type="text"
                    value={sellInColor}
                    onChange={(e) => setSellInColor(e.target.value)}
                    placeholder="Black"
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kondisi</label>
                  <select
                    value={sellInCondition}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onChange={(e) => setSellInCondition(e.target.value as any)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  >
                    <option value="new">Baru</option>
                    <option value="second_grade_a">Second Mulus (A)</option>
                    <option value="second_grade_b">Second Wajar (B)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor IMEI Perangkat (15 Digit) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={sellInImei}
                  onChange={(e) => setSellInImei(e.target.value)}
                  placeholder="Contoh: 358941091239999"
                  className="w-full font-mono text-sm p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Harga Beli / Modal (Rp)</label>
                  <input
                    type="number"
                    required
                    value={sellInCostPrice}
                    onChange={(e) => setSellInCostPrice(Number(e.target.value))}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Harga Jual Nanti (Rp)</label>
                  <input
                    type="number"
                    required
                    value={sellInSellingPrice}
                    onChange={(e) => setSellInSellingPrice(Number(e.target.value))}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Pelanggan Penjual <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={sellInCustName}
                  onChange={(e) => setSellInCustName(e.target.value)}
                  placeholder="Nama pemilik asal..."
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSellInModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                >
                  Terima ke Inventaris
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. EXCHANGE MODAL (Tukar Unit & Garansi) */}
      {showExchangeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-base text-slate-900">Tukar Unit IMEI & Klaim Garansi</h3>
              </div>
              <button onClick={() => setShowExchangeModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExchangeSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  IMEI Unit Lama yang Bermasalah
                </label>
                <input
                  type="text"
                  required
                  value={exchangeOldImei}
                  onChange={(e) => setExchangeOldImei(e.target.value)}
                  placeholder="Ketik atau scan IMEI unit lama..."
                  className="w-full font-mono text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  IMEI Unit Pengganti (Harus Available)
                </label>
                <select
                  required
                  value={exchangeNewImei}
                  onChange={(e) => setExchangeNewImei(e.target.value)}
                  className="w-full font-mono text-xs p-2 rounded-lg border border-slate-300"
                >
                  <option value="">-- Pilih Unit Pengganti --</option>
                  {availableUnits.map(u => (
                    <option key={u.id} value={u.imei}>
                      {u.brand} {u.model} - IMEI: {u.imei}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan Penukaran Unit
                </label>
                <textarea
                  rows={2}
                  value={exchangeReason}
                  onChange={(e) => setExchangeReason(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowExchangeModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                >
                  Proses Tukar Unit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. PAYMENT MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Pembayaran Kasir Gadget</h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl mb-4 text-center">
              <span className="text-xs text-slate-500 uppercase font-semibold">Total Tagihan</span>
              <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {formatRupiah(grandTotal)}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Uang Tunai Diterima (Rp)
                </label>
                <input
                  type="number"
                  value={paidAmount || ''}
                  onChange={(e) => setPaidAmount(Number(e.target.value))}
                  placeholder="0"
                  className="w-full bg-white text-lg font-bold text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 outline-none tabular-nums"
                />
              </div>

              <button
                type="button"
                onClick={() => setPaidAmount(grandTotal)}
                className="w-full py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Uang Pas ({formatRupiah(grandTotal)})
              </button>

              <button
                type="button"
                onClick={handleCheckout}
                disabled={isProcessing || paidAmount < grandTotal}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Memproses Transaksi...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Selesaikan & Terbitkan Nota IMEI</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. RECEIPT MODAL */}
      {showReceiptModal && lastSale && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 flex flex-col items-center">
            <div className="w-full bg-slate-50 border border-dashed border-slate-300 p-5 rounded-xl font-mono text-[11px] text-slate-800 space-y-3">
              <div className="text-center">
                <div className="font-bold text-sm text-slate-900 uppercase">{activeBusiness?.name || 'Kasir POS'}</div>
                <div className="text-[10px] text-slate-500">Nota Resmi Penjualan & Garansi Gadget</div>
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 text-[10px] text-slate-600 flex justify-between">
                <span>{lastSale.saleNumber}</span>
                <span>{new Date(lastSale.createdAt).toLocaleDateString('id-ID')}</span>
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1.5">
                {lastSale.lineItems.map((item, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex justify-between font-semibold">
                      <span>{item.productName}</span>
                      <span className="tabular-nums">{formatRupiah(item.subtotal)}</span>
                    </div>
                    {item.imei && (
                      <div className="text-[10px] text-indigo-700">
                        S/N IMEI: {item.imei} (Garansi 1 Tahun)
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 text-right">
                <div className="flex justify-between font-bold text-xs pt-1">
                  <span>TOTAL:</span>
                  <span className="tabular-nums">{formatRupiah(lastSale.grandTotal)}</span>
                </div>
              </div>
            </div>

            <div className="w-full flex items-center gap-2 mt-4">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Nota</span>
              </button>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. SHIFT MODAL (BUKA / TUTUP SHIFT KASIR) */}
      {showShiftModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-900">
                  {activeShift ? 'Tutup Sesi Shift Kasir' : 'Buka Sesi Shift Kasir'}
                </h3>
              </div>
              <button 
                onClick={() => { setShowShiftModal(false); setShiftError(''); }} 
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {shiftError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {shiftError}
              </div>
            )}

            {activeShift ? (
              <form onSubmit={handleCloseShiftSubmit} className="space-y-4">
                <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs text-slate-700">
                  <div className="flex justify-between">
                    <span>Kasir Bertugas:</span>
                    <strong className="text-slate-900">{activeShift.cashierName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Modal Kas Awal:</span>
                    <strong className="tabular-nums">{formatRupiah(activeShift.openingCash)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Penjualan Tunai:</span>
                    <strong className="tabular-nums text-indigo-700">+{formatRupiah(activeShift.cashSalesTotal)}</strong>
                  </div>
                  {activeShift.cashInTotal > 0 && (
                    <div className="flex justify-between">
                      <span>Mutasi Kas Masuk:</span>
                      <strong className="tabular-nums text-emerald-700">+{formatRupiah(activeShift.cashInTotal)}</strong>
                    </div>
                  )}
                  {activeShift.cashOutTotal > 0 && (
                    <div className="flex justify-between">
                      <span>Mutasi Kas Keluar:</span>
                      <strong className="tabular-nums text-rose-700">-{formatRupiah(activeShift.cashOutTotal)}</strong>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900">
                    <span>Kas Diharapkan di Laci:</span>
                    <strong className="tabular-nums">{formatRupiah(activeShift.expectedClosingCash)}</strong>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Hitungan Fisik Uang di Laci Kasir (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={shiftActualClosingCash || ''}
                    onChange={(e) => setShiftActualClosingCash(Number(e.target.value))}
                    placeholder="Contoh: 1500000"
                    className="w-full bg-white text-sm font-bold text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none tabular-nums"
                  />
                  {shiftActualClosingCash > 0 && (
                    <div className="text-xs mt-1">
                      Selisih Kas: {' '}
                      <span className={`font-bold ${shiftActualClosingCash - activeShift.expectedClosingCash === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatRupiah(shiftActualClosingCash - activeShift.expectedClosingCash)}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan Shift
                  </label>
                  <textarea
                    rows={2}
                    value={shiftNotes}
                    onChange={(e) => setShiftNotes(e.target.value)}
                    placeholder="Catatan serah terima kasir konter HP..."
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => { setShowShiftModal(false); setShiftError(''); }}
                    className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={shiftLoading}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs disabled:opacity-50"
                  >
                    {shiftLoading ? 'Menutup Shift...' : 'Tutup Shift Kasir'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleOpenShiftSubmit} className="space-y-4">
                <p className="text-xs text-slate-500">
                  Buka sesi kasir baru untuk mulai mencatat penjualan gadget, aksesoris, dan mutasi kas di konter.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Modal Kas Awal di Laci (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={shiftOpeningCash || ''}
                    onChange={(e) => setShiftOpeningCash(Number(e.target.value))}
                    placeholder="300000"
                    className="w-full bg-white text-sm font-bold text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Keterangan Sesi Shift
                  </label>
                  <input
                    type="text"
                    value={shiftNotes}
                    onChange={(e) => setShiftNotes(e.target.value)}
                    placeholder="Shift Konter Roxy"
                    className="w-full bg-white text-xs text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => { setShowShiftModal(false); setShiftError(''); }}
                    className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={shiftLoading}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs disabled:opacity-50"
                  >
                    {shiftLoading ? 'Membuka...' : 'Buka Shift Kasir'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 8. CASH MOVEMENT MODAL (KAS MASUK / KAS KELUAR) */}
      {showCashMovementModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Mutasi Kas Laci Konter HP</h3>
              <button onClick={() => setShowCashMovementModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCashMovementSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setMovementType('cash_in')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all ${
                    movementType === 'cash_in' 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  + Kas Masuk (In)
                </button>
                <button
                  type="button"
                  onClick={() => setMovementType('cash_out')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all ${
                    movementType === 'cash_out' 
                      ? 'bg-rose-600 text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  - Kas Keluar (Out)
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nominal Uang (Rp) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={movementAmount || ''}
                  onChange={(e) => setMovementAmount(Number(e.target.value))}
                  placeholder="100000"
                  className="w-full bg-white text-sm font-bold text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan / Keperluan Mutasi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder="Contoh: Tambah uang kembalian pecahan 20rb"
                  className="w-full bg-white text-xs text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCashMovementModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={shiftLoading}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs disabled:opacity-50"
                >
                  {shiftLoading ? 'Menyimpan...' : 'Catat Mutasi Kas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
