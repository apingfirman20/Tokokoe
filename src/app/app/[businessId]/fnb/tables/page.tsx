'use client';

import React, { useState } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { UtensilsCrossed, Users, CheckCircle2, Clock, X, User, Plus, Trash2, LayoutGrid } from 'lucide-react';

export default function TablesPage() {
  const { tables, updateTableStatus, addTable, deleteTable } = useBusiness();

  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');

  // Add Table Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [newCapacity, setNewCapacity] = useState<number>(4);

  const currentTbl = tables.find(t => t.id === selectedTable);

  const handleUpdate = (status: 'available' | 'occupied' | 'reserved') => {
    if (!selectedTable) return;
    updateTableStatus(selectedTable, status, customerName);
    setSelectedTable(null);
    setCustomerName('');
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNumber.trim()) return;
    addTable(newTableNumber.trim(), newCapacity || 4);
    setNewTableNumber('');
    setNewCapacity(4);
    setShowAddModal(false);
  };

  const handleInitDefaultTables = () => {
    for (let i = 1; i <= 6; i++) {
      addTable(`Meja 0${i}`, i % 2 === 0 ? 4 : 2);
    }
  };

  const handleDelete = () => {
    if (!selectedTable) return;
    deleteTable(selectedTable);
    setSelectedTable(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Manajemen Meja & Dine-in
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Status alokasi meja restoran, kapasitas pengunjung, dan reservasi aktif
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="py-2 px-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Tambah Meja Baru</span>
          </button>

          <div className="hidden md:flex items-center gap-3 text-xs pl-3 border-l border-slate-200">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Tersedia ({tables.filter(t => t.status === 'available').length})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>Terisi ({tables.filter(t => t.status === 'occupied').length})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Reservasi ({tables.filter(t => t.status === 'reserved').length})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {tables.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mb-4 border border-teal-100">
            <LayoutGrid className="w-7 h-7" />
          </div>
          <h3 className="font-bold text-slate-900 text-base">Belum Ada Meja Restoran</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1 mb-6">
            Atur tata letak meja untuk memfasilitasi pesanan Dine-In, nomor meja di struk, dan sistem dapur KDS.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Meja Pertama</span>
            </button>
            <button
              onClick={handleInitDefaultTables}
              className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300 transition-all"
            >
              Inisialisasi Standar (Meja 01 - 06)
            </button>
          </div>
        </div>
      ) : (
        /* Tables Grid Layout */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {tables.map((tbl) => {
            let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            let statusText = 'Tersedia';

            if (tbl.status === 'occupied') {
              badgeColor = 'bg-rose-50 text-rose-700 border-rose-200';
              statusText = 'Terisi';
            } else if (tbl.status === 'reserved') {
              badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
              statusText = 'Reservasi';
            }

            return (
              <div
                key={tbl.id}
                onClick={() => {
                  setSelectedTable(tbl.id);
                  setCustomerName(tbl.customerName || '');
                }}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-4 bg-white hover:shadow-md ${
                  tbl.status === 'occupied' 
                    ? 'border-rose-200 hover:border-rose-400' 
                    : tbl.status === 'reserved'
                    ? 'border-amber-200 hover:border-amber-400'
                    : 'border-slate-200 hover:border-teal-500'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900">{tbl.tableNumber}</h3>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <Users className="w-3 h-3 text-slate-400" />
                      <span>Kapasitas {tbl.capacity} Orang</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${badgeColor}`}>
                    {statusText}
                  </span>
                </div>

                {tbl.customerName ? (
                  <div className="p-2 rounded-lg bg-slate-50 text-slate-700 text-xs truncate">
                    👤 {tbl.customerName}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 italic">
                    Klik untuk ubah status
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Table Detail / Status Change Modal */}
      {selectedTable && currentTbl && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-base text-slate-900">Ubah Status {currentTbl.tableNumber}</h3>
              <button onClick={() => setSelectedTable(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Tamu / Keterangan Meja
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: Bpk. Hendra (4 org)"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleUpdate('available')}
                  className="py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-200"
                >
                  Tersedia
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdate('occupied')}
                  className="py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs border border-rose-200"
                >
                  Terisi
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdate('reserved')}
                  className="py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs border border-amber-200"
                >
                  Reservasi
                </button>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="text-rose-600 hover:text-rose-700 text-xs font-semibold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Meja</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTable(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Table Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-base text-slate-900">Tambah Meja Baru</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor / Nama Meja
                </label>
                <input
                  type="text"
                  required
                  value={newTableNumber}
                  onChange={(e) => setNewTableNumber(e.target.value)}
                  placeholder="Contoh: Meja 01, Meja Bar, Meja VIP"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kapasitas Kursi (Orang)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  required
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(Number(e.target.value))}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md"
                >
                  Simpan Meja
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
