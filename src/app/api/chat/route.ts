import { openai } from '@ai-sdk/openai';
import { streamText, convertToModelMessages, UIMessage, createUIMessageStream, createUIMessageStreamResponse, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { load } from 'cheerio';
import type { AgentMode, AgentStyle } from '@/types/chat';
import { assertProjectOwnedByUser, requireAuthenticatedUid, toRouteErrorResponse } from '@/lib/server/firebaseAuth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { readResponseTextWithinLimit, safeRemoteFetch } from '@/lib/server/safeRemoteFetch';
import { chatRequestSchema } from '@/lib/server/schemas/chat';
import { readJsonRequestBody } from '@/lib/server/validation';
import {
  buildChatSystemPrompt,
  getChatPersonalizationProfile,
  type ChatPersonalizationProfile,
} from '@/lib/server/chatPersonalization';
import { getSearchConsoleSummaryFromCache, getSearchConsolePagesFromCache } from '@/lib/server/gsc/read';
import { getPageQueriesFromCache } from '@/lib/server/gsc/pageQueries';
import { createWordPressPreviewJob, applyWordPressChangeJob, rollbackWordPressChangeJob } from '@/lib/wordpress/service';
import { getChangeMeasurementsByJob } from '@/lib/server/changeMeasurements';
import { getFirebaseAdminDb } from '@/lib/server/firebaseAdmin';

const CHAT_REMOTE_FETCH_TIMEOUT_MS = 8_000;
const CHAT_REMOTE_FETCH_MAX_RESPONSE_BYTES = 2_000_000;

const modeInstructions: Record<AgentMode, string> = {
  casual:
    'Odpowiadaj prosto i przyjaĹşnie, bez branĹĽowego ĹĽargonu. ' +
    'TĹ‚umacz wszystko tak, jakbyĹ› rozmawiaĹ‚ z wĹ‚aĹ›cicielem maĹ‚ego sklepu, ktĂłry dopiero zaczyna przygodÄ™ z SEO. ' +
    'UĹĽywaj prostych analogii i krĂłtkich zdaĹ„.',
  business:
    'Odpowiadaj konkretnie i punktowo. ' +
    'Skup siÄ™ na wynikach biznesowych, ROI i priorytetach. ' +
    'Pomijaj zbÄ™dne wyjaĹ›nienia podstaw â€“ rozmĂłwca zna realia prowadzenia biznesu online.',
  expert:
    'UĹĽywaj peĹ‚nej terminologii SEO i technicznej. ' +
    'Podawaj szczegĂłĹ‚owe dane, liczby, analizy i zaawansowane strategie. ' +
    'ZakĹ‚adaj wysokÄ… wiedzÄ™ rozmĂłwcy â€“ nie tĹ‚umacz podstawowych pojÄ™Ä‡.',
};

const styleInstructions: Record<AgentStyle, string> = {
  action:
    'Skup siÄ™ na konkretnych, gotowych do wdroĹĽenia akcjach. ' +
    'Dawaj listy zadaĹ„, przykĹ‚ady meta tagĂłw, gotowe szkice tekstĂłw. ' +
    'Mniej teorii, wiÄ™cej praktycznych krokĂłw.',
  inquisitive:
    'Przed odpowiedziÄ… przeanalizuj problem dogĹ‚Ä™bnie. ' +
    'JeĹ›li potrzebujesz wiÄ™cej kontekstu, zadaj 1â€“2 pytania precyzujÄ…ce. ' +
    'RozwaĹĽaj rĂłĹĽne scenariusze i ich konsekwencje, zanim zaproponujesz rozwiÄ…zanie.',
};

interface PageData {
  title: string;
  metaDescription: string;
  h1: string;
  h2Count: number;
  imagesWithoutAlt: number;
  wordCount: number;
}

export interface SeoCardData {
  url: string;
  title: { ok: boolean; text: string };
  h1: { ok: boolean; text: string; jsRendered: boolean };
  h2s: string[];
  imgs: number;
  score: number | null;
  metaDescription?: string;
  canonical?: string;
  robots?: string;
  ogTitle?: string;
  ogDescription?: string;
  linksInternalCount?: number;
  linksExternalCount?: number;
  ctaCount?: number;
  ctaExamples?: string[];
  sectionCount?: number;
  imagesTotal?: number;
  imagesWithoutAlt?: number;
  hasMetaDescription?: boolean;
  hasCanonical?: boolean;
  hasRobots?: boolean;
}

function isJsRendered(html: string, data: { h1: string; title: string }): boolean {
  const scriptCount = (html.match(/<script/g) || []).length;
  const hasReactRoot =
    html.includes('__next') ||
    html.includes('react-root') ||
    html.includes('data-reactroot');
  return !data.h1 && scriptCount > 5 && !!data.title && hasReactRoot;
}

function calculateSeoScore(data: PageData): number {
  let score = 100;

  // đź”´ Krytyczne (max -50) â€” JS_RENDERED nie jest karane za brak H1
  if (data.h1 !== 'JS_RENDERED' && (!data.h1 || data.h1 === 'BRAK H1!')) score -= 25;
  if (!data.title)                                                          score -= 15;
  if (!data.metaDescription || data.metaDescription === 'brak')           score -= 10;

  // đźźˇ WaĹĽne (max -30)
  if (data.title && data.title.length > 60)                               score -= 10;
  if (data.title && data.title.length < 20)                               score -= 5;
  if (!data.h2Count || data.h2Count === 0)                                score -= 10;
  else if (data.h2Count === 1)                                            score -= 5;
  if (data.metaDescription && data.metaDescription.length > 160)         score -= 5;
  if (data.metaDescription && data.metaDescription.length < 70)          score -= 5;

  // đźź˘ Opcjonalne (max -20)
  score -= Math.min((data.imagesWithoutAlt || 0) * 3, 15);
  if (data.wordCount && data.wordCount < 300)                             score -= 5;

  return Math.max(0, Math.min(100, score));
}

async function scrapeUrl(url: string): Promise<{ context: string; seoCardData: SeoCardData }> {
  const res = await safeRemoteFetch({
    url,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BressBot/1.0)' },
    timeoutMs: CHAT_REMOTE_FETCH_TIMEOUT_MS,
  });
  const html = await readResponseTextWithinLimit(res, CHAT_REMOTE_FETCH_MAX_RESPONSE_BYTES);
  const $ = load(html);

  $('script, style, nav, footer, header, iframe, .cookie').remove();

  const title = $('title').text().trim();
  const metaDesc = $('meta[name="description"]').attr('content') ?? 'brak';
  const canonical = $('link[rel="canonical"]').attr('href') ?? 'brak';
  const robots = $('meta[name="robots"]').attr('content') ?? 'brak';
  const ogTitle = $('meta[property="og:title"]').attr('content') ?? 'brak';
  const ogDescription = $('meta[property="og:description"]').attr('content') ?? 'brak';
  const rawH1 = $('h1').map((_, el) => $(el).text().trim()).get().join(' | ');
  const h2s = $('h2').map((_, el) => $(el).text().trim()).get().slice(0, 10);

  const imageNodes = $('img');
  const imagesTotal = imageNodes.length;
  const imgsMissing = imageNodes.filter((_, el) => {
    const alt = $(el).attr('alt');
    return alt === undefined || alt.trim() === '';
  }).length;

  const pageHost = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();

  const hrefs = $('a[href]')
    .map((_, el) => ($(el).attr('href') || '').trim())
    .get()
    .filter(Boolean);

  let linksInternalCount = 0;
  let linksExternalCount = 0;

  for (const href of hrefs) {
    if (
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:')
    ) {
      continue;
    }

    try {
      const resolved = new URL(href, url);
      const linkHost = resolved.hostname.replace(/^www\./, '');
      if (!pageHost || linkHost === pageHost) linksInternalCount += 1;
      else linksExternalCount += 1;
    } catch {
      // ignore malformed urls
    }
  }

  const ctaRegex = /\b(kup|zamow|skontaktuj|kontakt|umow|zaczni|zacznij|sprawdz|wycen|demo|oferta|zapisz|dolacz)\b/i;
  const ctaCandidates = $('button, a')
    .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter((text) => text.length > 0 && text.length <= 80 && ctaRegex.test(text));
  const ctaUnique = Array.from(new Set(ctaCandidates));
  const ctaCount = ctaUnique.length;
  const ctaExamples = ctaUnique.slice(0, 5);

  const sectionCount =
    $('section').length || $('main').children().length || $('body').children().length;
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText.split(' ').filter(Boolean).length;

  const hasMetaDescription = metaDesc !== 'brak' && metaDesc.trim().length > 0;
  const hasCanonical = canonical !== 'brak' && canonical.trim().length > 0;
  const hasRobots = robots !== 'brak' && robots.trim().length > 0;

  const jsRendered = isJsRendered(html, { h1: rawH1, title });
  const h1 = jsRendered ? 'JS_RENDERED' : rawH1 || 'BRAK H1!';

  const score = calculateSeoScore({
    title,
    metaDescription: metaDesc,
    h1,
    h2Count: h2s.length,
    imagesWithoutAlt: imgsMissing,
    wordCount,
  });

  const seoCardData: SeoCardData = {
    url,
    title: { ok: !!title && title.length <= 60 && title.length >= 20, text: title || 'BRAK!' },
    h1: { ok: !jsRendered && !!rawH1, text: rawH1 || (jsRendered ? 'JS_RENDERED' : 'BRAK!'), jsRendered },
    h2s,
    imgs: imgsMissing,
    score,
    metaDescription: metaDesc,
    canonical,
    robots,
    ogTitle,
    ogDescription,
    linksInternalCount,
    linksExternalCount,
    ctaCount,
    ctaExamples,
    sectionCount,
    imagesTotal,
    imagesWithoutAlt: imgsMissing,
    hasMetaDescription,
    hasCanonical,
    hasRobots,
  };

  const context = `
=== DANE STRONY DO ANALIZY SEO ===
URL: ${url}
Title tag: ${title || 'BRAK!'}
Meta description: ${metaDesc}
Canonical: ${canonical}
Robots: ${robots}
OG title: ${ogTitle}
OG description: ${ogDescription}
H1: ${h1}${jsRendered ? ' (strona renderowana przez JavaScript - H1 moze byc widoczny po zaladowaniu JS)' : ''}
Naglowki H2 (pierwsze 10): ${h2s.join(' | ') || 'brak'}
Linki wewnetrzne: ${linksInternalCount}
Linki zewnetrzne: ${linksExternalCount}
CTA count: ${ctaCount}
CTA examples: ${ctaExamples.join(' | ') || 'brak'}
Liczba sekcji: ${sectionCount}
Obrazy total: ${imagesTotal}
Obrazy bez atrybutu alt: ${imgsMissing}
Has meta description: ${hasMetaDescription ? 'yes' : 'no'}
Has canonical: ${hasCanonical ? 'yes' : 'no'}
Has robots: ${hasRobots ? 'yes' : 'no'}
Tresc strony (fragment):
${bodyText.slice(0, 5000)}
=================================
`;

  return { context, seoCardData };
}

