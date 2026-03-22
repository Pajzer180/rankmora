interface StepNameProps {
  value:    string;
  onChange: (v: string) => void;
}

export function StepName({ value, onChange }: StepNameProps) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">Cześć! Jak mam Cię nazywać?</h2>
        <p className="mt-3 text-xl text-zinc-400">Zacznijmy od podstaw.</p>
      </div>
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Twoje imię..."
        className="w-full border-transparent bg-transparent py-4 text-4xl font-bold text-white placeholder-zinc-700 caret-purple-500 focus:outline-none focus:ring-0 md:text-5xl"
      />
    </div>
  );
}
