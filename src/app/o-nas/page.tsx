import Link from 'next/link';
import { Zap, Scale, ShieldCheck, ArrowUpRight } from 'lucide-react';

/* ─── Wartości ─── */
const values = [
  {
    icon: Zap,
    title: 'Technologia na pierwszym miejscu',
    description:
      'Wykorzystujemy najnowsze modele AI i bezserwerową architekturę brzegową, aby zapewnić najwyższą wydajność.',
  },
  {
    icon: Scale,
    title: 'Skalowalność bez limitów',
    description:
      'Nasze narzędzia rosną wraz z Twoim biznesem. Obsługujemy miliony zapytań z gwarancją niezawodności.',
  },
  {
    icon: ShieldCheck,
    title: 'Bezpieczeństwo danych',
    description:
      'Zabezpieczenia klasy Enterprise. Nie przechowujemy zbędnych danych, a wszystko jest szyfrowane E2E.',
  },
];

/* ─── Produkty ─── */
const products = [
  {
    name: 'Bress.io',
    tagline: 'Autonomiczny silnik SEO',
    description:
      'Zwiększ CTR bez ingerencji w kod źródłowy. Agent AI analizuje intencje Twoich klientów i optymalizuje strukturę strony w czasie rzeczywistym.',
    href: '/',
    glow: 'shadow-[0_0_80px_-20px_rgba(147,51,234,0.35)]',
    accent: 'border-purple-500/30',
    badge: { label: 'Jesteś tutaj', active: false },
    dot: 'bg-purple-500',
  },
  {
    name: 'KarbonTrack',
    tagline: 'Środowisko pod kontrolą',
    description:
      'Zaawansowane śledzenie i raportowanie emisji węglowej (Scope 1, 2, 3) dla firm. Jeden dashboard — pełna widoczność śladu węglowego.',
    href: '#',
    glow: 'shadow-[0_0_80px_-20px_rgba(34,197,94,0.3)]',
    accent: 'border-emerald-500/30',
    badge: { label: 'Więcej wkrótce', active: false },
    dot: 'bg-emerald-400',
  },
];

export default function ONasPage() {
  return (
    <main className="min-h-screen bg-black">

      {/* ── 1. Nagłówek — Vision Statement ── */}
      <section className="pt-36 pb-24 text-center">
        <div className="max-w-4xl mx-auto px-6">

          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-400">
            Nasza misja
          </span>

          <h1 className="mt-6 mb-6 text-4xl lg:text-6xl font-bold text-white tracking-tight leading-tight">
            Budujemy ekosystem dla nowoczesnego biznesu.
          </h1>

          <p className="text-xl text-gray-400 leading-relaxed max-w-2xl mx-auto">
            Jesteśmy grupą technologiczną tworzącą bezkompromisowe oprogramowanie SaaS.
            Nasz cel jest prosty: automatyzacja procesów, które do tej pory pochłaniały
            Twój czas i kapitał.
          </p>

        </div>
      </section>

      {/* ── 2. Wartości — Bento Grid ── */}
      <section className="pb-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {values.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-colors duration-300"
              >
                <div className="mb-5 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/10">
                  <Icon className="h-5 w-5 text-gray-400" strokeWidth={1.5} />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. Produkty — Ecosystem ── */}
      <section className="border-t border-white/10 pt-20 pb-32">
        <div className="max-w-6xl mx-auto px-6">

          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Poznaj nasze portfolio
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {products.map(({ name, tagline, description, href, glow, accent, badge, dot }) => (
              <div
                key={name}
                className={[
                  'group relative flex flex-col justify-between rounded-3xl border p-8 bg-white/5 transition-all duration-300 hover:bg-white/[0.08]',
                  accent,
                  glow,
                ].join(' ')}
              >
                {/* Header */}
                <div>
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2 h-2 rounded-full ${dot}`} />
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">
                        {tagline}
                      </span>
                    </div>
                    <Link
                      href={href}
                      className="text-gray-600 hover:text-white transition-colors"
                      aria-label={`Przejdź do ${name}`}
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </div>

                  <h3 className="text-2xl font-bold text-white mb-3">{name}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
                </div>

                {/* Footer */}
                <div className="mt-8">
                  <span
                    className={[
                      'inline-flex items-center rounded-full border px-4 py-1.5 text-xs font-medium',
                      badge.active
                        ? 'border-white/20 text-white'
                        : 'border-white/10 text-gray-600 cursor-default',
                    ].join(' ')}
                  >
                    {badge.label}
                  </span>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

    </main>
  );
}
