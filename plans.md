# plans.md — Architektura i Plan Budowy MVP Bress.io

## Architektura systemu

```
┌─────────────────────────────────────────────────────────────┐
│                    PANEL EKSPERTA (Next.js)                  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Auth       │  │  Dashboard   │  │  Projekt / SEO   │  │
│  │  (Firebase)  │  │  (projekty)  │  │  (optymalizacje) │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Server Actions / API Routes              │   │
│  │  /api/snippet/:token   /api/publish   /api/analyze   │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌─────────────┐  ┌──────────┐  ┌────────────┐
    │  Firestore  │  │ OpenAI   │  │  Firebase  │
    │   (dane)    │  │   API    │  │    Auth    │
    └─────────────┘  └──────────┘  └────────────┘
           ▲
           │ HTTP (token)
┌──────────┴──────────────────────────────────────┐
│              JS SNIPPET (klient WWW)             │
│                                                  │
│  • Pobiera optymalizacje z /api/snippet/:token   │
│  • Tryb autonomiczny → wdraża automatycznie      │
│  • Tryb manualny → pokazuje przycisk "Publikuj"  │
└──────────────────────────────────────────────────┘
```

## Przepływ danych

1. Ekspert loguje się do Panelu i dodaje projekt klienta (URL strony)
2. Ekspert wpisuje wytyczne przez czat tekstowy
3. Wiadomość tekstowa → GPT-4 → optymalizacje SEO
4. Optymalizacje zapisane w Firestore jako `pending`
5. Snippet na stronie klienta odpytuje `/api/snippet/:token` co N minut
6. **Tryb autonomiczny ON**: Snippet sam wdraża zmiany (meta tagi, nagłówki, treść)
7. **Tryb autonomiczny OFF**: Klient klika "Publikuj" w swoim mini-dashboardzie lub ekspert zatwierdza w panelu
8. Po wdrożeniu status zmienia się na `published`

---

## Etap 1 — Inicjalizacja projektu

**Cel:** Postawienie działającego szkieletu aplikacji gotowego do developmentu.

### Zadania:
- [ ] Inicjalizacja projektu: `npx create-next-app@latest` (TypeScript, Tailwind, App Router, src/)
- [ ] Instalacja i konfiguracja shadcn/ui
- [ ] Instalacja Firebase SDK i Firebase Admin SDK
- [ ] Konfiguracja `next.config.ts` (`serverExternalPackages`)
- [ ] Stworzenie pliku `.env.local` ze zmiennymi Firebase
- [ ] Stworzenie `lib/firebase/client.ts` i `lib/firebase/admin.ts` (lazy init)
- [ ] Wdrożenie bazowego layoutu aplikacji (Tailwind, czcionki, kolory marki)
- [ ] Weryfikacja: `npm run dev` działa, `npm run build` przechodzi

### Efekt końcowy:
Działający Next.js z Firebase gotowy do dodania auth i logiki.

---

## Etap 2 — Autentykacja i zarządzanie projektami

**Cel:** Ekspert może się zalogować i stworzyć projekt klienta.

### Zadania:
- [ ] Firebase Auth — logowanie przez e-mail/hasło (Server Actions + HttpOnly cookies)
- [ ] `lib/firebase/session.ts` — `createSession()`, `deleteSession()`, `getSessionUser()`
- [ ] Strona `/logowanie` — formularz logowania po polsku
- [ ] Middleware ochrony tras (sprawdzanie sesji)
- [ ] Dashboard `/dashboard` — lista projektów klienta
- [ ] Formularz tworzenia projektu (nazwa, URL strony)
- [ ] Zapis projektu do Firestore (`projects/{projectId}`)
- [ ] Generowanie unikalnego tokenu snippetu (`snippetToken`) per projekt
- [ ] Strona projektu `/dashboard/[projectId]` — widok szczegółowy

### Efekt końcowy:
Ekspert może zalogować się, stworzyć projekt i zobaczyć jego token snippetu.

---

