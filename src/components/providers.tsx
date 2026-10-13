'use client';

import React from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { BusinessProvider } from '@/context/BusinessContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <BusinessProvider>
        {children}
      </BusinessProvider>
    </AuthProvider>
  );
}
