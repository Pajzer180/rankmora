import HeroSection from '@/components/HeroSection';
import SocialProofSection from '@/components/SocialProofSection';
import FeaturesSection from '@/components/FeaturesSection';
import HowItWorksSection from '@/components/HowItWorksSection';
import HowItWorks from '@/components/HowItWorks';

export default function Home() {
  return (
    <main className="bg-[#0a0a0a]">
      <HeroSection />
      <SocialProofSection />
      <FeaturesSection />
      <HowItWorksSection />
      <section id="how-it-works">
        <HowItWorks />
      </section>
    </main>
  );
}
