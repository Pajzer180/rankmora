import { OptionCard } from './OptionCard';
import type { AccountType } from '@/types/profile';

const INPUT_CLS =
  'w-full border-b-2 border-zinc-800 bg-transparent pb-3 text-xl text-white placeholder-zinc-700 transition-colors duration-200 focus:border-purple-600 focus:outline-none';

const LABEL_CLS = 'mb-2 block text-xs font-medium uppercase tracking-widest text-zinc-600';

const TEAM_SIZES = [
  { value: '1-10',   label: '1–10' },
  { value: '11-50',  label: '11–50' },
  { value: '51-200', label: '51–200' },
  { value: '200+',   label: '200+' },
];

interface DomainPanelProps {
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

export function DomainPanel({
  accountType,
  projectName,
  companyName,
  domain,
  teamSize,
  onProjectName,
  onCompanyName,
  onDomain,
  onTeamSize,
}: DomainPanelProps) {
  if (!accountType) return null;

  return (
    <div className="space-y-8 rounded-2xl bg-[#111111] p-8">
      <h2 className="text-xl font-semibold text-white">Twój projekt</h2>

      {accountType === 'freelancer' && (
        <>
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
        </>
      )}

      {accountType === 'company' && (
        <>
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
                <OptionCard
                  key={value}
                  selected={teamSize === value}
                  onClick={() => onTeamSize(value)}
                  label={label}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
