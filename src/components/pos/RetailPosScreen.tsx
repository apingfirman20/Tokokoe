'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { Product, CartLineItem, Sale, HeldCart } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { 
  ShoppingBag, ScanBarcode, Search, Plus, Minus, 
  Trash2, Banknote, CheckCircle2, Printer, X, Keyboard,
  Clock, ArrowUpRight, ArrowDownLeft, RotateCcw, AlertTriangle,
  Coins
} from 'lucide-react';
import { ReceiptModal } from './ReceiptModal';
import { playPosSound } from '@/lib/audio';

export function RetailPosScreen() {
  const { 
    activeBusiness, 
    activeBranch, 
    products, 
    processCheckout,
    activeShift,
    openShift,
    closeShift,
    recordCashMovement,
    heldCarts,
    holdCart,
    removeHeldCart,
    refundSale,
    sales,
  } = useBusiness();

  const [barcodeInput, setBarcodeInput] = useState('');
  const [cart, setCart] = useState<CartLineItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState<number>(0);

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  // Held Cart & Refund Modals
  const [showHeldModal, setShowHeldModal] = useState(false);
  const [holdCustomerTag, setHoldCustomerTag] = useState('');
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundSaleId, setRefundSaleId] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundMsg, setRefundMsg] = useState('');

  // Shift & Cash Drawer Modals
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showCashMovementModal, setShowCashMovementModal] = useState(false);
  const [shiftOpeningCash, setShiftOpeningCash] = useState<number>(200000);
  const [shiftActualClosingCash, setShiftActualClosingCash] = useState<number>(0);
  const [shiftNotes, setShiftNotes] = useState('');
  const [movementType, setMovementType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [movementAmount, setMovementAmount] = useState<number>(50000);
  const [movementReason, setMovementReason] = useState('');
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftError, setShiftError] = useState('');

  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Auto focus barcode input on mount and after cart updates
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, [cart]);


  // Handle barcode submission (e.g. from physical USB laser scanner or typing)
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = barcodeInput.trim();
    if (!query) return;

    // Search product with strict priority:
    // 1. Exact Barcode match
    let found = products.find(p => p.barcode && p.barcode.trim() === query);
    // 2. Exact SKU match
    if (!found) {
      found = products.find(p => p.sku && p.sku.trim().toLowerCase() === query.toLowerCase());
    }
    // 3. Fallback name search
    if (!found) {
      found = products.find(p => p.name.toLowerCase().includes(query.toLowerCase()));
    }

    if (found) {
      if (found.isActive === false || found.available === false) {
        playPosSound('scan_error');
        setFeedbackMsg(`❌ Produk "${found.name}" nonaktif / diarsipkan.`);
        setTimeout(() => setFeedbackMsg(''), 3000);
        return;
      }
      if (found.trackStock && (found.stockQty ?? 0) <= 0) {
        playPosSound('scan_error');
        setFeedbackMsg(`❌ Stok produk "${found.name}" habis (0 unit tersisa).`);
        setTimeout(() => setFeedbackMsg(''), 3000);
        return;
      }
      playPosSound('scan_success');
      addToCart(found);
      setBarcodeInput('');
      setFeedbackMsg(`✓ Ditambahkan: ${found.name}`);
      setTimeout(() => setFeedbackMsg(''), 2000);
      barcodeInputRef.current?.focus();
    } else {
      playPosSound('scan_error');
      setFeedbackMsg(`❌ Barcode / SKU "${query}" tidak ditemukan.`);
      setTimeout(() => setFeedbackMsg(''), 2500);
      barcodeInputRef.current?.focus();
    }
  };

  const addToCart = (product: Product) => {
    if (product.isActive === false || product.available === false) {
      playPosSound('scan_error');
      setFeedbackMsg(`❌ Produk "${product.name}" sedang nonaktif / diarsipkan.`);
      setTimeout(() => setFeedbackMsg(''), 2500);
      return;
    }
    if (product.trackStock && (product.stockQty ?? 0) <= 0) {
      playPosSound('scan_error');
      setFeedbackMsg(`❌ Stok produk "${product.name}" habis (0 unit tersisa).`);
      setTimeout(() => setFeedbackMsg(''), 2500);
      return;
    }
    playPosSound('scan_success');
    setCart(prev => {
      const idx = prev.findIndex(item => item.productId === product.id);
      if (idx !== -1) {
        if (product.trackStock && prev[idx].quantity + 1 > (product.stockQty ?? 0)) {
          playPosSound('scan_error');
          setFeedbackMsg(`⚠️ Stok produk "${product.name}" hanya tersisa ${product.stockQty} unit.`);
          setTimeout(() => setFeedbackMsg(''), 2500);
          return prev;
        }
        const next = [...prev];
        next[idx].quantity += 1;
        next[idx].subtotal = next[idx].quantity * next[idx].unitPrice;
        return next;
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitPrice: product.sellingPrice,
          subtotal: product.sellingPrice,
          notes: product.barcode,
        }
      ];
    });
  };

  const updateQty = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      setCart(prev => prev.filter(item => item.productId !== productId));
      return;
    }
    setCart(prev => prev.map(item => 
      item.productId === productId 
        ? { ...item, quantity: newQty, subtotal: newQty * item.unitPrice } 
        : item
    ));
  };

  // Calculations
  const rawSubtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const discountAmount = Math.round((rawSubtotal * discountPercent) / 100);
  const grandTotal = Math.max(0, rawSubtotal - discountAmount);
  const changeAmount = Math.max(0, paidAmount - grandTotal);

  // Keyboard shortcut listener (F2: Bayar, F3: Focus Barcode Scanner, Esc: Bersihkan Keranjang)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        if (cart.length > 0) {
          if (!activeShift) {
            setShiftError('Sesi kasir (shift) belum dibuka. Buka sesi shift kasir terlebih dahulu untuk transaksi tunai.');
            setShowShiftModal(true);
          } else {
            setPaidAmount(grandTotal);
            setShowPaymentModal(true);
          }
        }
      } else if (e.key === 'F3') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setCart([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, activeShift, grandTotal]);

  const [checkoutError, setCheckoutError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleOpenShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShiftLoading(true);
    setShiftError('');
    try {
      await openShift(shiftOpeningCash, shiftNotes);
      setShowShiftModal(false);
      setShiftNotes('');
      setCheckoutError('');
      playPosSound('key_click');
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
      playPosSound('key_click');
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
        setMovementAmount(50000);
        playPosSound('key_click');
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
    if (paidAmount < grandTotal) return;

    if (!activeShift) {
      setCheckoutError('Sesi kasir (shift) belum dibuka. Buka sesi shift kasir terlebih dahulu untuk transaksi tunai.');
      setShowShiftModal(true);
      return;
    }

    setIsProcessing(true);
    setCheckoutError('');

    try {
      const res = await processCheckout({
        lineItems: cart,
        subtotal: rawSubtotal,
        discount: discountAmount,
        tax: 0,
        serviceCharge: 0,
        grandTotal,
        paidAmount,
        changeAmount,
        paymentMethod: 'cash',
        orderType: 'retail_pos',
      });

      if (res.success && res.sale) {
        playPosSound('checkout_success');
        setLastSale(res.sale);
        setShowPaymentModal(false);
        setShowReceiptModal(true);
        setCart([]);
        setDiscountPercent(0);
      } else {
        playPosSound('scan_error');
        setCheckoutError(res.error || 'Terjadi kesalahan transaksi.');
        alert(res.error || 'Gagal menyelesaikan transaksi.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleHoldCart = () => {
    if (cart.length === 0) return;
    const tag = holdCustomerTag.trim() || `Pelanggan #${heldCarts.length + 1}`;
    holdCart(tag, cart, rawSubtotal, discountAmount, grandTotal);
    setCart([]);
    setDiscountPercent(0);
    setHoldCustomerTag('');
    setFeedbackMsg(`✓ Keranjang "${tag}" berhasil ditahan.`);
    setTimeout(() => setFeedbackMsg(''), 3000);
  };

  const handleResumeCart = (held: HeldCart) => {
    setCart(held.lineItems);
    removeHeldCart(held.id);
    setShowHeldModal(false);
    setFeedbackMsg(`✓ Keranjang "${held.customerTag || 'Pelanggan'}" dilanjutkan.`);
    setTimeout(() => setFeedbackMsg(''), 3000);
  };

  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundSaleId.trim() || !refundReason.trim()) {
      alert("ID/Nomor transaksi dan alasan retur wajib diisi.");
      return;
    }
    setRefundLoading(true);
    setRefundMsg('');
    try {
      const res = await refundSale({
        saleId: refundSaleId.trim(),
        reason: refundReason.trim(),
      });
      if (res.success) {
        setRefundMsg(`✓ Berhasil memproses retur untuk transaksi ${res.sale?.saleNumber || refundSaleId}. Stok telah dipulihkan.`);
        setRefundSaleId('');
        setRefundReason('');
        setTimeout(() => {
          setShowRefundModal(false);
          setRefundMsg('');
        }, 2500);
      } else {
        alert(res.error || "Gagal memproses retur.");
      }
    } finally {
      setRefundLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 -m-4 md:-m-6 lg:-m-8">
      {/* 1. RETAIL SCANNER TOOLBAR */}
      <section className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-16 z-20 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-slate-900">{activeBusiness?.name || 'Toko Kita'}</h2>
              <span className="text-xs text-slate-400">• {activeBranch?.name || 'Outlet Tebet'}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
              <span>{activeShift ? `Kasir: ${activeShift.cashierName}` : 'Kasir: Belum Buka Shift'}</span>
              <span>•</span>
              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                {activeShift?.notes || 'Retail POS'}
              </span>
              <span>•</span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Sistem Authoritative
              </span>
            </div>
          </div>
        </div>

        {/* Shift Controls & Shortcuts */}
        <div className="flex items-center gap-2.5">
          {activeShift && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              <Coins className="w-3.5 h-3.5 text-emerald-600" />
              <span>Laci Kas: {formatRupiah(activeShift.currentCashDrawer ?? activeShift.expectedClosingCash ?? activeShift.openingCash)}</span>
            </div>
          )}

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

          {/* Held Cart & Refund Buttons */}
          <button
            type="button"
            onClick={() => setShowHeldModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              heldCarts.length > 0 
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 font-bold animate-pulse'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <span>Keranjang Tertunda</span>
            {heldCarts.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                {heldCarts.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowRefundModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-semibold transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
            <span>Retur Transaksi</span>
          </button>

          {/* Keyboard Shortcuts Legend */}
          <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[10px] font-bold">F2</kbd>
              <span>Bayar</span>
            </div>
            <div className="w-px h-3 bg-slate-300" />
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[10px] font-bold">F3</kbd>
              <span>Scan Barcode</span>
            </div>
            <div className="w-px h-3 bg-slate-300" />
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[10px] font-bold">F4</kbd>
              <span>Tahan</span>
            </div>
            <div className="w-px h-3 bg-slate-300" />
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[10px] font-bold">Esc</kbd>
              <span>Batal</span>
            </div>
          </div>
        </div>
      </section>

      {/* SHIFT WARNING BANNER (When shift is closed) */}
      {!activeShift && (
        <div className="mx-6 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Shift Kasir Belum Dibuka:</strong> Transaksi tunai dan pencatatan kas laci memerlukan pembukaan shift kasir terlebih dahulu.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setShiftError('');
              setShowShiftModal(true);
            }}
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-colors shrink-0 active:scale-[0.98]"
          >
            Buka Shift Kasir Sekarang
          </button>
        </div>
      )}

      {/* 2. MAIN STAGE */}
      <div className="grid grid-cols-12 gap-6 px-6 pb-8 items-start">
        {/* LEFT 7 COLS: Fast Input & Quick Catalog */}
        <div className="col-span-12 lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
          {/* Barcode Scanner Input Form */}
          <form onSubmit={handleBarcodeSubmit} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ScanBarcode className="w-4 h-4 text-emerald-600" />
                <span>Input / Scan Barcode Produk (Tekan Enter)</span>
              </span>
              {feedbackMsg && (
                <span className="text-xs font-semibold text-emerald-700 animate-pulse">
                  {feedbackMsg}
                </span>
              )}
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Scan barcode fisik atau ketik nama (Le Minerale, Chitato, Rinso)..."
                className="flex-1 bg-slate-50 text-slate-900 text-sm px-4 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-600 focus:bg-white outline-none font-mono"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors"
              >
                + Masuk
              </button>
            </div>
          </form>

          {/* Quick Product Grid for Touch or Mouse */}
          <div>
            {(() => {
              const activeProducts = products.filter(p => p.isActive !== false && p.available !== false);
              return (
                <>
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">
                    Katalog Produk Kasir ({activeProducts.length} SKU)
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                    {activeProducts.map((prod) => (
                      <button
                        key={prod.id}
                        onClick={() => addToCart(prod)}
                        className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs hover:border-emerald-500 hover:shadow-xs text-left transition-all flex flex-col justify-between"
                      >
                        <div>
                          <span className="font-semibold text-xs text-slate-900 line-clamp-1">{prod.name}</span>
                          <span className="font-mono text-[10px] text-slate-400">{prod.barcode || prod.sku}</span>
                        </div>
                        <div className="mt-2 pt-1 border-t border-slate-100 flex items-center justify-between">
                          <span className="font-bold text-xs text-emerald-700 tabular-nums">{formatRupiah(prod.sellingPrice)}</span>
                          <span className="text-[10px] text-slate-500">Stok: {prod.stockQty}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* RIGHT 5 COLS: High Density Register Slip */}
        <div className="col-span-12 lg:col-span-5 xl:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col sticky top-36 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">Struk Kasir ({cart.length} Baris)</h3>
            {cart.length > 0 && (
              <button onClick={() => setCart([])} className="text-xs text-rose-600 hover:underline">
                Kosongkan
              </button>
            )}
          </div>

          {/* Line items table */}
          <div className="p-3 flex flex-col gap-2 max-h-[380px] overflow-y-auto divide-y divide-slate-100">
            {cart.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Scan barcode barang atau klik produk untuk mulai transaksi.
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.productId} className="pt-2 first:pt-0 flex items-center justify-between gap-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{item.productName}</div>
                    <div className="text-[11px] text-slate-400 tabular-nums">
                      {formatRupiah(item.unitPrice)} x {item.quantity}
                    </div>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-1 bg-slate-100 rounded p-0.5">
                    <button
                      onClick={() => updateQty(item.productId, item.quantity - 1)}
                      className="w-5 h-5 rounded bg-white text-slate-700 flex items-center justify-center shadow-2xs"
                    >
                      -
                    </button>
                    <span className="w-5 text-center font-bold tabular-nums">{item.quantity}</span>
                    <button
                      onClick={() => updateQty(item.productId, item.quantity + 1)}
                      className="w-5 h-5 rounded bg-white text-slate-700 flex items-center justify-center shadow-2xs"
                    >
                      +
                    </button>
                  </div>

                  <div className="font-bold text-slate-900 tabular-nums min-w-[65px] text-right">
                    {formatRupiah(item.subtotal)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Discount and Grand Total */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Diskon Promosi</span>
              <div className="flex items-center gap-1">
                {[0, 5, 10].map(pct => (
                  <button
                    key={pct}
                    onClick={() => setDiscountPercent(pct)}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      discountPercent === pct ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
              <span>Total Pembayaran</span>
              <span className="text-emerald-700 text-xl tabular-nums">{formatRupiah(grandTotal)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={handleHoldCart}
                disabled={cart.length === 0}
                className="py-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs border border-amber-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <span>Tahan [F4]</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!activeShift) {
                    setShiftError('Sesi kasir (shift) belum dibuka. Buka sesi shift kasir terlebih dahulu untuk transaksi tunai.');
                    setShowShiftModal(true);
                  } else {
                    setPaidAmount(grandTotal);
                    setShowPaymentModal(true);
                  }
                }}
                disabled={cart.length === 0}
                className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-[0.98]"
              >
                <Banknote className="w-4 h-4" />
                <span>Bayar [F2]</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. CASH PAYMENT MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Pembayaran Kasir Ritel</h3>
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

            {checkoutError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                <span>{checkoutError}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Uang Tunai Pelanggan (Rp)
                </label>
                <input
                  type="number"
                  autoFocus
                  value={paidAmount || ''}
                  onChange={(e) => setPaidAmount(Number(e.target.value))}
                  className="w-full text-lg font-bold text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 outline-none tabular-nums"
                />
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
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Memproses Transaksi...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Selesaikan & Potong Stok Inventaris</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. RECEIPT MODAL */}
      <ReceiptModal
        isOpen={showReceiptModal && !!lastSale}
        onClose={() => setShowReceiptModal(false)}
        sale={lastSale}
        businessName={activeBusiness?.name}
        branchName={activeBranch?.name}
      />

      {/* 5. SHIFT MODAL (BUKA / TUTUP SHIFT KASIR) */}
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
                    <strong className="tabular-nums text-teal-700">+{formatRupiah(activeShift.cashSalesTotal)}</strong>
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
                    placeholder="Catatan serah terima kasir..."
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:border-teal-500 outline-none"
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
                  Buka sesi kasir baru untuk mulai mencatat transaksi penjualan ritel dan mutasi laci kas.
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
                    Keterangan Sesi Shift
                  </label>
                  <input
                    type="text"
                    value={shiftNotes}
                    onChange={(e) => setShiftNotes(e.target.value)}
                    placeholder="Shift Pagi / Reguler Ritel"
                    className="w-full bg-white text-xs text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-500 outline-none"
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
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs disabled:opacity-50"
                  >
                    {shiftLoading ? 'Membuka...' : 'Buka Shift Kasir'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 6. CASH MOVEMENT MODAL (KAS MASUK / KAS KELUAR) */}
      {showCashMovementModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Mutasi Kas Laci Kasir</h3>
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
                  placeholder="50000"
                  className="w-full bg-white text-sm font-bold text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-500 outline-none tabular-nums"
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
                  placeholder="Contoh: Tambah uang kembalian / Beli kantong kresek"
                  className="w-full bg-white text-xs text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-500 outline-none"
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

      {/* 6. HELD CARTS MODAL */}
      {showHeldModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Daftar Keranjang Tertunda</h3>
                <p className="text-xs text-slate-500">Lanjutkan transaksi pelanggan yang sempat ditahan</p>
              </div>
              <button onClick={() => setShowHeldModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {heldCarts.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                Tidak ada transaksi yang sedang ditahan saat ini.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {heldCarts.map((held) => (
                  <div key={held.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/80 transition-all flex items-center justify-between gap-4">
                    <div>
                      <div className="font-bold text-xs text-slate-900 flex items-center gap-2">
                        <span>{held.customerTag || 'Pelanggan POS'}</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {new Date(held.createdAt).toLocaleTimeString('id-ID')}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {held.lineItems.length} produk • Total: <strong className="text-slate-800">{formatRupiah(held.grandTotal)}</strong>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-xs">
                        {held.lineItems.map(i => `${i.quantity}x ${i.productName}`).join(', ')}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleResumeCart(held)}
                        className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs"
                      >
                        Lanjutkan
                      </button>
                      <button
                        type="button"
                        onClick={() => removeHeldCart(held.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. REFUND / RETUR MODAL */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-600" />
                <h3 className="font-bold text-base text-slate-900">Retur / Refund Penjualan</h3>
              </div>
              <button onClick={() => { setShowRefundModal(false); setRefundMsg(''); }} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {refundMsg && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{refundMsg}</span>
              </div>
            )}

            <form onSubmit={handleRefundSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ID atau Nomor Struk Transaksi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={refundSaleId}
                  onChange={(e) => setRefundSaleId(e.target.value)}
                  placeholder="Contoh: RET-202610-1234 atau ID Transaksi"
                  className="w-full bg-slate-50 text-xs font-mono text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:bg-white focus:border-rose-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan Retur / Pengembalian <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Contoh: Barang rusak / cacat kemasan / salah beli"
                  className="w-full bg-slate-50 text-xs text-slate-900 p-3 rounded-xl border border-slate-300 focus:bg-white focus:border-rose-500 outline-none resize-none"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800 space-y-1">
                <strong>Catatan Sistem:</strong>
                <p>Retur akan secara otomatis memulihkan stok inventaris ke stock ledger, mengurangi saldo kas drawer, dan merekam jejak audit tanpa menghapus histori transaksi asli.</p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRefundModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={refundLoading}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {refundLoading ? 'Memproses Retur...' : 'Proses Refund & Pulihkan Stok'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
