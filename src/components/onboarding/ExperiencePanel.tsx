import { BookOpen, BarChart2, GraduationCap } from 'lucide-react';
import { OptionCard } from './OptionCard';
import type { SeoLevel } from '@/types/profile';

interface ExperiencePanelProps {
  value:    SeoLevel | '';
  onChange: (v: SeoLevel) => void;
}

const OPTIONS: { value: SeoLevel; icon: React.ReactNode; label: string; description: string }[] = [
  {
    value:       'beginner',
    icon:        <BookOpen className="h-5 w-5" />,
    label:       'Początkujący',
    description: 'Dopiero zaczynam przygodę z SEO',
  },
  {
    value:       'mid',
    icon:        <BarChart2 className="h-5 w-5" />,
    label:       'Średniozaawansowany',
    description: 'Pracuję z narzędziami SEO na co dzień',
  },
  {
    value:       'expert',
    icon:        <GraduationCap className="h-5 w-5" />,
    label:       'Zaawansowany / Ekspert',
    description: 'Znam techniczne aspekty optymalizacji',
  },
];

export function ExperiencePanel({ value, onChange }: ExperiencePanelProps) {
  return (
    <div className="rounded-2xl bg-[#111111] p-8">
      <h2 className="mb-1 text-xl font-semibold text-white">Twoja wiedza o SEO</h2>
      <p className="mb-6 text-sm text-zinc-500">Dopasujemy interfejs do Twojego poziomu.</p>
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
