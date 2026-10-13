'use client';

import React, { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useBusiness } from '@/context/BusinessContext';
import { AppShell } from '@/components/layout/AppShell';

export default function BusinessLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const businessId = params?.businessId as string;
  const { activeBusiness, switchBusiness } = useBusiness();

  useEffect(() => {
    if (businessId && activeBusiness?.id !== businessId) {
      switchBusiness(businessId);
    }
  }, [businessId, activeBusiness?.id, switchBusiness]);

  return <AppShell>{children}</AppShell>;
}
