import { User, Briefcase } from 'lucide-react';
import { OptionCard } from './OptionCard';
import type { AccountType } from '@/types/profile';

interface StepClientTypeProps {
  value:    AccountType | '';
  onChange: (v: AccountType) => void;
}

const OPTIONS: { value: AccountType; icon: React.ReactNode; label: string; description: string }[] = [
  {
    value:       'freelancer',
    icon:        <User className="h-5 w-5" />,
    label:       'Freelancer / Własna strona',
    description: 'Zarządzam jedną lub kilkoma własnymi stronami',
  },
  {
    value:       'company',
    icon:        <Briefcase className="h-5 w-5" />,
    label:       'Firma / Agencja',
    description: 'Obsługuję klientów lub pracuję w zespole',
  },
];

export function StepClientType({ value, onChange }: StepClientTypeProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">Dla kogo pracujesz?</h2>
        <p className="mt-3 text-xl text-zinc-400">Dostosujemy agenta do Twojego kontekstu.</p>
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
