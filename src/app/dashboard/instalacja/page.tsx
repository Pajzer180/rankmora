'use client';

// LEGACY — strona instalacji JS snippetu. Ukryta z głównej nawigacji.

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import {
  getOrCreateDefaultProject,
  generateSnippetToken,
  getSnippetStatus,
} from '@/lib/snippetActions';
import type { Project, SiteInstall } from '@/lib/snippetActions';
import { buildSnippetTag } from '@/lib/appUrl';
import {
  Code,
  Copy,
  Check,
  RefreshCw,
  Wifi,
  WifiOff,
  Globe,
  Clock,
  Hash,
} from 'lucide-react';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'przed chwilą';
  if (mins < 60) return `${mins} min temu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} godz. temu`;
  const days = Math.floor(hrs / 24);
  return `${days} dni temu`;
}

export default function InstalacjaPage() {
  const { user, profile, loading, saveProfile } = useAuth();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [install, setInstall] = useState<SiteInstall | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<'token' | 'snippet' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({ projectName: '', domain: '', companyName: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user || !profile) return;
    setPageLoading(true);
    setError(null);
    try {
      console.log('[Instalacja] loadData → getOrCreateDefaultProject…');
      const proj = await getOrCreateDefaultProject(user.uid, profile);
      console.log('[Instalacja] project:', proj.id);
      setProject(proj);
      if (proj.snippetToken) {
        console.log('[Instalacja] loadData → getSnippetStatus…');
        const status = await getSnippetStatus(proj.id);
        setInstall(status);
      }
    } catch (err) {
      console.error('[Instalacja] loadData error:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPageLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    console.log('[Instalacja] effect:', { loading, user: !!user, profile: !!profile });
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (user && profile) {
      loadData();
    } else if (!loading && user && !profile) {
      setPageLoading(false);
    }
  }, [user, profile, loading, router, loadData]);

  const handleGenerate = async () => {
    if (!project) return;
    setGenerating(true);
    try {
      const token = await generateSnippetToken(project.id);
      setProject((p) => (p ? { ...p, snippetToken: token } : p));
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (text: string, type: 'token' | 'snippet') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    if (!profileForm.projectName.trim()) {
      setProfileError('Podaj nazwę projektu.');
      return;
    }
    setSavingProfile(true);
    setProfileError(null);
    try {
      await saveProfile({
        projectName: profileForm.projectName.trim(),
        domain: profileForm.domain.trim(),
        companyName: profileForm.companyName.trim() || undefined,
        onboardingCompleted: true,
      });
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading || pageLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-1 justify-center overflow-y-auto px-6 py-10">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h1 className="text-xl font-bold text-white">
              Uzupełnij profil, aby aktywować instalację
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Potrzebujemy podstawowych danych, aby utworzyć Twój projekt
              i wygenerować snippet.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Nazwa projektu <span className="text-red-400">*</span>
              </label>
              <input
                value={profileForm.projectName}
                onChange={(e) => setProfileForm((f) => ({ ...f, projectName: e.target.value }))}
                placeholder="np. Mój Sklep Online"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-purple-500/50"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Domena strony
              </label>
              <input
                value={profileForm.domain}
                onChange={(e) => setProfileForm((f) => ({ ...f, domain: e.target.value }))}
                placeholder="np. example.com"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-purple-500/50"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Nazwa firmy
              </label>
              <input
                value={profileForm.companyName}
                onChange={(e) => setProfileForm((f) => ({ ...f, companyName: e.target.value }))}
                placeholder="opcjonalne"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-purple-500/50"
              />
            </div>
          </div>

          {profileError && (
            <p className="text-xs text-red-400">{profileError}</p>
          )}

          <button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="w-full rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            {savingProfile ? 'Zapisywanie…' : 'Zapisz i przejdź dalej'}
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-md rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
          <p className="text-sm font-medium text-red-400">
            Nie udało się załadować zakładki Instalacja
          </p>
          <p className="mt-2 text-xs text-zinc-500">{error}</p>
          <button
            onClick={loadData}
            className="mt-4 rounded-lg bg-white/5 px-4 py-2 text-xs text-zinc-300 transition-colors hover:bg-white/10"
          >
            Spróbuj ponownie
          </button>
        </div>
      </div>
    );
  }

  const token = project?.snippetToken ?? 'TOKEN';
  const snippetTag = buildSnippetTag(token);

  const hasToken = !!project?.snippetToken;
  const isConnected = !!install;

  return (
    <div className="flex flex-1 justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div>
          <div className="mb-2 flex items-center gap-2.5">
            <Code className="h-5 w-5 text-purple-400" />
            <h1 className="text-xl font-bold text-white">
              Instalacja na stronie
            </h1>
          </div>
          <p className="text-sm leading-relaxed text-zinc-400">
            Wklej snippet na swojej stronie, aby Bress rozpoznawał ją
            automatycznie bez ręcznego podawania URL.
          </p>
        </div>

        {/* Status */}
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Status połączenia
          </h2>

          {!hasToken ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <WifiOff className="h-4 w-4" />
              <span>Wygeneruj token, aby rozpocząć</span>
            </div>
          ) : !isConnected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-yellow-400/80">
                <WifiOff className="h-4 w-4" />
                <span>Nie zainstalowano</span>
              </div>
              <button
                onClick={loadData}
                className="flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Odśwież
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <Wifi className="h-4 w-4" />
                  <span className="font-medium">Połączono</span>
                </div>
                <button
                  onClick={loadData}
                  className="flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Odśwież
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4 rounded-lg bg-white/[0.03] p-3">
                <div className="flex items-start gap-2">
                  <Globe className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-zinc-500" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-600">
                      Domena
                    </p>
                    <p className="text-sm text-zinc-200">{install.domain}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-zinc-500" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-600">
                      Ostatnio
                    </p>
                    <p className="text-sm text-zinc-200">
                      {timeAgo(install.lastSeenAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Hash className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-zinc-500" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-600">
                      Zgłoszenia
                    </p>
                    <p className="text-sm text-zinc-200">{install.pingCount}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Token */}
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Twój token
          </h2>

          {!hasToken ? (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Generowanie…
                </>
              ) : (
                'Wygeneruj token'
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={project!.snippetToken!}
                className="flex-1 rounded-lg border border-white/10 bg-black px-3 py-2 font-mono text-sm text-zinc-300 outline-none"
              />
              <button
                onClick={() =>
                  handleCopy(project!.snippetToken!, 'token')
                }
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-400 transition-colors hover:border-purple-500/30 hover:text-white"
              >
                {copied === 'token' ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied === 'token' ? 'Skopiowano' : 'Kopiuj'}
              </button>
            </div>
          )}
        </section>

        {/* Snippet */}
        {hasToken && (
          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Snippet do wklejenia
              </h2>
              <button
                onClick={() => handleCopy(snippetTag, 'snippet')}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-purple-500/30 hover:text-white"
              >
                {copied === 'snippet' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied === 'snippet' ? 'Skopiowano' : 'Kopiuj'}
              </button>
            </div>

            <pre className="overflow-x-auto rounded-lg bg-black p-4 font-mono text-sm leading-relaxed text-purple-300">
              {snippetTag}
            </pre>
          </section>
        )}

        {/* Instructions */}
        {hasToken && (
          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Jak zainstalować
            </h2>
            <ol className="space-y-2.5 text-sm text-zinc-300">
              <li className="flex gap-3">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-purple-600/20 text-xs font-semibold text-purple-400">
                  1
                </span>
                <span>Skopiuj snippet powyżej</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-purple-600/20 text-xs font-semibold text-purple-400">
                  2
                </span>
                <span>
                  Wklej go przed zamknięciem tagu{' '}
                  <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-zinc-400">
                    {'</body>'}
                  </code>{' '}
                  na swojej stronie
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-purple-600/20 text-xs font-semibold text-purple-400">
                  3
                </span>
                <span>Odśwież stronę</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-purple-600/20 text-xs font-semibold text-purple-400">
                  4
                </span>
                <span>Wróć tutaj i sprawdź status połączenia</span>
              </li>
            </ol>
          </section>
        )}

        {/* Info note */}
        <div className="space-y-2 text-center text-xs leading-relaxed text-zinc-600">
          <p>
            Snippet nie wprowadza zmian na stronie. Sluzy wylacznie do polaczenia
            strony z Bress.
          </p>
          <p>
            Aby snippet dzialal na stronach online, Bress.io musi byc dostepny
            pod publicznym adresem (np. <code className="rounded bg-white/5 px-1 py-0.5 font-mono text-zinc-500">https://app.bress.io</code>).
            W trybie deweloperskim snippet uzywa adresu lokalnego.
          </p>
        </div>
      </div>
    </div>
  );
}
