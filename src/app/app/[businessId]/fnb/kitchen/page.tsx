'use client';

import React, { use } from 'react';
import { useBusiness } from '@/context/BusinessContext';
import { KitchenOrderStatus } from '@/types';
import { ChefHat, Clock, CheckCircle2, ArrowRight, BellRing } from 'lucide-react';

export default function KitchenPage() {
  const { sales, updateOrderStatus, activeBusiness } = useBusiness();
  const businessId = activeBusiness?.id || 'biz_kopi_senja';

  // Orders must be approved/forwarded by Cashier first (waiting_cashier is hidden from Kitchen)
  const kitchenSales = sales.filter(
    s => s.businessId === businessId && s.orderStatus !== 'completed' && s.orderStatus !== 'waiting_cashier'
  );

  const getStatusColor = (status: KitchenOrderStatus) => {
    switch (status) {
      case 'new': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'preparing': return 'bg-sky-100 text-sky-800 border-sky-300';
      case 'ready': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      default: return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  const getStatusLabel = (status: KitchenOrderStatus) => {
    switch (status) {
      case 'new': return 'Pesanan Baru Masuk';
      case 'preparing': return 'Sedang Dimasak';
      case 'ready': return 'Siap Saji';
      case 'served': return 'Telah Disajikan';
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ChefHat className="w-6 h-6 text-teal-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Layar Dapur & KDS (Kitchen Display System)
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Status persiapan pesanan makanan dan minuman real-time ({kitchenSales.length} tiket aktif)
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>KDS Auto-Sync Aktif</span>
        </div>
      </div>

      {kitchenSales.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-dashed border-slate-300 text-center text-slate-400">
          <ChefHat className="w-12 h-12 stroke-1 mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">Tidak ada antrean pesanan di dapur saat ini.</p>
          <p className="text-xs text-slate-400 mt-0.5">Pesanan baru dari POS kasir akan otomatis muncul di layar ini.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {kitchenSales.map((sale) => (
            <div
              key={sale.id}
              className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col justify-between overflow-hidden"
            >
              <div>
                {/* Header Ticket */}
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-slate-800">{sale.saleNumber}</span>
                    <div className="text-xs font-semibold text-teal-800 mt-0.5">
                      {sale.tableNumber || sale.orderType} {sale.customerName ? `• ${sale.customerName}` : ''}
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase ${getStatusColor(sale.orderStatus)}`}>
                    {getStatusLabel(sale.orderStatus)}
                  </span>
                </div>

                {/* Items List */}
                <div className="p-4 space-y-2.5">
                  {sale.lineItems.map((item, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-3 text-xs">
                      <div>
                        <div className="font-bold text-slate-900">
                          {item.quantity}x {item.productName}
                        </div>
                        {item.selectedOptions && Object.keys(item.selectedOptions).length > 0 && (
                          <div className="text-[11px] text-teal-800 font-semibold mt-0.5">
                            {Object.entries(item.selectedOptions).map(([k, v]) => `${k}: ${v}`).join(' • ')}
                          </div>
                        )}
                        {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                          <div className="text-[11px] text-purple-800 font-semibold mt-0.5">
                            + {item.selectedModifiers.join(', ')}
                          </div>
                        )}
                        {item.notes && (
                          <div className="text-[11px] text-amber-800 font-medium italic mt-0.5">
                            Catatan: {item.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Action Buttons */}
              <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                {sale.orderStatus === 'new' && (
                  <button
                    onClick={() => updateOrderStatus(sale.id, 'preparing')}
                    className="w-full py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>Mulai Memasak</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                {sale.orderStatus === 'preparing' && (
                  <button
                    onClick={() => updateOrderStatus(sale.id, 'ready')}
                    className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Tandai Siap Saji</span>
                  </button>
                )}

                {sale.orderStatus === 'ready' && (
                  <button
                    onClick={() => updateOrderStatus(sale.id, 'completed')}
                    className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>Selesai Disajikan</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
