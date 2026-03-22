'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Link2,
  Loader2,
  RefreshCw,
  Unplug,
  Upload,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getOrCreateDefaultProject } from '@/lib/snippetActions';
import type { Project } from '@/lib/snippetActions';
import type {
  WordPressApplyResponse,
  WordPressConnectResponse,
  WordPressFetchResponse,
  WordPressItemSummary,
  WordPressPreviewResponse,
} from '@/types/wordpress';

interface ConnectionFormState {
  siteUrl: string;
  wpUsername: string;
  applicationPassword: string;
}

interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

function formatDate(ts?: number | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('pl-PL', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function connectionBadgeClass(status: 'connected' | 'failed' | 'disconnected') {
  if (status === 'connected') return 'border-green-500/30 bg-green-500/10 text-green-400';
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-400';
  return 'border-white/10 bg-white/5 text-zinc-400';
}

function getAuthTokenErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';

  if (code.startsWith('auth/')) {
    return 'Sesja Bress wygasla. Zaloguj sie ponownie.';
  }

  return error instanceof Error
    ? error.message
    : 'Nie udalo sie pobrac aktywnej sesji Bress.';
}

export default function UstawieniaPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [connectionForm, setConnectionForm] = useState<ConnectionFormState>({
    siteUrl: '',
    wpUsername: '',
    applicationPassword: '',
  });
  const [connectLoading, setConnectLoading] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [connectionFeedback, setConnectionFeedback] = useState<FeedbackState | null>(null);

  const [targetType, setTargetType] = useState<'pages' | 'posts'>('pages');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<WordPressItemSummary[]>([]);
  const [fetchingItems, setFetchingItems] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WordPressItemSummary | null>(null);

  const [suggestedTitle, setSuggestedTitle] = useState('');
  const [suggestedContent, setSuggestedContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<WordPressPreviewResponse | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyResult, setApplyResult] = useState<WordPressApplyResponse | null>(null);
  const [contentFeedback, setContentFeedback] = useState<FeedbackState | null>(null);

  const loadData = useCallback(async () => {
    if (!user || !profile) return;

    setPageLoading(true);
    setPageError(null);

    try {
      const proj = await getOrCreateDefaultProject(user.uid, {
        projectName: profile.projectName,
        companyName: profile.companyName,
        domain: profile.domain,
      });

      setProject(proj);
      setConnectionForm((prev) => ({
        siteUrl: proj.wordpress?.siteUrl ?? prev.siteUrl ?? '',
        wpUsername: proj.wordpress?.wpUsername ?? prev.wpUsername ?? '',
        applicationPassword: '',
      }));
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setPageLoading(false);
    }
  }, [user, profile]);

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
  }, [loading, user, profile, router, loadData]);

  const connectionStatus = project?.wordpress?.status ?? 'disconnected';
  const isConnected = connectionStatus === 'connected';

  const postAuthorizedJson = useCallback(async <T,>(url: string, body: unknown): Promise<T> => {
    if (!user) {
      throw new Error('Brak autoryzacji.');
    }

    let idToken: string;
    try {
      idToken = await user.getIdToken(true);
    } catch (error) {
      throw new Error(getAuthTokenErrorMessage(error));
    }

    if (!idToken) {
      throw new Error('Nie udalo sie pobrac aktywnej sesji Bress. Zaloguj sie ponownie.');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json().catch(() => null)) as
      | { error?: string; details?: unknown }
      | null;

    if (!response.ok) {
      throw new Error(data?.error ?? `HTTP ${response.status}`);
    }

    return data as T;
  }, [user]);

  const resetPreviewState = useCallback(() => {
    setPreviewData(null);
    setApplyResult(null);
    setContentFeedback(null);
  }, []);

  const handleConnect = async () => {
    if (!project) return;

    setConnectLoading(true);
    setConnectionFeedback(null);

    try {
      const response = await postAuthorizedJson<WordPressConnectResponse>('/api/wordpress/connect', {
        projectId: project.id,
        siteUrl: connectionForm.siteUrl,
        wpUsername: connectionForm.wpUsername,
        applicationPassword: connectionForm.applicationPassword,
      });

      setConnectionFeedback({
        type: 'success',
        message: `Polaczono poprawnie. Zweryfikowano uzytkownika ${response.verifiedUser}.`,
      });
      setConnectionForm((prev) => ({ ...prev, applicationPassword: '' }));
    } catch (error) {
      setConnectionFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setConnectLoading(false);
      await loadData();
    }
  };

  const handleDisconnect = async () => {
    if (!project) return;

    setDisconnectLoading(true);
    setConnectionFeedback(null);

    try {
      await postAuthorizedJson('/api/wordpress/disconnect', {
        projectId: project.id,
      });

      setItems([]);
      setSelectedItem(null);
      setSuggestedTitle('');
      setSuggestedContent('');
      resetPreviewState();
      setConnectionFeedback({
        type: 'success',
        message: 'Polaczenie WordPress zostalo rozlaczone.',
      });
    } catch (error) {
      setConnectionFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDisconnectLoading(false);
      await loadData();
    }
  };

  const handleFetchItems = async () => {
    setFetchingItems(true);
    setContentFeedback(null);

    try {
      const response = await postAuthorizedJson<WordPressFetchResponse>('/api/wordpress/fetch', {
        targetType,
        search: search.trim() || undefined,
      });

      setItems(response.items);
      setSelectedItem((current) => {
        if (!current) return null;
        return response.items.find((item) => item.id === current.id && item.targetType === current.targetType) ?? null;
      });
      setContentFeedback({
        type: 'success',
        message: response.items.length
          ? `Pobrano ${response.items.length} pozycji z WordPress.`
          : 'Brak wynikow dla tego filtra.',
      });
    } catch (error) {
      setContentFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setFetchingItems(false);
    }
  };

  const handleSelectItem = (item: WordPressItemSummary) => {
    setSelectedItem(item);
    setSuggestedTitle('');
    setSuggestedContent('');
    resetPreviewState();
  };

  const handleCreatePreview = async () => {
    if (!selectedItem) {
      setContentFeedback({ type: 'error', message: 'Najpierw wybierz strone lub wpis.' });
      return;
    }

    const suggestedTitleValue = suggestedTitle.trim();
    const suggestedContentValue = suggestedContent.trim();
    if (!suggestedTitleValue && !suggestedContentValue) {
      setContentFeedback({ type: 'error', message: 'Podaj nowy title lub content do podgladu.' });
      return;
    }

    setPreviewLoading(true);
    setContentFeedback(null);
    setApplyResult(null);

    try {
      const body: {
        targetType: 'page' | 'post';
        targetId: number;
        suggestedTitle?: string;
        suggestedContent?: string;
      } = {
        targetType: selectedItem.targetType,
        targetId: selectedItem.id,
      };

      if (suggestedTitleValue) {
        body.suggestedTitle = suggestedTitleValue;
      }
      if (suggestedContentValue) {
        body.suggestedContent = suggestedContent;
      }

      const response = await postAuthorizedJson<WordPressPreviewResponse>('/api/wordpress/preview', body);
      setPreviewData(response);
      setContentFeedback({
        type: 'success',
        message: `Podglad gotowy. Job ID: ${response.jobId}.`,
      });
    } catch (error) {
      setContentFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApplyPreview = async () => {
    if (!previewData) return;

    setApplyLoading(true);
    setContentFeedback(null);

    try {
      const response = await postAuthorizedJson<WordPressApplyResponse>('/api/wordpress/apply', {
        jobId: previewData.jobId,
      });

      setApplyResult(response);
      setItems((current) => current.map((item) => (
        item.id === response.updatedItem.id && item.targetType === response.updatedItem.targetType
          ? response.updatedItem
          : item
      )));
      setContentFeedback({
        type: 'success',
        message: 'Zmiany zostaly zastosowane w WordPress.',
      });
    } catch (error) {
      setContentFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setApplyLoading(false);
    }
  };

  const selectedItemLabel = useMemo(() => {
    if (!selectedItem) return 'Brak wybranej strony';
    return `${selectedItem.title} (${selectedItem.targetType})`;
  }, [selectedItem]);

  if (loading || pageLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <p className="text-sm text-zinc-500">
          Uzupelnij najpierw profil projektu, aby polaczyc WordPress.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-5xl space-y-6">
        <section>
          <div className="mb-2 flex items-center gap-2.5">
            <Link2 className="h-5 w-5 text-purple-400" />
            <h1 className="text-xl font-bold text-white">Polacz WordPress</h1>
          </div>
          <p className="text-sm leading-relaxed text-zinc-400">
            MVP flow: connect - fetch - preview - apply. Dane WordPress sa obslugiwane tylko przez server-side route handlers.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Dane polaczenia
            </h2>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Site URL
                </label>
                <input
                  type="url"
                  value={connectionForm.siteUrl}
                  onChange={(e) => setConnectionForm((prev) => ({ ...prev, siteUrl: e.target.value }))}
                  placeholder="https://twoja-strona.pl"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-purple-500/50"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                  WP Username
                </label>
                <input
                  value={connectionForm.wpUsername}
                  onChange={(e) => setConnectionForm((prev) => ({ ...prev, wpUsername: e.target.value }))}
                  placeholder="np. admin"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-purple-500/50"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Application Password
                </label>
                <input
                  type="password"
                  value={connectionForm.applicationPassword}
                  onChange={(e) => setConnectionForm((prev) => ({ ...prev, applicationPassword: e.target.value }))}
                  placeholder="wklej Application Password"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-purple-500/50"
                />
                <p className="mt-2 text-xs text-zinc-500">
                  Haslo jest wysylane tylko do server route i po zapisie nie wraca juz do przegladarki.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={handleConnect}
                disabled={connectLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
              >
                {connectLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {connectLoading ? 'Laczenie...' : 'Zapisz i sprawdz polaczenie'}
              </button>

              <button
                onClick={handleDisconnect}
                disabled={disconnectLoading || !project?.wordpress}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                {disconnectLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                {disconnectLoading ? 'Rozlaczanie...' : 'Rozlacz'}
              </button>
            </div>

            {connectionFeedback && (
              <div
                className={`mt-4 rounded-lg border p-3 text-sm ${
                  connectionFeedback.type === 'success'
                    ? 'border-green-500/20 bg-green-500/5 text-green-300'
                    : 'border-red-500/20 bg-red-500/5 text-red-300'
                }`}
              >
                {connectionFeedback.message}
              </div>
            )}

            {pageError && (
              <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
                {pageError}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Status polaczenia
            </h2>

            <div className="mb-4 flex items-center gap-2 text-sm">
              <span className={`rounded-full border px-2 py-0.5 ${connectionBadgeClass(connectionStatus)}`}>
                {connectionStatus}
              </span>
              {connectionStatus === 'connected' && <CheckCircle2 className="h-4 w-4 text-green-400" />}
              {connectionStatus === 'failed' && <AlertCircle className="h-4 w-4 text-red-400" />}
            </div>

            <div className="space-y-2 text-sm text-zinc-400">
              <p>Site URL: {project?.wordpress?.siteUrl ?? '-'}</p>
              <p>WP Username: {project?.wordpress?.wpUsername ?? '-'}</p>
              <p>Zweryfikowany user: {project?.wordpress?.lastVerifiedUser ?? '-'}</p>
              <p>Ostatni test: {formatDate(project?.wordpress?.lastCheckedAt)}</p>
              {project?.wordpress?.lastError && (
                <p className="text-red-400">Blad: {project.wordpress.lastError}</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setTargetType('pages')}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                targetType === 'pages'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/5 text-zinc-300 hover:bg-white/10'
              }`}
            >
              Strony
            </button>
            <button
              onClick={() => setTargetType('posts')}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                targetType === 'posts'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/5 text-zinc-300 hover:bg-white/10'
              }`}
            >
              Wpisy
            </button>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj po tytule lub slugu"
              className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-purple-500/50"
            />
            <button
              onClick={handleFetchItems}
              disabled={!isConnected || fetchingItems}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
            >
              {fetchingItems ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {fetchingItems ? 'Pobieranie...' : `Pobierz ${targetType === 'pages' ? 'strony' : 'wpisy'}`}
            </button>
          </div>

          {!isConnected && (
            <p className="text-sm text-zinc-500">
              Najpierw zapisz poprawne polaczenie WordPress, aby pobrac strony i wpisy.
            </p>
          )}

          {isConnected && items.length === 0 && !fetchingItems && (
            <p className="text-sm text-zinc-500">
              Kliknij przycisk pobierania, aby zaladowac liste z WordPress.
            </p>
          )}

          {isConnected && items.length > 0 && (
            <div className="space-y-2">
              {items.map((item) => {
                const isSelected = selectedItem?.id === item.id && selectedItem?.targetType === item.targetType;
                return (
                  <article
                    key={`${item.targetType}-${item.id}`}
                    className={`rounded-lg border p-3 transition-colors ${
                      isSelected
                        ? 'border-purple-500/40 bg-purple-500/10'
                        : 'border-white/10 bg-black/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{item.title}</p>
                        <p className="mt-1 text-xs text-zinc-500">slug: {item.slug || '-'}</p>
                        <p className="mt-1 text-xs text-zinc-500">status: {item.status}</p>
                        {item.link && (
                          <Link href={item.link} target="_blank" className="mt-1 inline-block text-xs text-purple-300 hover:text-purple-200">
                            {item.link}
                          </Link>
                        )}
                      </div>
                      <button
                        onClick={() => handleSelectItem(item)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
                      >
                        {isSelected ? 'Wybrane' : 'Wybierz'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Preview i apply
          </h2>
          <p className="mb-4 text-sm text-zinc-400">Wybrana pozycja: {selectedItemLabel}</p>

          {!selectedItem && (
            <p className="text-sm text-zinc-500">
              Wybierz najpierw strone lub wpis z listy powyzej.
            </p>
          )}

          {selectedItem && (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                    Suggested title
                  </label>
                  <input
                    value={suggestedTitle}
                    onChange={(e) => setSuggestedTitle(e.target.value)}
                    placeholder={selectedItem.title}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-purple-500/50"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                    Suggested content
                  </label>
                  <textarea
                    value={suggestedContent}
                    onChange={(e) => setSuggestedContent(e.target.value)}
                    rows={8}
                    placeholder="Wklej nowy content HTML lub tresc do podgladu"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-purple-500/50"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={handleCreatePreview}
                  disabled={previewLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
                >
                  {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {previewLoading ? 'Generowanie...' : 'Generuj podglad'}
                </button>

                <button
                  onClick={handleApplyPreview}
                  disabled={!previewData || applyLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  {applyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {applyLoading ? 'Zastosowywanie...' : 'Zastosuj zmiany'}
                </button>
              </div>

              {contentFeedback && (
                <div
                  className={`mt-4 rounded-lg border p-3 text-sm ${
                    contentFeedback.type === 'success'
                      ? 'border-green-500/20 bg-green-500/5 text-green-300'
                      : 'border-red-500/20 bg-red-500/5 text-red-300'
                  }`}
                >
                  {contentFeedback.message}
                </div>
              )}
            </>
          )}

          {previewData && (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-zinc-400">
                Job ID: {previewData.jobId} · changed fields: {previewData.changedFields.join(', ')}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Before</p>
                  <p className="mb-2 text-sm font-semibold text-white">{previewData.currentTitle || '-'}</p>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-300">
                    {previewData.currentContent || '-'}
                  </pre>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">After</p>
                  <p className="mb-2 text-sm font-semibold text-white">{previewData.suggestedTitle || '-'}</p>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-300">
                    {previewData.suggestedContent || '-'}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {applyResult && (
            <div className="mt-6 rounded-lg border border-green-500/20 bg-green-500/5 p-4">
              <p className="text-sm font-medium text-green-300">Zmiany zostaly zapisane w WordPress.</p>
              <p className="mt-2 text-xs text-zinc-300">ID: {applyResult.updatedItem.id}</p>
              <p className="mt-1 text-xs text-zinc-300">Title: {applyResult.updatedItem.title}</p>
              {applyResult.updatedItem.link && (
                <Link href={applyResult.updatedItem.link} target="_blank" className="mt-2 inline-block text-xs text-green-300 hover:text-green-200">
                  Otworz zaktualizowana strone
                </Link>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
