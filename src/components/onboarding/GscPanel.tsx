'use client';

import { useState } from 'react';
import { Globe, CheckCircle, Loader2 } from 'lucide-react';

interface GscPanelProps {
  connected: boolean;
  onConnect: () => Promise<void> | void;
}

export function GscPanel({ connected, onConnect }: GscPanelProps) {
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      await onConnect();
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="rounded-2xl bg-[#111111] p-8">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-xl font-semibold text-white">Google Search Console</h2>
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
          opcjonalnie
        </span>
      </div>
      <p className="mb-6 text-sm text-zinc-500">
        Bress.io analizuje pozycje i CTR z danych Google Search Console.
      </p>

      <div className="rounded-xl border border-white/10 bg-black/40 p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
            <Globe className="h-4 w-4 text-gray-300" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Google Search Console</p>
            <p className="text-xs text-zinc-500">Uprawnienia tylko do odczytu</p>
          </div>
          {connected && (
            <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-green-400">
              <CheckCircle className="h-3.5 w-3.5" />
              Polaczono
            </span>
          )}
        </div>

        {!connected ? (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-100 disabled:opacity-60"
          >
            {connecting ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Laczenie...</>
            ) : (
              <><span className="font-bold text-blue-600">G</span>Polacz konto Google</>
            )}
          </button>
        ) : (
          <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-center">
            <p className="text-sm font-medium text-green-300">Polaczono pomyslnie.</p>
          </div>
        )}
      </div>
    </div>
  );
}