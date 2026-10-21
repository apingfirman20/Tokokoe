'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useBusiness } from '@/context/BusinessContext';
import { Product, CartLineItem, OrderType, PaymentMethod, Sale } from '@/types';
import { formatRupiah, parseRupiah } from '@/lib/utils';
import { 
  Coffee, Search, Plus, Minus, Trash2, CreditCard, 
  Banknote, Receipt, CheckCircle2, Clock, X, ChefHat, 
  UtensilsCrossed, AlertCircle, Printer, RotateCcw, ArrowDownLeft
} from 'lucide-react';
import { ReceiptModal } from './ReceiptModal';
import { playPosSound } from '@/lib/audio';

export function FnBPosScreen() {
  const { 
    activeBusiness, 
    activeBranch, 
    products, 
    tables, 
    activeShift, 
    openShift, 
    closeShift, 
    recordCashMovement,
    processCheckout,
    openFnBOrder,
    addItemsToFnBOrder,
    moveTable,
    mergeTables
  } = useBusiness();

  // Category filter state
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState('');

  // Cart & Order State
  const [cart, setCart] = useState<CartLineItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [selectedTable, setSelectedTable] = useState<string>('Meja 01');
  const [customerName, setCustomerName] = useState('');

  // Modals & Sub-states
  const [showTableModal, setShowTableModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  // Customization Modal State (Options, Modifiers, Notes)
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [lineItemNotes, setLineItemNotes] = useState<string>('');

  // Table Move / Merge action states
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [targetTableId, setTargetTableId] = useState('');
  const [tableActionLoading, setTableActionLoading] = useState(false);

  // Cash payment calculation state
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentError, setPaymentError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isOpenOrderProcessing, setIsOpenOrderProcessing] = useState<boolean>(false);
  const [orderFeedbackMsg, setOrderFeedbackMsg] = useState<string>('');

  // Shift form states
  const [shiftOpeningCash, setShiftOpeningCash] = useState<number>(200000);
  const [shiftActualClosingCash, setShiftActualClosingCash] = useState<number>(0);
  const [shiftNotes, setShiftNotes] = useState('');
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftError, setShiftError] = useState('');
  const [showCashMovementModal, setShowCashMovementModal] = useState(false);
  const [movementType, setMovementType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [movementAmount, setMovementAmount] = useState<number>(50000);
  const [movementReason, setMovementReason] = useState('');

  // Synchronize table selection with first table
  React.useEffect(() => {
    if (tables.length > 0 && !selectedTableId) {
      setSelectedTableId(tables[0].id);
      setSelectedTable(tables[0].tableNumber);
    }
  }, [tables, selectedTableId]);

  // Filter products by category & search (excluding archived/inactive)
  const categories = ['Semua', 'Coffee Base', 'Non-Coffee', 'Signature', 'Pastry & Bakery', 'Makanan Berat'];
  const filteredProducts = products.filter(p => {
    if (p.isActive === false || p.available === false) return false;
    const matchCategory = selectedCategory === 'Semua' || p.category === selectedCategory;
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  // Authoritative Business Tax & Service Charge (PB1 derived, never hard-coded 10%)
  const taxRate = activeBusiness?.taxRate !== undefined ? activeBusiness.taxRate : 10;
  const serviceChargeRate = activeBusiness?.serviceChargeRate !== undefined ? activeBusiness.serviceChargeRate : 0;

  // Cart Calculations
  const subtotal = cart.reduce((acc, item) => acc + item.subtotal, 0);
  const tax = Math.round((subtotal * taxRate) / 100);
  const serviceCharge = Math.round((subtotal * serviceChargeRate) / 100);
  const grandTotal = subtotal + tax + serviceCharge;
  const changeAmount = Math.max(0, paidAmount - grandTotal);

  // Line item uniqueness key helper
  const getItemKey = (item: CartLineItem) => {
    const optStr = item.selectedOptions ? JSON.stringify(Object.entries(item.selectedOptions).sort()) : '';
    const modStr = item.selectedModifiers ? [...item.selectedModifiers].sort().join(',') : '';
    const notesStr = item.notes || '';
    return `${item.productId}::${optStr}::${modStr}::${notesStr}`;
  };

  // Cart Actions with full variant / modifier isolation
  const addToCartWithCustomization = (
    product: Product,
    options?: Record<string, string>,
    modifiers?: string[],
    notes?: string
  ) => {
    if (product.isActive === false || product.available === false) {
      alert(`Produk "${product.name}" sedang nonaktif / diarsipkan.`);
      return;
    }

    // Compute authoritative options surcharge
    let optionsExtra = 0;
    if (options && product.options) {
      for (const [optName, choiceLabel] of Object.entries(options)) {
        const optObj = product.options.find(o => o.name === optName);
        if (optObj?.choices) {
          const choice = optObj.choices.find(c => c.label === choiceLabel);
          if (choice?.extraPrice) optionsExtra += choice.extraPrice;
        }
      }
    }

    // Compute authoritative modifiers surcharge
    let modifiersExtra = 0;
    if (modifiers && product.modifiers) {
      for (const modName of modifiers) {
        const modObj = product.modifiers.find(m => m.name === modName);
        if (modObj?.price) modifiersExtra += modObj.price;
      }
    }

    const unitPrice = product.sellingPrice + optionsExtra + modifiersExtra;
    const newItem: CartLineItem = {
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unitPrice,
      subtotal: unitPrice,
      notes: notes?.trim() || undefined,
      selectedOptions: options && Object.keys(options).length > 0 ? options : undefined,
      selectedModifiers: modifiers && modifiers.length > 0 ? modifiers : undefined,
    };

    const targetKey = getItemKey(newItem);

    setCart(prev => {
      const existingIdx = prev.findIndex(item => getItemKey(item) === targetKey);
      if (existingIdx >= 0) {
        return prev.map((item, idx) => 
          idx === existingIdx
            ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.unitPrice }
            : item
        );
      }
      return [...prev, newItem];
    });
  };

  const handleProductClick = (product: Product) => {
    if (product.isActive === false || product.available === false) {
      alert(`Produk "${product.name}" sedang nonaktif / diarsipkan.`);
      return;
    }
    if ((product.options && product.options.length > 0) || (product.modifiers && product.modifiers.length > 0)) {
      setCustomizingProduct(product);
      const initialOptions: Record<string, string> = {};
      if (product.options) {
        product.options.forEach(opt => {
          if (opt.choices && opt.choices.length > 0) {
            initialOptions[opt.name] = opt.choices[0].label;
          }
        });
      }
      setSelectedOptions(initialOptions);
      setSelectedModifiers([]);
      setLineItemNotes('');
      setShowCustomizeModal(true);
    } else {
      addToCartWithCustomization(product);
    }
  };

  const updateQuantityByIndex = (index: number, delta: number) => {
    setCart(prev => {
      return prev.map((item, idx) => {
        if (idx === index) {
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          return { ...item, quantity: newQty, subtotal: newQty * item.unitPrice };
        }
        return item;
      }).filter(Boolean) as CartLineItem[];
    });
  };

  const removeFromCartByIndex = (index: number) => {
    setCart(prev => prev.filter((_, idx) => idx !== index));
  };

  const clearCart = () => {
    setCart([]);
  };

  // Open Order / Send to Kitchen without immediate payment
  const handleOpenOrder = async () => {
    if (cart.length === 0 || isOpenOrderProcessing) return;
    setIsOpenOrderProcessing(true);
    setPaymentError('');
    try {
      const curTbl = tables.find(t => t.id === selectedTableId || t.tableNumber === selectedTable);
      if (curTbl?.activeSaleId) {
        // Append items to active unpaid order
        const res = await addItemsToFnBOrder(curTbl.activeSaleId, cart);
        if (res.success) {
          setOrderFeedbackMsg(`✓ Menu tambahan berhasil dikirim ke KDS Dapur untuk ${selectedTable}!`);
          clearCart();
          setTimeout(() => setOrderFeedbackMsg(''), 5000);
        } else {
          setPaymentError(res.error || 'Gagal menambahkan menu ke pesanan meja.');
        }
      } else {
        // Open new order and lock table
        const res = await openFnBOrder({
          orderType: orderType === 'takeaway' ? 'takeaway' : 'dine_in',
          tableId: selectedTableId || undefined,
          tableNumber: selectedTable,
          customerName: customerName || undefined,
          lineItems: cart,
        });
        if (res.success) {
          setOrderFeedbackMsg(`✓ Pesanan baru berhasil dibuka & dikirim ke KDS Dapur untuk ${selectedTable}!`);
          clearCart();
          setTimeout(() => setOrderFeedbackMsg(''), 5000);
        } else {
          setPaymentError(res.error || 'Gagal mengirim pesanan ke dapur.');
        }
      }
    } finally {
      setIsOpenOrderProcessing(false);
    }
  };

  // Checkout execution
  const handleCheckout = async () => {
    if (isProcessing) return;
    if (cart.length === 0) return;
    if (paidAmount < grandTotal) {
      setPaymentError('Nominal uang yang dibayarkan kurang dari total tagihan.');
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
        tax,
        serviceCharge,
        grandTotal,
        paidAmount,
        changeAmount,
        paymentMethod: 'cash',
        orderType,
        tableNumber: orderType === 'dine_in' ? selectedTable : undefined,
        tableId: orderType === 'dine_in' ? selectedTableId : undefined,
        customerName: customerName || undefined,
      });

      if (res.success && res.sale) {
        playPosSound('checkout_success');
        setLastSale(res.sale);
        setShowPaymentModal(false);
        setShowReceiptModal(true);
        clearCart();
      } else {
        playPosSound('scan_error');
        setPaymentError(res.error || 'Terjadi kesalahan pemrosesan transaksi.');
      }
    } finally {
      setIsProcessing(false);
    }
  };


  const handleOpenShift = async (e: React.FormEvent) => {
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

  const handleCloseShift = async (e: React.FormEvent) => {
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
        setMovementAmount(50000);
      } else {
        alert(res.error || 'Gagal mencatat mutasi kas kasir.');
      }
    } finally {
      setShiftLoading(false);
    }
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

          {activeShift && (
            <button
              onClick={() => setShowCashMovementModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
            >
              <ArrowDownLeft className="w-3.5 h-3.5 text-teal-600" />
              <span>Mutasi Kas</span>
            </button>
          )}
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
                onClick={() => handleProductClick(prod)}
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
                  {((prod.options && prod.options.length > 0) || (prod.modifiers && prod.modifiers.length > 0)) && (
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-teal-800/90 text-white font-bold text-[9px] uppercase tracking-wider">
                      Varian / Topping
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

          {/* Cart Items List with independent variant rows */}
          <div className="p-4 flex flex-col gap-3 max-h-[360px] overflow-y-auto divide-y divide-slate-100">
            {cart.length === 0 ? (
              <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-2">
                <Coffee className="w-10 h-10 stroke-1 text-slate-300" />
                <span className="text-xs">Keranjang masih kosong. Pilih menu di sebelah kiri.</span>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div key={`${item.productId}_${idx}`} className="pt-2.5 first:pt-0 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs text-slate-900 truncate">
                      {item.productName}
                    </div>
                    {item.selectedOptions && Object.keys(item.selectedOptions).length > 0 && (
                      <div className="text-[10px] text-teal-700 font-medium">
                        {Object.entries(item.selectedOptions).map(([k, v]) => `${k}: ${v}`).join(' • ')}
                      </div>
                    )}
                    {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                      <div className="text-[10px] text-purple-700 font-medium">
                        + {item.selectedModifiers.join(', ')}
                      </div>
                    )}
                    {item.notes && (
                      <div className="text-[10px] text-amber-700 italic">
                        Catatan: {item.notes}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                      {formatRupiah(item.unitPrice)}
                    </div>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateQuantityByIndex(idx, -1)}
                      className="w-5 h-5 rounded bg-white text-slate-700 hover:bg-slate-200 flex items-center justify-center text-xs shadow-2xs"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-bold text-slate-900 w-4 text-center tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantityByIndex(idx, 1)}
                      className="w-5 h-5 rounded bg-white text-slate-700 hover:bg-slate-200 flex items-center justify-center text-xs shadow-2xs"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="text-right font-bold text-xs text-slate-900 min-w-[65px] tabular-nums">
                      {formatRupiah(item.subtotal)}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCartByIndex(idx)}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Price Breakdown & Action Buttons */}
          <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex flex-col gap-2">
            {orderFeedbackMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{orderFeedbackMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Subtotal</span>
              <span className="tabular-nums font-medium">{formatRupiah(subtotal)}</span>
            </div>
            {taxRate > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Pajak Resto (PB1 {taxRate}%)</span>
                <span className="tabular-nums font-medium">{formatRupiah(tax)}</span>
              </div>
            )}
            {serviceChargeRate > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Service Charge ({serviceChargeRate}%)</span>
                <span className="tabular-nums font-medium">{formatRupiah(serviceCharge)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
              <span>Total Tagihan</span>
              <span className="text-teal-700 tabular-nums text-lg">{formatRupiah(grandTotal)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              {orderType === 'dine_in' && (
                <button
                  type="button"
                  onClick={handleOpenOrder}
                  disabled={cart.length === 0 || isOpenOrderProcessing}
                  className="py-3 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <ChefHat className="w-4 h-4 text-teal-400" />
                  <span>{isOpenOrderProcessing ? 'Mengirim...' : 'Kirim ke KDS'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setPaidAmount(grandTotal);
                  setShowPaymentModal(true);
                }}
                disabled={cart.length === 0}
                className={`${orderType === 'dine_in' ? 'col-span-1' : 'col-span-2'} py-3 px-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md shadow-teal-900/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40`}
              >
                <Banknote className="w-4 h-4" />
                <span>Bayar ({formatRupiah(grandTotal)})</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. TABLE SELECTION MODAL */}
      {showTableModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Pilih Meja Dine-in</h3>
                <p className="text-xs text-slate-500">Pilih meja untuk mencatat pesanan, pindah meja, atau gabung meja</p>
              </div>
              <button onClick={() => setShowTableModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6 max-h-80 overflow-y-auto p-1">
              {tables.map((t) => (
                <div
                  key={t.id}
                  onClick={() => {
                    setSelectedTableId(t.id);
                    setSelectedTable(t.tableNumber);
                    setShowTableModal(false);
                  }}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer hover:shadow-xs ${
                    selectedTableId === t.id
                      ? 'border-teal-600 bg-teal-50 text-teal-800 font-bold ring-2 ring-teal-500/20'
                      : t.status === 'occupied'
                      ? 'border-rose-200 bg-rose-50/70 text-rose-800'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-800'
                  }`}
                >
                  <span className="text-xs font-semibold">{t.tableNumber}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    t.status === 'occupied' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {t.status === 'occupied' ? 'Terisi (Ada Bill)' : 'Kosong'}
                  </span>
                  {t.customerName && (
                    <span className="text-[10px] text-slate-500 truncate max-w-full">
                      {t.customerName}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowTableModal(false);
                    setShowMoveModal(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
                >
                  Pindah Meja
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTableModal(false);
                    setShowMergeModal(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
                >
                  Gabung Meja
                </button>
              </div>
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

      {/* 3.1 PRODUCT CUSTOMIZATION MODAL (OPTIONS & MODIFIERS) */}
      {showCustomizeModal && customizingProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-bold text-base text-slate-900">{customizingProduct.name}</h3>
                <p className="text-xs text-slate-500">Pilih varian, topping, dan catatan pesanan</p>
              </div>
              <button onClick={() => setShowCustomizeModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
              {/* Product Options */}
              {customizingProduct.options?.map((opt) => (
                <div key={opt.name} className="space-y-2">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                    {opt.name}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {opt.choices.map((choice) => (
                      <button
                        type="button"
                        key={choice.label}
                        onClick={() => setSelectedOptions(prev => ({ ...prev, [opt.name]: choice.label }))}
                        className={`p-2.5 rounded-xl border text-xs font-semibold text-left flex justify-between items-center transition-all ${
                          selectedOptions[opt.name] === choice.label
                            ? 'border-teal-600 bg-teal-50 text-teal-800 shadow-2xs'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span>{choice.label}</span>
                        {choice.extraPrice > 0 && (
                          <span className="text-[10px] text-teal-700 font-bold">
                            +{formatRupiah(choice.extraPrice)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Product Modifiers */}
              {customizingProduct.modifiers && customizingProduct.modifiers.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                    Topping / Add-on Tambahan
                  </label>
                  <div className="space-y-1.5">
                    {customizingProduct.modifiers.map((mod) => {
                      const isChecked = selectedModifiers.includes(mod.name);
                      return (
                        <label
                          key={mod.name}
                          className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer text-xs transition-all ${
                            isChecked ? 'border-purple-600 bg-purple-50 text-purple-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedModifiers(prev => [...prev, mod.name]);
                                } else {
                                  setSelectedModifiers(prev => prev.filter(m => m !== mod.name));
                                }
                              }}
                              className="rounded text-teal-600 focus:ring-teal-500"
                            />
                            <span className="font-semibold">{mod.name}</span>
                          </div>
                          {mod.price > 0 && (
                            <span className="text-[11px] font-bold text-purple-700">
                              +{formatRupiah(mod.price)}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Line Notes */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="text-xs font-semibold text-slate-700 block">
                  Catatan Tambahan untuk Dapur (Notes)
                </label>
                <input
                  type="text"
                  value={lineItemNotes}
                  onChange={(e) => setLineItemNotes(e.target.value)}
                  placeholder="Contoh: Less sugar / Pisahkan sedotan / Sangat panas"
                  className="w-full bg-slate-50 text-xs p-2.5 rounded-xl border border-slate-200 focus:bg-white focus:border-teal-500 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCustomizeModal(false)}
                className="px-4 py-2 rounded-xl text-slate-600 font-semibold text-xs hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  addToCartWithCustomization(
                    customizingProduct,
                    selectedOptions,
                    selectedModifiers,
                    lineItemNotes
                  );
                  setShowCustomizeModal(false);
                }}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambahkan ke Pesanan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3.2 MOVE TABLE MODAL */}
      {showMoveModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-base text-slate-900">Pindah Meja Tamu</h3>
              <button onClick={() => setShowMoveModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Meja Asal</label>
                <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-bold">
                  {selectedTable} ({tables.find(t => t.id === selectedTableId || t.tableNumber === selectedTable)?.status === 'occupied' ? 'Terisi' : 'Kosong'})
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Pilih Meja Tujuan (Harus Kosong)</label>
                <select
                  value={targetTableId}
                  onChange={(e) => setTargetTableId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
                >
                  <option value="">-- Pilih Meja Tujuan --</option>
                  {tables
                    .filter(t => t.status === 'available' && t.id !== selectedTableId && t.tableNumber !== selectedTable)
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        {t.tableNumber} (Kapasitas {t.capacity})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowMoveModal(false)}
                  className="px-3 py-2 rounded-xl text-slate-600 font-semibold text-xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!targetTableId || tableActionLoading}
                  onClick={async () => {
                    const fromTbl = tables.find(t => t.id === selectedTableId || t.tableNumber === selectedTable);
                    if (!fromTbl) return;
                    setTableActionLoading(true);
                    try {
                      const res = await moveTable(fromTbl.id, targetTableId);
                      if (res.success) {
                        const targetTbl = tables.find(t => t.id === targetTableId);
                        if (targetTbl) {
                          setSelectedTableId(targetTbl.id);
                          setSelectedTable(targetTbl.tableNumber);
                        }
                        setShowMoveModal(false);
                        alert(`Meja ${selectedTable} berhasil dipindahkan!`);
                      } else {
                        alert(res.error || 'Gagal memindahkan meja.');
                      }
                    } finally {
                      setTableActionLoading(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs disabled:opacity-50"
                >
                  {tableActionLoading ? 'Memindahkan...' : 'Konfirmasi Pindah'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3.3 MERGE TABLE MODAL */}
      {showMergeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-base text-slate-900">Gabung Meja (Merge)</h3>
              <button onClick={() => setShowMergeModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Meja Asal</label>
                <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-bold">
                  {selectedTable}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Pilih Meja Target Gabungan</label>
                <select
                  value={targetTableId}
                  onChange={(e) => setTargetTableId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
                >
                  <option value="">-- Pilih Meja Target --</option>
                  {tables
                    .filter(t => t.id !== selectedTableId && t.tableNumber !== selectedTable)
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        {t.tableNumber} ({t.status === 'occupied' ? 'Terisi' : 'Kosong'})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowMergeModal(false)}
                  className="px-3 py-2 rounded-xl text-slate-600 font-semibold text-xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!targetTableId || tableActionLoading}
                  onClick={async () => {
                    const fromTbl = tables.find(t => t.id === selectedTableId || t.tableNumber === selectedTable);
                    if (!fromTbl) return;
                    setTableActionLoading(true);
                    try {
                      const res = await mergeTables(fromTbl.id, targetTableId);
                      if (res.success) {
                        const targetTbl = tables.find(t => t.id === targetTableId);
                        if (targetTbl) {
                          setSelectedTableId(targetTbl.id);
                          setSelectedTable(targetTbl.tableNumber);
                        }
                        setShowMergeModal(false);
                        alert(`Meja ${selectedTable} berhasil digabungkan ke meja target!`);
                      } else {
                        alert(res.error || 'Gagal menggabungkan meja.');
                      }
                    } finally {
                      setTableActionLoading(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs disabled:opacity-50"
                >
                  {tableActionLoading ? 'Menggabungkan...' : 'Konfirmasi Gabung'}
                </button>
              </div>
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
      <ReceiptModal
        isOpen={showReceiptModal && !!lastSale}
        onClose={() => setShowReceiptModal(false)}
        sale={lastSale}
        businessName={activeBusiness?.name}
        branchName={activeBranch?.name}
      />

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
                    placeholder="Catatan kendala atau serah terima..."
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
                    {shiftLoading ? 'Membuka...' : 'Buka Shift Sekarang'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 5. CASH MOVEMENT MODAL (KAS MASUK / KAS KELUAR) */}
      {showCashMovementModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Mutasi Kas Laci Kasir F&B</h3>
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
                  placeholder="Contoh: Beli es batu darurat / Uang kembalian koin"
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
    </div>
  );
}
