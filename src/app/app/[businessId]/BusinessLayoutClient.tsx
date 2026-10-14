'use client';

import React, { useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { AppShell } from '@/components/layout/AppShell';
import { evaluateRouteAccess } from '@/lib/modules/registry';
import { ShieldAlert, ArrowLeft, Building2 } from 'lucide-react';

export default function BusinessLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const businessId = params?.businessId as string;
  const { user, isLoading } = useAuth();
  const { businesses, activeBusiness, switchBusiness } = useBusiness();

  useEffect(() => {
    if (businessId && activeBusiness?.id !== businessId) {
      switchBusiness(businessId);
    }
  }, [businessId, activeBusiness?.id, switchBusiness]);

  // 1. Cross-Tenant Direct URL Protection:
  // If user is loaded and businesses list is loaded, verify caller is authorized for this tenant
  const isTenantAuthorized = !user || businesses.length === 0 || businesses.some(b => b.id === businessId);
  if (user && businesses.length > 0 && !isTenantAuthorized) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl max-w-md w-full p-6 text-center border border-slate-700 shadow-2xl">
          <div className="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4 border border-rose-500/30">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white">Akses Bisnis Ditolak</h2>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Anda bukan anggota atau pemilik resmi dari unit usaha ini. Akses lintas bisnis (Cross-Tenant) dicegah demi keamanan data.
          </p>
          <div className="mt-6 flex justify-center">
            <Link
              href="/businesses"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs transition-colors"
            >
              <Building2 className="w-4 h-4" />
              <span>Buka Daftar Bisnis Saya</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 2. Vertical & Module Route Direct URL Enforcement:
  const routeAccess = evaluateRouteAccess(
    pathname,
    activeBusiness,
    user?.memberRole || 'owner',
    user?.permissions
  );

  if (!routeAccess.allowed) {
    return (
      <AppShell>
        <div className="min-h-[70vh] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-center border border-slate-200 shadow-lg">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Akses Modul Dibatasi</h2>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              {routeAccess.reason}
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Link
                href={`/app/${businessId}/dashboard`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Kembali ke Dashboard</span>
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return <AppShell>{children}</AppShell>;
}
