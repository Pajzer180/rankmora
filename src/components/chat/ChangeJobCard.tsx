'use client';

import { useState } from 'react';
import {
  Rocket,
  Undo2,
  BarChart3,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import { getClientAuth } from '@/lib/firebase';

export interface ChangeJobCardProps {
  jobId: string;
  pageUrl: string;
  changeType: string;
  beforeValue: Record<string, unknown>;
  proposedValue: Record<string, unknown>;
  previewSummary: string;
  targetType?: string;
  targetId?: number;
}

type JobStatus = 'idle' | 'applying' | 'applied' | 'rolling_back' | 'rolled_back' | 'failed';

const FIELD_LABELS: Record<string, string> = {
  title: 'Tytuł',
  metaDescription: 'Meta opis',
  content: 'Treść',
};

function truncate(value: unknown, maxLen: number): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

async function getAuthToken(): Promise<string> {
  const user = getClientAuth().currentUser;
  if (!user) throw new Error('Nie jesteś zalogowany');
  return user.getIdToken();
}

export default function ChangeJobCard({
  jobId,
  pageUrl,
  changeType,
  beforeValue,
  proposedValue,
  previewSummary,
}: ChangeJobCardProps) {
  const [status, setStatus] = useState<JobStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [measurements, setMeasurements] = useState<Record<string, unknown> | null>(null);

  const changedFields = Object.keys(proposedValue).filter(
    (key) => JSON.stringify(proposedValue[key]) !== JSON.stringify(beforeValue[key]),
  );

  async function handleApply() {
    setStatus('applying');
    setMessage(null);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/wordpress/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Błąd wdrożenia');
      setStatus('applied');
      setMessage('Wdrożono pomyślnie');
    } catch (err) {
      setStatus('failed');
      setMessage(err instanceof Error ? err.message : 'Nieznany błąd');
    }
  }

  async function handleRollback() {
    setStatus('rolling_back');
    setMessage(null);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/wordpress/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Błąd cofania');
      setStatus('rolled_back');
      setMessage('Cofnięto pomyślnie');
    } catch (err) {
      setStatus('failed');
      setMessage(err instanceof Error ? err.message : 'Nieznany błąd');
    }
  }

  async function handleShowResults() {
    setMessage(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/change-measurements?jobId=${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nie udało się pobrać wyników');
      setMeasurements(data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Nieznany błąd');
    }
  }

  const isLoading = status === 'applying' || status === 'rolling_back';

  return (
    <div className="my-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-purple-600/20 px-2 py-0.5 text-xs font-medium text-purple-400">
          {changeType}
        </span>
        <a
          href={pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 truncate font-mono text-xs text-gray-400 transition-colors hover:text-gray-200"
        >
          {pageUrl.length > 50 ? pageUrl.slice(0, 50) + '...' : pageUrl}
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
        </a>
      </div>

      {/* Summary */}
      <p className="mb-3 text-gray-300">{previewSummary}</p>

      {/* Before / After comparison */}
      {changedFields.length > 0 && (
        <div className="mb-3 space-y-2">
          {changedFields.map((field) => (
            <div key={field} className="rounded-lg border border-white/5 bg-black/20 p-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {FIELD_LABELS[field] ?? field}
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex gap-2">
                  <span className="flex-shrink-0 text-red-400">Przed:</span>
                  <span className="text-gray-400">
                    {truncate(beforeValue[field], field === 'content' ? 200 : 120)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="flex-shrink-0 text-green-400">Po:</span>
                  <span className="text-gray-200">
                    {truncate(proposedValue[field], field === 'content' ? 200 : 120)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {(status === 'idle' || status === 'failed') && (
          <button
            onClick={handleApply}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            <Rocket className="h-3.5 w-3.5" />
            Wdróż w WordPress
          </button>
        )}

        {status === 'applied' && (
          <>
            <button
              onClick={handleRollback}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-600/30 disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Cofnij
            </button>
            <button
              onClick={handleShowResults}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-white/10"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Pokaż wyniki
            </button>
          </>
        )}

        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
      </div>

      {/* Status message */}
      {message && (
        <div
          className={`mt-2 flex items-center gap-1.5 text-xs ${
            status === 'failed' ? 'text-red-400' : 'text-green-400'
          }`}
        >
          {status === 'failed' ? (
            <XCircle className="h-3.5 w-3.5" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          {message}
        </div>
      )}

      {/* Measurements */}
      {measurements && (
        <div className="mt-3 rounded-lg border border-white/5 bg-black/20 p-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Wyniki pomiaru
          </div>
          <pre className="max-h-40 overflow-auto text-xs text-gray-300">
            {JSON.stringify(measurements, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
