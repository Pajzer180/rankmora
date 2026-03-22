import { Award, Zap, Smile } from 'lucide-react';
import { OptionCard } from './OptionCard';
import type { AgentTone } from '@/types/profile';

interface StepToneProps {
  value:    AgentTone | '';
  onChange: (v: AgentTone) => void;
}

const OPTIONS: { value: AgentTone; icon: React.ReactNode; label: string; description: string }[] = [
  {
    value:       'professional',
    icon:        <Award className="h-5 w-5" />,
    label:       'Profesjonalny i Ekspercki',
    description: 'Precyzyjny, merytoryczny, buduje autorytet marki',
  },
  {
    value:       'sales',
    icon:        <Zap className="h-5 w-5" />,
    label:       'Sprzedażowy i Perswazyjny',
    description: 'Motywuje do działania, akcentuje korzyści i CTA',
  },
  {
    value:       'casual',
    icon:        <Smile className="h-5 w-5" />,
    label:       'Luźny i Bezpośredni',
    description: 'Konwersacyjny, blisko czytelnika, angażujący',
  },
];

export function StepTone({ value, onChange }: StepToneProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">Jak Agent ma komunikować treści?</h2>
        <p className="mt-3 text-xl text-zinc-400">Ton nagłówków dopasujemy do Twojej marki.</p>
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
