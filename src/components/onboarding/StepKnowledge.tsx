import { BookOpen, BarChart2, GraduationCap } from 'lucide-react';
import { OptionCard } from './OptionCard';
import type { SeoLevel } from '@/types/profile';

interface StepKnowledgeProps {
  value:    SeoLevel | '';
  onChange: (v: SeoLevel) => void;
}

const OPTIONS: { value: SeoLevel; icon: React.ReactNode; label: string; description: string }[] = [
  {
    value:       'beginner',
    icon:        <BookOpen className="h-5 w-5" />,
    label:       'Początkujący',
    description: 'Dopiero zaczynam przygodę z SEO i pozycjonowaniem',
  },
  {
    value:       'mid',
    icon:        <BarChart2 className="h-5 w-5" />,
    label:       'Średniozaawansowany',
    description: 'Znam podstawy, pracuję z narzędziami SEO na co dzień',
  },
  {
    value:       'expert',
    icon:        <GraduationCap className="h-5 w-5" />,
    label:       'Zaawansowany / Ekspert',
    description: 'Prowadzę kampanie SEO, znam techniczne aspekty optymalizacji',
  },
];

export function StepKnowledge({ value, onChange }: StepKnowledgeProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">Twoja wiedza o SEO</h2>
        <p className="mt-3 text-xl text-zinc-400">Dopasujemy interfejs do Twojego poziomu.</p>
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
