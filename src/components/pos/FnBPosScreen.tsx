'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useBusiness } from '@/context/BusinessContext';
import { Product, CartLineItem, OrderType, PaymentMethod, Sale } from '@/types';
import { formatRupiah, parseRupiah } from '@/lib/utils';
import { 
  Coffee, Search, Plus, Minus, Trash2, CreditCard, 
  Banknote, Receipt, CheckCircle2, Clock, X, ChefHat, 
  UtensilsCrossed, AlertCircle, Printer, RotateCcw
} from 'lucide-react';

export function FnBPosScreen() {
  const { 
    activeBusiness, 
    activeBranch, 
    products, 
    tables, 
    activeShift, 
    openShift, 
    closeShift, 
    processCheckout 
  } = useBusiness();

  // Category filter state
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState('');

  // Cart & Order State
  const [cart, setCart] = useState<CartLineItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [selectedTable, setSelectedTable] = useState<string>('Meja 01');
  const [customerName, setCustomerName] = useState('');

  // Modals
  const [showTableModal, setShowTableModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  // Cash payment calculation state
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentError, setPaymentError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Shift form states
  const [shiftOpeningCash, setShiftOpeningCash] = useState<number>(200000);
  const [shiftActualClosingCash, setShiftActualClosingCash] = useState<number>(0);
  const [shiftNotes, setShiftNotes] = useState('');

  // Filter products by category & search
  const categories = ['Semua', 'Coffee Base', 'Non-Coffee', 'Signature', 'Pastry & Bakery', 'Makanan Berat'];
  const filteredProducts = products.filter(p => {
    const matchCategory = selectedCategory === 'Semua' || p.category === selectedCategory;
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  // Cart Calculations
  const subtotal = cart.reduce((acc, item) => acc + item.subtotal, 0);
  const tax = Math.round(subtotal * 0.1); // PB1 10%
  const grandTotal = subtotal + tax;
  const changeAmount = Math.max(0, paidAmount - grandTotal);

  // Cart Actions
  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.unitPrice }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitPrice: product.sellingPrice,
          subtotal: product.sellingPrice,
          notes: '',
        }
      ];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.productId === productId) {
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          return { ...item, quantity: newQty, subtotal: newQty * item.unitPrice };
        }
        return item;
      }).filter(Boolean) as CartLineItem[];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const clearCart = () => {
    setCart([]);
  };

  // Checkout execution
  const handleCheckout = async () => {
    if (isProcessing) return;
    if (cart.length === 0) return;
    if (paidAmount < grandTotal) {
      setPaymentError('Nominal uang yang dibayarkan kurang dari total tagihan.');
      return;
    }

    setIsProcessing(true);
    setPaymentError('');

    try {
      const res = await processCheckout({
        lineItems: cart,
        subtotal,
        discount: 0,
        tax,
        serviceCharge: 0,
        grandTotal,
        paidAmount,
        changeAmount,
        paymentMethod: 'cash',
        orderType,
        tableNumber: orderType === 'dine_in' ? selectedTable : undefined,
        customerName: customerName || undefined,
      });

      if (res.success && res.sale) {
        setLastSale(res.sale);
        setShowPaymentModal(false);
        setShowReceiptModal(true);
        clearCart();
      } else {
        setPaymentError(res.error || 'Terjadi kesalahan pemrosesan transaksi.');
      }
    } finally {
      setIsProcessing(false);
    }
  };


  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    openShift(shiftOpeningCash, shiftNotes);
    setShowShiftModal(false);
  };

  const handleCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    closeShift(shiftActualClosingCash, shiftNotes);
    setShowShiftModal(false);
  };

  return (
    <div className="flex flex-col gap-4 -m-4 md:-m-6 lg:-m-8">
      {/* 1. OPERATIONAL SUB-BAR (Stitch F&B Meta Bar) */}
      <section className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-16 z-20 shadow-xs">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm text-slate-900">{activeBusiness?.name || 'Kasir POS'}</h2>
                <span className="text-xs text-slate-400">• {activeBranch?.name || 'Cabang Utama'}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                <span>{activeShift ? `Kasir: ${activeShift.cashierName}` : 'Kasir: Belum Buka Shift'}</span>
                <span>•</span>
                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                  {activeShift?.notes || '#SF-01'}
                </span>
                <span>•</span>
                <span className="text-teal-700 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  WIB Online
                </span>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="hidden xl:flex items-center gap-4 bg-slate-50 px-3.5 py-1.5 rounded-lg border border-slate-200/80 text-xs text-slate-600">
            <div>
              Meja Terisi: <strong suppressHydrationWarning className="text-slate-900">{tables.filter(t => t.status === 'occupied').length} / {tables.length}</strong>
            </div>
            <div className="w-px h-3 bg-slate-300" />
            <div className="flex items-center gap-1.5 text-teal-700 font-semibold">
              <ChefHat className="w-3.5 h-3.5" />
              <span>Dapur KDS Terhubung</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          {/* Order Type Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setOrderType('dine_in')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                orderType === 'dine_in' ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dine-in
            </button>
            <button
              onClick={() => setOrderType('takeaway')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                orderType === 'takeaway' ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Takeaway
            </button>
          </div>

          <Link
            href={`/app/${activeBusiness?.id}/fnb/kitchen`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
          >
            <ChefHat className="w-3.5 h-3.5 text-teal-600" />
            <span>KDS Dapur</span>
          </Link>

          <button
            onClick={() => setShowShiftModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-semibold border border-teal-200 transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{activeShift ? 'Tutup Shift' : 'Buka Shift'}</span>
          </button>
        </div>
      </section>

      {/* 2. POS MAIN STAGE: Split Layout */}
      <div className="grid grid-cols-12 gap-6 px-6 pb-8 items-start">
        {/* LEFT 7 COLS: Catalog, Filters, Search & Grid */}
        <div className="col-span-12 lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
          {/* Search & Active Table Bar */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-1 min-w-[200px] bg-slate-100 px-3 py-2 rounded-xl text-slate-700">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari menu kopi, pastry, minuman..."
                className="w-full bg-transparent border-0 outline-none text-xs text-slate-900 placeholder:text-slate-400"
              />
            </div>

            {orderType === 'dine_in' && (
              <button
                onClick={() => setShowTableModal(true)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 transition-colors text-xs font-semibold"
              >
                <UtensilsCrossed className="w-3.5 h-3.5 text-teal-600" />
                <span>Pilih Meja: <strong>{selectedTable}</strong></span>
              </button>
            )}
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all shadow-xs ${
                  selectedCategory === cat
                    ? 'bg-teal-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Menu Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((prod) => (
              <div
                key={prod.id}
                onClick={() => addToCart(prod)}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col overflow-hidden group active:scale-[0.98]"
              >
                <div className="relative h-28 w-full bg-slate-100 overflow-hidden">
                  {prod.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={prod.imageUrl}
                      alt={prod.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <Coffee className="w-8 h-8" />
                    </div>
                  )}
                  {prod.category === 'Coffee Base' && (
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-teal-700/90 text-white font-bold text-[9px] uppercase tracking-wider">
                      Popular
                    </span>
                  )}
                </div>

                <div className="p-3 flex flex-col flex-1 justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-xs text-slate-900 group-hover:text-teal-700 transition-colors line-clamp-1">
                      {prod.name}
                    </h3>
                    <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                      {prod.category} • Stok: {prod.stockQty}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="font-bold text-xs text-slate-900 tabular-nums">
                      {formatRupiah(prod.sellingPrice)}
                    </span>
                    <button
                      type="button"
                      className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-600 hover:text-white flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT 5 COLS: Active Cart / Order Slip Inspector */}
        <div className="col-span-12 lg:col-span-5 xl:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col sticky top-36 overflow-hidden">
          {/* Cart Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Pesanan Aktif</h3>
              <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                <span className="capitalize font-semibold text-teal-700">{orderType.replace('_', ' ')}</span>
                {orderType === 'dine_in' && <span>• {selectedTable}</span>}
              </div>
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-[11px] text-rose-600 hover:underline flex items-center gap-1 font-medium"
              >
                <Trash2 className="w-3 h-3" />
                <span>Batal</span>
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="p-4 flex flex-col gap-3 max-h-[360px] overflow-y-auto divide-y divide-slate-100">
            {cart.length === 0 ? (
              <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-2">
                <Coffee className="w-10 h-10 stroke-1 text-slate-300" />
                <span className="text-xs">Keranjang masih kosong. Pilih menu di sebelah kiri.</span>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.productId} className="pt-2 first:pt-0 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs text-slate-900 truncate">
                      {item.productName}
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      {formatRupiah(item.unitPrice)}
                    </div>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
                    <button
                      onClick={() => updateQuantity(item.productId, -1)}
                      className="w-5 h-5 rounded bg-white text-slate-700 hover:bg-slate-200 flex items-center justify-center text-xs shadow-2xs"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-bold text-slate-900 w-4 text-center tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.productId, 1)}
                      className="w-5 h-5 rounded bg-white text-slate-700 hover:bg-slate-200 flex items-center justify-center text-xs shadow-2xs"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="text-right font-bold text-xs text-slate-900 min-w-[70px] tabular-nums">
                    {formatRupiah(item.subtotal)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Price Breakdown & Checkout Action */}
          <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Subtotal</span>
              <span className="tabular-nums font-medium">{formatRupiah(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Pajak Resto (PB1 10%)</span>
              <span className="tabular-nums font-medium">{formatRupiah(tax)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
              <span>Total Tagihan</span>
              <span className="text-teal-700 tabular-nums text-lg">{formatRupiah(grandTotal)}</span>
            </div>

            <button
              onClick={() => {
                setPaidAmount(grandTotal);
                setShowPaymentModal(true);
              }}
              disabled={cart.length === 0}
              className="w-full mt-3 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-md shadow-teal-900/30 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Banknote className="w-4 h-4" />
              <span>Bayar Sekarang ({formatRupiah(grandTotal)})</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. TABLE SELECTION MODAL */}
      {showTableModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Pilih Meja Dine-in</h3>
              <button onClick={() => setShowTableModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3 mb-6">
              {tables.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTable(t.tableNumber);
                    setShowTableModal(false);
                  }}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                    selectedTable === t.tableNumber
                      ? 'border-teal-600 bg-teal-50 text-teal-800 font-bold'
                      : t.status === 'occupied'
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-800'
                  }`}
                >
                  <span className="text-xs font-semibold">{t.tableNumber}</span>
                  <span className="text-[10px] text-slate-500">
                    {t.status === 'occupied' ? 'Terisi' : 'Kosong'}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowTableModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. CASH PAYMENT MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-base text-slate-900">Pembayaran Kasir Tunai</h3>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {paymentError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {paymentError}
              </div>
            )}

            <div className="bg-slate-50 p-4 rounded-xl mb-4 text-center">
              <span className="text-xs text-slate-500 uppercase font-semibold">Total Tagihan</span>
              <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {formatRupiah(grandTotal)}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Uang Diterima dari Pelanggan
                </label>
                <input
                  type="number"
                  value={paidAmount || ''}
                  onChange={(e) => setPaidAmount(Number(e.target.value))}
                  placeholder="0"
                  className="w-full bg-white text-lg font-bold text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-500 outline-none tabular-nums"
                />
              </div>

              {/* Quick Preset Buttons for Indonesian Rupiah Denominations */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaidAmount(grandTotal)}
                  className="py-2 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-semibold border border-teal-200"
                >
                  Uang Pas
                </button>
                <button
                  type="button"
                  onClick={() => setPaidAmount(Math.ceil(grandTotal / 50000) * 50000)}
                  className="py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                >
                  {formatRupiah(Math.ceil(grandTotal / 50000) * 50000 || 50000)}
                </button>
                <button
                  type="button"
                  onClick={() => setPaidAmount(Math.ceil(grandTotal / 100000) * 100000 || 100000)}
                  className="py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                >
                  {formatRupiah(Math.ceil(grandTotal / 100000) * 100000 || 100000)}
                </button>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between text-emerald-800">
                <span className="text-xs font-semibold">Kembalian:</span>
                <span className="text-base font-bold tabular-nums">
                  {formatRupiah(changeAmount)}
                </span>
              </div>

              <button
                type="button"
                onClick={handleCheckout}
                disabled={isProcessing || paidAmount < grandTotal}
                className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Memproses Transaksi...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Selesaikan & Cetak Struk</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. THERMAL RECEIPT MODAL */}
      {showReceiptModal && lastSale && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 flex flex-col items-center">
            {/* Thermal Print Receipt Simulation */}
            <div className="w-full bg-slate-50 border border-dashed border-slate-300 p-5 rounded-xl font-mono text-[11px] text-slate-800 space-y-3">
              <div className="text-center space-y-1">
                <div className="font-bold text-sm text-slate-900 uppercase">{activeBusiness?.name || 'Kasir POS'}</div>
                <div className="text-[10px] text-slate-500">{activeBranch?.name || 'Cabang Senopati'}</div>
                <div className="text-[10px] text-slate-400">Telp: {activeBusiness?.phone || '0812-3456-7890'}</div>
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 text-[10px] text-slate-600 flex justify-between">
                <span>{lastSale.saleNumber}</span>
                <span>{new Date(lastSale.createdAt).toLocaleTimeString('id-ID')}</span>
              </div>
              <div className="text-[10px] text-slate-600 flex justify-between">
                <span>Kasir: {lastSale.cashierName}</span>
                <span>{lastSale.tableNumber || lastSale.orderType}</span>
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1.5">
                {lastSale.lineItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <div>
                      <div>{item.productName}</div>
                      <div className="text-[10px] text-slate-400">{item.quantity} x {formatRupiah(item.unitPrice)}</div>
                    </div>
                    <span className="font-semibold tabular-nums">{formatRupiah(item.subtotal)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 text-right">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="tabular-nums">{formatRupiah(lastSale.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>PB1 (10%):</span>
                  <span className="tabular-nums">{formatRupiah(lastSale.tax)}</span>
                </div>
                <div className="flex justify-between font-bold text-xs pt-1 border-t border-slate-200">
                  <span>TOTAL:</span>
                  <span className="tabular-nums">{formatRupiah(lastSale.grandTotal)}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span>Tunai:</span>
                  <span className="tabular-nums">{formatRupiah(lastSale.paidAmount)}</span>
                </div>
                <div className="flex justify-between text-[10px] font-semibold text-teal-800">
                  <span>Kembalian:</span>
                  <span className="tabular-nums">{formatRupiah(lastSale.changeAmount)}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-slate-300 pt-3 text-center text-[10px] text-slate-500">
                Terima kasih atas kunjungan Anda!<br />
                Satu Platform, Semua Usaha.
              </div>
            </div>

            <div className="w-full flex items-center gap-2 mt-4">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Thermal</span>
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

      {/* 6. SHIFT OPEN / CLOSE MODAL */}
      {showShiftModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-base text-slate-900">
                  {activeShift ? 'Tutup Sesi Shift Kasir' : 'Buka Sesi Shift Kasir'}
                </h3>
              </div>
              <button onClick={() => setShowShiftModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {activeShift ? (
              <form onSubmit={handleCloseShift} className="space-y-4">
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
                    <strong className="tabular-nums text-teal-700">+{formatRupiah(activeShift.cashSalesTotal)}</strong>
                  </div>
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
                    placeholder="Contoh: 380000"
                    className="w-full bg-white text-sm font-bold text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-500 outline-none tabular-nums"
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
                    placeholder="Catatan kendala atau serah terima..."
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:border-teal-500 outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowShiftModal(false)}
                    className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
                  >
                    Tutup Shift Kasir
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleOpenShift} className="space-y-4">
                <p className="text-xs text-slate-500">
                  Buka sesi kasir baru untuk mulai mencatat transaksi tunai dan mutasi kas di cabang ini.
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
                    placeholder="200000"
                    className="w-full bg-white text-sm font-bold text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-500 outline-none tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Keterangan Sesi
                  </label>
                  <input
                    type="text"
                    value={shiftNotes}
                    onChange={(e) => setShiftNotes(e.target.value)}
                    placeholder="Shift Pagi / Shift Sore"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:border-teal-500 outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowShiftModal(false)}
                    className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs"
                  >
                    Buka Shift Sekarang
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
