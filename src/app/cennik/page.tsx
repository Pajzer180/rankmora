import Link from 'next/link';
import { Check } from 'lucide-react';

/* ─── Dane planów ─── */
const plans = [
  {
    name: 'Starter',
    description: 'Dla małych stron i blogów',
    price: '99 zł',
    period: '/ miesiąc',
    featured: false,
    cta: { label: 'Testuj przez 3 dni', href: '/register', variant: 'ghost' as const },
    features: [
      'Do 5 000 odsłon / m-c',
      'Optymalizacja H1/H2',
      'Tygodniowe raporty CTR',
      'Wsparcie email',
    ],
  },
  {
    name: 'Pro',
    description: 'Dla rosnących biznesów',
    price: '299 zł',
    period: '/ miesiąc',
    featured: true,
    cta: { label: 'Testuj przez 3 dni', href: '/register', variant: 'primary' as const },
    features: [
      'Wszystko z planu Starter',
      'Do 50 000 odsłon / m-c',
      'Integracja z 3 domenami',
      'Optymalizacja Intent-based',
      'Dedykowany manager sukcesu',
    ],
  },
  {
    name: 'Enterprise',
    description: 'Dla agencji i dużych portali',
    price: 'Wycena indywidualna',
    period: '',
    featured: false,
    cta: { label: 'Skontaktuj się', href: '/kontakt', variant: 'outline' as const },
    features: [
      'Nielimitowane odsłony',
      'Nielimitowane domeny',
      'Instalacja On-premise',
      'White-label (branding agencji)',
      'Pełny dostęp do API',
    ],
  },
];

/* ─── Przycisk CTA ─── */
function PlanButton({
  label,
  href,
  variant,
}: {
  label: string;
  href: string;
  variant: 'primary' | 'ghost' | 'outline';
}) {
  const base = 'block w-full py-3 rounded-full text-sm font-semibold text-center transition-all duration-200';
  const styles = {
    primary: 'bg-purple-600 hover:bg-purple-500 text-white',
    ghost:   'bg-white/5 hover:bg-white/10 text-white border border-white/10',
    outline: 'border border-white/20 hover:border-white/40 text-white hover:bg-white/5',
  };
  return (
    <Link href={href} className={`${base} ${styles[variant]}`}>
      {label}
    </Link>
  );
}

/* ─── Karta planu ─── */
function PlanCard({ plan }: { plan: (typeof plans)[number] }) {
  const { name, description, price, period, featured, cta, features } = plan;

  return (
    <div
      className={[
        'relative flex flex-col rounded-3xl p-8 transition-all duration-300 hover:-translate-y-2',
        featured
          ? 'bg-[#0f0a1c] border border-purple-500/50 scale-105'
          : 'bg-white/5 border border-white/10',
      ].join(' ')}
    >
      {/* Badge wyróżnienia */}
      {featured && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center rounded-full bg-purple-600 px-4 py-1 text-xs font-semibold text-white whitespace-nowrap">
            Najczęściej wybierany
          </span>
        </div>
      )}

      {/* Nagłówek planu */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-white">{name}</h3>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>

      {/* Cena */}
      <div className="mb-8">
        <span className="text-4xl font-black text-white">{price}</span>
        {period && <span className="ml-1.5 text-sm text-gray-500">{period}</span>}
      </div>

      {/* CTA */}
      <PlanButton {...cta} />
      {(featured || plan.cta.variant === 'ghost') && (
        <p className="mt-2.5 text-center text-xs text-gray-600">
          Opłata pobrana po 3 dniach testów.
        </p>
      )}

      {/* Separator */}
      <div className="my-8 border-t border-white/5" />

      {/* Lista funkcji */}
      <ul className="flex flex-col gap-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" strokeWidth={2.5} />
            <span className="text-sm text-gray-400">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Strona główna cennika ─── */
export default function CennikPage() {
  return (
    <main className="min-h-screen bg-black">
      <div className="max-w-6xl mx-auto px-4">

        {/* Nagłówek */}
        <div className="pt-40 pb-20 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
            Proste i przejrzyste zasady.
          </h1>
          <p className="mt-5 text-lg text-gray-400 max-w-xl mx-auto">
            Zacznij od pełnego, 3-dniowego dostępu do wszystkich funkcji. Bez zobowiązań.
          </p>
        </div>

        {/* Karty cennika */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center pb-32">
          {plans.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </div>

      </div>
    </main>
  );
}
