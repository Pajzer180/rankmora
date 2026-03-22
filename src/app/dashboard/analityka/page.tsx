'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getOrCreateDefaultProject } from '@/lib/snippetActions';
import type { Project } from '@/lib/snippetActions';
import type {
  SearchConsoleConnectResponse,
  SearchConsolePagesResponse,
  SearchConsolePagesRow,
  SearchConsoleSelectPropertyResponse,
  SearchConsoleSitesResponse,
  SearchConsoleSummaryResponse,
} from '@/types/searchConsole';

function formatDateTime(ts?: number | null): string {
  if (!ts) {
    return '-';
  }

  return new Date(ts).toLocaleString('pl-PL', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatCtr(ctr: number): string {
  return `${(ctr * 100).toFixed(1)}%`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('pl-PL');
}

function isOlderThan48h(ts: number): boolean {
  return Date.now() - ts > 48 * 60 * 60 * 1000;
}

function getSearchConsoleFeedback(
  status: string | null,
  reason: string | null,
): { type: 'success' | 'error'; message: string } | null {
  if (status === 'connected') {
    return {
      type: 'success',
      message: 'Google Search Console zostal polaczony z tym projektem.',
    };
  }

  if (status !== 'error') {
    return null;
  }

  switch (reason) {
    case 'oauth-denied':
      return { type: 'error', message: 'Polaczenie z Google zostalo anulowane.' };
    case 'oauth-error':
      return { type: 'error', message: 'Google zwrocil blad podczas autoryzacji.' };
    case 'callback-failed':
      return { type: 'error', message: 'Nie udalo sie dokonczyc polaczenia z Google Search Console.' };
    default:
      return { type: 'error', message: 'Wystapil blad podczas laczenia z Google Search Console.' };
  }
}

function computeCtrOpportunities(rows: SearchConsolePagesRow[]): SearchConsolePagesRow[] {
  return rows
    .filter((row) => row.position <= 15 && row.impressions >= 500 && row.ctr <= 0.02)
    .sort((a, b) => b.impressions - a.impressions);
}

function computeTopByClicks(rows: SearchConsolePagesRow[], limit: number): SearchConsolePagesRow[] {
  return [...rows].sort((a, b) => b.clicks - a.clicks).slice(0, limit);
}

function AnalitykaPageFallback() {
  return (
    <div className="flex flex-1 items-center justify-center bg-black">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
    </div>
  );
}

function AnalitykaPageContent() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const gscStatus = searchParams.get('gsc');
  const gscReason = searchParams.get('gscReason');

  const [project, setProject] = useState<Project | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [selectLoading, setSelectLoading] = useState(false);
  const [propertyDraft, setPropertyDraft] = useState('');

  const [summary, setSummary] = useState<SearchConsoleSummaryResponse | null>(null);
  const [pages, setPages] = useState<SearchConsolePagesResponse | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const projectId = project?.id ?? null;
  const projectStatus = project?.searchConsole?.status ?? null;

  const requestAuthorizedJson = useCallback(async <T,>(
    url: string,
    init?: RequestInit,
  ): Promise<T> => {
    if (!user) {
      throw new Error('Brak autoryzacji.');
    }

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
    if (!user || !profile) {
      return;
    }

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

  const loadGscData = useCallback(async (pid: string) => {
    setDataLoading(true);

    try {
      const [summaryRes, pagesRes] = await Promise.all([
        requestAuthorizedJson<SearchConsoleSummaryResponse>(
          `/api/gsc/summary?projectId=${encodeURIComponent(pid)}`,
        ),
        requestAuthorizedJson<SearchConsolePagesResponse>(
          `/api/gsc/pages?projectId=${encodeURIComponent(pid)}&limit=100&sortBy=impressions&sortDir=desc`,
        ),
      ]);

      setSummary(summaryRes);
      setPages(pagesRes);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setDataLoading(false);
    }
  }, [requestAuthorizedJson]);

  const loadSites = useCallback(async (nextProjectId: string) => {
    setSitesLoading(true);

    try {
      const response = await requestAuthorizedJson<SearchConsoleSitesResponse>(
        `/api/gsc/sites?projectId=${encodeURIComponent(nextProjectId)}`,
        {
          method: 'GET',
        },
      );

      setProject((current) => {
        if (!current || current.id !== nextProjectId) {
          return current;
        }

        return {
          ...current,
          searchConsole: {
            connectionId: current.searchConsole?.connectionId ?? nextProjectId,
            status: 'connected',
            selectedPropertyUrl: response.selectedPropertyUrl,
            availableProperties: response.items,
            connectedAt: current.searchConsole?.connectedAt ?? Date.now(),
            updatedAt: Date.now(),
            lastSyncedAt: response.lastSyncedAt,
            lastError: null,
          },
        };
      });

      setPropertyDraft((current) => current || response.selectedPropertyUrl || response.items[0]?.siteUrl || '');
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setSitesLoading(false);
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
    const nextDraft = project?.searchConsole?.selectedPropertyUrl
      ?? project?.searchConsole?.availableProperties?.[0]?.siteUrl
      ?? '';
    setPropertyDraft(nextDraft);
  }, [project]);

  const feedback = useMemo(
    () => getSearchConsoleFeedback(gscStatus, gscReason),
    [gscReason, gscStatus],
  );

  useEffect(() => {
    if (!projectId || !user) {
      return;
    }

    if (gscStatus === 'connected' || projectStatus === 'connected') {
      void loadSites(projectId);
    }
  }, [gscStatus, loadSites, projectId, projectStatus, user]);

  // Fetch GSC data when property is selected and connected
  useEffect(() => {
    if (!projectId || projectStatus !== 'connected') {
      return;
    }

    const selectedProperty = project?.searchConsole?.selectedPropertyUrl;
    if (!selectedProperty) {
      return;
    }

    void loadGscData(projectId);
  }, [projectId, projectStatus, project?.searchConsole?.selectedPropertyUrl, loadGscData]);

  const handleConnect = async () => {
    if (!projectId) {
      return;
    }

    setConnectLoading(true);
    setPageError(null);

    try {
      const response = await requestAuthorizedJson<SearchConsoleConnectResponse>('/api/gsc/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          returnTo: '/dashboard/analityka',
        }),
      });

      window.location.assign(response.authorizationUrl);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
      setConnectLoading(false);
    }
  };

  const handleSelectProperty = async () => {
    if (!projectId || !propertyDraft) {
      return;
    }

    setSelectLoading(true);
    setPageError(null);

    try {
      await requestAuthorizedJson<SearchConsoleSelectPropertyResponse>('/api/gsc/select-site', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          propertyUrl: propertyDraft,
        }),
      });

      await loadSites(projectId);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setSelectLoading(false);
    }
  };

  const handleSync = async () => {
    if (!projectId || syncLoading) {
      return;
    }

    setSyncLoading(true);
    setSyncResult(null);
    setPageError(null);

    try {
      const response = await requestAuthorizedJson<{ ok: boolean }>(
        '/api/gsc/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        },
      );

      if (response.ok) {
        setSyncResult('Synchronizacja zakonczona pomyslnie.');
        // Reload GSC data to show fresh results
        await loadGscData(projectId);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncLoading(false);
    }
  };

  const ctrOpportunities = useMemo(
    () => (pages ? computeCtrOpportunities(pages.rows) : []),
    [pages],
  );

  const topByClicks = useMemo(
    () => (pages ? computeTopByClicks(pages.rows, 5) : []),
    [pages],
  );

  const alerts = useMemo(() => {
    const items: { message: string; severity: 'warning' | 'error' }[] = [];

    if (projectStatus !== 'connected') {
      items.push({
        message: 'Podlacz Google Search Console, aby zobaczyc dane.',
        severity: 'warning',
      });
    }

    if (summary && !summary.freshness.hasData) {
      items.push({
        message: 'Brak danych GSC. Uruchom synchronizacje.',
        severity: 'error',
      });
    }

    if (summary?.freshness.lastSyncedAt && isOlderThan48h(summary.freshness.lastSyncedAt)) {
      items.push({
        message: `Dane moga byc nieaktualne. Ostatnia synchronizacja: ${formatDateTime(summary.freshness.lastSyncedAt)}`,
        severity: 'warning',
      });
    }

    return items;
  }, [projectStatus, summary]);

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
          Uzupelnij najpierw profil projektu, aby podlaczyc Search Console.
        </p>
      </div>
    );
  }

  const searchConsole = project?.searchConsole ?? null;
  const isConnected = projectStatus === 'connected';
  const availableProperties = searchConsole?.availableProperties ?? [];
  const propertySelectionChanged = propertyDraft !== (searchConsole?.selectedPropertyUrl ?? '');

  return (
    <div className="flex-1 overflow-y-auto bg-black px-6 py-6">
      {/* GSC Connection Panel */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-purple-400" />
              <p className="text-sm font-semibold text-white">Google Search Console</p>
              <span className={`rounded-full border px-2 py-0.5 text-xs ${
                isConnected
                  ? 'border-green-500/30 bg-green-500/10 text-green-400'
                  : searchConsole?.status === 'failed'
                    ? 'border-red-500/30 bg-red-500/10 text-red-400'
                    : 'border-white/10 bg-white/5 text-zinc-400'
              }`}>
                {searchConsole?.status ?? 'not-connected'}
              </span>
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
              Polacz projekt z Google Search Console, aby bezpiecznie zapisac token OAuth po stronie serwera
              i wybrac wlasciwosc do przyszlego pobierania metryk.
            </p>
            <div className="grid gap-2 text-xs text-zinc-500 sm:grid-cols-3">
              <p>Projekt: {project?.name ?? '-'}</p>
              <p>Wybrana wlasciwosc: {searchConsole?.selectedPropertyUrl ?? '-'}</p>
              <p>Ostatnia synchronizacja: {formatDateTime(searchConsole?.lastSyncedAt)}</p>
            </div>
          </div>

          <button
            onClick={handleConnect}
            disabled={connectLoading || !projectId}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            {connectLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {connectLoading
              ? 'Przekierowanie do Google...'
              : isConnected
                ? 'Polacz ponownie'
                : 'Polacz z Google'}
          </button>
        </div>

        {feedback && (
          <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-green-500/20 bg-green-500/5 text-green-300'
              : 'border-red-500/20 bg-red-500/5 text-red-300'
          }`}>
            {feedback.message}
          </div>
        )}

        {pageError && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
            {pageError}
          </div>
        )}

        {searchConsole?.lastError && !feedback && !pageError && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
            {searchConsole.lastError}
          </div>
        )}

        {isConnected && (
          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Wlasciwosc Search Console dla projektu
              </label>
              {sitesLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black px-3 py-2.5 text-sm text-zinc-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Pobieranie properties z Google...
                </div>
              ) : availableProperties.length > 0 ? (
                <select
                  value={propertyDraft}
                  onChange={(event) => setPropertyDraft(event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-purple-500/50"
                >
                  {availableProperties.map((property) => (
                    <option key={property.siteUrl} value={property.siteUrl}>
                      {property.siteUrl} ({property.permissionLevel})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2.5 text-sm text-yellow-200">
                  Konto zostalo polaczone, ale Google nie zwrocilo zadnych dostepnych properties.
                </div>
              )}
            </div>

            <button
              onClick={handleSelectProperty}
              disabled={!availableProperties.length || !propertySelectionChanged || selectLoading || sitesLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              {selectLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {selectLoading ? 'Zapisywanie...' : 'Zapisz wybrana wlasciwosc'}
            </button>
          </div>
        )}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.message}
              className={`flex items-center gap-3 rounded-2xl border px-5 py-4 text-sm ${
                alert.severity === 'error'
                  ? 'border-red-500/20 bg-red-500/5 text-red-300'
                  : 'border-yellow-500/20 bg-yellow-500/5 text-yellow-300'
              }`}
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {alert.message}
            </div>
          ))}
        </div>
      )}

      {/* Loading state for GSC data */}
      {dataLoading && (
        <div className="mb-6 flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-10">
          <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
          <p className="text-sm text-zinc-400">Ladowanie danych z Search Console...</p>
        </div>
      )}

      {/* Data sections - only show when we have data */}
      {summary && !dataLoading && (
        <>
          {/* Stan danych */}
          <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 px-6 py-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-purple-400" />
                <h2 className="text-sm font-semibold text-white">Stan danych</h2>
              </div>

              <button
                onClick={handleSync}
                disabled={syncLoading || !projectId}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
                {syncLoading ? 'Synchronizacja...' : 'Synchronizuj teraz'}
              </button>
            </div>

            {syncResult && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 text-sm text-green-300">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                {syncResult}
              </div>
            )}

            {!summary.freshness.hasData || !summary.freshness.lastSyncedAt ? (
              <div className="flex items-center gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-300">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                Brak zsynchronizowanych danych. Kliknij &quot;Synchronizuj teraz&quot; powyzej.
              </div>
            ) : (
              <>
                <div className="mb-4 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
                  <p>Ostatnia synchronizacja: {formatDateTime(summary.freshness.lastSyncedAt)}</p>
                  <p>Okno danych: {summary.windowDays} dni</p>
                </div>

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <div className="rounded-xl border border-white/8 bg-black/50 p-4">
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">Klikniecia</p>
                    <p className="mt-1 text-xl font-bold text-white">{formatNumber(summary.totals.clicks)}</p>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/50 p-4">
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">Wyswietlenia</p>
                    <p className="mt-1 text-xl font-bold text-white">{formatNumber(summary.totals.impressions)}</p>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/50 p-4">
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">Sredni CTR</p>
                    <p className="mt-1 text-xl font-bold text-white">{formatCtr(summary.totals.avgCtr)}</p>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/50 p-4">
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">Srednia pozycja</p>
                    <p className="mt-1 text-xl font-bold text-white">{summary.totals.avgPosition.toFixed(1)}</p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Okazje CTR & Strony do ochrony */}
          {pages && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {/* Okazje CTR */}
              <div className="rounded-2xl border border-sky-500/15 bg-sky-500/5 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15">
                    <TrendingUp className="h-4 w-4 text-sky-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">Okazje CTR</h3>
                  <span className="ml-auto rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-400">
                    {ctrOpportunities.length}
                  </span>
                </div>

                <p className="mb-4 text-xs text-zinc-500">
                  Strony z wysoka pozycja (top 15), duzymi wyswietleniami i niskim CTR. Szybki wzrost bez nowych tresci.
                </p>

                {ctrOpportunities.length === 0 ? (
                  <div className="rounded-xl border border-white/8 bg-black/50 p-4 text-center">
                    <p className="text-xs text-zinc-500">Brak okazji spelniajacych kryteria.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {ctrOpportunities.map((row) => (
                      <div key={row.pageUrl} className="rounded-xl border border-white/8 bg-black/50 p-4">
                        <p className="mb-3 truncate font-mono text-xs text-zinc-400">{row.pageUrl}</p>

                        <div className="mb-3 flex gap-4">
                          <div>
                            <p className="text-[10px] text-zinc-600">Pozycja</p>
                            <p className="text-sm font-bold text-white">#{row.position.toFixed(1)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-zinc-600">CTR</p>
                            <p className="text-sm font-bold text-orange-400">{formatCtr(row.ctr)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-zinc-600">Wyswietlenia</p>
                            <p className="text-sm font-bold text-white">{formatNumber(row.impressions)}</p>
                          </div>
                        </div>

                        <Link href={`/dashboard/chat?pageUrl=${encodeURIComponent(row.pageUrl)}`}>
                          <button className="w-full rounded-lg border border-sky-500/25 bg-sky-500/10 py-2 text-xs font-medium text-sky-400 transition-colors hover:bg-sky-500/20">
                            Otworz w chacie
                          </button>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Strony do ochrony */}
              <div className="rounded-2xl border border-violet-500/15 bg-violet-500/5 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15">
                    <ShieldCheck className="h-4 w-4 text-violet-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">Strony do ochrony</h3>
                  <span className="ml-auto rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-400">
                    {topByClicks.length}
                  </span>
                </div>

                <p className="mb-4 text-xs text-zinc-500">
                  Najlepsze strony wedlug klikniec. Wymagaja ostroznosci przy optymalizacji.
                </p>

                {topByClicks.length === 0 ? (
                  <div className="rounded-xl border border-white/8 bg-black/50 p-4 text-center">
                    <p className="text-xs text-zinc-500">Brak danych o stronach.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {topByClicks.map((row) => (
                      <div
                        key={row.pageUrl}
                        className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/50 p-4"
                      >
                        <ShieldCheck className="h-5 w-5 flex-shrink-0 text-green-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-xs text-zinc-300">{row.pageUrl}</p>
                          <p className="mt-0.5 text-[10px] text-zinc-500">
                            CTR {formatCtr(row.ctr)} · {formatNumber(row.clicks)} klikniec · {formatNumber(row.impressions)} wyswietlen
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AnalitykaPage() {
  return (
    <Suspense fallback={<AnalitykaPageFallback />}>
      <AnalitykaPageContent />
    </Suspense>
  );
}
