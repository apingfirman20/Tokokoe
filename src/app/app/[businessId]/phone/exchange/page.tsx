'use client';

import React, { useState } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { RefreshCw, Shield, AlertTriangle, ArrowRight, Check } from 'lucide-react';

export default function ExchangePage() {
  const { imeiUnits, exchangeImei } = useBusiness();

  const [oldImei, setOldImei] = useState('');
  const [newImei, setNewImei] = useState('');
  const [reason, setReason] = useState('Kendala LCD / Garansi retur toko');
  const [fee, setFee] = useState<number>(0);

  const [successMsg, setSuccessMsg] = useState('');

  const availableUnits = imeiUnits.filter(u => u.status === 'available');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldImei.trim() || !newImei.trim()) {
      alert('IMEI unit lama dan unit pengganti wajib ditentukan.');
      return;
    }

    const res = await exchangeImei(oldImei.trim(), newImei.trim(), reason, fee);
    if (res.success) {
      setSuccessMsg(`✓ Tukar unit sukses! Unit lama IMEI ${oldImei} telah ditarik ke karantina dan digantikan unit IMEI ${newImei}.`);
      setOldImei('');
      setNewImei('');
      setTimeout(() => setSuccessMsg(''), 5000);
    } else {
      alert(res.error);
    }
  };


  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <div className="flex items-center gap-2">
          <RefreshCw className="w-6 h-6 text-amber-600" />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Tukar Unit & Klaim Garansi IMEI
          </h1>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Validasi unit bermasalah, tukar ganti dengan stok tersedia, dan karantina unit retur
        </p>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            IMEI Unit Lama yang Bermasalah <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            value={oldImei}
            onChange={(e) => setOldImei(e.target.value)}
            placeholder="Scan atau ketik 15 digit IMEI lama..."
            className="w-full font-mono text-sm p-2.5 rounded-xl border border-slate-300 outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Pilih Unit Pengganti dari Stok Aktif <span className="text-rose-500">*</span>
          </label>
          <select
            required
            value={newImei}
            onChange={(e) => setNewImei(e.target.value)}
            className="w-full font-mono text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
          >
            <option value="">-- Pilih Unit Pengganti --</option>
            {availableUnits.map((u) => (
              <option key={u.id} value={u.imei}>
                {u.brand} {u.model} {u.storage} ({u.color}) — IMEI: {u.imei}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Alasan Penukaran / Kerusakan Unit
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
          />
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
          >
            <span>Eksekusi Tukar Unit</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
