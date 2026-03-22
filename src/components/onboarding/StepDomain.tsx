import type { AccountType } from '@/types/profile';

const INPUT_CLS =
  'w-full border-transparent bg-transparent py-3 text-3xl font-bold text-white placeholder-zinc-700 caret-purple-500 focus:outline-none focus:ring-0';

const LABEL_CLS =
  'mb-2 block text-xs font-medium uppercase tracking-widest text-zinc-600';

const TEAM_SIZES = [
  { value: '1-10',   label: '1–10' },
  { value: '11-50',  label: '11–50' },
  { value: '51-200', label: '51–200' },
  { value: '200+',   label: '200+' },
];

interface StepDomainProps {
  accountType:   AccountType | '';
  projectName:   string;
  companyName:   string;
  domain:        string;
  teamSize:      string;
  onProjectName: (v: string) => void;
  onCompanyName: (v: string) => void;
  onDomain:      (v: string) => void;
  onTeamSize:    (v: string) => void;
}

export function StepDomain({
  accountType,
  projectName,
  companyName,
  domain,
  teamSize,
  onProjectName,
  onCompanyName,
  onDomain,
  onTeamSize,
}: StepDomainProps) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">Twój projekt</h2>
        <p className="mt-3 text-xl text-zinc-400">
          {accountType === 'freelancer'
            ? 'Podaj nazwę projektu i adres domeny.'
            : 'Podaj nazwę firmy, domenę i wielkość zespołu.'}
        </p>
      </div>

      {accountType === 'freelancer' && (
        <div className="space-y-8">
          <div>
            <label className={LABEL_CLS}>Nazwa projektu</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => onProjectName(e.target.value)}
              placeholder="np. Mój Sklep Online"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Adres domeny</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => onDomain(e.target.value)}
              placeholder="np. mojsklep.pl"
              className={INPUT_CLS}
            />
          </div>
        </div>
      )}

      {accountType === 'company' && (
        <div className="space-y-8">
          <div>
            <label className={LABEL_CLS}>Nazwa firmy</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => onCompanyName(e.target.value)}
              placeholder="np. Agencja Digital Sp. z o.o."
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Adres domeny</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => onDomain(e.target.value)}
              placeholder="np. agencja.pl"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Wielkość zespołu</label>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {TEAM_SIZES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onTeamSize(value)}
                  className={`rounded-xl border py-3 text-center text-sm font-semibold transition-all duration-200 ${
                    teamSize === value
                      ? 'border-purple-500 bg-purple-500/10 text-white drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]'
                      : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:bg-white/10 hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
