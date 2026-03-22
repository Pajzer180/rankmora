'use client';

import { Bot, Search, Hash, Globe, FileText } from 'lucide-react';

const TILES = [
  {
    icon: Search,
    iconBg: 'bg-blue-500/20',
    iconColor: 'text-blue-400',
    title: 'Przeanalizuj konkretny URL',
    desc: 'Sprawdź SEO i błędy techniczne',
    text: '🔍 Przeanalizuj konkretny URL',
  },
  {
    icon: Hash,
    iconBg: 'bg-green-500/20',
    iconColor: 'text-green-400',
    title: 'Zaproponuj frazy kluczowe',
    desc: 'Dla Twojej niszy i branży',
    text: '📝 Zaproponuj frazy kluczowe',
  },
  {
    icon: Globe,
    iconBg: 'bg-orange-500/20',
    iconColor: 'text-orange-400',
    title: 'Oceń moją stronę główną',
    desc: 'Pełna analiza i rekomendacje',
    text: '📊 Oceń moją stronę główną',
  },
  {
    icon: FileText,
    iconBg: 'bg-pink-500/20',
    iconColor: 'text-pink-400',
    title: 'Ulepsz istniejący artykuł',
    desc: 'Optymalizacja treści i meta',
    text: '✍️ Ulepsz istniejący artykuł',
  },
];

interface Props {
  onQuickAction: (text: string) => void;
}

export default function QuickActions({ onQuickAction }: Props) {
  return (
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center px-8">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-900/15 blur-[100px]" />

      {/* Bot icon */}
      <div
        className="flex items-center justify-center rounded-2xl border border-purple-500/20 bg-purple-900/30 p-4"
        style={{ boxShadow: '0 0 40px rgba(168, 85, 247, 0.15)' }}
      >
        <Bot className="h-8 w-8 text-purple-400" />
      </div>

      {/* Headings */}
      <p className="mt-4 text-xl font-semibold text-white">Jak mogę Ci dziś pomóc?</p>
      <p className="mt-1 text-sm text-zinc-500">Wybierz akcję lub napisz wiadomość poniżej</p>

      {/* Tiles */}
      <div className="mx-auto mt-8 grid w-full max-w-[560px] grid-cols-2 gap-3">
        {TILES.map(({ icon: Icon, iconBg, iconColor, title, desc, text }) => (
          <button
            key={title}
            onClick={() => onQuickAction(text)}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.08] bg-zinc-900/80 p-4 text-left transition-all duration-200 hover:border-white/[0.15] hover:bg-zinc-800/80"
          >
            <div className={`flex-shrink-0 rounded-xl p-2.5 ${iconBg}`}>
              <Icon className={`h-4 w-4 ${iconColor}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{title}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
