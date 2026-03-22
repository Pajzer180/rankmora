import { Award, Zap, Smile } from 'lucide-react';
import { OptionCard } from './OptionCard';
import type { AgentTone } from '@/types/profile';

interface TonePanelProps {
  value:    AgentTone | '';
  onChange: (v: AgentTone) => void;
}

const OPTIONS: { value: AgentTone; icon: React.ReactNode; label: string; description: string }[] = [
  {
    value:       'professional',
    icon:        <Award className="h-5 w-5" />,
    label:       'Profesjonalny',
    description: 'Precyzyjny, buduje autorytet marki',
  },
  {
    value:       'sales',
    icon:        <Zap className="h-5 w-5" />,
    label:       'Sprzedażowy',
    description: 'Perswazyjny, akcentuje korzyści i CTA',
  },
  {
    value:       'casual',
    icon:        <Smile className="h-5 w-5" />,
    label:       'Luźny',
    description: 'Konwersacyjny, bliski czytelnikowi',
  },
];

export function TonePanel({ value, onChange }: TonePanelProps) {
  return (
    <div className="rounded-2xl bg-[#111111] p-8">
      <h2 className="mb-1 text-xl font-semibold text-white">Ton komunikacji Agenta</h2>
      <p className="mb-6 text-sm text-zinc-500">Dopasujemy styl nagłówków do Twojej marki.</p>
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
