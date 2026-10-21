'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useBusiness } from '@/context/BusinessContext';
import { INITIAL_BUSINESSES } from '@/lib/data/seed-data';
import { FnBPosScreen } from '@/components/pos/FnBPosScreen';
import { PhonePosScreen } from '@/components/pos/PhonePosScreen';
import { RetailPosScreen } from '@/components/pos/RetailPosScreen';

export default function PosPage() {
  const params = useParams();
  const routeBusinessId = params?.businessId as string;
  const { activeBusiness, businesses } = useBusiness();

  // Resolve business matching the URL route directly to prevent mismatched POS screen during SSR or hydration
  const currentBiz = 
    (routeBusinessId ? businesses.find(b => b.id === routeBusinessId) : null) || 
    activeBusiness || 
    INITIAL_BUSINESSES.find(b => b.id === routeBusinessId) ||
    INITIAL_BUSINESSES[0];

  const businessType = currentBiz?.businessType || 'fnb';

  return (
    <div>
      {businessType === 'fnb' && <FnBPosScreen />}
      {businessType === 'phone' && <PhonePosScreen />}
      {businessType === 'retail' && <RetailPosScreen />}
    </div>
  );
}
