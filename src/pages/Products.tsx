import React, { useState, useMemo, useRef } from 'react';
import { useStore } from '../store/useStore';
import type { Product } from '../types';
import { Plus, Edit2, AlertTriangle, Search, Filter, Package, Eye, EyeOff, Layers, ChevronDown, ChevronUp, Image as ImageIcon, MoreVertical, Trash2, Download, Upload, CheckSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

type TabKey = 'master' | 'stock';
type SortField = 'name' | 'category' | 'purchasePrice' | 'sellingPrice' | 'stock';
type SortDirection = 'asc' | 'desc';

const Products = () => {
  const { products, branches, branchStocks, currentUser, addProduct, updateProduct, addBranchStock, updateBranchStock } = useStore();

  const [activeTab, setActiveTab] = useState<TabKey>('master');
  const [isEditing, setIsEditing] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Partial<Product>>({ isActive: true });
  
  // Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // 'active', 'inactive', ''
  
  // Sorting
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  
  // Stock editing
  const [editingStockProductId, setEditingStockProductId] = useState<string | null>(null);
  const [stockInputs, setStockInputs] = useState<Record<string, { stock: number; minStock: number }>>({});

  const isOwner = currentUser?.role === 'owner';

  const categories = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
    return cats.sort();
  }, [products]);

  const processedProducts = useMemo(() => {
    let result = products;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q)));
    }
    if (categoryFilter) {
      result = result.filter(p => p.category === categoryFilter);
    }
    if (statusFilter) {
      const isActive = statusFilter === 'active';
      result = result.filter(p => p.isActive === isActive);
    }
    if (branchFilter && activeTab === 'stock') {
      const productIdsAtBranch = branchStocks.filter(bs => bs.branchId === branchFilter).map(bs => bs.productId);
      result = result.filter(p => productIdsAtBranch.includes(p.id));
    }

    result = [...result].sort((a, b) => {
      let valA: any = a[sortField as keyof Product];
      let valB: any = b[sortField as keyof Product];
      
      if (sortField === 'stock') {
        valA = branchStocks.filter(bs => bs.productId === a.id).reduce((sum, bs) => sum + bs.stock, 0);
        valB = branchStocks.filter(bs => bs.productId === b.id).reduce((sum, bs) => sum + bs.stock, 0);
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [products, searchQuery, categoryFilter, statusFilter, branchFilter, activeTab, branchStocks, sortField, sortDirection]);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return processedProducts.slice(start, start + itemsPerPage);
  }, [processedProducts, currentPage]);

  const totalPages = Math.max(1, Math.ceil(processedProducts.length / itemsPerPage));

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(paginatedProducts.map(p => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const productId = currentProduct.id || `p${Date.now()}`;
    
    if (currentProduct.id) {
      updateProduct({ ...currentProduct, id: currentProduct.id } as Product);
    } else {
      const newProduct: Product = {
        id: productId,
        sku: currentProduct.sku || '',
        name: currentProduct.name || '',
        category: currentProduct.category || '',
        purchasePrice: currentProduct.purchasePrice || 0,
        sellingPrice: currentProduct.sellingPrice || 0,
        unit: currentProduct.unit || 'pcs',
        imageUrl: currentProduct.imageUrl,
        barcode: currentProduct.barcode,
        isActive: currentProduct.isActive !== false,
        variants: currentProduct.variants,
      };
      addProduct(newProduct);

      branches.forEach(b => {
        addBranchStock({
          id: `bs_${productId}_${b.id}`,
          productId: productId,
          branchId: b.id,
          stock: 0,
          minStock: 5,
        });
      });
    }
    setIsEditing(false);
    setCurrentProduct({ isActive: true });
  };

  const handleSaveStocks = (productId: string) => {
    branches.forEach(b => {
      const key = `${productId}_${b.id}`;
      const input = stockInputs[key];
      if (!input) return;
      
      const existing = branchStocks.find(bs => bs.productId === productId && bs.branchId === b.id);
      if (existing) {
        updateBranchStock(existing.id, { stock: input.stock, minStock: input.minStock });
      } else {
        addBranchStock({
          id: `bs_${productId}_${b.id}`,
          productId,
          branchId: b.id,
          stock: input.stock,
          minStock: input.minStock,
        });
      }
    });
    setEditingStockProductId(null);
    setStockInputs({});
  };

  const startEditStock = (productId: string) => {
    const inputs: Record<string, { stock: number; minStock: number }> = {};
    branches.forEach(b => {
      const bs = branchStocks.find(s => s.productId === productId && s.branchId === b.id);
      inputs[`${productId}_${b.id}`] = { stock: bs?.stock || 0, minStock: bs?.minStock || 5 };
    });
    setStockInputs(inputs);
    setEditingStockProductId(productId);
  };

  // Fixed Margin Calculation: (Sell - Buy) / Sell * 100
  const getMargin = (buy: number, sell: number) => {
    if (sell === 0) return 0;
    return Math.round(((sell - buy) / sell) * 100);
  };

  const getStockStatus = (productId: string) => {
    const stocks = branchStocks.filter(bs => bs.productId === productId);
    const hasCritical = stocks.some(bs => bs.stock <= bs.minStock);
    const totalStock = stocks.reduce((sum, bs) => sum + bs.stock, 0);
    return { hasCritical, totalStock, stockEntries: stocks };
  };

  const handleBulkDelete = () => {
    if (window.confirm(`Yakin ingin menghapus ${selectedIds.length} produk?`)) {
      // Dummy logic for now, in a real app would call deleteProducts(selectedIds)
      alert(`Berhasil menghapus ${selectedIds.length} produk.`);
      setSelectedIds([]);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCurrentProduct(prev => ({ ...prev, imageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="p-4 md:p-8" onClick={() => setOpenActionMenuId(null)}>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-brand-dark">Manajemen Produk</h1>
          <p className="text-gray-500 mt-1">Kelola master produk dan stok per cabang</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="bg-white border border-gray-200 text-brand-dark px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-gray-50 font-semibold shadow-sm transition-colors">
            <Upload className="w-4 h-4" /> Import Excel
          </button>
          <button className="bg-white border border-gray-200 text-brand-dark px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-gray-50 font-semibold shadow-sm transition-colors">
            <Download className="w-4 h-4" /> Export Excel
          </button>
          {activeTab === 'master' && (
            <button 
              onClick={() => { setIsEditing(true); setCurrentProduct({ isActive: true }); }}
              className="bg-[#d4af37] hover:bg-[#c5a030] text-brand-dark px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors font-bold shadow-sm"
            >
              <Plus className="w-5 h-5" />
              Tambah Produk
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
          <button
            onClick={() => { setActiveTab('master'); setCurrentPage(1); }}
            className={clsx("flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors", activeTab === 'master' ? "bg-brand-dark text-[#d4af37]" : "text-gray-500 hover:text-brand-dark")}
          >
            <Package className="w-4 h-4" /> Master Produk
          </button>
          <button
            onClick={() => { setActiveTab('stock'); setCurrentPage(1); }}
            className={clsx("flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors", activeTab === 'stock' ? "bg-brand-dark text-[#d4af37]" : "text-gray-500 hover:text-brand-dark")}
          >
            <Layers className="w-4 h-4" /> Stok per Cabang
          </button>
        </div>
      </div>

      {/* Search, Filters & Bulk Actions */}
      <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            placeholder="Cari nama, SKU, atau barcode..."
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border-transparent rounded-lg focus:bg-white focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 outline-none transition-all"
          />
        </div>
        
        <select
          value={categoryFilter}
          onChange={e => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
          className="px-4 py-2 bg-gray-50 border border-transparent rounded-lg focus:bg-white focus:border-[#d4af37] outline-none cursor-pointer"
        >
          <option value="">Semua Kategori</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          className="px-4 py-2 bg-gray-50 border border-transparent rounded-lg focus:bg-white focus:border-[#d4af37] outline-none cursor-pointer"
        >
          <option value="">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>

        {activeTab === 'stock' && (
          <select
            value={branchFilter}
            onChange={e => { setBranchFilter(e.target.value); setCurrentPage(1); }}
            className="px-4 py-2 bg-gray-50 border border-transparent rounded-lg focus:bg-white focus:border-[#d4af37] outline-none cursor-pointer"
          >
            <option value="">Semua Cabang</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.length > 0 && activeTab === 'master' && (
        <div className="bg-brand-dark text-white px-4 py-3 rounded-xl mb-4 flex justify-between items-center shadow-lg animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3">
            <CheckSquare className="w-5 h-5 text-[#d4af37]" />
            <span className="font-bold">{selectedIds.length} produk terpilih</span>
          </div>
          <div className="flex gap-2">
            <button onClick={handleBulkDelete} className="px-3 py-1.5 bg-white/10 hover:bg-red-500/80 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Hapus
            </button>
          </div>
        </div>
      )}

      {/* Product Form Modal */}
      {isEditing && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8 animate-in zoom-in-95">
          <h2 className="text-xl font-bold mb-5 text-brand-dark">{currentProduct.id ? 'Edit Produk' : 'Produk Baru'}</h2>
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Image Upload */}
            <div className="md:col-span-3 flex items-start gap-4 mb-2">
              <div className="w-24 h-24 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden relative group cursor-pointer shrink-0 hover:bg-gray-100 transition-colors">
                {currentProduct.imageUrl ? (
                  <img src={currentProduct.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-8 h-8 text-gray-400" />
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Upload className="w-6 h-6 text-white" />
                </div>
                <input type="file" accept="image/*" onChange={handleImageChange} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
              <div className="pt-2">
                <p className="text-sm font-bold text-brand-dark mb-1">Foto Produk</p>
                <p className="text-xs text-gray-500 mb-2">Format yang didukung: JPG, PNG. Rekomendasi rasio 1:1.</p>
                {currentProduct.imageUrl && (
                  <button type="button" onClick={() => setCurrentProduct(prev => ({...prev, imageUrl: undefined}))} className="text-xs font-bold text-red-500 hover:text-red-600 px-3 py-1 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                    Hapus Foto
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Produk *</label>
              <input required type="text" value={currentProduct.name || ''} onChange={e => setCurrentProduct({...currentProduct, name: e.target.value})} className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-[#d4af37] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU *</label>
              <input required type="text" value={currentProduct.sku || ''} onChange={e => setCurrentProduct({...currentProduct, sku: e.target.value})} className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-[#d4af37] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kategori *</label>
              <input required type="text" value={currentProduct.category || ''} onChange={e => setCurrentProduct({...currentProduct, category: e.target.value})} className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-[#d4af37] outline-none" placeholder="Contoh: Makanan, Minuman..." list="cat-list" />
              <datalist id="cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Harga Beli *</label>
              <input required type="number" value={currentProduct.purchasePrice || ''} onChange={e => setCurrentProduct({...currentProduct, purchasePrice: Number(e.target.value)})} className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-[#d4af37] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Harga Jual *</label>
              <input required type="number" value={currentProduct.sellingPrice || ''} onChange={e => setCurrentProduct({...currentProduct, sellingPrice: Number(e.target.value)})} className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-[#d4af37] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Margin</label>
              <div className="p-2.5 border rounded-xl bg-gray-50 font-bold text-[#d4af37]">
                {getMargin(currentProduct.purchasePrice || 0, currentProduct.sellingPrice || 0)}%
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Satuan *</label>
              <input required type="text" value={currentProduct.unit || ''} onChange={e => setCurrentProduct({...currentProduct, unit: e.target.value})} className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-[#d4af37] outline-none" placeholder="pcs, kg, liter..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
              <input type="text" value={currentProduct.barcode || ''} onChange={e => setCurrentProduct({...currentProduct, barcode: e.target.value})} className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-[#d4af37] outline-none" placeholder="Opsional" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Varian</label>
              <input type="text" value={currentProduct.variants || ''} onChange={e => setCurrentProduct({...currentProduct, variants: e.target.value})} className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-[#d4af37] outline-none" placeholder="Contoh: Size S, M, L" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-3 cursor-pointer p-2.5">
                <input type="checkbox" checked={currentProduct.isActive !== false} onChange={e => setCurrentProduct({...currentProduct, isActive: e.target.checked})} className="w-5 h-5 accent-[#d4af37] rounded" />
                <span className="font-medium text-gray-700">Produk Aktif</span>
              </label>
            </div>
            
            <div className="md:col-span-3 flex justify-end gap-3 mt-2 border-t border-gray-100 pt-4">
              <button type="button" onClick={() => { setIsEditing(false); setCurrentProduct({ isActive: true }); }} className="px-6 py-2.5 border-2 border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 font-bold">Batal</button>
              <button type="submit" className="px-6 py-2.5 bg-[#d4af37] text-brand-dark rounded-xl hover:bg-[#c5a030] font-bold">Simpan</button>
            </div>
          </form>
        </div>
      )}

      {/* ============ TAB: MASTER PRODUK ============ */}
      {activeTab === 'master' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="p-4 w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-[#d4af37] focus:ring-[#d4af37]"
                      checked={selectedIds.length === paginatedProducts.length && paginatedProducts.length > 0}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th className="p-4 font-semibold cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('name')}>
                    Produk {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="p-4 font-semibold cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('category')}>
                    Kategori {sortField === 'category' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="p-4 font-semibold cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('purchasePrice')}>
                    Harga Beli {sortField === 'purchasePrice' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="p-4 font-semibold cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('sellingPrice')}>
                    Harga Jual {sortField === 'sellingPrice' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="p-4 font-semibold">Margin</th>
                  <th className="p-4 font-semibold cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('stock')}>
                    Total Stok {sortField === 'stock' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedProducts.map(product => {
                  const { hasCritical, totalStock, stockEntries } = getStockStatus(product.id);
                  const margin = getMargin(product.purchasePrice, product.sellingPrice);
                  const isExpanded = expandedProductId === product.id;
                  const isSelected = selectedIds.includes(product.id);
                  const isMenuOpen = openActionMenuId === product.id;
                  
                  return (
                    <React.Fragment key={product.id}>
                      <tr className={clsx(
                        "hover:bg-gray-50 transition-colors", 
                        !product.isActive && "opacity-60",
                        isSelected && "bg-amber-50/50"
                      )}>
                        <td className="p-4 text-center">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded border-gray-300 text-[#d4af37] focus:ring-[#d4af37]"
                            checked={isSelected}
                            onChange={() => toggleSelect(product.id)}
                          />
                        </td>
                        <td className="p-4 cursor-pointer" onClick={() => setExpandedProductId(isExpanded ? null : product.id)}>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 shrink-0 overflow-hidden">
                              {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5" />}
                            </div>
                            <div>
                              <div className="font-bold text-brand-dark flex items-center gap-2">
                                {product.name}
                                {hasCritical && (
                                  <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-bold flex items-center gap-1 border border-red-200">
                                    <AlertTriangle className="w-2.5 h-2.5" /> KRITIS
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">{product.sku}{product.barcode ? ` · ${product.barcode}` : ''}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 cursor-pointer" onClick={() => setExpandedProductId(isExpanded ? null : product.id)}>
                          <span className="px-2.5 py-1 bg-gray-100 rounded-md text-xs font-semibold text-gray-600 border border-gray-200">{product.category || '-'}</span>
                        </td>
                        <td className="p-4 text-sm text-gray-600">Rp {product.purchasePrice.toLocaleString('id-ID')}</td>
                        <td className="p-4 text-sm font-bold text-brand-dark">Rp {product.sellingPrice.toLocaleString('id-ID')}</td>
                        <td className="p-4">
                          <span className={clsx("text-sm font-bold px-2 py-1 rounded-md", margin >= 30 ? "bg-green-100 text-green-700" : margin >= 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700")}>
                            {margin}%
                          </span>
                        </td>
                        <td className="p-4 cursor-pointer" onClick={() => setExpandedProductId(isExpanded ? null : product.id)}>
                          <div className="flex items-center gap-2">
                            <span className={clsx("font-bold text-lg", hasCritical ? "text-red-600" : "text-brand-dark")}>{totalStock}</span>
                            <span className="text-xs text-gray-500">{product.unit}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          {product.isActive ? (
                            <span className="px-2.5 py-1 bg-green-50 text-green-700 rounded-md text-xs font-bold border border-green-200 flex items-center gap-1 w-fit"><Eye className="w-3 h-3" /> Aktif</span>
                          ) : (
                            <span className="px-2.5 py-1 bg-gray-50 text-gray-500 rounded-md text-xs font-bold border border-gray-200 flex items-center gap-1 w-fit"><EyeOff className="w-3 h-3" /> Nonaktif</span>
                          )}
                        </td>
                        <td className="p-4 text-right relative">
                          <div className="flex justify-end gap-1 items-center">
                            <button 
                              onClick={() => setExpandedProductId(isExpanded ? null : product.id)}
                              className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setOpenActionMenuId(isMenuOpen ? null : product.id); }}
                              className={clsx("p-1.5 rounded-lg transition-colors", isMenuOpen ? "bg-gray-200 text-brand-dark" : "text-gray-400 hover:bg-gray-100")}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>
                          
                          {/* Action Menu Dropdown */}
                          {isMenuOpen && (
                            <div className="absolute right-8 top-10 bg-white border border-gray-200 shadow-lg rounded-xl overflow-hidden z-10 min-w-[140px] animate-in slide-in-from-top-2">
                              <button 
                                onClick={(e) => { e.stopPropagation(); setIsEditing(true); setCurrentProduct(product); setOpenActionMenuId(null); }}
                                className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <Edit2 className="w-4 h-4 text-[#d4af37]" /> Edit Detail
                              </button>
                              <div className="h-px bg-gray-100"></div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); alert('Hapus belum diimplementasi'); setOpenActionMenuId(null); }}
                                className="w-full text-left px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2"
                              >
                                <Trash2 className="w-4 h-4" /> Hapus
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      
                      {/* Expanded: Stock per Branch */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="bg-slate-50/80 px-8 py-5 border-b border-gray-200">
                            <div className="flex items-center justify-between mb-4">
                              <p className="text-sm font-bold text-brand-dark flex items-center gap-2">
                                <Layers className="w-4 h-4 text-[#d4af37]" /> Distribusi Stok: {product.name}
                              </p>
                              {editingStockProductId !== product.id ? (
                                <button onClick={() => startEditStock(product.id)} className="text-sm font-bold text-white bg-brand-dark hover:bg-slate-800 px-3 py-1.5 rounded-lg transition-colors">Edit Stok Cabang</button>
                              ) : (
                                <div className="flex gap-2">
                                  <button onClick={() => setEditingStockProductId(null)} className="text-sm font-bold text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">Batal</button>
                                  <button onClick={() => handleSaveStocks(product.id)} className="text-sm font-bold text-brand-dark bg-[#d4af37] hover:bg-[#c5a030] px-3 py-1.5 rounded-lg transition-colors">Simpan Stok</button>
                                </div>
                              )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                              {branches.map(b => {
                                const bs = stockEntries.find(s => s.branchId === b.id);
                                const key = `${product.id}_${b.id}`;
                                const isEditingThis = editingStockProductId === product.id;
                                const isLow = (bs?.stock || 0) <= (bs?.minStock || 0);
                                
                                return (
                                  <div key={b.id} className={clsx("bg-white rounded-xl p-4 border shadow-sm", isLow ? "border-red-200 bg-red-50/30" : "border-gray-200")}>
                                    <p className="font-bold text-sm text-brand-dark mb-3 pb-2 border-b border-gray-100">{b.name}</p>
                                    {isEditingThis ? (
                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Stok Fisik</label>
                                          <input type="number" value={stockInputs[key]?.stock ?? 0} onChange={e => setStockInputs({...stockInputs, [key]: { ...stockInputs[key], stock: Number(e.target.value) }})} className="w-full p-2 border border-gray-300 rounded-lg text-sm font-bold focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] outline-none" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Batas Min</label>
                                          <input type="number" value={stockInputs[key]?.minStock ?? 5} onChange={e => setStockInputs({...stockInputs, [key]: { ...stockInputs[key], minStock: Number(e.target.value) }})} className="w-full p-2 border border-gray-300 rounded-lg text-sm font-bold focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] outline-none" />
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex justify-between items-end">
                                        <div>
                                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Total Stok</p>
                                          <p className={clsx("text-2xl font-black leading-none", isLow ? "text-red-600" : "text-brand-dark")}>{bs?.stock ?? 0}</p>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Min. Stok</p>
                                          <p className="text-sm font-bold text-gray-600">{bs?.minStock ?? 0}</p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {paginatedProducts.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-16 text-center">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Package className="w-8 h-8 text-gray-400" />
                      </div>
                      <p className="text-gray-500 font-medium">Tidak ada produk ditemukan</p>
                      <p className="text-sm text-gray-400 mt-1">Coba ubah filter atau kata kunci pencarian</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {processedProducts.length > 0 && (
            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
              <span className="text-sm text-gray-500">
                Menampilkan <span className="font-bold text-brand-dark">{(currentPage - 1) * itemsPerPage + 1}</span> hingga <span className="font-bold text-brand-dark">{Math.min(currentPage * itemsPerPage, processedProducts.length)}</span> dari <span className="font-bold text-brand-dark">{processedProducts.length}</span> entri
              </span>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed bg-white"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button 
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={clsx("w-8 h-8 rounded-lg text-sm font-bold transition-colors", currentPage === i + 1 ? "bg-brand-dark text-[#d4af37]" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100")}
                  >
                    {i + 1}
                  </button>
                ))}
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed bg-white"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============ TAB: STOK PER CABANG ============ */}
      {activeTab === 'stock' && (
        <div className="space-y-4">
          {paginatedProducts.map(product => {
            const relevantStocks = branchStocks.filter(bs => bs.productId === product.id && (!branchFilter || bs.branchId === branchFilter));
            if (relevantStocks.length === 0 && branchFilter) return null;
            
            return (
              <div key={product.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between p-5 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 shrink-0">
                      {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover rounded-xl" /> : <ImageIcon className="w-6 h-6" />}
                    </div>
                    <div>
                      <span className="font-bold text-lg text-brand-dark">{product.name}</span>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs font-semibold text-gray-500 bg-gray-200 px-2 py-0.5 rounded-md">{product.sku}</span>
                        <span className="text-xs font-semibold text-[#d4af37] bg-[#d4af37]/10 px-2 py-0.5 rounded-md">{product.category}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-gray-500 block mb-1">Harga Jual</span>
                    <span className="text-xl font-black text-brand-dark">Rp {product.sellingPrice.toLocaleString('id-ID')}</span>
                  </div>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    {(branchFilter ? relevantStocks : branches.map(b => {
                      const bs = branchStocks.find(s => s.productId === product.id && s.branchId === b.id);
                      return bs || { id: `temp_${product.id}_${b.id}`, productId: product.id, branchId: b.id, stock: 0, minStock: 0 };
                    })).map(bs => {
                      const branch = branches.find(b => b.id === bs.branchId);
                      const isLow = bs.stock <= bs.minStock;
                      return (
                        <div key={bs.id} className={clsx("p-4 rounded-xl border relative overflow-hidden", isLow ? "bg-red-50 border-red-200" : "bg-white border-gray-200 shadow-sm")}>
                          {isLow && <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>}
                          <p className="text-xs font-bold text-gray-500 mb-2 truncate uppercase tracking-wider">{branch?.name || 'Cabang'}</p>
                          <p className={clsx("text-3xl font-black", isLow ? "text-red-600" : "text-brand-dark")}>{bs.stock}</p>
                          <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wider">Min. {bs.minStock}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
          {paginatedProducts.length === 0 && (
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-16 text-center">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <Layers className="w-10 h-10 text-gray-300" />
              </div>
              <p className="text-gray-500 font-medium text-lg">Tidak ada data stok</p>
              <p className="text-sm text-gray-400 mt-2">Pilih cabang lain atau reset filter pencarian</p>
            </div>
          )}
          
          {/* Pagination for Stock tab */}
          {processedProducts.length > 0 && (
            <div className="flex justify-center mt-6">
              <div className="flex items-center gap-1 bg-white p-2 rounded-xl shadow-sm border border-gray-100">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="px-4 font-bold text-brand-dark">Hal {currentPage} / {totalPages}</span>
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Products;
