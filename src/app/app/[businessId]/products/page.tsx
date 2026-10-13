'use client';

import React, { useState, use } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { useAuth } from '@/context/AuthContext';
import { Product } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { hasPermission } from '@/lib/permissions';
import { validateProductBarcode, checkDuplicateBarcode, detectBarcodeType } from '@/lib/validation/barcode';
import { 
  Package, Plus, Search, Edit2, CheckCircle2, 
  X, AlertTriangle, Coffee, Smartphone, ShoppingBag, AlertCircle 
} from 'lucide-react';

export default function ProductsPage() {
  const { products, activeBusiness, createProduct, updateProduct } = useBusiness();
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Umum');
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [costPrice, setCostPrice] = useState<number>(0);
  const [stockQty, setStockQty] = useState<number>(10);
  const [barcode, setBarcode] = useState('');
  const [sku, setSku] = useState('');
  const [modalError, setModalError] = useState('');

  const canViewCostPrice = hasPermission(user?.memberRole || 'owner', 'products.cost.read', user?.permissions);
  const canManageProducts = hasPermission(user?.memberRole || 'owner', 'products.create', user?.permissions);

  const categories = ['Semua', ...Array.from(new Set(products.map(p => p.category)))];

  const filtered = products.filter(p => {
    const matchCat = selectedCategory === 'Semua' || p.category === selectedCategory;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode && p.barcode.includes(search)) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setName('');
    setCategory(activeBusiness?.businessType === 'fnb' ? 'Coffee Base' : 'Umum');
    setSellingPrice(20000);
    setCostPrice(10000);
    setStockQty(20);
    setBarcode('');
    setSku('');
    setModalError('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setCategory(p.category);
    setSellingPrice(p.sellingPrice);
    setCostPrice(p.costPrice);
    setStockQty(p.stockQty);
    setBarcode(p.barcode || '');
    setSku(p.sku || '');
    setModalError('');
    setShowAddModal(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setModalError('');

    const cleanBarcode = barcode.trim();
    if (cleanBarcode) {
      // 1. Check duplicate barcode within current business
      const duplicate = checkDuplicateBarcode(products, cleanBarcode, editingProduct?.id);
      if (duplicate.isDuplicate && duplicate.conflictingProduct) {
        setModalError(`Barcode "${cleanBarcode}" sudah digunakan oleh produk lain ("${duplicate.conflictingProduct.name}").`);
        return;
      }

      // 2. Validate format (accepts EAN-13, EAN-8, or internal alphanumeric)
      const val = validateProductBarcode(cleanBarcode);
      if (!val.valid) {
        setModalError(val.error || 'Format barcode tidak valid.');
        return;
      }
    }

    if (editingProduct) {
      updateProduct(editingProduct.id, {
        name,
        category,
        sellingPrice,
        costPrice: canViewCostPrice ? costPrice : editingProduct.costPrice,
        stockQty,
        barcode: cleanBarcode || undefined,
        sku: sku.trim() || undefined,
      });
    } else {
      createProduct({
        name,
        category,
        sellingPrice,
        costPrice,
        stockQty,
        barcode: cleanBarcode || undefined,
        sku: sku.trim() || undefined,
        trackStock: true,
      });
    }

    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Katalog Produk & Menu
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kelola daftar produk, harga jual, barcode, dan kuantitas inventaris ({products.length} item aktif)
          </p>
        </div>

        {canManageProducts && (
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-sm transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tambah Produk Baru</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-xl text-slate-700 min-w-[240px] flex-1">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama produk, SKU, barcode..."
            className="w-full bg-transparent border-0 outline-none text-xs text-slate-900"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setSelectedCategory(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === c
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Nama Produk</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4">SKU / Barcode</th>
                <th className="py-3 px-4 text-right">Harga Jual</th>
                {canViewCostPrice && <th className="py-3 px-4 text-right">HPP (Modal)</th>}
                <th className="py-3 px-4 text-center">Stok</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((prod) => (
                <tr key={prod.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {prod.name}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                      {prod.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500">
                    {prod.barcode || prod.sku || '-'}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                    {formatRupiah(prod.sellingPrice)}
                  </td>
                  {canViewCostPrice && (
                    <td className="py-3 px-4 text-right text-slate-500 tabular-nums">
                      {formatRupiah(prod.costPrice)}
                    </td>
                  )}
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      prod.stockQty <= 5 
                        ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      {prod.trackStock ? `${prod.stockQty} unit` : 'Tanpa Stok'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {canManageProducts && (
                      <button
                        onClick={() => handleOpenEdit(prod)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-slate-100 transition-colors"
                        title="Edit Produk"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">
                {editingProduct ? 'Edit Master Produk' : 'Tambah Produk Baru'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Produk <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Es Kopi Susu Senja"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kategori
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Contoh: Coffee Base"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jumlah Stok
                  </label>
                  <input
                    type="number"
                    value={stockQty}
                    onChange={(e) => setStockQty(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Harga Jual (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500 font-bold"
                  />
                </div>

                {canViewCostPrice && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Harga Modal / HPP (Rp)
                    </label>
                    <input
                      type="number"
                      value={costPrice}
                      onChange={(e) => setCostPrice(Number(e.target.value))}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                    />
                  </div>
                )}
              </div>

              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2 mb-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Barcode / EAN
                    </label>
                    {barcode.trim() && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {detectBarcodeType(barcode.trim())}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Contoh: 8996001414001"
                    className="w-full font-mono text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kode SKU
                  </label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Contoh: KPS-ES-01"
                    className="w-full font-mono text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs"
                >
                  Simpan Produk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
