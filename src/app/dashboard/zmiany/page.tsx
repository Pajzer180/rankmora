'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  GitCompare,
  Loader2,
  RotateCcw,
  Upload,
  XCircle,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getOrCreateDefaultProject } from '@/lib/snippetActions';
import type { Project } from '@/lib/snippetActions';
import type { ChangeJobRecord, ChangeJobStatus } from '@/types/changeJobs';
import type { ChangeMeasurementRecord } from '@/types/changeMeasurements';

type StatusFilter = 'all' | ChangeJobStatus;

interface StatusTab {
  key: StatusFilter;
  label: string;
}

const STATUS_TABS: StatusTab[] = [
  { key: 'all', label: 'Wszystkie' },
  { key: 'preview_ready', label: 'Oczekujace' },
  { key: 'applied', label: 'Zastosowane' },
  { key: 'rolled_back', label: 'Cofniete' },
  { key: 'failed', label: 'Bledne' },
];

function formatDateTime(ts?: number | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('pl-PL', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function changeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    title: 'Tytul',
    meta_description: 'Meta opis',
    h1: 'Naglowek H1',
    content: 'Tresc',
    internal_link: 'Link wewnetrzny',
    cta: 'CTA',
    other: 'Inne',
  };
  return labels[type] ?? type;
}

function statusBadge(status: ChangeJobStatus) {
  switch (status) {
    case 'preview_ready':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-400">
          <Clock className="h-3 w-3" />
          Oczekuje
        </span>
      );
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
          <CheckCircle2 className="h-3 w-3" />
          Zatwierdzono
        </span>
      );
    case 'applied':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
          <CheckCircle2 className="h-3 w-3" />
          Zastosowano
        </span>
      );
    case 'rolled_back':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-xs text-purple-400">
          <RotateCcw className="h-3 w-3" />
          Cofnieto
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
          <XCircle className="h-3 w-3" />
          Blad
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-zinc-400">
          {status}
        </span>
      );
  }
}

function ZmianyPageFallback() {
  return (
    <div className="flex flex-1 items-center justify-center bg-black">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
    </div>
  );
}

