# CLAUDE.md — Pamięć Projektu Bress.io

## Opis projektu

**Bress.io** to asystent SEO oparty o AI, skierowany do właścicieli małych firm. Łączy się z WordPress i Google Search Console, analizuje dane, proponuje zmiany i wdraża je jednym kliknięciem.

### Core workflow
1. **Podłącz WordPress + GSC** — użytkownik podaje dane WP i łączy konto Google.
2. **Analityka** — dashboard pokazuje realne dane z GSC: okazje CTR, strony do ochrony, alerty.
3. **Chat z agentem** — AI analizuje dane GSC i treść strony, proponuje max 3 zmiany.
4. **Podgląd zmian** — karta before/after w chacie z przyciskami Wdróż/Anuluj.
5. **Wdrożenie** — agent wdraża zmianę w WordPress przez REST API.
6. **Pomiar i rollback** — mierzenie efektu po 7/14/30 dniach, jednoklkowe cofnięcie.

### Legacy (oznaczone w kodzie jako `// LEGACY`)
- **JS Snippet** — wcześniejszy mechanizm wdrażania zmian w DOM. Nie jest core, ale kod pozostaje w repo.
- **Panel eksperta / generate** — wcześniejszy flow generowania akcji SEO. Zastąpiony przez chat + tool-calling.

## Tech Stack

| Warstwa | Technologia |
|---|---|
| Framework | Next.js (App Router, TypeScript) |
| Stylowanie | Tailwind CSS |
| Baza danych | Firebase Firestore |
| Autentykacja | Firebase Authentication |
| Chat AI | OpenAI API (gpt-4o, tool-calling) |
| WordPress | WP REST API + Application Passwords |
| GSC | Google Search Console API (OAuth2) |
| Hosting | Vercel (docelowo) |

## Komendy

```bash
npm run dev      # Serwer deweloperski
npm run build    # Build produkcyjny
npm run start    # Uruchomienie produkcyjne
npm run lint     # Linting
```

## Architektura Firebase

### Kolekcje core
- `projects/{projectId}` — projekt (domena, WordPress connection, GSC connection)
- `profiles/{uid}` — profil użytkownika (imię, cel biznesowy, ton, poziom SEO)
- `chats/{userId}/sessions/{sessionId}/messages/{messageId}` — sesje i wiadomości czatu
- `change_jobs/{jobId}` — joby zmian (preview_ready → applied → rolled_back)
- `change_measurements/{measurementId}` — pomiary efektu zmian (7d/14d/30d)
- `searchConsoleDailyMetrics/{id}` — dzienne metryki GSC
- `searchConsolePageMetrics/{id}` — metryki per strona
- `search_console_page_queries_28d/{id}` — cache top zapytań per strona
- `search_console_connections/{id}` — tokeny OAuth GSC
- `wordpress_connections/{id}` — zaszyfrowane dane logowania WP

### Legacy kolekcje
- `seo_actions/{actionId}` — akcje snippetowe
- `siteInstalls/{installId}` — instalacje snippetów

Pola Firestore: camelCase (`siteUrl`, `createdAt`, `publishedAt` itp.)

### Wzorce Firebase w Next.js (App Router)
- `lib/server/firebaseAdmin.ts` → `getFirebaseAdminDb()` (server-only)
- `lib/firebase.ts` → `getClientAuth()`, `getClientDb()` (client)
- `next.config.ts`: `serverExternalPackages: ['firebase-admin']`

## Architektura API

### Core endpointy
| Endpoint | Metoda | Opis |
|---|---|---|
| `/api/chat` | POST | Chat z tool-calling (GSC, WP preview/apply/rollback) |
| `/api/gsc/connect` | POST | Inicjacja OAuth z Google |
| `/api/gsc/callback` | GET | Callback OAuth |
| `/api/gsc/sites` | GET | Lista properties GSC |
| `/api/gsc/select-site` | POST | Wybór property |
| `/api/gsc/summary` | GET | Podsumowanie metryk |
| `/api/gsc/pages` | GET | Metryki per strona |
| `/api/gsc/page-queries` | GET | Top zapytania per strona |
| `/api/wordpress/connect` | POST | Podłączenie WordPress |
| `/api/wordpress/fetch` | GET | Lista stron/wpisów WP |
| `/api/wordpress/apply` | POST | Wdrożenie change job |
| `/api/wordpress/rollback` | POST | Cofnięcie change job |
| `/api/change-jobs` | GET | Lista change jobs |
| `/api/change-measurements` | GET | Pomiary efektu |