## Etap 3 — Czat z Agentem SEO i generowanie optymalizacji

**Cel:** Ekspert wpisuje wytyczne przez czat; Agent SEO przetwarza je na konkretne optymalizacje.

### Zadania:
- [ ] Komponent `<ChatInterface>` — pole tekstowe, historia wiadomości, wysyłanie
- [ ] Server Action: wiadomość czatu + kontekst strony → GPT-4 → lista optymalizacji SEO
- [ ] Zapis optymalizacji do Firestore (`optimizations/{id}`, status: `pending`)
- [ ] Zapis wiadomości do Firestore (`guidelines/{id}`, kolekcja wiadomości czatu)
- [ ] Widok listy optymalizacji w panelu projektu (tytuł, opis zmiany, status)
- [ ] Możliwość ręcznego zatwierdzenia/odrzucenia optymalizacji przez eksperta
- [ ] Struktura optymalizacji: `{ type, selector, value, description, status }`

### Efekt końcowy:
Ekspert może wpisać wytyczne przez czat i zobaczyć wygenerowane optymalizacje SEO gotowe do wdrożenia.

---

## Etap 4 — JS Snippet i wdrażanie optymalizacji

**Cel:** Klient może wkleić Snippet na swoją stronę i zacząć otrzymywać optymalizacje.

### Zadania:
- [ ] API Route: `GET /api/snippet/[token]` — zwraca `pending` optymalizacje dla danego tokenu
- [ ] Stworzenie pliku `public/snippet.js` — czysty JavaScript (bez bundlera)
- [ ] Snippet: odpytuje API co 5 minut, obsługuje odpowiedź
- [ ] Snippet: logika wdrażania zmian DOM (meta tagi, nagłówki H1-H3, treść akapitów)
- [ ] Snippet: tryb autonomiczny (flaga z API) → auto-wdrożenie
- [ ] Snippet: tryb manualny → renderuje niewidoczny przycisk "Publikuj Zmiany SEO"
- [ ] API Route: `POST /api/publish` — zmienia status optymalizacji na `published`
- [ ] Aktualizacja statusu w Firestore po wdrożeniu
- [ ] Widok kodu Snippetu w panelu (gotowy do skopiowania `<script>` tag)

### Efekt końcowy:
Klient wkleja jeden `<script>` tag na swoją stronę i optymalizacje zaczynają działać.

---

## Etap 5 — Tryb autonomiczny, polish i gotowość do MVP

**Cel:** Dopracowanie UX, dodanie trybu autonomicznego i przygotowanie do pierwszych klientów.

### Zadania:
- [ ] Przełącznik "Tryb Autonomiczny" w ustawieniach projektu (zapis w Firestore)
- [ ] API zwraca flagę `isAutonomous` — Snippet reaguje odpowiednio
- [ ] Dashboard: statystyki (ile optymalizacji wdrożono, kiedy ostatnia aktywność)
- [ ] Historia optymalizacji z datami i statusami
- [ ] Obsługa błędów i stany ładowania w całym UI (po polsku)
- [ ] Responsywność — weryfikacja mobile-first na prawdziwych urządzeniach
- [ ] Zabezpieczenie API routes (rate limiting, walidacja tokenów)
- [ ] Zmienne środowiskowe dla środowiska produkcyjnego
- [ ] Deploy na Vercel + konfiguracja domeny
- [ ] Testy manualne end-to-end pełnego flow

### Efekt końcowy:
Działające MVP gotowe do onboardingu pierwszych klientów B2B.

---

## Priorytety techniczne (cross-cutting)

- **Bezpieczeństwo**: Token snippetu nie ujawnia kluczy Firebase. API weryfikuje token przed zwróceniem danych.
- **Wydajność snippetu**: Plik `snippet.js` musi być lekki (< 10 KB), bez zewnętrznych zależności.
- **Niezawodność**: Snippet nie może crashować strony klienta — try/catch na każdej operacji DOM.
- **Skalowalność Firestore**: Indeksy na `projectId + status` dla zapytań o optymalizacje.
