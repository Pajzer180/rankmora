'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle, Globe, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getOrCreateDefaultProject } from '@/lib/snippetActions';
import type { Project } from '@/lib/snippetActions';
import type {
  SearchConsoleConnectResponse,
  SearchConsolePropertySummary,
  SearchConsoleSelectPropertyResponse,
  SearchConsoleSitesResponse,
} from '@/types/searchConsole';

interface StepGscProps {
  connected: boolean;
  onConnectionChange: (connected: boolean) => void;
  projectProfile: {
    projectName: string;
    companyName: string;
    domain: string;
  };
}

function getSearchConsoleFeedback(
  status: string | null,
  reason: string | null,
): { type: 'success' | 'error'; message: string } | null {
  if (status === 'connected') {
    return {
      type: 'success',
      message: 'Google Search Console zostal polaczony z projektem.',
    };
  }

  if (status !== 'error') {
    return null;
  }

  switch (reason) {
    case 'oauth-denied':
      return { type: 'error', message: 'Polaczenie z Google zostalo anulowane. Kliknij ponownie i zaakceptuj uprawnienia.' };
    case 'oauth-error':
      return { type: 'error', message: 'Google zwrocil blad podczas autoryzacji. Sprobuj ponownie.' };
    case 'token-exchange-failed':
      return { type: 'error', message: 'Nie udalo sie wymienic kodu autoryzacji na token. Sprawdz konfiguracje OAuth (Client ID, Secret, Redirect URI) w Google Cloud Console.' };
    case 'missing-access-token':
      return { type: 'error', message: 'Google nie zwrocil tokenu dostepu. Sprobuj ponownie.' };
    case 'missing-refresh-token':
      return { type: 'error', message: 'Google nie zwrocil refresh tokenu. Usun Bress.io z uprawnien w koncie Google (myaccount.google.com/permissions), a nastepnie polacz ponownie.' };
    case 'properties-failed':
      return { type: 'error', message: 'Nie udalo sie pobrac listy stron z Search Console. Sprawdz czy masz properties w Google Search Console.' };
    case 'encryption-config-missing':
      return { type: 'error', message: 'Brak konfiguracji szyfrowania tokenow (GSC_TOKENS_SECRET). Skontaktuj sie z administratorem.' };
    case 'state-invalid':
      return { type: 'error', message: 'Sesja autoryzacji wygasla lub jest nieprawidlowa. Sprobuj ponownie.' };
    case 'missing-params':
      return { type: 'error', message: 'Brakuje parametrow w odpowiedzi OAuth. Sprawdz konfiguracje Redirect URI w Google Cloud Console.' };
    case 'rate-limited':
      return { type: 'error', message: 'Zbyt wiele prob polaczenia. Poczekaj chwile i sprobuj ponownie.' };
    case 'callback-failed':
      return { type: 'error', message: 'Nie udalo sie dokonczyc polaczenia z Google Search Console. Sprawdz logi serwera.' };
    default:
      return { type: 'error', message: 'Wystapil blad podczas laczenia z Google Search Console.' };
  }
}

