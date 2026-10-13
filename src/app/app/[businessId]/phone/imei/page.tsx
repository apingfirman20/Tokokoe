'use client';

import React, { useState, use } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { formatRupiah } from '@/lib/utils';
import { Smartphone, Search, History, Shield, CheckCircle2, AlertOctagon, X } from 'lucide-react';

export default function ImeiTrackerPage() {
  const { imeiUnits, imeiHistories } = useBusiness();

  const [search, setSearch] = useState('');
  const [selectedImei, setSelectedImei] = useState<string | null>(null);

  const filtered = imeiUnits.filter(u => 
    u.imei.includes(search) ||
    u.productName.toLowerCase().includes(search.toLowerCase()) ||
    u.brand.toLowerCase().includes(search.toLowerCase())
  );

  const selectedUnitHistories = imeiHistories.filter(h => h.imei === selectedImei);
  const currentUnit = imeiUnits.find(u => u.imei === selectedImei);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Smartphone className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Pelacak & Histori Unit IMEI
          </h1>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Pencarian nomor serial unik (15 digit), audit mutasi, dan validasi masa garansi perangkat
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Scan barcode IMEI atau ketik nama model HP..."
          className="w-full bg-transparent border-0 outline-none text-xs text-slate-900 font-mono"
        />
      </div>

      {/* IMEI Units Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Nomor IMEI (Serial)</th>
                <th className="py-3 px-4">Model & Spesifikasi</th>
                <th className="py-3 px-4">Kondisi</th>
                <th className="py-3 px-4 text-right">Harga Jual</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Riwayat Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((unit) => (
                <tr key={unit.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                    <div>{unit.imei}</div>
                    {unit.imei2 && (
                      <div className="text-[10px] text-slate-400 font-normal">SIM 2: {unit.imei2}</div>
                    )}
                    {unit.serialNumber && (
                      <div className="text-[10px] text-slate-500 font-normal">SN: {unit.serialNumber}</div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{unit.brand} {unit.model} {unit.storage}</div>
                    <div className="text-[11px] text-slate-500">Warna: {unit.color}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] uppercase font-bold">
                      {unit.condition === 'new' ? 'Baru' : 'Second'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                    {formatRupiah(unit.sellingPrice)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      unit.status === 'available'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : unit.status === 'sold'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : unit.status === 'reserved'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : unit.status === 'quarantined'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : 'bg-purple-50 text-purple-700 border border-purple-200'
                    }`}>
                      {unit.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => setSelectedImei(unit.imei)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-[11px] transition-colors"
                    >
                      Buka Timeline
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* IMEI History Timeline Modal */}
      {selectedImei && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-bold text-base text-slate-900">Jejak Rekam Mutasi IMEI</h3>
                <div className="font-mono text-xs text-indigo-700 mt-0.5 font-bold">
                  {selectedImei} {currentUnit ? `(${currentUnit.brand} ${currentUnit.model})` : ''}
                </div>
              </div>
              <button onClick={() => setSelectedImei(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
              {selectedUnitHistories.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Belum ada log riwayat mutasi untuk unit ini.
                </div>
              ) : (
                selectedUnitHistories.map((hist, idx) => (
                  <div key={idx} className="flex gap-3 text-xs">
                    <div className="w-2 rounded-full bg-indigo-500 shrink-0 self-stretch" />
                    <div className="flex-1 bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold uppercase text-indigo-900 text-[11px]">{hist.action}</span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(hist.timestamp).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <p className="text-slate-700 text-xs">{hist.notes}</p>
                      <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200/60">
                        Operator: {hist.operatorName} • Ref: {hist.referenceId}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedImei(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
