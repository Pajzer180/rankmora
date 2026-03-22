'use client';

import { useState, useRef, useEffect } from 'react';
import { SendHorizonal, Plus, ChevronDown, Globe } from 'lucide-react';
import type { AgentMode, AgentStyle } from '@/types/chat';

const MODE_LABELS: Record<AgentMode, string> = {
  casual:   'Luźny',
  business: 'Biznesowy',
  expert:   'Ekspercki',
};

const STYLE_LABELS: Record<AgentStyle, string> = {
  inquisitive: 'Dociekliwy',
  action:      'Działający',
};

const MODES: { label: string; value: AgentMode }[] = [
  { label: 'Luźny',     value: 'casual'   },
  { label: 'Biznesowy', value: 'business' },
  { label: 'Ekspercki', value: 'expert'   },
];

const STYLES: { label: string; value: AgentStyle }[] = [
  { label: 'Dociekliwy', value: 'inquisitive' },
  { label: 'Działający', value: 'action'      },
];

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
  agentMode: AgentMode;
  agentStyle: AgentStyle;
  onAgentModeChange: (mode: AgentMode) => void;
  onAgentStyleChange: (style: AgentStyle) => void;
  onNewChat: () => void;
  activeSiteDomain: string | null;
}

export default function ChatInput({
  onSend,
  disabled,
  agentMode,
  agentStyle,
  onAgentModeChange,
  onAgentStyleChange,
  onNewChat,
  activeSiteDomain,
}: Props) {
  const [value,     setValue]     = useState('');
  const [modeOpen,  setModeOpen]  = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modeRef     = useRef<HTMLDivElement>(null);
  const styleRef    = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modeRef.current  && !modeRef.current.contains(e.target as Node))  setModeOpen(false);
      if (styleRef.current && !styleRef.current.contains(e.target as Node)) setStyleOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSubmit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const pillCls = 'flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400 transition-colors hover:text-white cursor-pointer';

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-3">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Napisz wiadomość..."
          disabled={disabled}
          className="w-full resize-none bg-transparent px-1 pb-3 text-sm text-white placeholder-zinc-600 focus:outline-none"
          style={{ minHeight: '24px' }}
        />

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          {/* New chat */}
          <button
            onClick={onNewChat}
            title="Nowy czat"
            className="flex items-center justify-center rounded-lg bg-zinc-800 p-1.5 text-zinc-400 transition-colors hover:text-white"
          >
            <Plus className="h-4 w-4" />
          </button>

          {/* Mode dropdown */}
          <div ref={modeRef} className="relative">
            <button
              onClick={() => { setModeOpen((o) => !o); setStyleOpen(false); }}
              className={pillCls}
            >
              <span>Poziom: {MODE_LABELS[agentMode]}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {modeOpen && (
              <div className="absolute bottom-full left-0 mb-1 min-w-[150px] rounded-xl border border-white/10 bg-zinc-900 py-1 shadow-xl">
                {MODES.map(({ label, value: v }) => (
                  <button
                    key={v}
                    onClick={() => { onAgentModeChange(v); setModeOpen(false); }}
                    className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-white/5 ${
                      agentMode === v ? 'font-medium text-purple-400' : 'text-zinc-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Style dropdown */}
          <div ref={styleRef} className="relative">
            <button
              onClick={() => { setStyleOpen((o) => !o); setModeOpen(false); }}
              className={pillCls}
            >
              <span>Styl: {STYLE_LABELS[agentStyle]}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {styleOpen && (
              <div className="absolute bottom-full left-0 mb-1 min-w-[150px] rounded-xl border border-white/10 bg-zinc-900 py-1 shadow-xl">
                {STYLES.map(({ label, value: v }) => (
                  <button
                    key={v}
                    onClick={() => { onAgentStyleChange(v); setStyleOpen(false); }}
                    className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-white/5 ${
                      agentStyle === v ? 'font-medium text-purple-400' : 'text-zinc-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeSiteDomain && (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
              <Globe className="h-3 w-3" />
              {activeSiteDomain}
            </span>
          )}

          <div className="flex-1" />

          {/* Send */}
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || disabled}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600 transition-colors hover:bg-purple-500 disabled:opacity-40"
          >
            <SendHorizonal className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-zinc-600">
        Bress.io może popełniać błędy. Weryfikuj ważne informacje.
      </p>
    </div>
  );
}
