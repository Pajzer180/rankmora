interface NamePanelProps {
  value:    string;
  onChange: (v: string) => void;
}

export function NamePanel({ value, onChange }: NamePanelProps) {
  return (
    <div className="rounded-2xl bg-[#111111] p-8">
      <h2 className="mb-1 text-xl font-semibold text-white">Jak mam Cię nazywać?</h2>
      <p className="mb-8 text-sm text-zinc-500">Zacznijmy od podstaw.</p>
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Twoje imię..."
        className="w-full border-b-2 border-zinc-800 bg-transparent pb-3 text-2xl text-white placeholder-zinc-700 transition-colors duration-200 focus:border-purple-600 focus:outline-none"
      />
    </div>
  );
}
