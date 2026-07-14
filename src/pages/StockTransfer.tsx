import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { ArrowRightLeft, Camera, Check, X } from 'lucide-react';
import type { StockTransfer } from '../types';

const StockTransferPage = () => {
  const { currentUser, branches, products, branchStocks, stockTransfers, addStockTransfer, updateStockTransfer } = useStore();
  const [showModal, setShowModal] = useState(false);
  
  const [toBranchId, setToBranchId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [rejectionReason, setRejectionReason] = useState('');

  // Transfer filtering
  const relevantTransfers = stockTransfers.filter(t => 
    currentUser?.role === 'owner' || t.fromBranchId === currentUser?.branchId || t.toBranchId === currentUser?.branchId
  );

  const availableProductIds = branchStocks.filter(bs => bs.branchId === currentUser?.branchId && bs.stock > 0).map(bs => bs.productId);
  const availableProducts = products.filter(p => availableProductIds.includes(p.id));

  const handleCreateTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.branchId) return alert('Anda tidak terdaftar di cabang tertentu.');
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    const bs = branchStocks.find(s => s.productId === selectedProductId && s.branchId === currentUser?.branchId);
    if (quantity > (bs?.stock || 0)) {
      return alert('Stok tidak mencukupi untuk transfer.');
    }

    const newTransfer: StockTransfer = {
      id: `trx-${Date.now()}`,
      fromBranchId: currentUser.branchId,
      toBranchId: toBranchId,
      items: [{ productId: product.id, name: product.name, quantity }],
      status: 'pending',
      sentByUserId: currentUser.id,
      date: new Date().toISOString()
    };
    
    addStockTransfer(newTransfer);
    setShowModal(false);
  };

  const simulateCameraApproval = (transferId: string) => {
    // In a real app, this would open device camera, upload to storage, and return URL.
    if(window.confirm('Ambil foto bukti terima barang? (Simulasi)')) {
      updateStockTransfer(transferId, { 
        status: 'approved', 
        receivedByUserId: currentUser?.id,
        photoEvidenceUrl: 'https://via.placeholder.com/150/22c55e/ffffff?text=Bukti+Terima'
      });
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-brand-dark">Transfer Stok</h1>
          <p className="text-gray-500 mt-1">Kirim dan terima barang antar cabang</p>
        </div>
        {currentUser?.role !== 'owner' && (
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-brand-green text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors"
          >
            <ArrowRightLeft className="w-5 h-5" />
            Kirim Barang
          </button>
        )}
      </div>

      <div className="space-y-4">
        {relevantTransfers.map(t => {
          const fromBranch = branches.find(b => b.id === t.fromBranchId)?.name;
          const toBranch = branches.find(b => b.id === t.toBranchId)?.name;
          const isReceiver = currentUser?.branchId === t.toBranchId;
          const isSender = currentUser?.branchId === t.fromBranchId;

          return (
            <div key={t.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className={`px-2 py-1 text-xs font-bold uppercase rounded-md ${
                    t.status === 'pending' ? 'bg-orange-100 text-orange-600' :
                    t.status === 'approved' ? 'bg-green-100 text-green-600' :
                    'bg-red-100 text-red-600'
                  }`}>{t.status}</span>
                  <span className="text-sm text-gray-400">{new Date(t.date).toLocaleString('id-ID')}</span>
                </div>
                <h3 className="font-bold text-lg mb-1">{t.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}</h3>
                <p className="text-gray-500">
                  <span className="font-medium text-brand-dark">{fromBranch}</span> &rarr; <span className="font-medium text-brand-dark">{toBranch}</span>
                </p>
              </div>

              <div className="flex gap-2">
                {t.status === 'pending' && isReceiver && (
                  <>
                    <button onClick={() => simulateCameraApproval(t.id)} className="flex items-center gap-2 bg-brand-green text-white px-4 py-2 rounded-lg hover:bg-green-600 text-sm">
                      <Camera className="w-4 h-4" /> Terima
                    </button>
                    <button onClick={() => {
                      const reason = prompt('Alasan penolakan?');
                      if (reason) updateStockTransfer(t.id, { status: 'rejected', rejectionReason: reason, receivedByUserId: currentUser?.id });
                    }} className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 text-sm">
                      <X className="w-4 h-4" /> Tolak
                    </button>
                  </>
                )}
                {t.status === 'pending' && isSender && (
                  <button onClick={() => updateStockTransfer(t.id, { status: 'cancelled' })} className="text-red-500 hover:underline text-sm px-4">
                    Batalkan Pengiriman
                  </button>
                )}
                {t.photoEvidenceUrl && (
                  <img src={t.photoEvidenceUrl} alt="Bukti" className="w-12 h-12 rounded border object-cover" />
                )}
              </div>
            </div>
          )
        })}
        {relevantTransfers.length === 0 && (
          <div className="text-center text-gray-500 py-10 bg-white rounded-xl border border-gray-100">
            Belum ada riwayat transfer stok.
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-4">Kirim Stok</h3>
            <form onSubmit={handleCreateTransfer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Produk</label>
                <select required value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-green outline-none">
                  <option value="">-- Pilih --</option>
                  {availableProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (Stok: {p.stock})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah</label>
                <input required type="number" min="1" value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-green outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cabang Tujuan</label>
                <select required value={toBranchId} onChange={e => setToBranchId(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-green outline-none">
                  <option value="">-- Pilih --</option>
                  {branches.filter(b => b.id !== currentUser?.branchId).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 border rounded-lg text-gray-700 hover:bg-gray-50">Batal</button>
                <button type="submit" className="flex-1 py-2 bg-brand-green text-white rounded-lg hover:bg-green-600">Kirim</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockTransferPage;
