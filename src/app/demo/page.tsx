'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import Link from 'next/link';
import { Zap, ArrowRight, CheckCircle2, AlertTriangle, Code2 } from 'lucide-react';

/* ─── Typy ─── */
type Phase = 'idle' | 'analyzing' | 'complete';

/* ─── Stałe ─── */
const CONSOLE_STEPS = [
  { delay: 150,  text: '> Inicjalizacja agenta Bress.io v2.4...',                                      color: 'text-gray-500'   },
  { delay: 900,  text: '> Pobieranie i renderowanie struktury DOM...',                                  color: 'text-green-400'  },
  { delay: 1900, text: '> Wykryto 1x H1, 4x H2. Brak danych ustrukturyzowanych (Schema.org).',        color: 'text-yellow-400' },
  { delay: 2900, text: '> Analizowanie nasycenia słowem kluczowym (Density: 0.8% — za mało).',         color: 'text-yellow-400' },
  { delay: 3900, text: '> Generowanie wstrzyknięć poprawiających CTR i Intent...',                     color: 'text-purple-400' },
  { delay: 4700, text: '> ✓ Optymalizacja zakończona. Wynik poprawiony: 42 → 98 pkt.',                color: 'text-green-400'  },
];
const ANALYZE_DURATION = 5400;

/* ─── Animacje ─── */
const fadeSlide: Variants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -16, transition: { duration: 0.3, ease: 'easeIn' } },
};

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const item: Variants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

/* ─── Komponent licznika ─── */
function AnimatedScore({ target, color }: { target: number; color: string }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const duration = 1200;
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress >= 1) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [target]);

  return (
    <span className={`text-6xl font-black tabular-nums ${color}`}>{value}</span>
  );
}

/* ─── Widok 1: Formularz ─── */
function IdleView({ onStart }: { onStart: (url: string, kw: string) => void }) {
  const [url, setUrl] = useState('');
  const [kw,  setKw]  = useState('');

  return (
    <motion.div
      key="idle"
      variants={fadeSlide}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="max-w-xl mx-auto"
    >
      <div className="text-center mb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-400 mb-6">
          <Zap className="h-3 w-3 text-purple-400" />
          Bez rejestracji · Wyniki w 5 sekund
        </span>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Sprawdź, co ulepszy<br />Autonomiczny Agent.
        </h1>
        <p className="mt-4 text-gray-400 text-lg">
          Symuluj pełny audyt On-Page i zobacza, jakie zmiany Bress.io wstrzyknąłby do DOM Twojej strony.
        </p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            URL strony
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="np. twoj-sklep.pl/fotel-biurowy"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-700 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/40 transition-colors"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Główna fraza kluczowa
          </label>
          <input
            type="text"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onStart(url, kw)}
            placeholder="np. fotel biurowy ergonomiczny"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-700 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/40 transition-colors"
          />
        </div>
        <button
          onClick={() => onStart(url, kw)}
          className="mt-2 flex items-center justify-center gap-2 w-full rounded-xl bg-purple-600 hover:bg-purple-500 px-6 py-3.5 text-base font-semibold text-white transition-all duration-200"
        >
          <Zap className="h-4 w-4" />
          Rozpocznij Głęboki Audyt On-Page
        </button>
      </div>
    </motion.div>
  );
}

