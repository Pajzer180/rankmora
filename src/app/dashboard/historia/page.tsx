'use client';

// LEGACY — tryb developerski historii zmian. Zastąpiony przez /dashboard/zmiany.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getOrCreateDefaultProject } from '@/lib/snippetActions';
import type { ChangeHistoryEntry } from '@/types/history';

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('pl-PL', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function statusBadgeClass(status: ChangeHistoryEntry['status']): string {
  if (status === 'applied') return 'border-green-500/30 bg-green-500/10 text-green-400';
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-400';
  return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400';
}

function previewText(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '-';
  return normalized.length > 220 ? `${normalized.slice(0, 220)}...` : normalized;
}

interface ApplyDraft {
  endpoint: string;
  payloadText: string;
  entityId: string;
}

interface ApplyFeedback {
  type: 'success' | 'error';
  text: string;
}

function buildDefaultEndpoint(entry: ChangeHistoryEntry): string {
  if ((entry.entityType === 'page' || entry.entityType === 'homepage') && entry.entityId) {
    return `/wp-json/wp/v2/pages/${entry.entityId}`;
  }
  if (entry.entityType === 'post' && entry.entityId) {
    return `/wp-json/wp/v2/posts/${entry.entityId}`;
  }
  return '';
}

function buildDefaultPayload(entry: ChangeHistoryEntry): Record<string, unknown> {
  if (entry.actionType === 'update_title') return { title: entry.afterValue };
  if (
    entry.actionType === 'update_content' ||
    entry.actionType === 'update_h1' ||
    entry.actionType === 'update_h2'
  ) {
    return { content: entry.afterValue };
  }
  if (entry.actionType === 'update_meta_description') {
    return { meta: { description: entry.afterValue } };
  }
  if (entry.actionType === 'update_canonical') return { meta: { canonical: entry.afterValue } };
  if (entry.actionType === 'update_robots') return { meta: { robots: entry.afterValue } };
  return { value: entry.afterValue };
}

export default function HistoriaPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<ChangeHistoryEntry[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyDrafts, setApplyDrafts] = useState<Record<string, ApplyDraft>>({});
  const [applyingById, setApplyingById] = useState<Record<string, boolean>>({});
  const [applyFeedbackById, setApplyFeedbackById] = useState<Record<string, ApplyFeedback>>({});

  const loadHistory = useCallback(async () => {
    if (!user || !profile) return;
    setPageLoading(true);
    setError(null);

    try {
      const project = await getOrCreateDefaultProject(user.uid, {
        projectName: profile.projectName,
        companyName: profile.companyName,
        domain: profile.domain,
      });

      const idToken = await user.getIdToken();
      if (!idToken) {
        throw new Error('Brak tokenu autoryzacji');
      }

      const response = await fetch(
        `/api/history?projectId=${encodeURIComponent(project.id)}&limit=100`,
        {
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        },
      );
      if (!response.ok) {
        if (response.status === 401) throw new Error('Brak autoryzacji');
        if (response.status === 403) throw new Error('Brak dostepu do projektu');
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as { items?: ChangeHistoryEntry[] };
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
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
      void loadHistory();
      return;
    }
    if (!loading && user && !profile) {
      setPageLoading(false);
    }
  }, [loading, user, profile, router, loadHistory]);

  const getDraft = useCallback(
    (entry: ChangeHistoryEntry): ApplyDraft => {
      return (
        applyDrafts[entry.id] ?? {
          endpoint: buildDefaultEndpoint(entry),
          payloadText: JSON.stringify(buildDefaultPayload(entry), null, 2),
          entityId: entry.entityId ?? '',
        }
      );
    },
    [applyDrafts],
  );

  const handleApply = useCallback(
    async (entry: ChangeHistoryEntry) => {
      if (!user) return;

      const draft = getDraft(entry);
      const endpoint = draft.endpoint.trim();
      const entityId = draft.entityId.trim() || entry.entityId || null;

      if (!endpoint) {
        setApplyFeedbackById((prev) => ({
          ...prev,
          [entry.id]: { type: 'error', text: 'Podaj endpoint WordPress API.' },
        }));
        return;
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(draft.payloadText) as Record<string, unknown>;
      } catch {
        setApplyFeedbackById((prev) => ({
          ...prev,
          [entry.id]: { type: 'error', text: 'Payload musi byc poprawnym JSON.' },
        }));
        return;
      }

      setApplyingById((prev) => ({ ...prev, [entry.id]: true }));
      setApplyFeedbackById((prev) => {
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });

      try {
        const requestId = entry.requestId ?? crypto.randomUUID();
        const idToken = await user.getIdToken();
        const res = await fetch('/api/wordpress/apply', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            projectId: entry.projectId,
            siteUrl: entry.siteUrl,
            pageUrl: entry.pageUrl,
            actionType: entry.actionType,
            beforeValue: entry.beforeValue,
            afterValue: entry.afterValue,
            summary: entry.summary,
            requestId,
            actionId: entry.actionId ?? null,
            endpoint,
            payload,
            source: 'wordpress_api',
            entityType: entry.entityType,
            entityId,
          }),
        });
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);

        setApplyFeedbackById((prev) => ({
          ...prev,
          [entry.id]: { type: 'success', text: 'Zmieniono. Zapisano applied.' },
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setApplyFeedbackById((prev) => ({
          ...prev,
          [entry.id]: { type: 'error', text: `Blad apply: ${message}` },
        }));
      } finally {
        setApplyingById((prev) => ({ ...prev, [entry.id]: false }));
        await loadHistory();
      }
    },
    [getDraft, loadHistory, user],
  );

  if (loading || pageLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-black px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Historia zmian</h1>
        <button
          onClick={() => void loadHistory()}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
        >
          Odswiez
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          Nie udalo sie pobrac historii: {error}
        </div>
      )}

      {!error && items.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">
          Brak zapisanych zmian.
        </div>
      )}

      <div className="space-y-3">
        {items.map((entry) => {
          const draft = getDraft(entry);
          const applying = !!applyingById[entry.id];
          const feedback = applyFeedbackById[entry.id] ?? null;

          return (
            <article key={entry.id} className="rounded-xl border border-white/10 bg-zinc-950/70 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full border px-2 py-0.5 ${statusBadgeClass(entry.status)}`}>
                  {entry.status}
                </span>
                <span className="text-zinc-500">{formatDate(entry.createdAt)}</span>
                <span className="text-zinc-500">source: {entry.source}</span>
              </div>

              <p className="text-sm font-medium text-white">{entry.summary}</p>
              <p className="mt-1 text-xs text-zinc-400">URL: {entry.pageUrl || entry.siteUrl}</p>
              <p className="mt-1 text-xs text-zinc-500">
                action: {entry.actionType} · entity: {entry.entityType}
                {entry.entityId ? `#${entry.entityId}` : ''}
              </p>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-black/50 p-2">
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Before</p>
                  <pre className="whitespace-pre-wrap break-words text-xs text-zinc-300">{previewText(entry.beforeValue)}</pre>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/50 p-2">
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">After</p>
                  <pre className="whitespace-pre-wrap break-words text-xs text-zinc-300">{previewText(entry.afterValue)}</pre>
                </div>
              </div>

              {entry.status === 'preview' && (
                <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3">
                  <p className="mb-2 text-xs font-medium text-zinc-300">WordPress apply</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      value={draft.endpoint}
                      onChange={(e) =>
                        setApplyDrafts((prev) => ({
                          ...prev,
                          [entry.id]: { ...draft, endpoint: e.target.value },
                        }))
                      }
                      placeholder="/wp-json/wp/v2/pages/123"
                      className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-purple-500/50"
                    />
                    <input
                      value={draft.entityId}
                      onChange={(e) =>
                        setApplyDrafts((prev) => ({
                          ...prev,
                          [entry.id]: { ...draft, entityId: e.target.value },
                        }))
                      }
                      placeholder="entityId (opcjonalne)"
                      className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-purple-500/50"
                    />
                  </div>

                  <textarea
                    value={draft.payloadText}
                    onChange={(e) =>
                      setApplyDrafts((prev) => ({
                        ...prev,
                        [entry.id]: { ...draft, payloadText: e.target.value },
                      }))
                    }
                    rows={5}
                    className="mt-2 w-full rounded border border-white/10 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 outline-none focus:border-purple-500/50"
                  />

                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => void handleApply(entry)}
                      disabled={applying}
                      className="rounded bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-50"
                    >
                      {applying ? 'Zastosowywanie...' : 'Zastosuj'}
                    </button>
                    {feedback && (
                      <span className={`text-xs ${feedback.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                        {feedback.text}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {(entry.requestId || entry.actionId) && (
                <p className="mt-2 text-[11px] text-zinc-600">
                  requestId: {entry.requestId ?? '-'} | actionId: {entry.actionId ?? '-'}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}