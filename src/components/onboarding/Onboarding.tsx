'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { SeoLevel, AccountType, BusinessGoal, AgentTone } from '@/types/profile';

import { StepName } from './StepName';
import { StepKnowledge } from './StepKnowledge';
import { StepClientType } from './StepClientType';
import { StepDomain } from './StepDomain';
import { StepGoal } from './StepGoal';
import { StepTone } from './StepTone';
import { StepGsc } from './StepGsc';

interface FormData {
  firstName: string;
  seoLevel: SeoLevel | '';
  accountType: AccountType | '';
  projectName: string;
  companyName: string;
  domain: string;
  teamSize: string;
  businessGoal: BusinessGoal | '';
  agentTone: AgentTone | '';
  gscConnected: boolean;
}

const INITIAL: FormData = {
  firstName: '',
  seoLevel: '',
  accountType: '',
  projectName: '',
  companyName: '',
  domain: '',
  teamSize: '',
  businessGoal: '',
  agentTone: '',
  gscConnected: false,
};

const TOTAL_STEPS = 7;
const ONBOARDING_DRAFT_STORAGE_KEY = 'bress-onboarding-draft';

interface StoredOnboardingDraft {
  step?: number;
  formData?: Partial<FormData>;
}

export default function Onboarding() {
  const { saveProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const gscStatus = searchParams.get('gsc');

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [formData, setFormData] = useState<FormData>(INITIAL);
  const [draftReady, setDraftReady] = useState(false);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const rawDraft = window.sessionStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY);
      const parsedDraft = rawDraft ? JSON.parse(rawDraft) as StoredOnboardingDraft : null;
      const restoredStep = typeof parsedDraft?.step === 'number'
        && parsedDraft.step >= 1
        && parsedDraft.step <= TOTAL_STEPS
        ? parsedDraft.step
        : 1;

      if (parsedDraft?.formData && typeof parsedDraft.formData === 'object') {
        setFormData({
          ...INITIAL,
          ...parsedDraft.formData,
        });
      }

      setStep(gscStatus ? TOTAL_STEPS : restoredStep);
    } catch {
      setStep(gscStatus ? TOTAL_STEPS : 1);
    } finally {
      setDraftReady(true);
    }
  }, [gscStatus]);

  useEffect(() => {
    if (!draftReady || typeof window === 'undefined') {
      return;
    }

    const draft: StoredOnboardingDraft = {
      step,
      formData,
    };

    window.sessionStorage.setItem(ONBOARDING_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [draftReady, formData, step]);

  useEffect(() => {
    if (!draftReady || !gscStatus || step === TOTAL_STEPS) {
      return;
    }

    setStep(TOTAL_STEPS);
  }, [draftReady, gscStatus, step]);

  const isStepValid = (): boolean => {
    switch (step) {
      case 1:
        return formData.firstName.trim() !== '';
      case 2:
        return formData.seoLevel !== '';
      case 3:
        return formData.accountType !== '';
      case 4:
        if (formData.accountType === 'freelancer') {
          return formData.projectName.trim() !== '' && formData.domain.trim() !== '';
        }

        return (
          formData.companyName.trim() !== ''
          && formData.domain.trim() !== ''
          && formData.teamSize !== ''
        );
      case 5:
        return formData.businessGoal !== '';
      case 6:
        return formData.agentTone !== '';
      case 7:
        return true;
      default:
        return true;
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      await Promise.all([
        saveProfile({
          onboardingCompleted: true,
          firstName: formData.firstName,
          seoLevel: formData.seoLevel as SeoLevel,
          accountType: formData.accountType as AccountType,
          projectName: formData.projectName || undefined,
          companyName: formData.companyName || undefined,
          domain: formData.domain,
          teamSize: formData.teamSize || undefined,
          businessGoal: formData.businessGoal as BusinessGoal,
          agentTone: formData.agentTone as AgentTone,
          gscConnected: formData.gscConnected,
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);

      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
      }
    } finally {
      router.push('/dashboard/chat');
    }
  };

  const goNext = () => {
    if (!isStepValid()) {
      return;
    }

    if (step === TOTAL_STEPS) {
      void handleComplete();
      return;
    }

    setDirection(1);
    setStep((currentStep) => currentStep + 1);
  };

  const goBack = () => {
    setDirection(-1);
    setStep((currentStep) => currentStep - 1);
  };

  const handleEnterKey = useEffectEvent(() => {
    goNext();
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') {
        return;
      }

      if ((event.target as HTMLElement).tagName === 'BUTTON') {
        return;
      }

      handleEnterKey();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!saving) {
      return;
    }

    const domain = formData.domain;
    const messages = [
      domain ? `Skanowanie domeny ${domain}...` : 'Skanowanie domeny...',
      'Konfiguracja Agenta SEO...',
      'Przygotowywanie pierwszego raportu...',
    ];

    let index = 0;
    setLoadingMsg(messages[0]);

    const intervalId = window.setInterval(() => {
      index = (index + 1) % messages.length;
      setLoadingMsg(messages[index]);
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [formData.domain, saving]);

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <StepName
            value={formData.firstName}
            onChange={(value) => set('firstName', value)}
          />
        );
      case 2:
        return (
          <StepKnowledge
            value={formData.seoLevel}
            onChange={(value) => set('seoLevel', value)}
          />
        );
      case 3:
        return (
          <StepClientType
            value={formData.accountType}
            onChange={(value) => set('accountType', value)}
          />
        );
      case 4:
        return (
          <StepDomain
            accountType={formData.accountType}
            projectName={formData.projectName}
            companyName={formData.companyName}
            domain={formData.domain}
            teamSize={formData.teamSize}
            onProjectName={(value) => set('projectName', value)}
            onCompanyName={(value) => set('companyName', value)}
            onDomain={(value) => set('domain', value)}
            onTeamSize={(value) => set('teamSize', value)}
          />
        );
      case 5:
        return (
          <StepGoal
            value={formData.businessGoal}
            onChange={(value) => set('businessGoal', value)}
          />
        );
      case 6:
        return (
          <StepTone
            value={formData.agentTone}
            onChange={(value) => set('agentTone', value)}
          />
        );
      case 7:
        return (
          <StepGsc
            connected={formData.gscConnected}
            onConnectionChange={(nextConnected) => set('gscConnected', nextConnected)}
            projectProfile={{
              projectName: formData.projectName,
              companyName: formData.companyName,
              domain: formData.domain,
            }}
          />
        );
      default:
        return null;
    }
  };

  const valid = isStepValid();
  const isLastStep = step === TOTAL_STEPS;
  const pct = Math.round(((step - 1) / (TOTAL_STEPS - 1)) * 100);

  const stepVariants = {
    enter: (dir: number) => ({ y: dir > 0 ? 24 : -24, opacity: 0 }),
    center: () => ({ y: 0, opacity: 1 }),
    exit: (dir: number) => ({ y: dir > 0 ? -24 : 24, opacity: 0 }),
  };

  return (
    <div className="relative min-h-screen bg-black">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-900/10 blur-[140px]" />

      <div className="fixed left-0 top-0 z-40 h-1 w-full bg-zinc-900">
        <motion.div
          className="h-full bg-purple-600"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      <div className="fixed left-6 top-4 z-40">
        <span className="text-sm font-bold tracking-tight text-white">Bress.io</span>
      </div>

      <div className="flex min-h-screen items-center justify-center px-6 py-24">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: 'easeOut' }}
            >
              <div className="py-2">
                {renderStep()}
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex items-center justify-between">
            {step > 1 ? (
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
                Wstecz
              </button>
            ) : (
              <div />
            )}

            <button
              onClick={goNext}
              disabled={!valid}
              className={`flex items-center gap-2 rounded-full px-8 py-3 text-base font-semibold transition-all duration-200 ${
                valid
                  ? 'bg-purple-600 text-white hover:bg-purple-500 hover:-translate-y-0.5'
                  : 'cursor-not-allowed border border-white/5 bg-zinc-900 text-zinc-500'
              }`}
            >
              {isLastStep ? 'Zakoncz i analizuj' : 'Dalej'}
              {!isLastStep && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {saving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
          <div className="flex flex-col items-center gap-6">
            <Loader2 className="h-12 w-12 animate-spin text-purple-600" />
            <AnimatePresence mode="wait">
              <motion.p
                key={loadingMsg}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="text-base font-medium text-white"
              >
                {loadingMsg}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}