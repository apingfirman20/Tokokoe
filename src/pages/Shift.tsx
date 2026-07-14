import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Clock, CheckCircle2, Play, Square, History, CreditCard, Banknote, Smartphone, TrendingUp, AlertTriangle, FileText, ChevronDown, ChevronUp, Printer, X } from 'lucide-react';
import type { Shift } from '../types';
import clsx from 'clsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';

const ShiftManager = () => {
  const { currentUser, shifts, openShift, closeShift, transactions, users, branches, addActivityLog } = useStore();
  const [startingCash, setStartingCash] = useState<number | ''>('');
  const [actualCash, setActualCash] = useState<number | ''>('');
  const [closeNote, setCloseNote] = useState('');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [selectedHistoryShift, setSelectedHistoryShift] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active'|'history'|'performance'>('active');
  
  const isOwner = currentUser?.role === 'owner';
  const isAdmin = currentUser?.role === 'admin';
  const isKasir = currentUser?.role === 'kasir';

  // Active shift for current user (kasir only has their own)
  const activeShift = isKasir
    ? shifts.find(s => s.cashierId === currentUser?.id && s.status === 'active')
    : null;

  // All active shifts (for owner/admin view)
  const allActiveShifts = useMemo(() => {
    if (isOwner) return shifts.filter(s => s.status === 'active');
    if (isAdmin) return shifts.filter(s => s.status === 'active' && s.branchId === currentUser?.branchId);
    return activeShift ? [activeShift] : [];
  }, [shifts, isOwner, isAdmin, currentUser, activeShift]);

  // Shift history
  const shiftHistory = useMemo(() => {
    const closed = shifts.filter(s => {
      if (s.status !== 'closed') return false;
      if (isKasir) return s.cashierId === currentUser?.id;
      if (isAdmin) return s.branchId === currentUser?.branchId;
      return true; // owner sees all
    });
    return closed.sort((a, b) => new Date(b.endTime || '').getTime() - new Date(a.endTime || '').getTime());
  }, [shifts, isKasir, isAdmin, currentUser]);

  // Calculations for active shift
  const shiftCalc = useMemo(() => {
    if (!activeShift) return null;
    const shiftTxs = transactions.filter(t => t.shiftId === activeShift.id && t.status === 'completed');
    
    const cashSales = shiftTxs.filter(t => t.paymentMethod === 'cash').reduce((acc, t) => acc + t.total, 0);
    const cardSales = shiftTxs.filter(t => t.paymentMethod === 'card').reduce((acc, t) => acc + t.total, 0);
    const qrisSales = shiftTxs.filter(t => t.paymentMethod === 'qris').reduce((acc, t) => acc + t.total, 0);
    const totalSales = shiftTxs.reduce((acc, t) => acc + t.total, 0);
    const totalTxCount = shiftTxs.length;
    const systemCash = activeShift.startingCash + cashSales;
    
    const elapsed = Date.now() - new Date(activeShift.startTime).getTime();
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);

    return { cashSales, cardSales, qrisSales, totalSales, totalTxCount, systemCash, hours, minutes };
  }, [activeShift, transactions]);

  // Calculate details for a specific closed shift (history detail)
  const getShiftDetails = (shift: Shift) => {
    const shiftTxs = transactions.filter(t => t.shiftId === shift.id && t.status === 'completed');
    const cashSales = shiftTxs.filter(t => t.paymentMethod === 'cash').reduce((acc, t) => acc + t.total, 0);
    const cardSales = shiftTxs.filter(t => t.paymentMethod === 'card').reduce((acc, t) => acc + t.total, 0);
    const qrisSales = shiftTxs.filter(t => t.paymentMethod === 'qris').reduce((acc, t) => acc + t.total, 0);
    const totalSales = shiftTxs.reduce((acc, t) => acc + t.total, 0);
    const totalTxCount = shiftTxs.length;
    const systemCash = shift.startingCash + cashSales;
    const selisih = (shift.endingCashActual || 0) - (shift.endingCashSystem || systemCash);
    return { cashSales, cardSales, qrisSales, totalSales, totalTxCount, systemCash, selisih };
  };

  // Performance chart data (compare shifts)
  const performanceData = useMemo(() => {
    const recentShifts = shiftHistory.slice(0, 10).reverse();
    return recentShifts.map(s => {
      const details = getShiftDetails(s);
      const cashierName = users.find(u => u.id === s.cashierId)?.name || 'Unknown';
      const dateStr = new Date(s.startTime).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
      const timeStr = new Date(s.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      return {
        name: `${dateStr} ${timeStr}`,
        'Total Penjualan': details.totalSales,
        'Cash': details.cashSales,
        'Non-Cash': details.cardSales + details.qrisSales,
        kasir: cashierName
      };
    });
  }, [shiftHistory, users]);

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

  const handleCloseShift = () => {
    if (actualCash === '' || !activeShift || !shiftCalc) return;
    
    const selisih = Number(actualCash) - shiftCalc.systemCash;
    
    // If there's a discrepancy and no note, block
    if (selisih !== 0 && closeNote.trim() === '') {
      alert('Wajib isi catatan jika ada selisih kas!');
      return;
    }
    
    closeShift(activeShift.id, Number(actualCash));

    // Add detailed log with note
    addActivityLog({
      id: `log${Date.now()}`,
      userId: currentUser?.id || '',
      branchId: activeShift.branchId,
      action: 'shift_closed',
      description: `Shift ditutup. Kas Sistem: Rp ${shiftCalc.systemCash.toLocaleString('id-ID')}, Kas Fisik: Rp ${Number(actualCash).toLocaleString('id-ID')}, Selisih: Rp ${selisih.toLocaleString('id-ID')}${closeNote ? `. Catatan: ${closeNote}` : ''}`,
      timestamp: new Date().toISOString()
    });

    setActualCash('');
    setCloseNote('');
    setShowCloseConfirm(false);
  };

  const selisih = actualCash !== '' && shiftCalc ? Number(actualCash) - shiftCalc.systemCash : null;

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-brand-dark">Manajemen Shift</h1>
          <p className="text-gray-500 mt-1">Kelola shift kasir, rekonsiliasi kas, dan riwayat</p>
        </div>
        
        {/* Tabs */}
        <div className="flex bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
          {[
            { key: 'active', label: 'Shift Aktif', icon: Clock },
            { key: 'history', label: 'Riwayat', icon: History },
            { key: 'performance', label: 'Performa', icon: TrendingUp },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                activeTab === tab.key ? "bg-brand-dark text-[#d4af37]" : "text-gray-500 hover:text-brand-dark"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ========================= TAB: ACTIVE ========================= */}
      {activeTab === 'active' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left: Active Shift Panel (Kasir) */}
          <div className="lg:col-span-2">
            {isKasir && !activeShift && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                <div className="flex justify-center mb-6">
                  <div className="w-16 h-16 bg-[#d4af37]/10 text-[#d4af37] rounded-full flex items-center justify-center">
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
                      className="w-full p-4 border rounded-xl focus:ring-2 focus:ring-[#d4af37] outline-none text-lg"
                      placeholder="Rp 0"
                    />
                  </div>
                  <button type="submit" className="w-full bg-[#d4af37] text-brand-dark font-bold py-4 rounded-xl hover:bg-[#c5a030] transition-colors">
                    Mulai Shift & Buka Kasir
                  </button>
                </form>
              </div>
            )}

            {isKasir && activeShift && shiftCalc && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Header */}
                <div className="bg-brand-dark p-6 text-white">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="inline-flex items-center gap-2 bg-green-500/20 text-green-400 px-4 py-1.5 rounded-full text-sm font-medium mb-3">
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                        Shift Aktif
                      </div>
                      <h2 className="text-xl font-bold">Shift Berjalan</h2>
                      <p className="text-gray-400 mt-1 text-sm">Dimulai: {new Date(activeShift.startTime).toLocaleString('id-ID')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-400 text-sm">Durasi</p>
                      <p className="text-2xl font-bold text-[#d4af37]">{shiftCalc.hours}j {shiftCalc.minutes}m</p>
                    </div>
                  </div>
                </div>
                
                {/* Stats Grid */}
                <div className="p-6">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                        <ShoppingCartIcon /> Total Transaksi
                      </div>
                      <p className="text-2xl font-bold text-brand-dark">{shiftCalc.totalTxCount}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                        <TrendingUp className="w-4 h-4" /> Total Penjualan
                      </div>
                      <p className="text-2xl font-bold text-brand-dark">Rp {shiftCalc.totalSales.toLocaleString('id-ID')}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                        <Banknote className="w-4 h-4" /> Modal Awal
                      </div>
                      <p className="text-2xl font-bold text-brand-dark">Rp {activeShift.startingCash.toLocaleString('id-ID')}</p>
                    </div>
                    <div className="bg-[#d4af37]/5 rounded-xl p-4 border border-[#d4af37]/20">
                      <div className="flex items-center gap-2 text-[#d4af37] text-sm mb-1 font-medium">
                        <Banknote className="w-4 h-4" /> Kas Seharusnya
                      </div>
                      <p className="text-2xl font-bold text-[#d4af37]">Rp {shiftCalc.systemCash.toLocaleString('id-ID')}</p>
                    </div>
                  </div>

                  {/* Payment Breakdown */}
                  <h3 className="font-bold text-brand-dark mb-3">Breakdown Pembayaran</h3>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="flex items-center gap-3 bg-green-50 p-4 rounded-xl border border-green-100">
                      <Banknote className="w-8 h-8 text-green-600" />
                      <div>
                        <p className="text-xs text-green-700 font-medium">Cash</p>
                        <p className="font-bold text-green-800">Rp {shiftCalc.cashSales.toLocaleString('id-ID')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 bg-blue-50 p-4 rounded-xl border border-blue-100">
                      <CreditCard className="w-8 h-8 text-blue-600" />
                      <div>
                        <p className="text-xs text-blue-700 font-medium">Kartu</p>
                        <p className="font-bold text-blue-800">Rp {shiftCalc.cardSales.toLocaleString('id-ID')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 bg-purple-50 p-4 rounded-xl border border-purple-100">
                      <Smartphone className="w-8 h-8 text-purple-600" />
                      <div>
                        <p className="text-xs text-purple-700 font-medium">QRIS</p>
                        <p className="font-bold text-purple-800">Rp {shiftCalc.qrisSales.toLocaleString('id-ID')}</p>
                      </div>
                    </div>
                  </div>

                  {/* Close Shift Button */}
                  {!showCloseConfirm ? (
                    <button 
                      onClick={() => setShowCloseConfirm(true)} 
                      className="w-full bg-red-500 text-white font-bold py-4 rounded-xl hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                    >
                      <Square className="w-5 h-5 fill-current" />
                      Tutup Shift
                    </button>
                  ) : (
                    <div className="border-2 border-red-200 rounded-2xl p-6 bg-red-50/30">
                      <h3 className="font-bold text-lg text-brand-dark mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                        Konfirmasi Tutup Shift
                      </h3>

                      {/* Ringkasan Otomatis */}
                      <div className="bg-white rounded-xl p-4 mb-4 border border-gray-100">
                        <p className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-wider">Ringkasan Shift</p>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between"><span className="text-gray-500">Total Transaksi</span><span className="font-bold">{shiftCalc.totalTxCount} transaksi</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Penjualan Cash</span><span className="font-bold text-green-600">Rp {shiftCalc.cashSales.toLocaleString('id-ID')}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Penjualan Kartu</span><span className="font-bold text-blue-600">Rp {shiftCalc.cardSales.toLocaleString('id-ID')}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Penjualan QRIS</span><span className="font-bold text-purple-600">Rp {shiftCalc.qrisSales.toLocaleString('id-ID')}</span></div>
                          <div className="flex justify-between border-t border-gray-100 pt-2 mt-2"><span className="text-gray-500">Total Penjualan</span><span className="font-bold text-lg">Rp {shiftCalc.totalSales.toLocaleString('id-ID')}</span></div>
                          <div className="flex justify-between bg-[#d4af37]/10 rounded-lg p-3 mt-2">
                            <span className="font-bold text-[#d4af37]">Kas Seharusnya (Modal + Cash Sales)</span>
                            <span className="font-bold text-lg text-[#d4af37]">Rp {shiftCalc.systemCash.toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Input Kas Fisik */}
                      <div className="mb-4">
                        <label className="block text-sm font-bold text-gray-700 mb-2">Kas Fisik Aktual (Hitung Manual)</label>
                        <input
                          required
                          type="number"
                          value={actualCash}
                          onChange={e => setActualCash(Number(e.target.value))}
                          className="w-full p-4 border-2 rounded-xl focus:ring-2 focus:ring-[#d4af37] outline-none text-xl font-bold"
                          placeholder="Masukkan jumlah kas fisik..."
                        />
                      </div>

                      {/* Selisih Indicator */}
                      {selisih !== null && (
                        <div className={clsx(
                          "p-4 rounded-xl mb-4 font-bold flex items-center justify-between",
                          selisih === 0 ? "bg-green-100 text-green-700 border border-green-200" :
                          selisih < 0 ? "bg-red-100 text-red-700 border border-red-200" :
                          "bg-yellow-100 text-yellow-700 border border-yellow-200"
                        )}>
                          <div className="flex items-center gap-2">
                            {selisih === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                            <span>Selisih:</span>
                          </div>
                          <span className="text-lg">
                            {selisih === 0 ? 'Pas! ✓' : `Rp ${selisih.toLocaleString('id-ID')} (${selisih > 0 ? 'Lebih' : 'Kurang'})`}
                          </span>
                        </div>
                      )}

                      {/* Catatan */}
                      <div className="mb-4">
                        <label className="block text-sm font-bold text-gray-700 mb-2">
                          Catatan Kasir {selisih !== null && selisih !== 0 && <span className="text-red-500">*Wajib diisi (ada selisih)</span>}
                        </label>
                        <textarea
                          value={closeNote}
                          onChange={e => setCloseNote(e.target.value)}
                          className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-[#d4af37] outline-none resize-none"
                          rows={3}
                          placeholder="Opsional, tapi wajib jika ada selisih kas..."
                        />
                      </div>

                      <div className="flex gap-3">
                        <button 
                          onClick={() => { setShowCloseConfirm(false); setActualCash(''); setCloseNote(''); }}
                          className="flex-1 py-3 rounded-xl border-2 border-gray-200 font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                          Batal
                        </button>
                        <button 
                          onClick={handleCloseShift}
                          disabled={actualCash === ''}
                          className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                          Konfirmasi Tutup Shift
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Owner/Admin View: All Active Shifts */}
            {(isOwner || isAdmin) && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-bold text-brand-dark mb-6 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#d4af37]" /> Shift Aktif Saat Ini
                </h2>
                {allActiveShifts.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Tidak ada shift yang sedang berjalan</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {allActiveShifts.map(s => {
                      const cashier = users.find(u => u.id === s.cashierId);
                      const branch = branches.find(b => b.id === s.branchId);
                      const sTxs = transactions.filter(t => t.shiftId === s.id && t.status === 'completed');
                      const omzet = sTxs.reduce((acc, t) => acc + t.total, 0);
                      const elapsed = Date.now() - new Date(s.startTime).getTime();
                      const h = Math.floor(elapsed / 3600000);
                      const m = Math.floor((elapsed % 3600000) / 60000);
                      return (
                        <div key={s.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                            <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-brand-dark">{cashier?.name || 'Kasir'}</p>
                            <p className="text-xs text-gray-500">{branch?.name || 'Cabang'} · Mulai {new Date(s.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-[#d4af37]">Rp {omzet.toLocaleString('id-ID')}</p>
                            <p className="text-xs text-gray-500">{h}j {m}m · {sTxs.length} trx</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Sidebar: Quick Stats */}
          <div className="space-y-6">
            {/* Today Summary */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-bold text-brand-dark mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#d4af37]" /> Ringkasan Hari Ini
              </h3>
              <div className="space-y-3">
                {(() => {
                  const todayShifts = shifts.filter(s => {
                    const d = new Date(s.startTime);
                    return d.toDateString() === new Date().toDateString();
                  });
                  const todayActive = todayShifts.filter(s => s.status === 'active').length;
                  const todayClosed = todayShifts.filter(s => s.status === 'closed').length;
                  return (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">Shift Aktif</span>
                        <span className="font-bold text-green-600">{todayActive}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">Shift Selesai</span>
                        <span className="font-bold">{todayClosed}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">Total Shift Hari Ini</span>
                        <span className="font-bold text-[#d4af37]">{todayShifts.length}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Alert: Selisih Besar */}
            {(() => {
              const recentAlerts = shiftHistory.filter(s => {
                const details = getShiftDetails(s);
                return Math.abs(details.selisih) > 10000; // threshold Rp 10.000
              }).slice(0, 3);
              if (recentAlerts.length === 0) return null;
              return (
                <div className="bg-red-50 rounded-2xl border border-red-200 p-6">
                  <h3 className="font-bold text-red-700 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" /> Selisih Kas Terdeteksi
                  </h3>
                  <div className="space-y-3">
                    {recentAlerts.map(s => {
                      const details = getShiftDetails(s);
                      const cashier = users.find(u => u.id === s.cashierId);
                      return (
                        <div key={s.id} className="bg-white p-3 rounded-lg border border-red-100 text-sm">
                          <p className="font-bold text-red-700">{cashier?.name}</p>
                          <p className="text-xs text-red-500">Selisih: Rp {details.selisih.toLocaleString('id-ID')}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ========================= TAB: HISTORY ========================= */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {shiftHistory.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
              <History className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">Belum ada riwayat shift</p>
            </div>
          ) : (
            shiftHistory.map(s => {
              const details = getShiftDetails(s);
              const cashier = users.find(u => u.id === s.cashierId);
              const branch = branches.find(b => b.id === s.branchId);
              const isExpanded = selectedHistoryShift === s.id;
              
              return (
                <div key={s.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* Summary Row */}
                  <button 
                    onClick={() => setSelectedHistoryShift(isExpanded ? null : s.id)}
                    className="w-full p-5 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-brand-dark">{cashier?.name || 'Kasir'} <span className="font-normal text-gray-400">· {branch?.name}</span></p>
                      <p className="text-xs text-gray-500">
                        {new Date(s.startTime).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} · {new Date(s.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} - {s.endTime ? new Date(s.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </p>
                    </div>
                    <div className="text-right shrink-0 mr-2">
                      <p className="font-bold text-brand-dark">Rp {details.totalSales.toLocaleString('id-ID')}</p>
                      <p className={clsx("text-xs font-semibold", details.selisih === 0 ? "text-green-500" : details.selisih < 0 ? "text-red-500" : "text-yellow-500")}>
                        Selisih: Rp {details.selisih.toLocaleString('id-ID')}
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </button>
                  
                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">Total Transaksi</p>
                          <p className="font-bold text-lg">{details.totalTxCount}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">Modal Awal</p>
                          <p className="font-bold">Rp {s.startingCash.toLocaleString('id-ID')}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">Kas Sistem</p>
                          <p className="font-bold text-[#d4af37]">Rp {(s.endingCashSystem || details.systemCash).toLocaleString('id-ID')}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">Kas Fisik</p>
                          <p className="font-bold">Rp {(s.endingCashActual || 0).toLocaleString('id-ID')}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-green-50 rounded-lg p-3 text-center border border-green-100">
                          <Banknote className="w-5 h-5 mx-auto mb-1 text-green-600" />
                          <p className="text-xs text-green-700">Cash</p>
                          <p className="font-bold text-green-800 text-sm">Rp {details.cashSales.toLocaleString('id-ID')}</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-100">
                          <CreditCard className="w-5 h-5 mx-auto mb-1 text-blue-600" />
                          <p className="text-xs text-blue-700">Kartu</p>
                          <p className="font-bold text-blue-800 text-sm">Rp {details.cardSales.toLocaleString('id-ID')}</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-3 text-center border border-purple-100">
                          <Smartphone className="w-5 h-5 mx-auto mb-1 text-purple-600" />
                          <p className="text-xs text-purple-700">QRIS</p>
                          <p className="font-bold text-purple-800 text-sm">Rp {details.qrisSales.toLocaleString('id-ID')}</p>
                        </div>
                      </div>
                      <div className={clsx(
                        "p-3 rounded-lg text-sm font-bold flex justify-between",
                        details.selisih === 0 ? "bg-green-100 text-green-700" : details.selisih < 0 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                      )}>
                        <span>Selisih Kas</span>
                        <span>{details.selisih === 0 ? 'Pas ✓' : `Rp ${details.selisih.toLocaleString('id-ID')} (${details.selisih > 0 ? 'Lebih' : 'Kurang'})`}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========================= TAB: PERFORMANCE ========================= */}
      {activeTab === 'performance' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-brand-dark mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#d4af37]" /> Grafik Performa Shift (10 Terakhir)
            </h2>
            {performanceData.length > 0 ? (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dx={-10} tickFormatter={(v) => `Rp ${(v/1000)}k`} />
                    <RechartsTooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => [`Rp ${value.toLocaleString('id-ID')}`, '']}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="Cash" fill="#22c55e" radius={[4, 4, 0, 0]} stackId="a" />
                    <Bar dataKey="Non-Cash" fill="#3b82f6" radius={[4, 4, 0, 0]} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Belum ada data shift untuk ditampilkan</p>
              </div>
            )}
          </div>

          {/* Shift comparison table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-bold text-brand-dark mb-4">Perbandingan Shift Terakhir</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-2 text-gray-500 font-semibold">Kasir</th>
                    <th className="text-left py-3 px-2 text-gray-500 font-semibold">Waktu</th>
                    <th className="text-right py-3 px-2 text-gray-500 font-semibold">Omzet</th>
                    <th className="text-right py-3 px-2 text-gray-500 font-semibold">Trx</th>
                    <th className="text-right py-3 px-2 text-gray-500 font-semibold">Selisih</th>
                  </tr>
                </thead>
                <tbody>
                  {shiftHistory.slice(0, 10).map(s => {
                    const details = getShiftDetails(s);
                    const cashier = users.find(u => u.id === s.cashierId);
                    return (
                      <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-3 px-2 font-medium">{cashier?.name || '-'}</td>
                        <td className="py-3 px-2 text-gray-500">{new Date(s.startTime).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })} {new Date(s.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="py-3 px-2 text-right font-bold">Rp {details.totalSales.toLocaleString('id-ID')}</td>
                        <td className="py-3 px-2 text-right">{details.totalTxCount}</td>
                        <td className={clsx("py-3 px-2 text-right font-bold", details.selisih === 0 ? "text-green-500" : details.selisih < 0 ? "text-red-500" : "text-yellow-500")}>
                          {details.selisih === 0 ? 'Pas ✓' : `Rp ${details.selisih.toLocaleString('id-ID')}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {shiftHistory.length === 0 && <p className="text-center text-gray-500 py-8">Belum ada data</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Simple ShoppingCart icon component (avoids name collision with lucide)
const ShoppingCartIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>
  </svg>
);

export default ShiftManager;
