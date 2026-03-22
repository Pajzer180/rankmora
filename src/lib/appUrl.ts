/**
 * Returns the public base URL of the Bress.io application.
 *
 * Uses NEXT_PUBLIC_APP_URL env variable. In local dev this can be
 * http://localhost:3000, in production it should be https://app.bress.io.
 */
export function getAppBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) {
    throw new Error(
      'Brakuje zmiennej srodowiskowej NEXT_PUBLIC_APP_URL. ' +
      'Dodaj ja do .env.local (np. NEXT_PUBLIC_APP_URL=http://localhost:3000 dla dev ' +
      'lub NEXT_PUBLIC_APP_URL=https://app.bress.io dla produkcji).',
    );
  }

  // Strip trailing slash for consistent concatenation
  return raw.replace(/\/+$/, '');
}

/**
 * Builds the full snippet <script> tag for a given token.
 */
export function buildSnippetTag(token: string): string {
  const base = getAppBaseUrl();
  const src = `${base}/api/snippet/agent.js?token=${token}`;
  return `<script async src="${src}"></script>`;
}

/**
 * Builds just the snippet agent.js URL for a given token.
 */
export function buildSnippetUrl(token: string): string {
  const base = getAppBaseUrl();
  return `${base}/api/snippet/agent.js?token=${token}`;
}
