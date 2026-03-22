import { DollarSign, Target, TrendingUp } from 'lucide-react';
import { OptionCard } from './OptionCard';
import type { BusinessGoal } from '@/types/profile';

interface GoalPanelProps {
  value:    BusinessGoal | '';
  onChange: (v: BusinessGoal) => void;
}

const OPTIONS: { value: BusinessGoal; icon: React.ReactNode; label: string; description: string }[] = [
  {
    value:       'ecommerce',
    icon:        <DollarSign className="h-5 w-5" />,
    label:       'Sprzedaż e-commerce',
    description: 'Zwiększenie konwersji i przychodów',
  },
  {
    value:       'leads',
    icon:        <Target className="h-5 w-5" />,
    label:       'Pozyskiwanie leadów',
    description: 'Formularze, zapytania, rejestracje',
  },
  {
    value:       'traffic',
    icon:        <TrendingUp className="h-5 w-5" />,
    label:       'Budowanie ruchu',
    description: 'Organiczny ruch i świadomość marki',
  },
];

export function GoalPanel({ value, onChange }: GoalPanelProps) {
  return (
    <div className="rounded-2xl bg-[#111111] p-8">
      <h2 className="mb-1 text-xl font-semibold text-white">Główny cel biznesowy</h2>
      <p className="mb-6 text-sm text-zinc-500">
        Agent dopasuje strategię nagłówków do Twojego celu.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
