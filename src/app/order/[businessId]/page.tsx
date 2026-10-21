'use client';

import React, { useState, useEffect, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  UtensilsCrossed, ShoppingBag, Plus, Minus, Search, 
  CheckCircle2, Clock, ChefHat, Sparkles, AlertCircle, 
  X, ChevronRight, MessageSquare, ArrowLeft, RefreshCw,
  Store, MapPin, Phone, HelpCircle
} from 'lucide-react';

interface PublicBusiness {
  id: string;
  name: string;
  logoUrl?: string | null;
  tagline?: string;
  address?: string;
  phone?: string;
  footerMessage?: string;
  taxRate: number;
  serviceChargeRate: number;
}

interface PublicProduct {
  id: string;
  name: string;
  category: string;
  sellingPrice: number;
  imageUrl?: string | null;
  stockQty: number;
  trackStock: boolean;
  available: boolean;
  options?: any;
  modifiers?: any;
}

interface PublicTable {
  id: string;
  tableNumber: string;
  capacity: number;
  status: string;
}

interface CartItem {
  product: PublicProduct;
  quantity: number;
  notes?: string;
}

function CustomerOrderContent({ params }: { params: Promise<{ businessId: string }> }) {
  const resolvedParams = use(params);
  const businessId = resolvedParams.businessId;
  const searchParams = useSearchParams();

  const urlTable = searchParams.get('table') || '';
  const urlTableId = searchParams.get('tableId') || '';

  // Data State
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [business, setBusiness] = useState<PublicBusiness | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [tables, setTables] = useState<PublicTable[]>([]);

  // Customer & Table Selection State
  const [selectedTable, setSelectedTable] = useState<string>(urlTable);
  const [selectedTableId, setSelectedTableId] = useState<string>(urlTableId);
  const [customerName, setCustomerName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  // Menu Navigation & Search
  const [activeCategory, setActiveCategory] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState('');

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCartDrawer, setShowCartDrawer] = useState(false);

  // Customize Item Modal
  const [customizingProduct, setCustomizingProduct] = useState<PublicProduct | null>(null);
  const [itemNoteInput, setItemNoteInput] = useState('');

  // Order Submission & Tracking
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<any | null>(null);
  const [orderStatus, setOrderStatus] = useState<string>('new');
  const [isPollingStatus, setIsPollingStatus] = useState(false);

  // 1. Fetch public restaurant menu
  useEffect(() => {
    async function fetchMenu() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/fnb/public-menu?businessId=${encodeURIComponent(businessId)}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          setErrorMsg(data.message || 'Gagal memuat menu restoran.');
          return;
        }

        setBusiness(data.business);
        setCategories(data.categories || []);
        setProducts(data.products || []);
        setTables(data.tables || []);

        // If table from URL is valid, lock it in
        if (urlTable) {
          setSelectedTable(urlTable);
          const found = (data.tables || []).find((t: PublicTable) => t.tableNumber.toLowerCase() === urlTable.toLowerCase());
          if (found) setSelectedTableId(found.id);
        } else if (data.tables && data.tables.length > 0) {
          setSelectedTable(data.tables[0].tableNumber);
          setSelectedTableId(data.tables[0].id);
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Terjadi gangguan jaringan saat memuat menu.');
      } finally {
        setLoading(false);
      }
    }

    if (businessId) {
      fetchMenu();
    }
  }, [businessId, urlTable]);

  // 2. Poll order status if order submitted
  useEffect(() => {
    if (!submittedOrder?.saleId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/fnb/customer-order?businessId=${businessId}&saleId=${submittedOrder.saleId}`);
        const data = await res.json();
        if (data.success && data.sale) {
          setOrderStatus(data.sale.orderStatus);
        }
      } catch (e) {
        // silent polling catch
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [submittedOrder?.saleId, businessId]);

  // Cart operations
  const handleAddToCart = (product: PublicProduct, customNote?: string) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id && item.notes === customNote);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id && item.notes === customNote
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1, notes: customNote }];
    });
  };

  const handleUpdateQty = (index: number, delta: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, idx) => idx !== index);
      }
      updated[index] = { ...item, quantity: newQty };
      return updated;
    });
  };

  const totalItemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = cart.reduce((acc, item) => acc + item.product.sellingPrice * item.quantity, 0);
  const tax = business ? Math.round((subtotal * (business.taxRate || 10)) / 100) : 0;
  const serviceCharge = business && business.serviceChargeRate ? Math.round((subtotal * business.serviceChargeRate) / 100) : 0;
  const grandTotal = subtotal + tax + serviceCharge;

  // Submit order to kitchen
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      alert('Silakan masukkan nama Anda sebagai pemesan.');
      return;
    }
    if (!selectedTable) {
      alert('Silakan pilih nomor meja Anda.');
      return;
    }
    if (cart.length === 0) {
      alert('Keranjang pesanan masih kosong.');
      return;
    }

    setIsSubmitting(true);
    try {
      const lineItems = cart.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        unitPrice: item.product.sellingPrice,
        subtotal: item.product.sellingPrice * item.quantity,
        notes: item.notes || undefined,
      }));

      const res = await fetch('/api/fnb/customer-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          tableId: selectedTableId || undefined,
          tableNumber: selectedTable,
          customerName: customerName.trim(),
          lineItems,
          notes: orderNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || 'Gagal mengirim pesanan ke dapur.');
        return;
      }

      setSubmittedOrder(data);
      setOrderStatus('new');
      setCart([]);
      setShowCartDrawer(false);
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan sistem saat mengirim pesanan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter products
  const filteredProducts = products.filter((p) => {
    const matchCategory = activeCategory === 'Semua' || p.category === activeCategory;
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-lg animate-bounce">
          <UtensilsCrossed className="w-6 h-6" />
        </div>
        <p className="mt-4 font-bold text-slate-800 text-sm">Menyiapkan Menu Restoran...</p>
        <p className="text-xs text-slate-500 mt-1">Menghubungkan ke sistem dapur</p>
      </div>
    );
  }

  // Error Screen
  if (errorMsg || !business) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full text-center border border-slate-200 shadow-sm space-y-4">
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-200">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="font-extrabold text-slate-900 text-base">Menu Tidak Tersedia</h2>
          <p className="text-xs text-slate-600 leading-relaxed">{errorMsg}</p>
          <div className="pt-2">
            <a
              href="/"
              className="inline-block px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
            >
              Kembali ke Beranda
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Confirmed Order Screen
  if (submittedOrder) {
    const getOrderStatusStep = () => {
      switch (orderStatus) {
        case 'new': return { step: 1, title: 'Pesanan Diterima Dapur', desc: 'Tiket pesanan Anda telah masuk di layar monitor dapur.', color: 'text-amber-600' };
        case 'preparing': return { step: 2, title: 'Sedang Dimasak / Diracik', desc: 'Koki dan barista sedang menyiapkan sajian pesanan Anda.', color: 'text-sky-600' };
        case 'ready': return { step: 3, title: 'Sajian Siap Saji!', desc: 'Pesanan Anda telah selesai dan segera diantar ke meja.', color: 'text-emerald-600' };
        case 'completed': return { step: 4, title: 'Telah Disajikan', desc: 'Selamat menikmati sajian Anda di restoran kami.', color: 'text-teal-700' };
        default: return { step: 1, title: 'Pesanan Diterima', desc: 'Sedang diproses oleh staf restoran.', color: 'text-slate-700' };
      }
    };

    const statusInfo = getOrderStatusStep();

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-slate-200 shadow-xl space-y-6 text-center">
          {/* Header icon */}
          <div className="relative mx-auto w-16 h-16 bg-teal-50 border border-teal-200 rounded-2xl flex items-center justify-center text-teal-600">
            <ChefHat className="w-9 h-9" />
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[10px]">
              ✓
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-bold tracking-wider uppercase text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
              {submittedOrder.tableNumber} • DINE IN
            </span>
            <h1 className="text-xl font-extrabold text-slate-900 pt-1">
              Pesanan Berhasil Terkirim!
            </h1>
            <p className="text-xs text-slate-500">
              Terima kasih, <span className="font-bold text-slate-800">{submittedOrder.customerName}</span>. Pesanan Anda langsung diproses dapur.
            </p>
          </div>

          {/* Ticket ID Box */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1 text-left">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">No. Pesanan:</span>
              <span className="font-mono font-bold text-slate-900">{submittedOrder.saleNumber}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Estimasi Total:</span>
              <span className="font-bold text-slate-900">Rp {submittedOrder.grandTotal.toLocaleString('id-ID')}</span>
            </div>
          </div>

          {/* Real-time Status Card */}
          <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-2 text-left">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className={`text-xs font-extrabold uppercase tracking-wide ${statusInfo.color}`}>
                {statusInfo.title}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{statusInfo.desc}</p>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-left text-[11px] text-amber-800 flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Info Pembayaran:</span> Pembayaran dapat dilakukan di kasir restoran setelah Anda selesai bersantap.
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={() => setSubmittedOrder(null)}
              className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Pesan Menu Tambahan Lagi</span>
            </button>
            <p className="text-[10px] text-slate-400">
              Menu tambahan akan otomatis digabungkan ke {submittedOrder.tableNumber}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Top Navbar & Restaurant Branding */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {business.logoUrl ? (
              <img
                src={business.logoUrl}
                alt={business.name}
                className="w-10 h-10 object-contain rounded-xl bg-slate-50 border border-slate-200 p-0.5"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-base shadow-2xs">
                {business.name.substring(0, 1)}
              </div>
            )}
            <div>
              <h1 className="font-extrabold text-sm text-slate-900 leading-tight">
                {business.name}
              </h1>
              <p className="text-[10px] text-slate-500 truncate max-w-[200px]">
                {business.tagline || 'Pesan Langsung dari Meja'}
              </p>
            </div>
          </div>

          {/* Table Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800">
            <UtensilsCrossed className="w-3.5 h-3.5 text-teal-600" />
            <span className="font-extrabold text-xs tracking-wide">
              {selectedTable || 'Pilih Meja'}
            </span>
          </div>
        </div>

        {/* Table Selector Dropdown if table was not preset in QR */}
        {(!urlTable || tables.length > 1) && (
          <div className="bg-teal-600 text-white px-4 py-1.5 text-xs flex items-center justify-between">
            <span className="text-[11px] font-medium opacity-90">Meja Anda saat ini:</span>
            <select
              value={selectedTable}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedTable(val);
                const found = tables.find((t) => t.tableNumber === val);
                if (found) setSelectedTableId(found.id);
              }}
              className="bg-teal-700 text-white text-xs font-bold px-2 py-0.5 rounded-lg border border-teal-500 outline-none"
            >
              {tables.map((t) => (
                <option key={t.id} value={t.tableNumber}>
                  {t.tableNumber} (Kapasitas {t.capacity} Org)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Search Bar */}
        <div className="px-4 py-2 max-w-2xl mx-auto border-t border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari makanan, kopi, atau minuman favorit..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 text-xs text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:ring-2 focus:ring-teal-500/20 border border-transparent focus:border-teal-500 transition-all"
            />
          </div>
        </div>

        {/* Category Horizontal Scroll */}
        <div className="max-w-2xl mx-auto px-4 pb-2.5 overflow-x-auto no-scrollbar flex items-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all shadow-2xs ${
                activeCategory === cat
                  ? 'bg-teal-600 text-white shadow-teal-600/20 scale-102'
                  : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {/* Product List */}
      <main className="max-w-2xl mx-auto px-4 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold text-slate-800">
            {activeCategory} ({filteredProducts.length})
          </div>
          <span className="text-[10px] text-slate-500">Harga belum termasuk PB1 & Servis</span>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-slate-200 text-slate-400 my-4 space-y-2">
            <UtensilsCrossed className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">Tidak ada menu yang sesuai.</p>
            <p className="text-[11px] text-slate-400">Coba ubah kata kunci pencarian atau pilih kategori lain.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredProducts.map((product) => {
              const inCartQty = cart
                .filter((item) => item.product.id === product.id)
                .reduce((acc, item) => acc + item.quantity, 0);

              return (
                <div
                  key={product.id}
                  className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs flex gap-3 items-center justify-between hover:border-teal-300 transition-all"
                >
                  {/* Left: Product Info */}
                  <div className="space-y-1 flex-1 min-w-0">
                    <span className="text-[9px] font-semibold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded uppercase">
                      {product.category}
                    </span>
                    <h3 className="font-extrabold text-xs text-slate-900 leading-snug line-clamp-2">
                      {product.name}
                    </h3>
                    <div className="font-extrabold text-sm text-teal-800">
                      Rp {product.sellingPrice.toLocaleString('id-ID')}
                    </div>
                  </div>

                  {/* Right: Image & Action */}
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-16 h-16 object-cover rounded-xl border border-slate-100 bg-slate-50 shadow-2xs"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xs">
                        🍽️
                      </div>
                    )}

                    {inCartQty > 0 ? (
                      <div className="flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded-xl p-1">
                        <button
                          type="button"
                          onClick={() => {
                            const idx = cart.findIndex((i) => i.product.id === product.id);
                            if (idx >= 0) handleUpdateQty(idx, -1);
                          }}
                          className="w-6 h-6 rounded-lg bg-white text-teal-800 font-bold flex items-center justify-center shadow-2xs hover:bg-rose-50 hover:text-rose-600 transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-extrabold text-teal-900 px-1">
                          {inCartQty}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddToCart(product)}
                          className="w-6 h-6 rounded-lg bg-teal-600 text-white font-bold flex items-center justify-center shadow-2xs hover:bg-teal-700 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddToCart(product)}
                        className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-2xs transition-all active:scale-95 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Pesan</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Bottom Floating Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-gradient-to-t from-white via-white to-transparent pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <button
              onClick={() => setShowCartDrawer(true)}
              className="w-full p-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white shadow-xl shadow-teal-900/20 flex items-center justify-between transition-all active:scale-98"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center font-extrabold text-sm">
                  {totalItemsCount}
                </div>
                <div className="text-left">
                  <div className="text-xs font-medium text-teal-100">Pesanan {selectedTable}</div>
                  <div className="font-extrabold text-base leading-none">
                    Rp {subtotal.toLocaleString('id-ID')}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 font-bold text-xs bg-white text-teal-800 px-3.5 py-2 rounded-xl shadow-xs">
                <span>Kirim ke Dapur</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Cart Review & Order Drawer */}
      {showCartDrawer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-5">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-teal-600" />
                  <span>Ringkasan Pesanan Meja</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  {selectedTable} • {business.name}
                </p>
              </div>
              <button
                onClick={() => setShowCartDrawer(false)}
                className="w-8 h-8 rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {cart.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="font-bold text-slate-900 truncate">
                      {item.product.name}
                    </div>
                    {item.notes && (
                      <div className="text-[10px] text-amber-700 italic">
                        Catatan: {item.notes}
                      </div>
                    )}
                    <div className="text-slate-500 font-medium">
                      Rp {item.product.sellingPrice.toLocaleString('id-ID')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(idx, -1)}
                        className="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold"
                      >
                        -
                      </button>
                      <span className="font-bold px-1.5">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(idx, 1)}
                        className="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold"
                      >
                        +
                      </button>
                    </div>

                    <div className="font-bold text-slate-900 text-right w-16">
                      Rp {(item.product.sellingPrice * item.quantity).toLocaleString('id-ID')}
                    </div>
                  </div>
                </div>
              ))}

              {/* Form Input: Customer Name & Notes */}
              <form onSubmit={handleSubmitOrder} id="order-form" className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Nama Pemesan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Masukkan nama Anda (misal: Budi / Ibu Ratna)..."
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan Tambahan untuk Dapur (Opsional)
                  </label>
                  <input
                    type="text"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="Contoh: Tolong disajikan bersamaan, es sedikit..."
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                  />
                </div>
              </form>

              {/* Calculation Summary */}
              <div className="border-t border-dashed border-slate-200 pt-3 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span>Rp {subtotal.toLocaleString('id-ID')}</span>
                </div>
                {serviceCharge > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Biaya Layanan ({business.serviceChargeRate}%):</span>
                    <span>Rp {serviceCharge.toLocaleString('id-ID')}</span>
                  </div>
                )}
                {tax > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Pajak Resto (PB1 {business.taxRate}%):</span>
                    <span>Rp {tax.toLocaleString('id-ID')}</span>
                  </div>
                )}
                <div className="border-t border-slate-300 pt-1.5 flex justify-between font-extrabold text-sm text-slate-900">
                  <span>ESTIMASI TOTAL:</span>
                  <span className="text-teal-800">Rp {grandTotal.toLocaleString('id-ID')}</span>
                </div>
              </div>

              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Pesanan akan langsung masuk ke dapur. Pembayaran dilakukan di kasir setelah bersantap.</span>
              </div>
            </div>

            {/* Drawer Footer CTA */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowCartDrawer(false)}
                className="py-3 px-4 rounded-xl bg-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-300 transition-colors"
              >
                Kembali
              </button>
              <button
                type="submit"
                form="order-form"
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md transition-all active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span>Mengirim ke Dapur...</span>
                ) : (
                  <>
                    <ChefHat className="w-4 h-4" />
                    <span>Kirim Pesanan ke Dapur 🚀</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomerOrderPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
          <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-lg animate-bounce">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <p className="mt-4 font-bold text-slate-800 text-sm">Menyiapkan Menu Restoran...</p>
        </div>
      }
    >
      <CustomerOrderContent params={params} />
    </React.Suspense>
  );
}

