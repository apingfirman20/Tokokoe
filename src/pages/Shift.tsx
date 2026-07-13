import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Clock, CheckCircle2, Play, Square } from 'lucide-react';
import type { Shift } from '../types';

const ShiftManager = () => {
  const { currentUser, shifts, openShift, closeShift, transactions } = useStore();
  const [startingCash, setStartingCash] = useState<number | ''>('');
  const [actualCash, setActualCash] = useState<number | ''>('');
  
  // Cari shift aktif untuk kasir ini
  const activeShift = shifts.find(s => s.cashierId === currentUser?.id && s.status === 'active');

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (startingCash === '') return;
    
    const newShift: Shift = {
      id: `shift${Date.now()}`,
      branchId: currentUser?.branchId || 'b1',
      cashierId: currentUser?.id || 'u1',
      startTime: new Date().toISOString(),
      startingCash: Number(startingCash),
      status: 'active'
    };
    openShift(newShift);
    setStartingCash('');
  };

  const handleCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (actualCash === '' || !activeShift) return;
    
    closeShift(activeShift.id, Number(actualCash));
    setActualCash('');
    alert('Shift berhasil ditutup!');
  };

  // Kalkulasi sistem saat shift aktif
  const shiftTransactions = transactions.filter(t => t.shiftId === activeShift?.id && t.status === 'completed' && t.paymentMethod === 'cash');
  const systemCash = (activeShift?.startingCash || 0) + shiftTransactions.reduce((acc, t) => acc + t.total, 0);

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-brand-dark">Manajemen Shift</h1>
        <p className="text-gray-500 mt-1">Kelola modal awal dan akhir kerja kasir</p>
      </div>

      {!activeShift ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center">
              <Play className="w-8 h-8 ml-1" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-center mb-6">Buka Shift Baru</h2>
          <form onSubmit={handleOpenShift} className="max-w-md mx-auto space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Modal Awal (Kas Fisik)</label>
              <input
                required
                type="number"
                value={startingCash}
                onChange={e => setStartingCash(Number(e.target.value))}
                className="w-full p-4 border rounded-xl focus:ring-2 focus:ring-brand-green outline-none text-lg"
                placeholder="Rp 0"
              />
            </div>
            <button type="submit" className="w-full bg-brand-green text-white font-bold py-4 rounded-xl hover:bg-green-600 transition-colors">
              Mulai Shift & Buka Kasir
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-brand-dark p-6 text-white text-center">
            <div className="inline-flex items-center gap-2 bg-green-500/20 text-brand-green px-4 py-1.5 rounded-full text-sm font-medium mb-4">
              <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse"></span>
              Shift Aktif
            </div>
            <h2 className="text-2xl font-bold">Waktunya Tutup Shift?</h2>
            <p className="text-gray-400 mt-2 text-sm">Dimulai pada {new Date(activeShift.startTime).toLocaleString('id-ID')}</p>
          </div>
          
          <div className="p-8">
            <div className="bg-gray-50 rounded-xl p-4 mb-8 grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Modal Awal</p>
                <p className="font-bold text-lg">Rp {activeShift.startingCash.toLocaleString('id-ID')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Penjualan Tunai (Sistem)</p>
                <p className="font-bold text-lg text-brand-green">+ Rp {(systemCash - activeShift.startingCash).toLocaleString('id-ID')}</p>
              </div>
              <div className="col-span-2 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-500">Total Kas Seharusnya</p>
                <p className="font-bold text-2xl text-brand-dark">Rp {systemCash.toLocaleString('id-ID')}</p>
              </div>
            </div>

            <form onSubmit={handleCloseShift} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Kas Fisik Aktual (Yang Ada di Laci)</label>
                <input
                  required
                  type="number"
                  value={actualCash}
                  onChange={e => setActualCash(Number(e.target.value))}
                  className="w-full p-4 border rounded-xl focus:ring-2 focus:ring-brand-green outline-none text-xl"
                  placeholder="Rp 0"
                />
              </div>
              
              {actualCash !== '' && (
                <div className={`p-4 rounded-xl ${Number(actualCash) === systemCash ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  Selisih: <strong>Rp {(Number(actualCash) - systemCash).toLocaleString('id-ID')}</strong>
                  {Number(actualCash) !== systemCash && ' (Harap laporkan ke admin)'}
                </div>
              )}

              <button type="submit" className="w-full bg-brand-orange text-white font-bold py-4 rounded-xl hover:bg-orange-600 transition-colors flex items-center justify-center gap-2">
                <Square className="w-5 h-5 fill-current" />
                Akhiri Shift
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftManager;
