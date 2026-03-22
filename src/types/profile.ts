export type SeoLevel     = 'beginner' | 'mid' | 'expert';
export type AccountType  = 'freelancer' | 'company';
export type BusinessGoal = 'ecommerce' | 'leads' | 'traffic';
export type AgentTone    = 'professional' | 'sales' | 'casual';

export interface UserProfile {
  uid: string;
  onboardingCompleted: boolean;
  firstName: string;
  seoLevel: SeoLevel;
  accountType: AccountType;
  projectName?: string;
  companyName?: string;
  domain: string;
  teamSize?: string;
  businessGoal: BusinessGoal;
  agentTone: AgentTone;
  gscConnected: boolean;
  createdAt: number;
}
