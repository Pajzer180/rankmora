'use client';

import { motion } from 'framer-motion';

/* ─── Dane kroków ─── */
const steps = [
  {
    number: '1',
    title: 'Podłącz WordPress i Search Console',
    description:
      'Podaj dane logowania do WP i połącz konto Google. Zajmuje to 2 minuty.',
    mockup: <CodeMockup />,
  },
  {
    number: '2',
    title: 'Porozmawiaj z agentem',
    description:
      'Agent analizuje Twoje dane z GSC, wskazuje okazje i proponuje zmiany w tytułach, opisach i treści.',
    mockup: <SyncMockup />,
  },
  {
    number: '3',
    title: 'Podgląd → Wdróż → Mierz',
    description:
      'Widzisz dokładnie co się zmieni. Po kliknięciu agent wdraża zmianę w WordPress i mierzy efekt.',
    mockup: <ChartMockup />,
  },
];

/* ─── Mockupy ─── */
function CodeMockup() {
  return (
    <div className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm leading-relaxed">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center text-[10px] text-blue-400">W</span>
          <span className="text-white/70 text-xs">WordPress połączony</span>
          <span className="ml-auto text-green-400 text-xs">&#10003;</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-yellow-500/20 flex items-center justify-center text-[10px] text-yellow-400">G</span>
          <span className="text-white/70 text-xs">Search Console połączone</span>
          <span className="ml-auto text-green-400 text-xs">&#10003;</span>
        </div>
      </div>
    </div>
  );
}

function SyncMockup() {
  return (
    <div className="w-full bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col items-center justify-center gap-4 min-h-[120px]">
      {/* Pulsujące kółko */}
      <div className="relative flex items-center justify-center">
        <span className="absolute w-14 h-14 rounded-full bg-purple-500/20 animate-ping" />
        <span className="absolute w-10 h-10 rounded-full bg-purple-500/30 animate-pulse" />
        <span className="w-6 h-6 rounded-full bg-purple-500" />
      </div>
      <p className="text-xs text-gray-400 tracking-wide">Synchronizacja danych...</p>
      {/* Paski postępu */}
      <div className="w-full space-y-2">
        {['Search Console', 'Tytuły i opisy', 'Propozycje zmian'].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 w-24 shrink-0">{label}</span>
            <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-500/60 animate-pulse"
                style={{ width: `${75 - i * 15}%`, animationDelay: `${i * 0.3}s` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartMockup() {
  const bars = [
    { label: 'Pn', before: 40, after: 58 },
    { label: 'Wt', before: 35, after: 62 },
    { label: 'Śr', before: 42, after: 71 },
    { label: 'Cz', before: 38, after: 80 },
    { label: 'Pt', before: 44, after: 88 },
  ];

  return (
    <div className="w-full bg-white/5 border border-white/10 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-400 font-medium">CTR tygodniowy</span>
        <span className="text-xs font-semibold text-green-400">+34% ↑</span>
      </div>
      <div className="flex items-end justify-between gap-1.5 h-20">
        {bars.map(({ label, before, after }) => (
          <div key={label} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex items-end gap-0.5 h-16">
              <div
                className="flex-1 rounded-sm bg-white/10"
                style={{ height: `${before}%` }}
              />
              <div
                className="flex-1 rounded-sm bg-purple-500"
                style={{ height: `${after}%` }}
              />
            </div>
            <span className="text-[9px] text-gray-600">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-white/10" />
          <span className="text-[10px] text-gray-500">Przed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-purple-500" />
          <span className="text-[10px] text-gray-500">Po Bress.io</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Karta kroku ─── */
const cardVariants = {
  hidden:  { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
} satisfies import('framer-motion').Variants;

function StepCard({
  number,
  title,
  description,
  mockup,
}: {
  number: string;
  title: string;
  description: string;
  mockup: React.ReactNode;
}) {
  return (
    <motion.div
      variants={cardVariants}
      className="flex flex-col md:flex-row items-start gap-8 bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/[0.07] transition-colors duration-300"
    >
      {/* Lewa strona — numer + treść */}
      <div className="flex-1 min-w-0">
        <span className="block text-7xl font-black leading-none text-white/5 select-none -mb-2">
          {number}
        </span>
        <h3 className="text-2xl font-bold text-white mt-2 mb-3">{title}</h3>
        <p className="text-gray-400 leading-relaxed text-sm max-w-sm">{description}</p>
      </div>

      {/* Prawa strona — mockup */}
      <div className="w-full md:w-64 shrink-0">{mockup}</div>
    </motion.div>
  );
}

/* ─── Linia łącząca kroki ─── */
function Connector() {
  return (
    <div className="flex justify-center">
      <div className="w-px h-10 bg-gradient-to-b from-purple-500/40 to-transparent" />
    </div>
  );
}

/* ─── Komponent główny ─── */
export default function HowItWorks() {
  return (
    <section className="bg-black pt-32 pb-32">
      <div className="max-w-5xl mx-auto px-4">

        {/* Nagłówek */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
            Od podłączenia do wyników w 3 krokach.
          </h2>
          <p className="mt-5 text-gray-400 text-lg max-w-2xl mx-auto">
            Podłącz WordPress i Search Console, porozmawiaj z agentem i wdrażaj zmiany bez angażowania programistów.
          </p>
        </motion.div>

        {/* Kroki */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          transition={{ staggerChildren: 0.2 }}
          className="flex flex-col"
        >
          {steps.map((step, i) => (
            <div key={step.number}>
              <StepCard {...step} />
              {i < steps.length - 1 && <Connector />}
            </div>
          ))}
        </motion.div>

      </div>
    </section>
  );
}
