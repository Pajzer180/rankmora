import 'server-only';

import {
  normalizeRemoteHttpUrl,
  readResponseTextWithinLimit,
  safeRemoteFetch,
} from '@/lib/server/safeRemoteFetch';

export type WordPressHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface WordPressRequestOptions {
  siteUrl: string;
  username: string;
  applicationPassword: string;
  path: string;
  method?: WordPressHttpMethod;
  body?: unknown;
  searchParams?: Record<string, string | number | boolean | null | undefined>;
}

const WORDPRESS_FETCH_TIMEOUT_MS = 10_000;
const WORDPRESS_FETCH_MAX_RESPONSE_BYTES = 1_000_000;

export class WordPressApiError extends Error {
  status: number;
  endpoint: string;
  details?: unknown;

  constructor(message: string, status: number, endpoint: string, details?: unknown) {
    super(message);
    this.name = 'WordPressApiError';
    this.status = status;
    this.endpoint = endpoint;
    this.details = details;
  }
}

export function normalizeWordPressSiteUrl(input: string): string {
  const url = normalizeRemoteHttpUrl(input, { defaultProtocol: 'https:' });
  const pathname = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${pathname === '/' ? '' : pathname}`;
}

export function toWordPressApiPath(siteUrl: string, inputPath: string): string {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    throw new Error('Missing WordPress API path.');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const endpointUrl = new URL(trimmed);
    const siteOrigin = new URL(normalizeWordPressSiteUrl(siteUrl)).origin;

    if (endpointUrl.origin !== siteOrigin) {
      throw new Error('WordPress endpoint origin mismatch.');
    }

    return `${endpointUrl.pathname}${endpointUrl.search}`;
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function safeJsonParse(rawText: string): unknown | null {
  if (!rawText.trim()) return null;

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return null;
  }
}

function buildWordPressUrl(
  siteUrl: string,
  path: string,
  searchParams?: Record<string, string | number | boolean | null | undefined>,
): URL {
  const normalizedSiteUrl = normalizeWordPressSiteUrl(siteUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(normalizedPath, `${normalizedSiteUrl}/`);

  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });

  return url;
}

export async function wordpressRequest<T>(options: WordPressRequestOptions): Promise<T> {
  const url = buildWordPressUrl(options.siteUrl, options.path, options.searchParams);
  const auth = Buffer.from(`${options.username}:${options.applicationPassword}`).toString('base64');

  const response = await safeRemoteFetch({
    url,
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    timeoutMs: WORDPRESS_FETCH_TIMEOUT_MS,
  });

  const rawText = await readResponseTextWithinLimit(response, WORDPRESS_FETCH_MAX_RESPONSE_BYTES);
  const parsed = safeJsonParse(rawText);

  if (!response.ok) {
    const details = parsed ?? (rawText || null);
    const message = typeof parsed === 'object' && parsed !== null && 'message' in parsed
      ? String((parsed as { message?: unknown }).message ?? `WordPress API HTTP ${response.status}`)
      : `WordPress API HTTP ${response.status}`;

    throw new WordPressApiError(message, response.status, url.toString(), details);
  }

  return (parsed ?? null) as T;
}
