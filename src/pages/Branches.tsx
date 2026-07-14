import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import type { Branch } from '../types';
import { Store, MapPin, Activity, Edit2, Phone, User, Clock, Users, Package, BarChart3, List, Grid, Power, X, Map, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

const Branches = () => {
  const navigate = useNavigate();
  const { branches, users, shifts, branchStocks, transactions, addBranch, updateBranch } = useStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isEditing, setIsEditing] = useState(false);
  const [currentBranch, setCurrentBranch] = useState<Partial<Branch>>({ isActive: true });

  const today = new Date().toISOString().split('T')[0];

  const getBranchStats = (branchId: string) => {
    const branchUsers = users.filter(u => u.branchId === branchId);
    const activeShift = shifts.find(s => s.branchId === branchId && !s.endTime);
    const branchProducts = branchStocks.filter(bs => bs.branchId === branchId && bs.stock > 0);
    const todayTransactions = transactions.filter(t => t.branchId === branchId && t.date.startsWith(today) && t.status === 'completed');
    const todayOmzet = todayTransactions.reduce((sum, t) => sum + t.total, 0);

    return {
      karyawan: branchUsers.length,
      isKasirOpen: !!activeShift,
      produk: branchProducts.length,
      omzet: todayOmzet
    };
  };

  const branchData = useMemo(() => {
    return branches.map(b => ({
      ...b,
      stats: getBranchStats(b.id)
    }));
  }, [branches, users, shifts, branchStocks, transactions]);

  const leaderboard = [...branchData].sort((a, b) => b.stats.omzet - a.stats.omzet);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentBranch.id) {
      updateBranch(currentBranch.id, currentBranch as Branch);
    } else {
      addBranch({
        ...currentBranch,
        id: `b${Date.now()}`,
        name: currentBranch.name || '',
        address: currentBranch.address || '',
        isActive: currentBranch.isActive ?? true
      } as Branch);
    }
    setIsEditing(false);
    setCurrentBranch({ isActive: true });
  };

  const openEdit = (branch: Branch) => {
    setCurrentBranch(branch);
    setIsEditing(true);
  };

  return (
    <div className="p-4 md:p-8">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-brand-dark">Manajemen Cabang</h1>
          <p className="text-gray-500 mt-1">Kelola operasional, informasi, dan performa tiap cabang</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
            <button
              onClick={() => setViewMode('grid')}
              className={clsx("p-2 rounded-lg transition-colors", viewMode === 'grid' ? "bg-gray-100 text-brand-dark" : "text-gray-400 hover:text-gray-600")}
              title="Grid View"
            >
              <Grid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={clsx("p-2 rounded-lg transition-colors", viewMode === 'list' ? "bg-gray-100 text-brand-dark" : "text-gray-400 hover:text-gray-600")}
              title="List View"
            >
              <List className="w-5 h-5" />
            </button>
          </div>
          <button 
            onClick={() => { setIsEditing(true); setCurrentBranch({ isActive: true }); }}
            className="bg-[#d4af37] hover:bg-[#c5a030] text-brand-dark px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors font-bold shadow-sm"
          >
            <Plus className="w-5 h-5" />
            Tambah Cabang
          </button>
        </div>
      </div>

      {/* Leaderboard Section */}
      <div className="mb-8 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-[#d4af37]" />
          <h2 className="text-lg font-bold text-brand-dark">Leaderboard Omzet Hari Ini</h2>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {leaderboard.map((b, idx) => (
            <div key={b.id} className="min-w-[200px] flex-1 bg-gray-50 rounded-xl p-4 border border-gray-100 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-lg shadow-sm shrink-0 bg-white text-gray-500">
                {idx === 0 ? '🏆' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
              </div>
              <div>
                <p className="font-bold text-brand-dark line-clamp-1">{b.name}</p>
                <p className="text-sm font-black text-[#d4af37]">Rp {b.stats.omzet.toLocaleString('id-ID')}</p>
              </div>
            </div>
          ))}
          {leaderboard.length === 0 && <p className="text-gray-500 italic text-sm">Belum ada data cabang.</p>}
        </div>
      </div>

      {/* Modal Form */}
      {isEditing && (
        <div className="fixed inset-0 z-50 bg-brand-dark/50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold text-brand-dark flex items-center gap-2">
                <Store className="w-5 h-5 text-[#d4af37]" />
                {currentBranch.id ? 'Edit Cabang' : 'Cabang Baru'}
              </h2>
              <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="branchForm" onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama Cabang *</label>
                  <input required type="text" value={currentBranch.name || ''} onChange={e => setCurrentBranch({...currentBranch, name: e.target.value})} className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-[#d4af37] outline-none" placeholder="Contoh: TokoKoe Pusat" />
                </div>
                
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Alamat Lengkap *</label>
                  <textarea required value={currentBranch.address || ''} onChange={e => setCurrentBranch({...currentBranch, address: e.target.value})} className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-[#d4af37] outline-none" rows={3} placeholder="Alamat lengkap cabang..." />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama PIC / Manager</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={currentBranch.picName || ''} onChange={e => setCurrentBranch({...currentBranch, picName: e.target.value})} className="w-full pl-9 p-2.5 border rounded-xl focus:ring-2 focus:ring-[#d4af37] outline-none" placeholder="Nama Penanggung Jawab" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Telepon</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={currentBranch.phone || ''} onChange={e => setCurrentBranch({...currentBranch, phone: e.target.value})} className="w-full pl-9 p-2.5 border rounded-xl focus:ring-2 focus:ring-[#d4af37] outline-none" placeholder="08123456789" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jam Operasional</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={currentBranch.operationalHours || ''} onChange={e => setCurrentBranch({...currentBranch, operationalHours: e.target.value})} className="w-full pl-9 p-2.5 border rounded-xl focus:ring-2 focus:ring-[#d4af37] outline-none" placeholder="Contoh: 08:00 - 22:00" />
                  </div>
                </div>

                <div className="flex items-center mt-6">
                  <label className="flex items-center gap-3 cursor-pointer p-2.5 bg-gray-50 rounded-xl border border-gray-200 w-full hover:bg-gray-100 transition-colors">
                    <input type="checkbox" checked={currentBranch.isActive !== false} onChange={e => setCurrentBranch({...currentBranch, isActive: e.target.checked})} className="w-5 h-5 accent-[#d4af37] rounded" />
                    <div>
                      <span className="font-bold text-gray-700 block">Cabang Aktif</span>
                      <span className="text-xs text-gray-500">Cabang nonaktif tidak bisa transaksi</span>
                    </div>
                  </label>
                </div>
              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <button type="button" onClick={() => setIsEditing(false)} className="px-6 py-2.5 border border-gray-300 rounded-xl text-gray-600 hover:bg-white font-bold transition-colors">Batal</button>
              <button type="submit" form="branchForm" className="px-6 py-2.5 bg-[#d4af37] text-brand-dark rounded-xl hover:bg-[#c5a030] font-bold shadow-sm transition-colors">Simpan Cabang</button>
            </div>
          </div>
        </div>
      )}

      {/* Branch Cards */}
      <div className={clsx(
        "grid gap-6",
        viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-2"
      )}>
        {branchData.map(branch => (
          <div key={branch.id} className={clsx(
            "bg-white rounded-2xl shadow-sm border overflow-hidden hover:shadow-md transition-shadow relative flex flex-col",
            branch.isActive ? "border-gray-200" : "border-gray-200 opacity-75"
          )}>
            {!branch.isActive && (
              <div className="absolute inset-0 bg-gray-50/50 z-10 pointer-events-none"></div>
            )}
            
            {/* Card Header */}
            <div className="bg-brand-dark p-4 flex justify-between items-start relative z-20">
              <div className="pr-12">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Store className="w-5 h-5 text-[#d4af37]" />
                  {branch.name}
                </h3>
                <span className={clsx(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold mt-1.5 uppercase tracking-wider",
                  branch.isActive ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"
                )}>
                  {branch.isActive ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  {branch.isActive ? 'Beroperasi' : 'Nonaktif'}
                </span>
              </div>
              <button onClick={() => openEdit(branch)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors" title="Edit Cabang">
                <Edit2 className="w-4 h-4" />
              </button>
            </div>

            {/* Info Section */}
            <div className="p-5 flex-1 flex flex-col relative z-20 bg-white">
              <div className="flex gap-4 mb-5">
                {/* Map Link */}
                <a href={`https://maps.google.com/?q=${encodeURIComponent(branch.address || branch.name)}`} target="_blank" rel="noreferrer" className="w-20 h-20 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-100 flex flex-col items-center justify-center text-blue-400 shrink-0 relative overflow-hidden transition-colors cursor-pointer group shadow-inner">
                  <Map className="w-8 h-8 opacity-60 group-hover:scale-110 transition-transform" />
                  <div className="absolute inset-0 bg-gradient-to-t from-blue-200/40 to-transparent"></div>
                  <span className="text-[9px] font-bold absolute bottom-1 uppercase text-blue-700">Buka Map</span>
                </a>
                
                <div className="space-y-2.5 flex-1">
                  <div className="flex items-start gap-2 text-sm text-gray-600 leading-tight">
                    <MapPin className="w-4 h-4 text-[#d4af37] shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{branch.address || '-'}</span>
                  </div>
                  {branch.picName && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <User className="w-4 h-4 text-[#d4af37] shrink-0" />
                      <span className="font-semibold">{branch.picName}</span>
                    </div>
                  )}
                  {branch.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="w-4 h-4 text-[#d4af37] shrink-0" />
                      <span>{branch.phone}</span>
                    </div>
                  )}
                  {branch.operationalHours && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Clock className="w-4 h-4 text-[#d4af37] shrink-0" />
                      <span>{branch.operationalHours}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Mini Stats Row */}
              <div className="grid grid-cols-2 gap-2 mb-5">
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  <p className="text-[10px] text-gray-500 font-bold uppercase mb-0.5">Omzet Hari Ini</p>
                  <p className="text-sm font-black text-brand-dark">Rp {(branch.stats.omzet / 1000).toLocaleString('id-ID')}K</p>
                </div>
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex flex-col justify-center">
                  <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Status Kasir</p>
                  <div className="flex items-center gap-1.5">
                    <div className={clsx("w-2 h-2 rounded-full", branch.stats.isKasirOpen ? "bg-green-500" : "bg-red-500")}></div>
                    <span className={clsx("text-xs font-bold", branch.stats.isKasirOpen ? "text-green-700" : "text-red-700")}>
                      {branch.stats.isKasirOpen ? 'Buka' : 'Tutup'}
                    </span>
                  </div>
                </div>
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-0.5">Karyawan</p>
                    <p className="text-sm font-black text-brand-dark">{branch.stats.karyawan}</p>
                  </div>
                  <Users className="w-4 h-4 text-gray-300" />
                </div>
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-0.5">Produk</p>
                    <p className="text-sm font-black text-brand-dark">{branch.stats.produk}</p>
                  </div>
                  <Package className="w-4 h-4 text-gray-300" />
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-gray-100 grid grid-cols-2 gap-2">
                <button onClick={() => navigate('/')} className="flex items-center justify-center gap-1.5 px-2 py-2 bg-white hover:bg-gray-50 text-brand-dark rounded-lg transition-colors text-xs font-bold border border-gray-200">
                  <BarChart3 className="w-3.5 h-3.5 text-[#d4af37]" /> Laporan
                </button>
                <button onClick={() => navigate('/transfer')} className="flex items-center justify-center gap-1.5 px-2 py-2 bg-white hover:bg-gray-50 text-brand-dark rounded-lg transition-colors text-xs font-bold border border-gray-200">
                  <Activity className="w-3.5 h-3.5 text-[#d4af37]" /> Log Stok
                </button>
              </div>
            </div>
          </div>
        ))}
        {branchData.length === 0 && (
          <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-gray-200">
            <Store className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-lg font-bold text-gray-500">Belum ada cabang terdaftar</p>
            <p className="text-gray-400 mb-4">Mulai dengan menambahkan cabang pertama Anda.</p>
            <button 
              onClick={() => { setIsEditing(true); setCurrentBranch({ isActive: true }); }}
              className="bg-[#d4af37] text-brand-dark px-6 py-2 rounded-xl font-bold inline-flex items-center gap-2 hover:bg-[#c5a030]"
            >
              <Plus className="w-5 h-5" /> Tambah Cabang
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Branches;
