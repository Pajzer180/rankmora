'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Bot } from 'lucide-react';
import { useEffect } from 'react';

export default function OverviewPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, router, user]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-white/10 bg-black/50 px-6 py-3.5 backdrop-blur">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600/20">
          <Bot className="h-[18px] w-[18px] text-purple-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-100">Przegląd</p>
          <p className="text-xs text-gray-500">
            nazwa-klienta.pl &middot; Ostatnia aktualizacja: dziś
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          <span className="text-xs text-gray-500">Online</span>
        </div>
      </header>

      {/* Kafelki analityczne */}
      <div className="grid grid-cols-3 gap-4 border-b border-white/10 px-6 py-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="mb-2 text-xs text-gray-500">Przeskanowane adresy URL</p>
          <p className="text-2xl font-bold text-white">142</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="mb-2 text-xs text-gray-500">Aktywne optymalizacje H1/H2</p>
          <p className="text-2xl font-bold text-white">38</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="mb-2 text-xs text-gray-500">Estymowany wzrost CTR</p>
          <p className="text-2xl font-bold text-green-400">+12%</p>
        </div>
      </div>

      {/* Szczegółowa analityka */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-h-[300px] rounded-2xl border border-white/10 bg-[#0a0a0a] p-6">
            <h3 className="mb-4 font-medium text-white">Ostatnie modyfikacje H1/H2</h3>
          </div>
          <div className="min-h-[300px] rounded-2xl border border-white/10 bg-[#0a0a0a] p-6">
            <h3 className="mb-4 font-medium text-white">Wyniki widoczności GSC</h3>
          </div>
        </div>
      </div>
    </>
  );
}
