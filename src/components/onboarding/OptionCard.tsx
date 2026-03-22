import { Check } from 'lucide-react';

interface OptionCardProps {
  selected:     boolean;
  onClick:      () => void;
  label:        string;
  description?: string;
  icon?:        React.ReactNode;
}

export function OptionCard({ selected, onClick, label, description, icon }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex w-full items-center gap-4 rounded-xl border p-6 text-left transition-all duration-200 ${
        selected
          ? 'border-purple-500 bg-purple-500/10 text-white drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]'
          : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:bg-white/10 hover:text-zinc-200'
      }`}
    >
      {icon && (
        <div
          className={`flex-shrink-0 transition-colors duration-200 ${
            selected ? 'text-purple-400' : 'text-zinc-500'
          }`}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className={`text-base font-semibold ${selected ? 'text-white' : 'text-zinc-300'}`}>
          {label}
        </div>
        {description && (
          <div className="mt-0.5 truncate text-xs text-zinc-500">{description}</div>
        )}
      </div>
      {selected && (
        <Check className="ml-auto h-4 w-4 flex-shrink-0 text-purple-400" />
      )}
    </button>
  );
}
