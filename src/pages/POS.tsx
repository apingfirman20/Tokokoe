import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import type { Product, TransactionItem, Transaction } from '../types';
import { Search, Camera, Scan, Trash2, Plus, Minus, Receipt, AlertCircle } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { QRCodeCanvas } from 'qrcode.react';
import { Link } from 'react-router-dom';

const POS = () => {
  const { products, currentUser, addTransaction, shifts } = useStore();
  const [cart, setCart] = useState<TransactionItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals state
  const [showScanner, setShowScanner] = useState(false);
  const [showPhotoScan, setShowPhotoScan] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [receiptData, setReceiptData] = useState<Transaction | null>(null);

  // Checkout State
  const [paymentMethod, setPaymentMethod] = useState<'cash'|'card'|'qris'>('cash');
  const [amountPaid, setAmountPaid] = useState<number | ''>('');

  const branchProducts = products.filter(p => p.branchId === currentUser?.branchId || p.branchId === 'b1'); // Fallback to b1 for dummy

  // Subtotal calculation
  const subtotal = cart.reduce((acc, item) => acc + item.subtotal, 0);
  const tax = subtotal * 0.11; // 11% PPN
  const total = subtotal + tax;

  const handleAddToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => i.productId === product.id 
          ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.price } 
          : i);
      }
      return [...prev, { productId: product.id, name: product.name, quantity: 1, price: product.sellingPrice, subtotal: product.sellingPrice }];
    });
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.productId === productId) {
        const newQty = Math.max(1, i.quantity + delta);
        return { ...i, quantity: newQty, subtotal: newQty * i.price };
      }
      return i;
    }));
  };

  const handleRemoveItem = (productId: string) => {
    setCart(prev => prev.filter(i => i.productId !== productId));
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const product = branchProducts.find(p => p.barcode === searchQuery || p.sku.toLowerCase() === searchQuery.toLowerCase() || p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (product) {
      handleAddToCart(product);
      setSearchQuery('');
    } else {
      alert('Produk tidak ditemukan');
    }
  };

  // Mock Photo Scan
  const simulatePhotoScan = () => {
    setShowPhotoScan(true);
    setTimeout(() => {
      setShowPhotoScan(false);
      // Simulate finding a random product
      if (branchProducts.length > 0) {
        const randomProduct = branchProducts[Math.floor(Math.random() * branchProducts.length)];
        handleAddToCart(randomProduct);
        alert(`Terdeteksi: ${randomProduct.name}`);
      }
    }, 2000);
  };

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    const paid = Number(amountPaid);
    if (paymentMethod === 'cash' && paid < total) {
      alert('Uang pembayaran kurang!');
      return;
    }

    const transaction: Transaction = {
      id: `trx${Date.now()}`,
      receiptNumber: `INV-${Date.now()}`,
      branchId: currentUser?.branchId || 'b1',
      cashierId: currentUser?.id || 'u1',
      shiftId: 'current-shift-id', // Akan diupdate di Phase 4
      items: cart,
      subtotal,
      tax,
      discount: 0,
      total,
      paymentMethod,
      amountPaid: paid,
      change: paymentMethod === 'cash' ? paid - total : 0,
      date: new Date().toISOString(),
      status: 'completed'
    };

    addTransaction(transaction);
    setReceiptData(transaction);
    setShowCheckout(false);
    setCart([]);
    setAmountPaid('');
  };

  const handlePrint = async () => {
    if (currentUser?.printerSetting === 'bluetooth') {
      try {
        // Simulasi Web Bluetooth API untuk Thermal Printer
        const device = await navigator.bluetooth.requestDevice({
          filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
          optionalServices: ['0000af30-0000-1000-8000-00805f9b34fb'] // Common thermal printer service
        });
        alert(`Terhubung ke printer Bluetooth: ${device.name}\nMencetak struk...`);
        // Di sini kita akan mengirim buffer text ke characteristic device
        console.log('Printing to bluetooth...', receiptData);
        setReceiptData(null);
      } catch (error) {
        console.error('Bluetooth print failed', error);
        alert('Gagal menyambung ke printer Bluetooth. Pastikan bluetooth aktif dan perangkat mendukung Web Bluetooth API.');
      }
    } else {
      window.print();
      setReceiptData(null);
    }
  };

  const activeShift = shifts.find(s => s.cashierId === currentUser?.id && s.status === 'active');

  if (!activeShift) {
    return (
      <div className="flex h-full bg-gray-50 items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full">
          <AlertCircle className="w-16 h-16 text-brand-orange mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-brand-dark mb-2">Shift Belum Dibuka</h2>
          <p className="text-gray-500 mb-6">Anda tidak dapat melakukan transaksi sebelum membuka shift kerja. Silakan buka shift Anda terlebih dahulu.</p>
          <Link to="/shift" className="bg-brand-green text-white font-bold py-3 px-6 rounded-xl hover:bg-green-600 transition-colors inline-block w-full">
            Buka Shift Sekarang
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-50">
      {/* Kiri: Daftar Produk & Pencarian */}
      <div className="flex-1 flex flex-col border-r border-gray-200">
        <div className="p-4 bg-white border-b border-gray-200 flex gap-4 items-center">
          <form onSubmit={handleSearch} className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-3 text-gray-400" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cari nama, SKU, atau Barcode (Enter)" 
              className="w-full pl-10 pr-4 py-3 bg-gray-100 border-transparent rounded-xl focus:bg-white focus:border-brand-green focus:ring-2 focus:ring-brand-green transition-all outline-none"
            />
          </form>
          <button onClick={() => setShowScanner(true)} className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors" title="Scan Barcode">
            <Scan className="w-6 h-6" />
          </button>
          <button onClick={simulatePhotoScan} className="p-3 bg-brand-orange hover:bg-orange-600 text-white rounded-xl transition-colors" title="Scan via Foto">
            <Camera className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {branchProducts.map(product => (
              <button 
                key={product.id}
                onClick={() => handleAddToCart(product)}
                className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:border-brand-green hover:shadow-md transition-all text-left flex flex-col h-full"
              >
                <div className="w-full h-32 bg-gray-100 rounded-lg mb-3 flex items-center justify-center text-gray-400">
                  <Camera className="w-8 h-8 opacity-50" />
                </div>
                <h3 className="font-semibold text-brand-dark line-clamp-2">{product.name}</h3>
                <div className="mt-auto pt-2 text-brand-orange font-bold">
                  Rp {product.sellingPrice.toLocaleString('id-ID')}
                </div>
                <div className="text-xs text-gray-500 mt-1">Stok: {product.stock}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Kanan: Keranjang */}
      <div className="w-96 bg-white flex flex-col shadow-[-4px_0_15px_rgba(0,0,0,0.02)] z-10">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-2xl font-bold text-brand-dark">Keranjang</h2>
        </div>
        
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <Search className="w-12 h-12 mb-2 opacity-20" />
              <p>Belum ada item</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.productId} className="flex flex-col p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-semibold text-brand-dark line-clamp-1">{item.name}</span>
                  <button onClick={() => handleRemoveItem(item.productId)} className="text-red-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-brand-orange font-medium text-sm">Rp {item.price.toLocaleString('id-ID')}</span>
                  <div className="flex items-center gap-3 bg-white px-2 py-1 rounded-lg border border-gray-200">
                    <button onClick={() => handleUpdateQuantity(item.productId, -1)} className="text-gray-500 hover:text-brand-dark"><Minus className="w-4 h-4" /></button>
                    <span className="w-6 text-center font-medium text-sm">{item.quantity}</span>
                    <button onClick={() => handleUpdateQuantity(item.productId, 1)} className="text-gray-500 hover:text-brand-dark"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="p-6 bg-gray-50 border-t border-gray-200 space-y-3">
          <div className="flex justify-between text-gray-500 text-sm">
            <span>Subtotal</span>
            <span>Rp {subtotal.toLocaleString('id-ID')}</span>
          </div>
          <div className="flex justify-between text-gray-500 text-sm">
            <span>Pajak (11%)</span>
            <span>Rp {tax.toLocaleString('id-ID')}</span>
          </div>
          <div className="flex justify-between text-xl font-bold text-brand-dark pt-2 border-t border-gray-200">
            <span>Total</span>
            <span>Rp {total.toLocaleString('id-ID')}</span>
          </div>
          <button 
            disabled={cart.length === 0}
            onClick={() => setShowCheckout(true)}
            className="w-full mt-4 bg-brand-green hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-colors"
          >
            Checkout
          </button>
        </div>
      </div>

      {/* Mock Photo Scanner Modal */}
      {showPhotoScan && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-2xl flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="font-bold text-lg">Menganalisis Foto Produk...</p>
            <p className="text-gray-500 text-sm">Simulasi Image Recognition (Claude Vision)</p>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
            <div className="bg-brand-dark p-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-lg">Pembayaran</h3>
              <button onClick={() => setShowCheckout(false)} className="text-gray-400 hover:text-white">&times;</button>
            </div>
            <form onSubmit={handleCheckout} className="p-6 space-y-4">
              <div className="text-center mb-6">
                <p className="text-gray-500 text-sm">Total Tagihan</p>
                <p className="text-4xl font-bold text-brand-green">Rp {total.toLocaleString('id-ID')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Metode Pembayaran</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cash', 'card', 'qris'] as const).map(method => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`py-2 rounded-lg text-sm font-medium border uppercase transition-colors ${paymentMethod === method ? 'bg-brand-orange text-white border-brand-orange' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === 'cash' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Uang Diterima</label>
                  <input
                    required
                    type="number"
                    value={amountPaid}
                    onChange={e => setAmountPaid(Number(e.target.value))}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-brand-green outline-none text-lg"
                  />
                  {amountPaid !== '' && Number(amountPaid) >= total && (
                    <p className="text-sm text-green-600 mt-2">
                      Kembalian: Rp {(Number(amountPaid) - total).toLocaleString('id-ID')}
                    </p>
                  )}
                </div>
              )}

              {paymentMethod === 'qris' && (
                <div className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-sm font-bold text-gray-700 mb-4">Scan untuk Bayar</p>
                  <div className="bg-white p-2 rounded-xl shadow-sm">
                    {/* Format QRIS dinamis simulasi */}
                    <QRCodeCanvas 
                      value={`00020101021126570014ID.CO.QRIS.WWW011893600915300004311020468305802ID5910TokoKoe ID6007Jakarta610512345540${total.toString().length}${total}6304ABCD`} 
                      size={200}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-4 text-center">Nominal Rp {total.toLocaleString('id-ID')} sudah termasuk dalam QR Code.</p>
                </div>
              )}

              <button type="submit" className="w-full bg-brand-green text-white font-bold py-3 rounded-lg mt-4 hover:bg-green-600">
                Selesaikan Pembayaran
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {receiptData && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b text-center">
              <Receipt className="w-8 h-8 mx-auto text-brand-green mb-2" />
              <h3 className="font-bold text-lg">Transaksi Berhasil</h3>
            </div>
            
            <div className="p-6 overflow-auto flex-1 bg-gray-50">
              <div id="printable-receipt" className="bg-white p-4 border border-gray-200 shadow-sm mx-auto text-sm text-black">
                <div className="text-center mb-4">
                  <h2 className="font-bold text-lg">TokoKoe</h2>
                  <p className="text-xs">Cabang ID: {receiptData.branchId}</p>
                  <p className="text-xs">{new Date(receiptData.date).toLocaleString('id-ID')}</p>
                </div>
                <div className="border-t border-b border-dashed border-gray-300 py-2 my-2 space-y-1 text-xs">
                  {receiptData.items.map(item => (
                    <div key={item.productId} className="flex justify-between">
                      <span>{item.name} x{item.quantity}</span>
                      <span>{item.subtotal.toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{receiptData.subtotal.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>PPN (11%)</span>
                    <span>{receiptData.tax.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm mt-1 border-t border-gray-300 pt-1">
                    <span>Total</span>
                    <span>{receiptData.total.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span>Metode: {receiptData.paymentMethod.toUpperCase()}</span>
                    <span>{receiptData.amountPaid.toLocaleString('id-ID')}</span>
                  </div>
                  {receiptData.paymentMethod === 'cash' && (
                    <div className="flex justify-between font-bold">
                      <span>Kembalian</span>
                      <span>{receiptData.change.toLocaleString('id-ID')}</span>
                    </div>
                  )}
                </div>
                <div className="text-center mt-6 text-xs text-gray-500">
                  Terima kasih atas kunjungan Anda
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border-t flex gap-3">
              <button onClick={() => setReceiptData(null)} className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50">
                Tutup
              </button>
              <button onClick={handlePrint} className="flex-1 py-2 px-4 bg-brand-orange text-white rounded-lg font-medium hover:bg-orange-600">
                Cetak Struk
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POS;