/* ─── Widok 2: Konsola ─── */
function AnalyzingView({ url }: { url: string }) {
  const [lines, setLines] = useState<typeof CONSOLE_STEPS>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers = CONSOLE_STEPS.map((step) =>
      setTimeout(() => {
        setLines((prev) => [...prev, step]);
      }, step.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <motion.div
      key="analyzing"
      variants={fadeSlide}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="max-w-2xl mx-auto"
    >
      <p className="text-center text-gray-500 text-sm mb-6 font-mono">
        Audyt: <span className="text-purple-400">{url || 'twoj-sklep.pl/produkt'}</span>
      </p>

      {/* Terminal */}
      <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="h-11 border-b border-white/10 bg-white/5 flex items-center px-4 gap-4">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/70" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <span className="w-3 h-3 rounded-full bg-green-500/70" />
          </div>
          <span className="flex-1 text-center text-xs text-gray-600 font-mono">
            bress-agent — audyt on-page
          </span>
        </div>

        <div className="p-5 font-mono text-sm min-h-[220px] flex flex-col gap-2.5">
          <AnimatePresence>
            {lines.map((line, i) => (
              <motion.p
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className={line.color}
              >
                {line.text}
              </motion.p>
            ))}
          </AnimatePresence>

          {/* Migający kursor */}
          {lines.length < CONSOLE_STEPS.length && (
            <span className="text-purple-400 animate-pulse">█</span>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <p className="text-center text-xs text-gray-700 mt-4 font-mono">
        Przetwarzanie... nie zamykaj okna.
      </p>
    </motion.div>
  );
}

/* ─── Widok 3: Wyniki ─── */
function CompleteView({ url, kw, onReset }: { url: string; kw: string; onReset: () => void }) {
  const keyword = kw || 'fotel biurowy ergonomiczny';
  const domain  = url || 'twoj-sklep.pl/produkt';

  const changes = [
    {
      icon: 'H1',
      label: 'Modyfikacja nagłówka H1',
      before: `${keyword.charAt(0).toUpperCase() + keyword.slice(1)} — sklep internetowy`,
      after: `${keyword.charAt(0).toUpperCase() + keyword.slice(1)} [TOP 2024] — Zamów z darmową dostawą 24h`,
      badge: 'Wysoki CTR',
      badgeClass: 'text-green-400 bg-green-400/10 border-green-400/20',
      IconEl: CheckCircle2,
    },
    {
      icon: 'META',
      label: 'Meta Description',
      before: 'Sprawdź naszą ofertę.',
      after: `✓ Odkryj ${keyword} klasy premium. Ergonomia i jakość w jednym. Kup teraz — gwarancja 5 lat i zwrot 30 dni.`,
      badge: 'CTA',
      badgeClass: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
      IconEl: CheckCircle2,
    },
    {
      icon: 'JSON-LD',
      label: 'Techniczne SEO',
      before: 'Brak danych strukturalnych (Schema.org)',
      after: 'Dodano Product Schema.org (JSON-LD) — aktywacja wyników rozszerzonych (Rich Snippets) w Google.',
      badge: 'Rich Snippets',
      badgeClass: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
      IconEl: Code2,
    },
  ];

  return (
    <motion.div
      key="complete"
      variants={fadeSlide}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="max-w-4xl mx-auto"
    >
      <p className="text-center text-gray-600 text-xs font-mono mb-8">
        Raport dla: <span className="text-purple-400">{domain}</span>
      </p>

      {/* ── Sekcja górna: Wyniki ── */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Stary wynik */}
        <div className="bg-white/5 border border-red-500/20 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-1">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wide">Obecny wynik On-Page</span>
          </div>
          <div className="flex items-end gap-1">
            <AnimatedScore target={42} color="text-red-400" />
            <span className="text-2xl font-bold text-red-400/50 mb-1">/100</span>
          </div>
          <p className="text-xs text-gray-600 mt-1">Wymaga natychmiastowej optymalizacji</p>
        </div>

        {/* Nowy wynik */}
        <div className="bg-white/5 border border-green-500/20 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-1">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="h-4 w-4 text-green-400" />
            <span className="text-xs font-semibold text-green-400 uppercase tracking-wide">Zoptymalizowany przez Bress</span>
          </div>
          <div className="flex items-end gap-1">
            <AnimatedScore target={98} color="text-green-400" />
            <span className="text-2xl font-bold text-green-400/50 mb-1">/100</span>
          </div>
          <p className="text-xs text-gray-600 mt-1">Gotowy do indeksowania</p>
        </div>
      </div>

      {/* ── Sekcja środkowa: Zmiany ── */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-3 mb-6"
      >
        {changes.map(({ icon, label, before, after, badge, badgeClass, IconEl }) => (
          <motion.div
            key={icon}
            variants={item}
            className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/[0.08] transition-colors duration-200"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] font-bold text-gray-400 font-mono">
                  {icon}
                </span>
                <span className="text-sm font-semibold text-white">{label}</span>
              </div>
              <span className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badgeClass}`}>
                {badge}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="rounded-lg bg-red-500/5 border border-red-500/10 px-3 py-2">
                <p className="text-[10px] text-red-400/60 font-medium mb-1 uppercase tracking-wide">Przed</p>
                <p className="text-xs text-gray-500 leading-relaxed">{before}</p>
              </div>
              <div className="rounded-lg bg-green-500/5 border border-green-500/10 px-3 py-2">
                <div className="flex items-start gap-1.5">
                  <IconEl className="h-3 w-3 text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] text-green-400/60 font-medium mb-1 uppercase tracking-wide">Po Bress.io</p>
                    <p className="text-xs text-gray-300 leading-relaxed">{after}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Sekcja dolna: CTA ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.6 }}
        className="bg-[#0f0a1c] border border-purple-500/30 rounded-2xl p-8 text-center"
      >
        <p className="text-white font-semibold text-lg mb-2">
          To wszystko dzieje się w{' '}
          <span className="text-purple-400">0.2 sekundy</span>{' '}
          podczas ładowania strony.
        </p>
        <p className="text-gray-500 text-sm mb-6">
          Bez Twojego zespołu IT. Bez zmian w kodzie. Bez przebudowy bazy danych.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-full bg-purple-600 hover:bg-purple-500 px-6 py-3 text-sm font-semibold text-white transition-all duration-200"
          >
            Rozpocznij 3-dniowy Trial
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            onClick={onReset}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Testuj inny URL
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Komponent główny ─── */
export default function DemoPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [url,   setUrl]   = useState('');
  const [kw,    setKw]    = useState('');

  function handleStart(inputUrl: string, inputKw: string) {
    setUrl(inputUrl);
    setKw(inputKw);
    setPhase('analyzing');
    setTimeout(() => setPhase('complete'), ANALYZE_DURATION);
  }

  function handleReset() {
    setPhase('idle');
    setUrl('');
    setKw('');
  }

  return (
    <main className="min-h-screen bg-black pt-28 pb-32">
      <div className="max-w-4xl mx-auto px-6">
        <AnimatePresence mode="wait">
          {phase === 'idle'      && <IdleView      key="idle"      onStart={handleStart} />}
          {phase === 'analyzing' && <AnalyzingView key="analyzing" url={url} />}
          {phase === 'complete'  && <CompleteView  key="complete"  url={url} kw={kw} onReset={handleReset} />}
        </AnimatePresence>
      </div>
    </main>
  );
}