### Legacy endpointy (oznaczone `// LEGACY`)
- `/api/generate` — generowanie akcji SEO
- `/api/active-actions` — serwowanie akcji do snippetu
- `/api/snippet/*` — JS snippet + beacon

### Wzorce backendu
- `requireAuthenticatedUid(req)` — wyciąga UID z Bearer tokena
- `assertProjectOwnedByUser(uid, projectId)` — sprawdza ownership
- `enforceRateLimit(req, { scope, uid })` — rate limiter per scope
- `toRouteErrorResponse(error)` — ujednolicona obsługa błędów
- Walidacja Zod w `src/lib/server/schemas/*`
- `safeRemoteFetch` — SSRF-hardened fetch

## Chat z tool-calling

Chat (`/api/chat`) używa `streamText` z `ai` SDK + `openai('gpt-4o')` z narzędziami:

| Tool | Opis |
|---|---|
| `get_gsc_summary` | Podsumowanie GSC |
| `get_gsc_pages` | Metryki per strona |
| `get_gsc_page_queries` | Top zapytania per strona |
| `create_wp_preview_job` | Tworzenie preview zmiany WP |
| `apply_wp_change_job` | Wdrożenie zmiany |
| `rollback_wp_change_job` | Cofnięcie zmiany |
| `get_change_measurements` | Pomiary efektu |

Protokół markerów w odpowiedzi:
- `__SEO_DATA__:{json}__END_SEO__` — karta SEO ze scrapera
- `__CHANGE_JOB__:{json}__END_CHANGE_JOB__` — karta podglądu zmiany WP

## Dashboard

### Strony core
- `/dashboard/analityka` — dane GSC, okazje CTR, strony do ochrony, alerty
- `/dashboard/chat` — chat z agentem AI + tool-calling
- `/dashboard/zmiany` — lista change jobs, filtry, rollback, pomiary
- `/dashboard/ustawienia` — podłączenie WordPress, test połączenia

### Strony legacy (ukryte z nawigacji)
- `/dashboard/instalacja` — instalacja JS snippetu
- `/dashboard/historia` — surowa historia zmian
- `/dashboard/strona`, `/dashboard/cele` — placeholdery

## Zasady Projektu

### UI i język
- **Interfejs wyłącznie w języku polskim**
- Komunikaty błędów, etykiety, przyciski — wszystko po polsku

### Podejście
- **Mobile-first**
- **App Router** — wyłącznie (nie Pages Router)
- `'use client'` tylko przy interaktywności
- Server Components jako domyślne

### Kod
- TypeScript strict mode
- Tailwind CSS (bez CSS Modules / styled-components)
- Komponenty UI: shadcn/ui
- Minimum abstrakcji
- Walidacja na granicach systemu (API routes)

### Bezpieczeństwo
- Bearer token auth (Firebase ID token)
- WordPress credentials szyfrowane w Firestore
- GSC OAuth tokeny szyfrowane
- `safeRemoteFetch` blokuje SSRF
- Rate limiting per scope

## Struktura katalogów

```
src/
├── app/
│   ├── (auth)/              # logowanie, rejestracja
│   ├── dashboard/           # analityka, chat, zmiany, ustawienia
│   ├── api/
│   │   ├── chat/            # chat z tool-calling
│   │   ├── gsc/             # Google Search Console API
│   │   ├── wordpress/       # WordPress API
│   │   ├── change-jobs/     # lista change jobs
│   │   ├── change-measurements/  # pomiary efektu
│   │   ├── generate/        # LEGACY
│   │   ├── active-actions/  # LEGACY
│   │   └── snippet/         # LEGACY
│   └── layout.tsx
├── components/
│   ├── ui/                  # shadcn/ui
│   ├── chat/                # ChatLayout, ChatWindow, ChatMessage, ChangeJobCard
│   └── ...                  # landing page, dashboard
├── lib/
│   ├── firebase.ts          # client SDK
│   ├── server/
│   │   ├── firebaseAdmin.ts # admin SDK
│   │   ├── firebaseAuth.ts  # auth helpers
│   │   ├── changeJobs.ts    # CRUD change jobs
│   │   ├── changeMeasurements.ts  # pomiary
│   │   ├── chatPersonalization.ts # personalizacja chatu
│   │   ├── gsc/             # ingest, read, pageQueries, storage
│   │   ├── schemas/         # Zod schemas
│   │   └── ...
│   └── wordpress/           # client.ts, service.ts, repository.ts
└── types/                   # TypeScript types
```
