'use client';

import type { AgentMode, AgentStyle } from '@/types/chat';

interface Props {
  agentMode: AgentMode;
  agentStyle: AgentStyle;
  onAgentModeChange: (mode: AgentMode) => void;
  onAgentStyleChange: (style: AgentStyle) => void;
}

const MODES: { label: string; value: AgentMode }[] = [
  { label: 'Luźny',     value: 'casual'   },
  { label: 'Biznesowy', value: 'business' },
  { label: 'Ekspercki', value: 'expert'   },
];

const STYLES: { label: string; value: AgentStyle }[] = [
  { label: 'Dociekliwy', value: 'inquisitive' },
  { label: 'Działający', value: 'action'      },
];

function pillClass(active: boolean) {
  return `border rounded-full px-3 py-1 text-sm cursor-pointer transition-colors ${
    active
      ? 'bg-purple-600 text-white border-purple-600'
      : 'bg-transparent text-zinc-400 hover:text-white border-white/10'
  }`;
}

export default function AgentModeSelector({
  agentMode,
  agentStyle,
  onAgentModeChange,
  onAgentStyleChange,
}: Props) {
  return (
    <div className="flex items-center gap-6 border-b border-white/5 bg-black px-6 py-3">
      {/* Poziom */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-600">Poziom:</span>
        <div className="flex gap-1.5">
          {MODES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => onAgentModeChange(value)}
              className={pillClass(agentMode === value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Separator */}
      <div className="h-4 w-px bg-white/10" />

      {/* Styl */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-600">Styl:</span>
        <div className="flex gap-1.5">
          {STYLES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => onAgentStyleChange(value)}
              className={pillClass(agentStyle === value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
