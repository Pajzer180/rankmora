import { openai } from '@ai-sdk/openai';
import { streamText, convertToModelMessages, UIMessage, createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { load } from 'cheerio';
import type { AgentMode, AgentStyle } from '@/types/chat';
import { requireAuthenticatedUid, toRouteErrorResponse } from '@/lib/server/firebaseAuth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { readResponseTextWithinLimit, safeRemoteFetch } from '@/lib/server/safeRemoteFetch';
import { chatRequestSchema } from '@/lib/server/schemas/chat';
import { readJsonRequestBody } from '@/lib/server/validation';

const CHAT_REMOTE_FETCH_TIMEOUT_MS = 8_000;
const CHAT_REMOTE_FETCH_MAX_RESPONSE_BYTES = 2_000_000;

const modeInstructions: Record<AgentMode, string> = {
  casual:
    'Odpowiadaj prosto i przyjaźnie, bez branżowego żargonu. ' +
    'Tłumacz wszystko tak, jakbyś rozmawiał z właścicielem małego sklepu, który dopiero zaczyna przygodę z SEO. ' +
    'Używaj prostych analogii i krótkich zdań.',
  business:
    'Odpowiadaj konkretnie i punktowo. ' +
    'Skup się na wynikach biznesowych, ROI i priorytetach. ' +
    'Pomijaj zbędne wyjaśnienia podstaw – rozmówca zna realia prowadzenia biznesu online.',
  expert:
    'Używaj pełnej terminologii SEO i technicznej. ' +
    'Podawaj szczegółowe dane, liczby, analizy i zaawansowane strategie. ' +
    'Zakładaj wysoką wiedzę rozmówcy – nie tłumacz podstawowych pojęć.',
};

const styleInstructions: Record<AgentStyle, string> = {
  action:
    'Skup się na konkretnych, gotowych do wdrożenia akcjach. ' +
    'Dawaj listy zadań, przykłady meta tagów, gotowe szkice tekstów. ' +
    'Mniej teorii, więcej praktycznych kroków.',
  inquisitive:
    'Przed odpowiedzią przeanalizuj problem dogłębnie. ' +
    'Jeśli potrzebujesz więcej kontekstu, zadaj 1–2 pytania precyzujące. ' +
    'Rozważaj różne scenariusze i ich konsekwencje, zanim zaproponujesz rozwiązanie.',
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

  // 🔴 Krytyczne (max -50) — JS_RENDERED nie jest karane za brak H1
  if (data.h1 !== 'JS_RENDERED' && (!data.h1 || data.h1 === 'BRAK H1!')) score -= 25;
  if (!data.title)                                                          score -= 15;
  if (!data.metaDescription || data.metaDescription === 'brak')           score -= 10;

  // 🟡 Ważne (max -30)
  if (data.title && data.title.length > 60)                               score -= 10;
  if (data.title && data.title.length < 20)                               score -= 5;
  if (!data.h2Count || data.h2Count === 0)                                score -= 10;
  else if (data.h2Count === 1)                                            score -= 5;
  if (data.metaDescription && data.metaDescription.length > 160)         score -= 5;
  if (data.metaDescription && data.metaDescription.length < 70)          score -= 5;

  // 🟢 Opcjonalne (max -20)
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
    } = await readJsonRequestBody(req, chatRequestSchema);

  const isDev = process.env.NODE_ENV !== 'production';

  // Wykryj URL w ostatniej wiadomości użytkownika
  // AI SDK 6.x: UIMessage nie ma pola `content` – tekst jest w parts[].type==='text'
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  const msgText = lastUserMsg?.parts
    ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ') ?? '';
  const rawUrl = msgText.match(/https?:\/\/[^\s<>"']+/)?.[0] ?? '';
  const manualUrl = rawUrl ? rawUrl.replace(/[.,;:!?)'">\]]+$/, '') : null;

  let pageContext = '';
  let seoCardData: SeoCardData | null = null;

  const effectiveUrl = manualUrl || activeSiteUrl || null;
  const urlSource =
    manualUrl
      ? 'manual'
      : activeSiteUrl && activeSiteSource === 'snippet'
        ? 'snippet'
        : activeSiteUrl
          ? 'active-site'
          : 'none';

  if (isDev) {
    console.log(`[CHAT_CONTEXT] manualUrl=${manualUrl ?? ''}`);
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
      ? 'Użytkownik podał URL ręcznie do analizy.'
      : urlSource === 'snippet'
        ? `Użytkownik ma podłączoną stronę projektu przez JS Snippet${activeSiteDomain ? ` (${activeSiteDomain})` : ''}. Analizuj tę stronę i nie pytaj o URL.`
        : urlSource === 'active-site'
          ? 'Użytkownik ma aktywną stronę projektu w kontekście czatu.'
          : '';

  const pagePart = pageContext
    ? `${pageSourceInstruction} Oto jej RZECZYWISTE dane pobrane przez scraper:\n${pageContext}\n` +
      (urlSource === 'snippet'
        ? 'URL pochodzi z aktywnego snippetu projektu. Nie proś o URL i nie zadawaj pytań o link, tylko analizuj tę stronę.\n'
        : '') +
      'BEZWZGLĘDNE ZASADY ANALIZY TEJ STRONY:\n' +
      '1. CYTUJ DOSŁOWNIE – jeśli title tag jest zbyt długi lub błędny, podaj jego DOKŁADNY tekst w cudzysłowie i napisz ile ma znaków (np. "Twój title: „Usługi sprzątania Warszawa i okolice – profesjonalne mycie okien, pranie dywanów, sprzątanie biur" — 97 znaków, max powinno być 60").\n' +
      '2. PODAWAJ GOTOWY TEKST DO SKOPIOWANIA – zamiast "popraw H1" napisz: \'Wstaw dokładnie ten H1: „Mycie okien Warszawa – od 3 zł/m² | Stefpol Cleaning"\'. Użytkownik ma skopiować i wkleić.\n' +
      '3. MAKSYMALNIE 3 ZMIANY, numerowane od najważniejszej. Nie wypisuj długich list.\n' +
      '4. NIGDY nie pisz ogólnych zasad SEO ("słowa kluczowe są ważne", "treść powinna być wartościowa") – użytkownik to wie. Mów TYLKO o tej konkretnej stronie.\n' +
      '5. WAZENIE SYGNALOW I KONTEKST: nie kazdy brak = problem. Oceniaj elementy wg typu strony (np. landing, usluga, blog, kontakt, regulamin) i celu strony.\n' +
      '6. KLASYFIKUJ znaleziska do poziomow: KRYTYCZNE, WAZNE, OPCJONALNE/KONTEKSTOWE. Nie wymuszaj wszystkich kategorii, jesli brak podstaw.\n' +
      '7. KRYTYCZNE oznaczaj tylko przy mocnym uzasadnieniu i realnym wplywie (np. indeksacja, trafnosc, CTR, nawigacja). Jesli brak pewnosci, obniz poziom do WAZNE lub OPCJONALNE.\n' +
      '8. Brak linkow zewnetrznych, brak obrazow, brak robots meta lub brak CTA moze byc uzasadniony. Zaznacz to jawnie jako kontekstowe, zamiast automatycznie traktowac jako blad.\n' +
      '9. FORMAT odpowiedzi (uzywaj tylko gdy dany problem faktycznie wystepuje):\n' +
      '**KRYTYCZNE** (napraw najpierw) - tylko problemy o wysokim ryzyku i mocnym dowodzie na tej stronie:\n' +
      '[konkretny problem z dosłownym cytatem rzeczywistej wartości]\n' +
      '→ Wstaw dokładnie: [gotowy kod HTML lub tekst do skopiowania] *(~X min)*\n' +
      'Linki: brak H1 → [Co to jest H1? →](https://developers.google.com/search/docs/appearance/title-link) | brak meta description → [Więcej →](https://developers.google.com/search/docs/appearance/snippet)\n\n' +
      '**WAZNE** - problemy istotne, ale zalezne od kontekstu strony i celu biznesowego:\n' +
      '[problem z cytatem]\n' +
      '→ Wstaw dokładnie: [gotowy kod lub tekst] *(~X min)*\n' +
      'Obrazy bez alt → [Więcej →](https://web.dev/image-alt/)\n\n' +
      '**OPCJONALNE / KONTEKSTOWE** - usprawnienia zalezne od typu strony, nie zawsze wymagane:\n' +
      '[problem z cytatem]\n' +
      '→ Sugestia: [tekst] *(~X min)*\n\n' +
      '**✅ Plan wdrożenia (kolejność):**\n\n' +
      '1. **[Akcja]** — wklej: `[konkretny kod lub tekst]`\n' +
      '2. **[Akcja]** — [konkretna zmiana]\n' +
      '3. **[Akcja]** — [konkretna zmiana]\n\n' +
      '10. ZAKONCZ kazda analize dokladnie tym zdaniem (uzupelnij fraze): ' +
      '"Wdrożenie tych zmian powinno poprawić pozycję dla frazy: [główna fraza wykryta ze strony]"\n\n' +
      '11. KARTA SEO jest generowana automatycznie przez system - NIE generuj zadnych blokow kodu MOCK_*. Skup sie wylacznie na rekomendacjach tekstowych.'
    : '';

  const seoDataPresenceInstruction = pageContext
    ? '__SEO_DATA_PRESENT__\nIf you see this marker, do not answer generically. You must quote page data.'
    : '';

  const promptIncludesPageContext = pageContext
    ? pagePart.includes(pageContext)
    : false;


  const SYSTEM = [
    'Jesteś Bress – zaawansowanym ekspertem SEO i content marketingu.',
    'Pomagasz użytkownikom zoptymalizować ich strony, treści i widoczność w wyszukiwarkach.',
    pagePart,
    seoDataPresenceInstruction,
    `Poziom odpowiedzi: ${modeInstructions[agentMode] ?? modeInstructions.business}`,
    `Styl pracy: ${styleInstructions[agentStyle] ?? styleInstructions.action}`,
    'Jesli masz dane strony z scrapera, analizuj szeroko: metadata, canonical, robots, OG, linkowanie wew/zew, CTA, sekcje i sygnaly konwersji. Nie ograniczaj sie do samych headingow. Nie kazdy brak jest bledem - oceniaj sygnaly kontekstowo wg typu strony i intencji.',
    'Zawsze odpowiadaj po polsku.',
    'W przykładach i gotowych rozwiązaniach możesz używać tagów HTML — użytkownik potrzebuje gotowego kodu do wklejenia.',
    'TABELKI — generuj TYLKO gdy: użytkownik prosi o porównanie 2+ opcji, jest 3 lub więcej problemów do zestawienia, użytkownik pyta o różnice między rozwiązaniami. NIE używaj tabelek gdy: odpowiedź to prosta odpowiedź na pytanie ogólne, jest tylko 1-2 punkty do omówienia, użytkownik pyta o definicję lub krótką radę.',
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
            model: 'gpt-4o-mini',
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

        const result = streamText({
          model: openai('gpt-4o-mini'),
          system: SYSTEM,
          messages: modelMessages,
        });

        writer.write({ type: 'text-start', id: 'main' });

        if (seoCardData) {
          const marker = `__SEO_DATA__:${JSON.stringify(seoCardData)}__END_SEO__\n`;
          writer.write({ type: 'text-delta', id: 'main', delta: marker });
        }

        for await (const chunk of result.textStream) {
          writer.write({ type: 'text-delta', id: 'main', delta: chunk });
        }

        writer.write({ type: 'text-end', id: 'main' });
      },
    }),
  });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
