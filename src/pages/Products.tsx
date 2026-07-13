import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import type { Product } from '../types';
import { Plus, Edit2, AlertTriangle, Trash2 } from 'lucide-react';

const Products = () => {
  const { products, branches, currentUser, addProduct, updateProduct } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Partial<Product>>({});

  // If admin, only show products for their branch. Owner sees all.
  const isOwner = currentUser?.role === 'owner';
  const displayedProducts = isOwner 
    ? products 
    : products.filter(p => p.branchId === currentUser?.branchId);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentProduct.id) {
      updateProduct(currentProduct as Product);
    } else {
      addProduct({
        ...currentProduct,
        id: `p${Date.now()}`,
        branchId: currentProduct.branchId || currentUser?.branchId || branches[0].id,
      } as Product);
    }
    setIsEditing(false);
    setCurrentProduct({});
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-brand-dark">Manajemen Produk</h1>
          <p className="text-gray-500 mt-1">Kelola daftar produk dan stok</p>
        </div>
        <button 
          onClick={() => { setIsEditing(true); setCurrentProduct({}); }}
          className="bg-brand-green hover:bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Tambah Produk
        </button>
      </div>

      {isEditing && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
          <h2 className="text-xl font-bold mb-4">{currentProduct.id ? 'Edit Produk' : 'Produk Baru'}</h2>
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Produk</label>
              <input required type="text" value={currentProduct.name || ''} onChange={e => setCurrentProduct({...currentProduct, name: e.target.value})} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-green outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
              <input required type="text" value={currentProduct.sku || ''} onChange={e => setCurrentProduct({...currentProduct, sku: e.target.value})} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-green outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Harga Beli</label>
              <input required type="number" value={currentProduct.purchasePrice || ''} onChange={e => setCurrentProduct({...currentProduct, purchasePrice: Number(e.target.value)})} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-green outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Harga Jual</label>
              <input required type="number" value={currentProduct.sellingPrice || ''} onChange={e => setCurrentProduct({...currentProduct, sellingPrice: Number(e.target.value)})} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-green outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stok Saat Ini</label>
              <input required type="number" value={currentProduct.stock || ''} onChange={e => setCurrentProduct({...currentProduct, stock: Number(e.target.value)})} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-green outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Batas Minimum Stok</label>
              <input required type="number" value={currentProduct.minStock || ''} onChange={e => setCurrentProduct({...currentProduct, minStock: Number(e.target.value)})} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-green outline-none" />
            </div>
            {isOwner && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cabang</label>
                <select required value={currentProduct.branchId || ''} onChange={e => setCurrentProduct({...currentProduct, branchId: e.target.value})} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-green outline-none">
                  <option value="">Pilih Cabang...</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            
            <div className="md:col-span-2 flex justify-end gap-3 mt-4">
              <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Batal</button>
              <button type="submit" className="px-4 py-2 bg-brand-green text-white rounded-lg hover:bg-green-600">Simpan</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-sm text-gray-500 uppercase tracking-wider">
              <th className="p-4 font-medium">SKU / Nama</th>
              <th className="p-4 font-medium">Kategori</th>
              <th className="p-4 font-medium">Harga Jual</th>
              <th className="p-4 font-medium">Stok</th>
              {isOwner && <th className="p-4 font-medium">Cabang</th>}
              <th className="p-4 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayedProducts.map(product => {
              const isLowStock = product.stock <= product.minStock;
              return (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4">
                    <div className="font-semibold text-brand-dark">{product.name}</div>
                    <div className="text-xs text-gray-500">{product.sku}</div>
                  </td>
                  <td className="p-4 text-gray-600">{product.category || '-'}</td>
                  <td className="p-4 font-medium text-brand-dark">Rp {product.sellingPrice.toLocaleString('id-ID')}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${isLowStock ? 'text-red-500' : 'text-gray-700'}`}>
                        {product.stock} {product.unit}
                      </span>
                      {isLowStock && (
                        <div className="px-2 py-1 bg-red-100 text-red-600 rounded-full text-xs flex items-center gap-1" title="Stok Menipis!">
                          <AlertTriangle className="w-3 h-3" />
                          Low
                        </div>
                      )}
                    </div>
                  </td>
                  {isOwner && (
                    <td className="p-4 text-gray-600 text-sm">
                      {branches.find(b => b.id === product.branchId)?.name}
                    </td>
                  )}
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => { setIsEditing(true); setCurrentProduct(product); }}
                      className="p-2 text-brand-orange hover:bg-orange-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {displayedProducts.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500">
                  Tidak ada data produk.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Products;