export function StepGsc({ connected, onConnectionChange, projectProfile }: StepGscProps) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const gscStatus = searchParams.get('gsc');
  const gscReason = searchParams.get('gscReason');

  const [project, setProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [propertyDraft, setPropertyDraft] = useState('');

  const projectId = project?.id ?? null;
  const projectStatus = project?.searchConsole?.status ?? null;
  const selectedPropertyUrl = project?.searchConsole?.selectedPropertyUrl ?? '';
  const firstAvailablePropertyUrl = project?.searchConsole?.availableProperties?.[0]?.siteUrl ?? '';

  const propertyDraftRef = useRef(propertyDraft);
  const lastConnectionValueRef = useRef<boolean | null>(null);
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    propertyDraftRef.current = propertyDraft;
  }, [propertyDraft]);

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);

  const syncPropertyDraft = useCallback((nextDraft: string) => {
    if (propertyDraftRef.current === nextDraft) {
      return;
    }

    propertyDraftRef.current = nextDraft;
    setPropertyDraft(nextDraft);
  }, []);

  const syncConnectionChange = useCallback((nextConnected: boolean) => {
    if (lastConnectionValueRef.current === nextConnected) {
      return;
    }

    lastConnectionValueRef.current = nextConnected;
    onConnectionChangeRef.current(nextConnected);
  }, []);

  const feedback = useMemo(
    () => getSearchConsoleFeedback(gscStatus, gscReason),
    [gscReason, gscStatus],
  );

  const loadProject = useCallback(async (): Promise<Project | null> => {
    if (!user || !projectProfile.domain.trim()) {
      setProject(null);
      return null;
    }

    setLoadingProject(true);
    try {
      const nextProject = await getOrCreateDefaultProject(user.uid, {
        projectName: projectProfile.projectName.trim(),
        companyName: projectProfile.companyName.trim(),
        domain: projectProfile.domain.trim(),
      });
      setProject(nextProject);
      return nextProject;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      return null;
    } finally {
      setLoadingProject(false);
    }
  }, [projectProfile.companyName, projectProfile.domain, projectProfile.projectName, user]);

  const fetchAuthorized = useCallback(async <T,>(
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
    });

    const data = (await response.json().catch(() => null)) as { error?: string } | T | null;
    if (!response.ok) {
      throw new Error((data as { error?: string } | null)?.error ?? `HTTP ${response.status}`);
    }

    return data as T;
  }, [user]);

  const loadSites = useCallback(async (nextProjectId: string) => {
    setSitesLoading(true);
    setError(null);

    try {
      const response = await fetchAuthorized<SearchConsoleSitesResponse>(
        `/api/gsc/sites?projectId=${encodeURIComponent(nextProjectId)}`,
        {
          method: 'GET',
          cache: 'no-store',
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

      syncPropertyDraft(response.selectedPropertyUrl ?? response.items[0]?.siteUrl ?? '');
      syncConnectionChange(Boolean(response.selectedPropertyUrl));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      syncConnectionChange(false);
    } finally {
      setSitesLoading(false);
    }
  }, [fetchAuthorized, syncConnectionChange, syncPropertyDraft]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  useEffect(() => {
    syncPropertyDraft(selectedPropertyUrl || firstAvailablePropertyUrl);
  }, [firstAvailablePropertyUrl, selectedPropertyUrl, syncPropertyDraft]);

  useEffect(() => {
    syncConnectionChange(Boolean(selectedPropertyUrl));
  }, [selectedPropertyUrl, syncConnectionChange]);

  useEffect(() => {
    if (!projectId || !user) {
      return;
    }

    const shouldRefreshSites = gscStatus === 'connected' || projectStatus === 'connected';
    if (!shouldRefreshSites) {
      return;
    }

    void loadSites(projectId);
  }, [gscStatus, loadSites, projectId, projectStatus, user]);

  const handleConnect = async () => {
    if (!user) {
      setError('Zaloguj sie ponownie, aby polaczyc Google Search Console.');
      return;
    }

    if (!projectProfile.domain.trim()) {
      setError('Najpierw podaj domene projektu w poprzednim kroku.');
      return;
    }

    setConnectLoading(true);
    setError(null);

    try {
      const currentProject = project ?? await loadProject();
      if (!currentProject) {
        throw new Error('Nie udalo sie przygotowac projektu dla polaczenia Search Console.');
      }

      const response = await fetchAuthorized<SearchConsoleConnectResponse>('/api/gsc/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: currentProject.id,
          returnTo: '/onboarding',
        }),
      });

      window.location.assign(response.authorizationUrl);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setConnectLoading(false);
    }
  };

  const handleSelectProperty = async () => {
    if (!projectId || !propertyDraft) {
      return;
    }

    setSaveLoading(true);
    setError(null);

    try {
      await fetchAuthorized<SearchConsoleSelectPropertyResponse>('/api/gsc/select-site', {
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
      syncConnectionChange(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaveLoading(false);
    }
  };

  const isConnected = projectStatus === 'connected' || connected;
  const availableProperties: SearchConsolePropertySummary[] = project?.searchConsole?.availableProperties ?? [];
  const propertySelectionChanged = propertyDraft !== (project?.searchConsole?.selectedPropertyUrl ?? '');
  const connectDisabled = connectLoading || loadingProject || !projectProfile.domain.trim() || !user;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">Podepnij Google Search Console</h2>
        <p className="mt-3 text-xl text-zinc-400">
          Opcjonalny krok. Mozesz go pominac i wrocic do niego pozniej.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/40 p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
            <Globe className="h-5 w-5 text-gray-300" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Google Search Console</p>
            <p className="text-xs text-zinc-500">Uprawnienia tylko do odczytu</p>
          </div>
          {isConnected && (
            <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-green-400">
              <CheckCircle className="h-4 w-4" />
              Polaczono
            </span>
          )}
        </div>

        {!projectProfile.domain.trim() && (
          <div className="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
            Najpierw wpisz domene projektu w poprzednim kroku.
          </div>
        )}

        {feedback && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-green-500/20 bg-green-500/10 text-green-300'
              : 'border-red-500/20 bg-red-500/10 text-red-300'
          }`}>
            {feedback.message}
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!isConnected ? (
          <button
            onClick={handleConnect}
            disabled={connectDisabled}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-100 disabled:opacity-60"
          >
            {connectLoading || loadingProject ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Laczenie z Google...</>
            ) : (
              <><span className="font-bold text-blue-600">G</span>Polacz z Google Search Console</>
            )}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-4 text-center">
              <CheckCircle className="mx-auto mb-2 h-6 w-6 text-green-400" />
              <p className="text-sm font-medium text-green-300">Konto Google jest juz polaczone z projektem.</p>
            </div>

            {sitesLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/30 px-4 py-4 text-sm text-zinc-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Pobieranie dostepnych properties...
              </div>
            ) : availableProperties.length > 0 ? (
              <div className="space-y-3">
                <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Wlasciwosc Search Console dla projektu
                </label>
                <select
                  value={propertyDraft}
                  onChange={(event) => setPropertyDraft(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white outline-none focus:border-purple-500/50"
                >
                  {availableProperties.map((property) => (
                    <option key={property.siteUrl} value={property.siteUrl}>
                      {property.siteUrl} ({property.permissionLevel})
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleSelectProperty}
                  disabled={!propertyDraft || !propertySelectionChanged || saveLoading}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  {saveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  {saveLoading ? 'Zapisywanie...' : 'Zapisz wybrana wlasciwosc'}
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
                Konto jest polaczone, ale Google nie zwrocilo zadnych dostepnych properties.
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={connectLoading}
              className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
            >
              {connectLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              {connectLoading ? 'Trwa ponowne laczenie...' : 'Polacz ponownie z Google'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}