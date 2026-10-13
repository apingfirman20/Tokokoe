'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { Store, ArrowRight, ShieldCheck, Coffee, Smartphone, ShoppingBag } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        if (user.role === 'employee' && user.activeBusinessId) {
          router.replace(`/app/${user.activeBusinessId}/pos`);
        } else {
          router.replace('/businesses');
        }
      } else {
        router.replace('/login');
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-400 flex items-center justify-center text-white mb-4 shadow-xl">
        <Store className="w-8 h-8" />
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight">Tokokoe SaaS</h1>
      <p className="text-teal-400 font-medium text-sm mt-1">Satu Platform, Semua Usaha.</p>
      <p className="text-xs text-slate-400 mt-4 max-w-sm">
        Mengarahkan ke workspace Anda...
      </p>
      <div className="mt-6">
        <Link
          href="/login"
          className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs transition-colors"
        >
          Masuk ke Akun
        </Link>
      </div>
    </div>
  );
}
