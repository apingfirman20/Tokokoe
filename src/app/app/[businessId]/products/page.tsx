'use client';

import React, { useState } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { useAuth } from '@/context/AuthContext';
import { Product } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { hasPermission } from '@/lib/permissions';
import { validateProductBarcode, checkDuplicateBarcode, detectBarcodeType } from '@/lib/validation/barcode';
import { 
  Package, Plus, Search, Edit2, Archive, CheckCircle2, 
  X, AlertTriangle, Coffee, Smartphone, ShoppingBag, AlertCircle, Loader2, RotateCcw,
  ChevronDown, Tag, FolderPlus
} from 'lucide-react';

export default function ProductsPage() {
  const { products, activeBusiness, createProduct, updateProduct, archiveProduct } = useBusiness();
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Makanan');
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [costPrice, setCostPrice] = useState<number>(0);
  const [stockQty, setStockQty] = useState<number>(10);
  const [barcode, setBarcode] = useState('');
  const [sku, setSku] = useState('');
  const [modalError, setModalError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Category management & inline creation state
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showAddCategoryInline, setShowAddCategoryInline] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [categoryInputError, setCategoryInputError] = useState('');
  const [categorySuccessMsg, setCategorySuccessMsg] = useState('');
  const [showManageCategoryModal, setShowManageCategoryModal] = useState(false);
  const [manageCategoryInput, setManageCategoryInput] = useState('');

  // Load custom categories from localStorage for the active business
  React.useEffect(() => {
    if (activeBusiness?.id) {
      try {
        const saved = localStorage.getItem(`tokokoe_categories_${activeBusiness.id}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setCustomCategories(parsed);
          }
        }
      } catch (e) {
        console.error('Error loading custom categories', e);
      }
    }
  }, [activeBusiness?.id]);

  // Default preset categories based on business type
  const defaultCategories = React.useMemo(() => {
    if (activeBusiness?.businessType === 'phone') {
      return ['Smartphone', 'Aksesoris', 'Sparepart', 'Tablet', 'Audio & Wearable', 'Second / Bekas'];
    }
    if (activeBusiness?.businessType === 'retail') {
      return ['Makanan', 'Minuman', 'Makanan Ringan', 'Sembako', 'Perawatan Diri', 'Kebutuhan Rumah', 'Alat Tulis'];
    }
    // F&B Default:
    return ['Makanan', 'Minuman', 'Dessert', 'Coffee Base', 'Non-Coffee', 'Signature', 'Pastry & Bakery', 'Makanan Berat', 'Snack'];
  }, [activeBusiness?.businessType]);

  // Combined unique categories: Makanan, Minuman, Dessert prioritized first for F&B
  const allAvailableCategories = React.useMemo(() => {
    const set = new Set<string>();
    if (activeBusiness?.businessType !== 'phone') {
      set.add('Makanan');
      set.add('Minuman');
      set.add('Dessert');
    }
    defaultCategories.forEach(c => set.add(c));
    customCategories.forEach(c => set.add(c));
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [defaultCategories, customCategories, products, activeBusiness?.businessType]);

  const filterCategories = ['Semua', ...allAvailableCategories];

  const handleAddNewCategory = (catName?: string) => {
    const nameToSave = (catName !== undefined ? catName : newCategoryInput).trim();
    if (!nameToSave) {
      setCategoryInputError('Nama kategori wajib diisi.');
      return;
    }

    const existing = allAvailableCategories.find(c => c.toLowerCase() === nameToSave.toLowerCase());
    if (existing) {
      setCategory(existing);
      setShowAddCategoryInline(false);
      setNewCategoryInput('');
      setCategoryInputError('');
      setCategorySuccessMsg(`Kategori "${existing}" dipilih.`);
      setTimeout(() => setCategorySuccessMsg(''), 3000);
      return;
    }

    const updated = [...customCategories, nameToSave];
    setCustomCategories(updated);
    if (activeBusiness?.id) {
      try {
        localStorage.setItem(`tokokoe_categories_${activeBusiness.id}`, JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving categories', e);
      }
    }
    setCategory(nameToSave);
    setShowAddCategoryInline(false);
    setNewCategoryInput('');
    setCategoryInputError('');
    setCategorySuccessMsg(`✓ Kategori "${nameToSave}" berhasil ditambahkan & dipilih!`);
    setTimeout(() => setCategorySuccessMsg(''), 3000);
  };

  const handleAddCategoryFromManager = () => {
    const clean = manageCategoryInput.trim();
    if (!clean) return;
    if (!allAvailableCategories.some(c => c.toLowerCase() === clean.toLowerCase())) {
      const updated = [...customCategories, clean];
      setCustomCategories(updated);
      if (activeBusiness?.id) {
        try {
          localStorage.setItem(`tokokoe_categories_${activeBusiness.id}`, JSON.stringify(updated));
        } catch (e) {
          console.error('Error saving categories', e);
        }
      }
    }
    setManageCategoryInput('');
  };

  const canViewCostPrice = hasPermission(user?.memberRole || 'owner', 'products.cost.read', user?.permissions);
  const canCreate = hasPermission(user?.memberRole || 'owner', 'products.create', user?.permissions);
  const canEdit = hasPermission(user?.memberRole || 'owner', 'products.update', user?.permissions);
  const canArchive = hasPermission(user?.memberRole || 'owner', 'products.delete', user?.permissions);

  const filtered = products.filter(p => {
    // Status Filter (active vs archived)
    if (statusFilter === 'active' && p.isActive === false) return false;
    if (statusFilter === 'archived' && p.isActive !== false) return false;

    const matchCat = selectedCategory === 'Semua' || p.category === selectedCategory;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode && p.barcode.includes(search)) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setName('');
    setCategory(activeBusiness?.businessType === 'phone' ? 'Smartphone' : 'Makanan');
    setSellingPrice(20000);
    setCostPrice(10000);
    setStockQty(20);
    setBarcode('');
    setSku('');
    setModalError('');
    setShowAddCategoryInline(false);
    setNewCategoryInput('');
    setCategoryInputError('');
    setCategorySuccessMsg('');
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

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    const cleanName = name.trim();
    if (!cleanName) {
      setModalError('Nama produk wajib diisi.');
      return;
    }

    // 1. Validate integer Rupiah and non-negative values
    if (!Number.isInteger(sellingPrice) || sellingPrice < 0) {
      setModalError('Harga jual harus berupa nominal Rupiah bulat dan tidak boleh negatif.');
      return;
    }
    if (!Number.isInteger(costPrice) || costPrice < 0) {
      setModalError('HPP harus berupa nominal Rupiah bulat dan tidak boleh negatif.');
      return;
    }
    if (!Number.isInteger(stockQty) || stockQty < 0) {
      setModalError('Jumlah stok harus berupa bilangan bulat dan tidak boleh negatif.');
      return;
    }

    const cleanBarcode = barcode.trim();
    if (cleanBarcode) {
      // Check duplicate barcode within current business
      const duplicate = checkDuplicateBarcode(products, cleanBarcode, editingProduct?.id);
      if (duplicate.isDuplicate && duplicate.conflictingProduct) {
        setModalError(`Barcode "${cleanBarcode}" sudah digunakan oleh produk lain ("${duplicate.conflictingProduct.name}").`);
        return;
      }

      // Validate format (accepts EAN-13, EAN-8, or internal alphanumeric)
      const val = validateProductBarcode(cleanBarcode);
      if (!val.valid) {
        setModalError(val.error || 'Format barcode tidak valid.');
        return;
      }
    }

    const cleanSku = sku.trim();

    setIsSaving(true);
    try {
      if (editingProduct) {
        // Explicitly clear barcode / SKU by passing null if cleared by user
        const res = await updateProduct(editingProduct.id, {
          name: cleanName,
          category: category.trim() || 'Umum',
          sellingPrice,
          costPrice: canViewCostPrice ? costPrice : editingProduct.costPrice,
          stockQty,
          barcode: cleanBarcode ? cleanBarcode : '',
          sku: cleanSku ? cleanSku : '',
        });

        if (!res.success) {
          setModalError(res.error || 'Gagal memperbarui data produk.');
          setIsSaving(false);
          return;
        }

        setActionFeedback(`✓ Produk "${cleanName}" berhasil diperbarui.`);
      } else {
        const res = await createProduct({
          name: cleanName,
          category: category.trim() || 'Umum',
          sellingPrice,
          costPrice: canViewCostPrice ? costPrice : 0,
          stockQty,
          barcode: cleanBarcode || undefined,
          sku: cleanSku || undefined,
          trackStock: true,
          available: true,
        });

        if (!res.success) {
          setModalError(res.error || 'Gagal menambahkan produk baru.');
          setIsSaving(false);
          return;
        }

        setActionFeedback(`✓ Produk "${cleanName}" berhasil ditambahkan.`);
      }

      setTimeout(() => setActionFeedback(null), 3000);
      setShowAddModal(false);
    } catch (err: any) {
      setModalError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async (p: Product) => {
    if (!confirm(`Apakah Anda yakin ingin menonaktifkan/mengarsipkan produk "${p.name}"? Produk ini tidak akan dapat dijual di POS, namun riwayat transaksi tetap aman.`)) {
      return;
    }

    try {
      const res = await archiveProduct(p.id);
      if (res.success) {
        setActionFeedback(`✓ Produk "${p.name}" berhasil diarsipkan.`);
        setTimeout(() => setActionFeedback(null), 3000);
      } else {
        alert(res.error || 'Gagal mengarsipkan produk.');
      }
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan sistem.');
    }
  };

  const handleReactivate = async (p: Product) => {
    try {
      const res = await updateProduct(p.id, { isActive: true, available: true });
      if (res.success) {
        setActionFeedback(`✓ Produk "${p.name}" berhasil diaktifkan kembali.`);
        setTimeout(() => setActionFeedback(null), 3000);
      } else {
        alert(res.error || 'Gagal mengaktifkan produk.');
      }
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan sistem.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Katalog Produk & Menu
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kelola daftar produk, harga jual, barcode, dan kuantitas inventaris ({products.length} total produk)
          </p>
        </div>

        {canCreate && (
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-sm transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tambah Produk Baru</span>
          </button>
        )}
      </div>

      {actionFeedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{actionFeedback}</span>
        </div>
      )}

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

        {/* Status Tab (Aktif vs Diarsipkan) */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'active' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Aktif
          </button>
          <button
            onClick={() => setStatusFilter('archived')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'archived' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Diarsipkan
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'all' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua
          </button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {filterCategories.map((c) => (
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
          <button
            onClick={() => setShowManageCategoryModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200/80 hover:bg-teal-100 transition-colors whitespace-nowrap shrink-0 ml-1"
            title="Kelola & Tambah Kategori Produk"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Kategori</span>
          </button>
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
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Tidak ada produk ditemukan sesuai filter.
                  </td>
                </tr>
              ) : (
                filtered.map((prod) => (
                  <tr key={prod.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div>{prod.name}</div>
                      {prod.isActive === false && (
                        <span className="text-[10px] text-rose-600 italic">Diarsipkan (tidak dijual)</span>
                      )}
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
                      {prod.isActive !== false ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Aktif
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-300">
                          Arsip
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {canEdit && (
                          <button
                            onClick={() => handleOpenEdit(prod)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-slate-100 transition-colors"
                            title="Edit Produk"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canArchive && (
                          prod.isActive !== false ? (
                            <button
                              onClick={() => handleArchive(prod)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Arsipkan / Nonaktifkan Produk"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReactivate(prod)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                              title="Aktifkan Kembali Produk"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
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
              <button 
                onClick={() => setShowAddModal(false)} 
                disabled={isSaving}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
              >
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

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Kategori Produk <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddCategoryInline(!showAddCategoryInline);
                      setCategoryInputError('');
                    }}
                    className="text-[11px] font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 hover:underline"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ Tambah Kategori Baru</span>
                  </button>
                </div>

                {/* Dropdown Selector */}
                <div className="relative">
                  <select
                    value={category}
                    onChange={(e) => {
                      if (e.target.value === '__add_new__') {
                        setShowAddCategoryInline(true);
                      } else {
                        setCategory(e.target.value);
                      }
                    }}
                    className="w-full text-xs p-2.5 pr-8 rounded-xl border border-slate-300 bg-white outline-none focus:border-teal-500 font-semibold text-slate-800 appearance-none cursor-pointer shadow-2xs"
                  >
                    {activeBusiness?.businessType !== 'phone' && (
                      <optgroup label="Pilihan Utama">
                        <option value="Makanan">Makanan</option>
                        <option value="Minuman">Minuman</option>
                        <option value="Dessert">Dessert</option>
                      </optgroup>
                    )}
                    <optgroup label="Daftar Kategori Tersedia">
                      {allAvailableCategories
                        .filter(c => activeBusiness?.businessType === 'phone' || !['Makanan', 'Minuman', 'Dessert'].includes(c))
                        .map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </optgroup>
                    <option value="__add_new__" className="text-teal-700 font-bold bg-teal-50">
                      ➕ Tambah Kategori Baru...
                    </option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Quick 1-click pills for Makanan, Minuman, Dessert */}
                {activeBusiness?.businessType !== 'phone' && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                    <span className="text-[10px] text-slate-400 font-medium">Pilih cepat:</span>
                    {['Makanan', 'Minuman', 'Dessert'].map((quickCat) => (
                      <button
                        key={quickCat}
                        type="button"
                        onClick={() => setCategory(quickCat)}
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all ${
                          category === quickCat
                            ? 'bg-teal-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {quickCat}
                      </button>
                    ))}
                  </div>
                )}

                {categorySuccessMsg && (
                  <p className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{categorySuccessMsg}</span>
                  </p>
                )}

                {/* Inline Drawer to Add Category */}
                {showAddCategoryInline && (
                  <div className="p-3 bg-teal-50/70 border border-teal-200/80 rounded-xl space-y-2 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-teal-700" />
                        <span>Kategori Baru</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddCategoryInline(false);
                          setNewCategoryInput('');
                          setCategoryInputError('');
                        }}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCategoryInput}
                        onChange={(e) => {
                          setNewCategoryInput(e.target.value);
                          setCategoryInputError('');
                        }}
                        placeholder="Contoh: Mocktail, Seafood, Roti..."
                        className="flex-1 text-xs p-2 rounded-lg border border-teal-300 bg-white outline-none focus:ring-1 focus:ring-teal-500 font-medium"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddNewCategory();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleAddNewCategory()}
                        className="px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shrink-0 shadow-xs transition-colors"
                      >
                        Simpan
                      </button>
                    </div>

                    {categoryInputError && (
                      <p className="text-[11px] text-rose-600 font-medium">{categoryInputError}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500 pt-0.5">
                      <span className="text-slate-400">Saran:</span>
                      {['Makanan', 'Minuman', 'Dessert', 'Snack', 'Coffee Base', 'Pastry & Bakery', 'Paket Hemat'].map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => handleAddNewCategory(sug)}
                          className="px-2 py-0.5 rounded bg-white border border-teal-200/60 text-teal-800 hover:bg-teal-100 font-medium transition-colors"
                        >
                          + {sug}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jumlah Stok
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={stockQty}
                  onChange={(e) => setStockQty(Math.floor(Number(e.target.value)))}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Harga Jual (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(Math.floor(Number(e.target.value)))}
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
                      min="0"
                      step="1"
                      value={costPrice}
                      onChange={(e) => setCostPrice(Math.floor(Number(e.target.value)))}
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
                    placeholder="Kosongkan jika tidak ada barcode"
                    className="w-full font-mono text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Hapus teks untuk mengosongkan barcode</span>
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
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Hapus teks untuk mengosongkan SKU</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSaving ? 'Menyimpan ke Server...' : 'Simpan Produk'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Manage Categories Modal */}
      {showManageCategoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-teal-600" />
                <h3 className="font-bold text-base text-slate-900">Kelola Kategori Produk</h3>
              </div>
              <button 
                onClick={() => setShowManageCategoryModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tambah Kategori Baru
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manageCategoryInput}
                    onChange={(e) => setManageCategoryInput(e.target.value)}
                    placeholder="Contoh: Makanan, Minuman, Dessert..."
                    className="flex-1 text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-teal-500 font-medium"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCategoryFromManager();
                      }
                    }}
                  />
                  <button
                    onClick={handleAddCategoryFromManager}
                    className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0"
                  >
                    + Tambah
                  </button>
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-500 block mb-2">
                  Daftar Kategori Aktif ({allAvailableCategories.length}):
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto p-1">
                  {allAvailableCategories.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-800 text-xs font-semibold border border-slate-200/60"
                    >
                      <Tag className="w-3 h-3 text-teal-600" />
                      <span>{cat}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setShowManageCategoryModal(false)}
                  className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
