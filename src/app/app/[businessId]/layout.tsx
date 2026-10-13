import React, { Suspense } from 'react';
import BusinessLayoutClient from './BusinessLayoutClient';

export default function BusinessAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm font-medium">Memuat workspace Tokokoe...</p>
        </div>
      </div>
    }>
      <BusinessLayoutClient>{children}</BusinessLayoutClient>
    </Suspense>
  );
}