export async function POST(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'chat', uid });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const {
      messages,
      agentMode,
      agentStyle,
      activeSiteUrl,
      activeSiteDomain,
      activeSiteSource,
      projectId,
      activePageUrl,
    } = await readJsonRequestBody(req, chatRequestSchema);

  const isDev = process.env.NODE_ENV !== 'production';

  let chatProfile: ChatPersonalizationProfile | null = null;
  try {
    chatProfile = await getChatPersonalizationProfile(uid);
  } catch (error) {
    if (isDev) {
      console.warn('[CHAT_PROFILE] failed to load personalization profile', error);
    }
  }

  const personalizationPrompt = buildChatSystemPrompt(chatProfile);

  // Verify project ownership and load project context
  let projectContext = '';
  if (projectId) {
    await assertProjectOwnedByUser(uid, projectId);
    if (isDev) {
      console.log(`[CHAT_CONTEXT] projectId=${projectId}`);
    }
    try {
      const db = getFirebaseAdminDb();
      const projectSnap = await db.collection('projects').doc(projectId).get();
      if (projectSnap.exists) {
        const projectData = projectSnap.data() as Record<string, unknown>;
        const projectName = typeof projectData.name === 'string' ? projectData.name : null;
        const projectDomain = typeof projectData.domain === 'string' ? projectData.domain : null;
        const parts: string[] = [];
        if (projectName) parts.push(`Nazwa projektu: ${projectName}`);
        if (projectDomain) parts.push(`Domena projektu: ${projectDomain}`);
        if (parts.length > 0) {
          projectContext = `\n=== KONTEKST PROJEKTU ===\n${parts.join('\n')}\n=========================\n`;
        }
      }
    } catch (error) {
      if (isDev) {
        console.warn('[CHAT_CONTEXT] failed to load project data', error);
      }
    }
  }

  // Wykryj URL w ostatniej wiadomoĹ›ci uĹĽytkownika
  // AI SDK 6.x: UIMessage nie ma pola `content` â€“ tekst jest w parts[].type==='text'
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  const msgText = lastUserMsg?.parts
    ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ') ?? '';
  const rawUrl = msgText.match(/https?:\/\/[^\s<>"']+/)?.[0] ?? '';
  const manualUrl = rawUrl ? rawUrl.replace(/[.,;:!?)'">\]]+$/, '') : null;

  let pageContext = '';
  let seoCardData: SeoCardData | null = null;

  const effectiveUrl = manualUrl || activePageUrl || activeSiteUrl || null;
  const urlSource =
    manualUrl
      ? 'manual'
      : activePageUrl
        ? 'analytics'
        : activeSiteUrl && activeSiteSource === 'snippet'
          ? 'snippet'
          : activeSiteUrl
            ? 'active-site'
            : 'none';

  if (isDev) {
    console.log(`[CHAT_CONTEXT] manualUrl=${manualUrl ?? ''}`);
    console.log(`[CHAT_CONTEXT] activePageUrl=${activePageUrl ?? ''}`);
    console.log(`[CHAT_CONTEXT] activeSiteUrl=${activeSiteUrl ?? ''}`);
    console.log(`[CHAT_CONTEXT] effectiveUrl=${effectiveUrl ?? ''}`);
    console.log(`[CHAT_CONTEXT] urlSource=${urlSource}`);
  }

  if (effectiveUrl) {
    if (isDev) {
      console.log(`[CHAT_CONTEXT] scraper called with=${effectiveUrl}`);
    }
    const result = await scrapeUrl(effectiveUrl);
    pageContext = result.context;
    seoCardData = result.seoCardData;
  }

  if (isDev) {
    console.log(`[CHAT_CONTEXT] pageContext length=${pageContext.length}`);
    console.log(`[CHAT_CONTEXT] seoCardData exists=${seoCardData ? 'yes' : 'no'}`);
    const pageContextPreview = pageContext.slice(0, 500).replace(/\s+/g, ' ').trim();
    console.log(`[CHAT_CONTEXT] pageContext first500=${pageContextPreview || '[empty]'}`);
  }

  const pageSourceInstruction =
    urlSource === 'manual'
      ? 'UĹĽytkownik podaĹ‚ URL rÄ™cznie do analizy.'
      : urlSource === 'analytics'
        ? `Uzytkownik przeszedl do czatu z panelu analityki, aby przeanalizowac konkretna strone: ${activePageUrl}. Analizuj te strone i nie pytaj o URL.`
        : urlSource === 'snippet'
          ? `UĹĽytkownik ma podĹ‚Ä…czonÄ… stronÄ™ projektu przez JS Snippet${activeSiteDomain ? ` (${activeSiteDomain})` : ''}. Analizuj tÄ™ stronÄ™ i nie pytaj o URL.`
          : urlSource === 'active-site'
            ? 'UĹĽytkownik ma aktywnÄ… stronÄ™ projektu w kontekĹ›cie czatu.'
            : '';

  const pagePart = pageContext
    ? `${pageSourceInstruction} Oto jej RZECZYWISTE dane pobrane przez scraper:\n${pageContext}\n` +
      (urlSource === 'snippet'
        ? 'URL pochodzi z aktywnego snippetu projektu. Nie proĹ› o URL i nie zadawaj pytaĹ„ o link, tylko analizuj tÄ™ stronÄ™.\n'
        : '') +
      'BEZWZGLÄDNE ZASADY ANALIZY TEJ STRONY:\n' +
      '1. CYTUJ DOSĹOWNIE â€“ jeĹ›li title tag jest zbyt dĹ‚ugi lub bĹ‚Ä™dny, podaj jego DOKĹADNY tekst w cudzysĹ‚owie i napisz ile ma znakĂłw (np. "TwĂłj title: â€žUsĹ‚ugi sprzÄ…tania Warszawa i okolice â€“ profesjonalne mycie okien, pranie dywanĂłw, sprzÄ…tanie biur" â€” 97 znakĂłw, max powinno byÄ‡ 60").\n' +
      '2. PODAWAJ GOTOWY TEKST DO SKOPIOWANIA â€“ zamiast "popraw H1" napisz: \'Wstaw dokĹ‚adnie ten H1: â€žMycie okien Warszawa â€“ od 3 zĹ‚/mÂ˛ | Stefpol Cleaning"\'. UĹĽytkownik ma skopiowaÄ‡ i wkleiÄ‡.\n' +
      '3. MAKSYMALNIE 3 ZMIANY, numerowane od najwaĹĽniejszej. Nie wypisuj dĹ‚ugich list.\n' +
      '4. NIGDY nie pisz ogĂłlnych zasad SEO ("sĹ‚owa kluczowe sÄ… waĹĽne", "treĹ›Ä‡ powinna byÄ‡ wartoĹ›ciowa") â€“ uĹĽytkownik to wie. MĂłw TYLKO o tej konkretnej stronie.\n' +
      '5. WAZENIE SYGNALOW I KONTEKST: nie kazdy brak = problem. Oceniaj elementy wg typu strony (np. landing, usluga, blog, kontakt, regulamin) i celu strony.\n' +
      '6. KLASYFIKUJ znaleziska do poziomow: KRYTYCZNE, WAZNE, OPCJONALNE/KONTEKSTOWE. Nie wymuszaj wszystkich kategorii, jesli brak podstaw.\n' +
      '7. KRYTYCZNE oznaczaj tylko przy mocnym uzasadnieniu i realnym wplywie (np. indeksacja, trafnosc, CTR, nawigacja). Jesli brak pewnosci, obniz poziom do WAZNE lub OPCJONALNE.\n' +
      '8. Brak linkow zewnetrznych, brak obrazow, brak robots meta lub brak CTA moze byc uzasadniony. Zaznacz to jawnie jako kontekstowe, zamiast automatycznie traktowac jako blad.\n' +
      '9. FORMAT odpowiedzi (uzywaj tylko gdy dany problem faktycznie wystepuje):\n' +
      '**KRYTYCZNE** (napraw najpierw) - tylko problemy o wysokim ryzyku i mocnym dowodzie na tej stronie:\n' +
      '[konkretny problem z dosĹ‚ownym cytatem rzeczywistej wartoĹ›ci]\n' +
      'â†’ Wstaw dokĹ‚adnie: [gotowy kod HTML lub tekst do skopiowania] *(~X min)*\n' +
      'Linki: brak H1 â†’ [Co to jest H1? â†’](https://developers.google.com/search/docs/appearance/title-link) | brak meta description â†’ [WiÄ™cej â†’](https://developers.google.com/search/docs/appearance/snippet)\n\n' +
      '**WAZNE** - problemy istotne, ale zalezne od kontekstu strony i celu biznesowego:\n' +
      '[problem z cytatem]\n' +
      'â†’ Wstaw dokĹ‚adnie: [gotowy kod lub tekst] *(~X min)*\n' +
      'Obrazy bez alt â†’ [WiÄ™cej â†’](https://web.dev/image-alt/)\n\n' +
      '**OPCJONALNE / KONTEKSTOWE** - usprawnienia zalezne od typu strony, nie zawsze wymagane:\n' +
      '[problem z cytatem]\n' +
      'â†’ Sugestia: [tekst] *(~X min)*\n\n' +
      '**âś… Plan wdroĹĽenia (kolejnoĹ›Ä‡):**\n\n' +
      '1. **[Akcja]** â€” wklej: `[konkretny kod lub tekst]`\n' +
      '2. **[Akcja]** â€” [konkretna zmiana]\n' +
      '3. **[Akcja]** â€” [konkretna zmiana]\n\n' +
      '10. ZAKONCZ kazda analize dokladnie tym zdaniem (uzupelnij fraze): ' +
      '"WdroĹĽenie tych zmian powinno poprawiÄ‡ pozycjÄ™ dla frazy: [gĹ‚Ăłwna fraza wykryta ze strony]"\n\n' +
      '11. KARTA SEO jest generowana automatycznie przez system - NIE generuj zadnych blokow kodu MOCK_*. Skup sie wylacznie na rekomendacjach tekstowych.'
    : '';

  const seoDataPresenceInstruction = pageContext
    ? '__SEO_DATA_PRESENT__\nIf you see this marker, do not answer generically. You must quote page data.'
    : '';

  const promptIncludesPageContext = pageContext
    ? pagePart.includes(pageContext)
    : false;


  const SYSTEM = [
    'JesteĹ› Bress â€“ zaawansowanym ekspertem SEO i content marketingu.',
    'Pomagasz uĹĽytkownikom zoptymalizowaÄ‡ ich strony, treĹ›ci i widocznoĹ›Ä‡ w wyszukiwarkach.',
    personalizationPrompt,
    projectContext,
    pagePart,
    seoDataPresenceInstruction,
    `Poziom odpowiedzi: ${modeInstructions[agentMode] ?? modeInstructions.business}`,
    `Styl pracy: ${styleInstructions[agentStyle] ?? styleInstructions.action}`,
    'Jesli masz dane strony z scrapera, analizuj szeroko: metadata, canonical, robots, OG, linkowanie wew/zew, CTA, sekcje i sygnaly konwersji. Nie ograniczaj sie do samych headingow. Nie kazdy brak jest bledem - oceniaj sygnaly kontekstowo wg typu strony i intencji.',
    'NARZEDZIA: Masz dostep do narzedzi, ktore pozwalaja Ci pobierac dane z Google Search Console i tworzyc zmiany w WordPressie uzytkownika. ' +
    'Jesli uzytkownik chce zoptymalizowac strone, uzyj narzedzi aby: 1) pobrac dane GSC, 2) przeanalizowac strone, 3) zaproponowac max 3 zmiany, 4) po ustaleniu propozycji wywolaj create_wp_preview_job. ' +
    'Jesli WordPress nie jest podlaczony, poinformuj uzytkownika i podaj rekomendacje tekstowe bez tworzenia preview job. ' +
    'Po utworzeniu preview job, opisz krotko co zostanie zmienione i dlaczego.',
    'Zawsze odpowiadaj po polsku.',
    'W przykĹ‚adach i gotowych rozwiÄ…zaniach moĹĽesz uĹĽywaÄ‡ tagĂłw HTML â€” uĹĽytkownik potrzebuje gotowego kodu do wklejenia.',
    'TABELKI â€” generuj TYLKO gdy: uĹĽytkownik prosi o porĂłwnanie 2+ opcji, jest 3 lub wiÄ™cej problemĂłw do zestawienia, uĹĽytkownik pyta o rĂłĹĽnice miÄ™dzy rozwiÄ…zaniami. NIE uĹĽywaj tabelek gdy: odpowiedĹş to prosta odpowiedĹş na pytanie ogĂłlne, jest tylko 1-2 punkty do omĂłwienia, uĹĽytkownik pyta o definicjÄ™ lub krĂłtkÄ… radÄ™.',
  ].filter(Boolean).join('\n\n');

  const systemIncludesPagePart = pagePart ? SYSTEM.includes(pagePart) : false;
  const systemIncludesSeoMarker = SYSTEM.includes('__SEO_DATA_PRESENT__');

  if (isDev) {
    console.log(
      `[CHAT_CONTEXT] prompt includes pageContext=${promptIncludesPageContext ? 'yes' : 'no'}`,
    );
    console.log(`[CHAT_CONTEXT] system includes pagePart=${systemIncludesPagePart ? 'yes' : 'no'}`);
    console.log(`[CHAT_CONTEXT] system includes __SEO_DATA_PRESENT__=${systemIncludesSeoMarker ? 'yes' : 'no'}`);
  }

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        const modelMessages = await convertToModelMessages(messages as UIMessage[]);
        const modelMessagesHasSeoMarker = modelMessages.some((m) => {
          const asJson = JSON.stringify(m);
          return asJson.includes('__SEO_DATA__') || asJson.includes('__SEO_DATA_PRESENT__');
        });

        if (isDev) {
          const modelInputSummary = {
            model: 'gpt-4o',
            effectiveUrl,
            urlSource,
            pageContextLength: pageContext.length,
            systemLength: SYSTEM.length,
            systemIncludesPagePart,
            systemIncludesSeoMarker,
            modelMessagesCount: modelMessages.length,
            modelMessagesHasSeoMarker,
            lastUserTextPreview: msgText.slice(0, 220),
            lastModelMessagePreview: modelMessages.length
              ? JSON.stringify(modelMessages[modelMessages.length - 1]).slice(0, 260)
              : '',
          };
          console.log(`[CHAT_CONTEXT] model input summary=${JSON.stringify(modelInputSummary)}`);
        }

        const changeJobMarkers: string[] = [];

        const result = streamText({
          model: openai('gpt-4o'),
          system: SYSTEM,
          messages: modelMessages,
          stopWhen: stepCountIs(5),
          tools: {
            get_gsc_summary: tool({
              description: 'Pobierz podsumowanie danych z Google Search Console dla projektu',
              inputSchema: z.object({ projectId: z.string() }),
              execute: async (input) => {
                try {
                  if (!input.projectId) {
                    return { error: 'Brak projectId.' };
                  }
                  await assertProjectOwnedByUser(uid, input.projectId);
                  return await getSearchConsoleSummaryFromCache(input.projectId);
                } catch (err) {
                  return { error: err instanceof Error ? err.message : 'Blad pobierania danych GSC.' };
                }
              },
            }),
            get_gsc_pages: tool({
              description: 'Pobierz listę stron z Google Search Console z opcjonalnym filtrowaniem i sortowaniem',
              inputSchema: z.object({
                projectId: z.string(),
                limit: z.number().optional().default(20),
                sortBy: z.enum(['clicks', 'impressions', 'ctr', 'position']).optional().default('clicks'),
                sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
                search: z.string().optional().default(''),
              }),
              execute: async (input) => {
                try {
                  if (!input.projectId) {
                    return { error: 'Brak projectId.' };
                  }
                  await assertProjectOwnedByUser(uid, input.projectId);
                  return await getSearchConsolePagesFromCache({
                    projectId: input.projectId,
                    limit: input.limit,
                    sortBy: input.sortBy,
                    sortDir: input.sortDir,
                    search: input.search,
                  });
                } catch (err) {
                  return { error: err instanceof Error ? err.message : 'Blad pobierania stron GSC.' };
                }
              },
            }),
            get_gsc_page_queries: tool({
              description: 'Pobierz top zapytania wyszukiwania dla konkretnej strony z Google Search Console',
              inputSchema: z.object({
                projectId: z.string(),
                pageUrl: z.string(),
              }),
              execute: async ({ projectId: toolProjectId, pageUrl: toolPageUrl }) => {
                try {
                  if (!toolProjectId) return { error: 'Brak projectId' };
                  await assertProjectOwnedByUser(uid, toolProjectId);
                  const result = await getPageQueriesFromCache(toolProjectId, toolPageUrl);
                  if (!result) return { queries: [], message: 'Brak danych w cache. Dane pojawia sie po synchronizacji GSC.' };
                  return result;
                } catch (e) {
                  return { error: e instanceof Error ? e.message : String(e) };
                }
              },
            }),
            create_wp_preview_job: tool({
              description: 'Utwórz podgląd zmian WordPress (preview job) dla wskazanej strony lub wpisu',
              inputSchema: z.object({
                projectId: z.string(),
                targetType: z.enum(['page', 'post']),
                targetId: z.number(),
                suggestedTitle: z.string().optional(),
                suggestedContent: z.string().optional(),
                suggestedMetaDescription: z.string().optional(),
              }),
              execute: async (input) => {
                try {
                  if (!input.projectId) {
                    return { error: 'Brak projectId.' };
                  }
                  const previewResult = await createWordPressPreviewJob({
                    uid,
                    projectId: input.projectId,
                    targetType: input.targetType,
                    targetId: input.targetId,
                    suggestedTitle: input.suggestedTitle,
                    suggestedContent: input.suggestedContent,
                    suggestedMetaDescription: input.suggestedMetaDescription,
                  });

                  // Build and store the change job marker for later emission
                  const markerPayload = {
                    jobId: previewResult.jobId,
                    pageUrl: previewResult.pageUrl,
                    changeType: previewResult.changeType,
                    beforeValue: previewResult.beforeValue,
                    proposedValue: previewResult.proposedValue,
                    previewSummary: previewResult.previewSummary,
                    targetType: input.targetType,
                    targetId: input.targetId,
                    changedFields: previewResult.changedFields,
                  };
                  changeJobMarkers.push(
                    `__CHANGE_JOB__:${JSON.stringify(markerPayload)}__END_CHANGE_JOB__`,
                  );

                  return previewResult;
                } catch (err) {
                  return { error: err instanceof Error ? err.message : 'Blad tworzenia preview job.' };
                }
              },
            }),
            apply_wp_change_job: tool({
              description: 'Wdróż (zastosuj) wcześniej utworzony change job na WordPress',
              inputSchema: z.object({ jobId: z.string() }),
              execute: async (input) => {
                try {
                  return await applyWordPressChangeJob(uid, input.jobId);
                } catch (err) {
                  return { error: err instanceof Error ? err.message : 'Blad wdrazania change job.' };
                }
              },
            }),
            rollback_wp_change_job: tool({
              description: 'Cofnij (rollback) wcześniej zastosowany change job na WordPress',
              inputSchema: z.object({ jobId: z.string() }),
              execute: async (input) => {
                try {
                  return await rollbackWordPressChangeJob(uid, input.jobId);
                } catch (err) {
                  return { error: err instanceof Error ? err.message : 'Blad cofania change job.' };
                }
              },
            }),
            get_change_measurements: tool({
              description: 'Pobierz pomiary wydajności (measurements) powiązane z danym change job',
              inputSchema: z.object({ jobId: z.string() }),
              execute: async (input) => {
                try {
                  return await getChangeMeasurementsByJob(input.jobId);
                } catch (err) {
                  return { error: err instanceof Error ? err.message : 'Blad pobierania pomiarow.' };
                }
              },
            }),
          },
        });

        writer.write({ type: 'text-start', id: 'main' });

        if (seoCardData) {
          const marker = `__SEO_DATA__:${JSON.stringify(seoCardData)}__END_SEO__\n`;
          writer.write({ type: 'text-delta', id: 'main', delta: marker });
        }

        for await (const chunk of result.textStream) {
          writer.write({ type: 'text-delta', id: 'main', delta: chunk });
        }

        // Emit any change job markers after all text streaming is done
        for (const jobMarker of changeJobMarkers) {
          writer.write({ type: 'text-delta', id: 'main', delta: `\n${jobMarker}\n` });
        }

        writer.write({ type: 'text-end', id: 'main' });
      },
    }),
  });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
