import { User, Briefcase } from 'lucide-react';
import { OptionCard } from './OptionCard';
import type { AccountType } from '@/types/profile';

interface AccountPanelProps {
  value:    AccountType | '';
  onChange: (v: AccountType) => void;
}

const OPTIONS: { value: AccountType; icon: React.ReactNode; label: string; description: string }[] = [
  {
    value:       'freelancer',
    icon:        <User className="h-5 w-5" />,
    label:       'Freelancer / Własna strona',
    description: 'Zarządzam własnymi projektami',
  },
  {
    value:       'company',
    icon:        <Briefcase className="h-5 w-5" />,
    label:       'Firma / Agencja',
    description: 'Obsługuję klientów lub pracuję w zespole',
  },
];

export function AccountPanel({ value, onChange }: AccountPanelProps) {
  return (
    <div className="rounded-2xl bg-[#111111] p-8">
      <h2 className="mb-1 text-xl font-semibold text-white">Dla kogo pracujesz?</h2>
      <p className="mb-6 text-sm text-zinc-500">Dostosujemy agenta do Twojego kontekstu.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
