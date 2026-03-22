import { Suspense } from 'react';
import Onboarding from '@/components/onboarding/Onboarding';

function OnboardingPageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingPageFallback />}>
      <Onboarding />
    </Suspense>
  );
}
