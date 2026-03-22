import { DollarSign, Target, TrendingUp } from 'lucide-react';
import { OptionCard } from './OptionCard';
import type { BusinessGoal } from '@/types/profile';

interface StepGoalProps {
  value:    BusinessGoal | '';
  onChange: (v: BusinessGoal) => void;
}

const OPTIONS: { value: BusinessGoal; icon: React.ReactNode; label: string; description: string }[] = [
  {
    value:       'ecommerce',
    icon:        <DollarSign className="h-5 w-5" />,
    label:       'Sprzedaż e-commerce',
    description: 'Zwiększenie konwersji i przychodów ze sklepu internetowego',
  },
  {
    value:       'leads',
    icon:        <Target className="h-5 w-5" />,
    label:       'Pozyskiwanie leadów',
    description: 'Generowanie zapytań ofertowych, rejestracji i kontaktów',
  },
  {
    value:       'traffic',
    icon:        <TrendingUp className="h-5 w-5" />,
    label:       'Budowanie ruchu (Blog)',
    description: 'Wzrost organicznego ruchu i świadomości marki',
  },
];

export function StepGoal({ value, onChange }: StepGoalProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">Jaki jest Twój główny cel biznesowy?</h2>
        <p className="mt-3 text-xl text-zinc-400">
          Agent będzie optymalizował nagłówki pod ten cel.
        </p>
      </div>
      <div className="space-y-3">
        {OPTIONS.map((opt) => (
          <OptionCard
            key={opt.value}
            selected={value === opt.value}
            onClick={() => onChange(opt.value)}
            icon={opt.icon}
            label={opt.label}
            description={opt.description}
          />
        ))}
      </div>
    </div>
  );
}
