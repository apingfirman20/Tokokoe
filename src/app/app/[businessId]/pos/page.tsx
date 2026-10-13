'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useBusiness } from '@/context/BusinessContext';
import { FnBPosScreen } from '@/components/pos/FnBPosScreen';
import { PhonePosScreen } from '@/components/pos/PhonePosScreen';
import { RetailPosScreen } from '@/components/pos/RetailPosScreen';

export default function PosPage() {
  const params = useParams();
  const routeBusinessId = params?.businessId as string;
  const { activeBusiness, businesses } = useBusiness();

  // Resolve business matching the URL route directly to prevent mismatched POS screen during SSR
  const currentBiz = (routeBusinessId ? businesses.find(b => b.id === routeBusinessId) : null) || activeBusiness;

  if (!currentBiz) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-xs font-medium">Menyiapkan modul POS usaha...</p>
        </div>
      </div>
    );
  }

  const businessType = currentBiz.businessType;

  return (
    <div>
      {businessType === 'fnb' && <FnBPosScreen />}
      {businessType === 'phone' && <PhonePosScreen />}
      {businessType === 'retail' && <RetailPosScreen />}
    </div>
  );
}
