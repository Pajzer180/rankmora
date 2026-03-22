import 'server-only';

import { getDocument } from '@/lib/server/firestoreRest';
import type {
  AgentTone,
  BusinessGoal,
  SeoLevel,
  UserProfile,
} from '@/types/profile';

export interface ChatPersonalizationProfile {
  firstName?: string;
  seoLevel?: SeoLevel;
  businessGoal?: BusinessGoal;
  agentTone?: AgentTone;
  projectName?: string;
  companyName?: string;
  domain?: string;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isSeoLevel(value: unknown): value is SeoLevel {
  return value === 'beginner' || value === 'mid' || value === 'expert';
}

function isBusinessGoal(value: unknown): value is BusinessGoal {
  return value === 'ecommerce' || value === 'leads' || value === 'traffic';
}

function isAgentTone(value: unknown): value is AgentTone {
  return value === 'professional' || value === 'sales' || value === 'casual';
}

export async function getChatPersonalizationProfile(
  uid: string,
): Promise<ChatPersonalizationProfile | null> {
  const snapshot = await getDocument('profiles', uid);
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as Partial<UserProfile>;

  return {
    firstName: normalizeOptionalString(data.firstName),
    seoLevel: isSeoLevel(data.seoLevel) ? data.seoLevel : undefined,
    businessGoal: isBusinessGoal(data.businessGoal) ? data.businessGoal : undefined,
    agentTone: isAgentTone(data.agentTone) ? data.agentTone : undefined,
    projectName: normalizeOptionalString(data.projectName),
    companyName: normalizeOptionalString(data.companyName),
    domain: normalizeOptionalString(data.domain),
  };
}

function buildKnownUserFactsInstruction(profile: ChatPersonalizationProfile): string {
  if (!profile.firstName) {
    return 'Znane dane o uzytkowniku z profilu: firstName = unknown. Nie zgaduj imienia ani nie wymyslaj go. Jesli uzytkownik pyta o swoje imie, powiedz wprost, ze nie masz tej informacji w profilu.';
  }

  return [
    `Znane dane o uzytkowniku z profilu: firstName = ${profile.firstName}.`,
    'To jest potwierdzony fakt z profilu uzytkownika, a nie przypuszczenie.',
    'Jesli uzytkownik pyta o swoje imie, jak ma na imie, jak sie nazywa albo prosi o przypomnienie imienia, odpowiedz zgodnie z profilem wprost i bez wahania.',
  ].join(' ');
}

function buildFirstNameUsageInstruction(firstName?: string): string | null {
  if (!firstName) {
    return null;
  }

  return `Mozesz zwracac sie do uzytkownika po imieniu ${firstName} tylko naturalnie i oszczednie: najwyzej raz na odpowiedz, zwykle na poczatku albo w podsumowaniu. Nie uzywaj imienia w kazdym akapicie.`;
}

function buildToneInstruction(agentTone?: AgentTone): string | null {
  switch (agentTone) {
    case 'casual':
      return 'Preferowany ton rozmowy: luzny i bezposredni. Odpowiadaj bardziej swobodnie, naturalnie i po ludzku, ale nadal konkretnie i pomocnie.';
    case 'sales':
      return 'Preferowany ton rozmowy: konkretny i perswazyjny. Akcentuj wynik biznesowy, korzysci, CTA i nastepny praktyczny krok.';
    case 'professional':
      return 'Preferowany ton rozmowy: profesjonalny i ekspercki. Pisz rzeczowo, jasno i merytorycznie, bez zbednego luzu.';
    default:
      return null;
  }
}

function buildSeoLevelInstruction(seoLevel?: SeoLevel): string | null {
  switch (seoLevel) {
    case 'beginner':
      return 'Poziom SEO uzytkownika: poczatkujacy. Tlumacz trudniejsze pojecia prostym jezykiem i nie zakladaj znajomosci zargonu.';
    case 'mid':
      return 'Poziom SEO uzytkownika: sredniozaawansowany. Mozesz uzywac typowych terminow SEO bez rozwleklego tlumaczenia podstaw.';
    case 'expert':
      return 'Poziom SEO uzytkownika: ekspert. Odpowiadaj bardziej technicznie i bezposrednio, uzywaj precyzyjnej terminologii SEO i nie tlumacz podstawowych pojec.';
    default:
      return null;
  }
}

function buildBusinessGoalInstruction(businessGoal?: BusinessGoal): string | null {
  switch (businessGoal) {
    case 'ecommerce':
      return 'Glowny cel biznesowy: ecommerce. Priorytetyzuj rekomendacje, ktore wspieraja sprzedaz, strony kategorii i produktow, CTR oraz intencje transakcyjne.';
    case 'leads':
      return 'Glowny cel biznesowy: leady. Priorytetyzuj rekomendacje, ktore pomagaja generowac zapytania, wzmacniac CTA, strony uslugowe i wiarygodnosc.';
    case 'traffic':
      return 'Glowny cel biznesowy: ruch organiczny. Priorytetyzuj rekomendacje contentowe, topical coverage, klastry tematow i zapytania informacyjne.';
    default:
      return null;
  }
}

function buildProjectContextInstruction(profile: ChatPersonalizationProfile): string | null {
  const label = profile.companyName ?? profile.projectName ?? profile.domain;
  if (!label) {
    return null;
  }

  if (profile.domain && label !== profile.domain) {
    return `Kontekst projektu uzytkownika: ${label} (${profile.domain}). Uwzgledniaj ten kontekst, gdy proponujesz strategie, tresci lub priorytety.`;
  }

  return `Kontekst projektu uzytkownika: ${label}. Uwzgledniaj ten kontekst, gdy proponujesz strategie, tresci lub priorytety.`;
}

export function buildChatSystemPrompt(
  profile: ChatPersonalizationProfile | null,
): string {
  if (!profile) {
    return '';
  }

  const instructions = [
    buildProjectContextInstruction(profile),
    buildKnownUserFactsInstruction(profile),
    buildFirstNameUsageInstruction(profile.firstName),
    buildToneInstruction(profile.agentTone),
    buildSeoLevelInstruction(profile.seoLevel),
    buildBusinessGoalInstruction(profile.businessGoal),
  ].filter((instruction): instruction is string => Boolean(instruction));

  if (instructions.length === 0) {
    return '';
  }

  return [
    'PERSONALIZACJA UZYTKOWNIKA:',
    ...instructions,
  ].join('\n');
}