function ZmianyPageContent() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ChangeJobRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [measurements, setMeasurements] = useState<Record<string, ChangeMeasurementRecord[]>>({});
  const [measurementsLoading, setMeasurementsLoading] = useState<string | null>(null);

  const requestAuthorizedJson = useCallback(async <T,>(
    url: string,
    init?: RequestInit,
  ): Promise<T> => {
    if (!user) throw new Error('Brak autoryzacji.');
    const idToken = await user.getIdToken();
    const response = await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${idToken}`,
      },
      cache: init?.cache ?? 'no-store',
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | T | null;
    if (!response.ok) {
      throw new Error((data as { error?: string } | null)?.error ?? `HTTP ${response.status}`);
    }
    return data as T;
  }, [user]);

  const loadData = useCallback(async () => {
    if (!user || !profile) return;
    setPageLoading(true);
    setPageError(null);

    try {
      const nextProject = await getOrCreateDefaultProject(user.uid, {
        projectName: profile.projectName,
        companyName: profile.companyName,
        domain: profile.domain,
      });
      setProject(nextProject);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setPageLoading(false);
    }
  }, [profile, user]);

  const loadJobs = useCallback(async (projectId: string) => {
    try {
      const res = await requestAuthorizedJson<{ ok: boolean; jobs: ChangeJobRecord[] }>(
        `/api/change-jobs?projectId=${encodeURIComponent(projectId)}`,
      );
      setJobs(res.jobs);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    }
  }, [requestAuthorizedJson]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (user && profile) {
      void loadData();
      return;
    }
    if (!loading && user && !profile) {
      setPageLoading(false);
    }
  }, [loadData, loading, profile, router, user]);

  useEffect(() => {
    if (project?.id) {
      void loadJobs(project.id);
    }
  }, [project?.id, loadJobs]);

  const filteredJobs = useMemo(() => {
    if (statusFilter === 'all') return jobs;
    return jobs.filter((job) => job.status === statusFilter);
  }, [jobs, statusFilter]);

  const handleApply = async (jobId: string) => {
    setActionLoading(jobId);
    setPageError(null);
    try {
      await requestAuthorizedJson('/api/wordpress/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      if (project?.id) await loadJobs(project.id);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRollback = async (jobId: string) => {
    setActionLoading(jobId);
    setPageError(null);
    try {
      await requestAuthorizedJson('/api/wordpress/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      if (project?.id) await loadJobs(project.id);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionLoading(null);
    }
  };

  const handleLoadMeasurements = async (jobId: string) => {
    if (measurements[jobId]) {
      // toggle off
      setMeasurements((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
      return;
    }

    setMeasurementsLoading(jobId);
    try {
      const res = await requestAuthorizedJson<{ ok: boolean; measurements: ChangeMeasurementRecord[] }>(
        `/api/change-measurements?jobId=${encodeURIComponent(jobId)}`,
      );
      setMeasurements((prev) => ({ ...prev, [jobId]: res.measurements }));
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setMeasurementsLoading(null);
    }
  };

  if (loading || pageLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <p className="text-sm text-zinc-500">
          Uzupelnij najpierw profil projektu.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-black px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <GitCompare className="h-5 w-5 text-purple-400" />
          <h1 className="text-lg font-semibold text-white">Zmiany</h1>
          <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-400">
            {jobs.length}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Lista optymalizacji SEO wygenerowanych przez agenta.
        </p>
      </div>

      {/* Error */}
      {pageError && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {pageError}
        </div>
      )}

      {/* Status filter tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === tab.key
                ? 'bg-purple-600/20 text-purple-400'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Jobs list */}
      {filteredJobs.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center">
          <p className="text-sm text-zinc-500">Brak zmian do wyswietlenia.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5"
            >
              {/* Job header */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-zinc-400">
                    {job.pageUrl}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {statusBadge(job.status)}
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-zinc-400">
                      {changeTypeLabel(job.changeType)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Preview summary */}
              {job.previewSummary && (
                <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                  {job.previewSummary}
                </p>
              )}

              {/* Timestamps */}
              <div className="mt-3 flex flex-wrap gap-4 text-[10px] uppercase tracking-wide text-zinc-600">
                <span>Utworzono: {formatDateTime(job.createdAt)}</span>
                {job.appliedAt && <span>Wdrozono: {formatDateTime(job.appliedAt)}</span>}
                {job.rolledBackAt && <span>Cofnieto: {formatDateTime(job.rolledBackAt)}</span>}
              </div>

              {/* Error message */}
              {job.status === 'failed' && job.error?.message && (
                <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300">
                  {job.error.message}
                </div>
              )}

              {/* Actions */}
              <div className="mt-4 flex flex-wrap gap-2">
                {job.status === 'preview_ready' && (
                  <button
                    onClick={() => handleApply(job.id)}
                    disabled={actionLoading === job.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
                  >
                    {actionLoading === job.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    Wdroz
                  </button>
                )}

                {job.status === 'applied' && (
                  <>
                    <button
                      onClick={() => handleRollback(job.id)}
                      disabled={actionLoading === job.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-100 transition-colors hover:bg-white/10 disabled:opacity-50"
                    >
                      {actionLoading === job.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Cofnij
                    </button>
                    <button
                      onClick={() => handleLoadMeasurements(job.id)}
                      disabled={measurementsLoading === job.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-100 transition-colors hover:bg-white/10 disabled:opacity-50"
                    >
                      {measurementsLoading === job.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <BarChart3 className="h-3.5 w-3.5" />
                      )}
                      Pomiary
                    </button>
                  </>
                )}
              </div>

              {/* Measurements panel */}
              {measurements[job.id] && (
                <div className="mt-4 rounded-xl border border-white/8 bg-black/50 p-4">
                  <p className="mb-3 text-xs font-medium text-zinc-300">Pomiary po wdrozeniu</p>
                  {measurements[job.id].length === 0 ? (
                    <p className="text-xs text-zinc-500">Brak pomiarow. Dane pojawia sie po kilku dniach.</p>
                  ) : (
                    <div className="space-y-3">
                      {measurements[job.id]
                        .sort((a, b) => a.window.localeCompare(b.window))
                        .map((m) => (
                          <div key={m.id} className="rounded-lg border border-white/8 bg-white/5 p-3">
                            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                              Okno: {m.window}
                            </p>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                              <div>
                                <p className="text-[10px] text-zinc-600">Klikniecia</p>
                                <p className="text-sm font-bold text-white">
                                  {m.current?.clicks?.toLocaleString('pl-PL') ?? '-'}
                                </p>
                                {m.delta && (
                                  <p className={`text-[10px] ${m.delta.clicks >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {m.delta.clicks >= 0 ? '+' : ''}{m.delta.clicks.toLocaleString('pl-PL')}
                                  </p>
                                )}
                              </div>
                              <div>
                                <p className="text-[10px] text-zinc-600">Wyswietlenia</p>
                                <p className="text-sm font-bold text-white">
                                  {m.current?.impressions?.toLocaleString('pl-PL') ?? '-'}
                                </p>
                                {m.delta && (
                                  <p className={`text-[10px] ${m.delta.impressions >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {m.delta.impressions >= 0 ? '+' : ''}{m.delta.impressions.toLocaleString('pl-PL')}
                                  </p>
                                )}
                              </div>
                              <div>
                                <p className="text-[10px] text-zinc-600">CTR</p>
                                <p className="text-sm font-bold text-white">
                                  {m.current?.ctr != null ? `${(m.current.ctr * 100).toFixed(1)}%` : '-'}
                                </p>
                                {m.delta && (
                                  <p className={`text-[10px] ${m.delta.ctr >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {m.delta.ctr >= 0 ? '+' : ''}{(m.delta.ctr * 100).toFixed(1)}%
                                  </p>
                                )}
                              </div>
                              <div>
                                <p className="text-[10px] text-zinc-600">Pozycja</p>
                                <p className="text-sm font-bold text-white">
                                  {m.current?.position != null ? m.current.position.toFixed(1) : '-'}
                                </p>
                                {m.delta && (
                                  <p className={`text-[10px] ${m.delta.position <= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {m.delta.position <= 0 ? '' : '+'}{m.delta.position.toFixed(1)}
                                  </p>
                                )}
                              </div>
                            </div>
                            <p className="mt-2 text-[10px] text-zinc-600">
                              Zmierzono: {formatDateTime(m.measuredAt)}
                            </p>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ZmianyPage() {
  return (
    <Suspense fallback={<ZmianyPageFallback />}>
      <ZmianyPageContent />
    </Suspense>
  );
}
