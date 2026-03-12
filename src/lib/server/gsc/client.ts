import 'server-only';

import { RouteError } from '@/lib/server/routeError';
import {
  GOOGLE_OAUTH_AUTHORIZE_URL,
  GOOGLE_OAUTH_TOKEN_URL,
  GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_URL,
  GOOGLE_SEARCH_CONSOLE_SITES_URL,
  SEARCH_CONSOLE_SCOPE,
  type GoogleSearchAnalyticsQueryRequest,
  type GoogleSearchAnalyticsResponse,
  type GoogleSitesListResponse,
  type GoogleTokenResponse,
  type JsonRequestOptions,
  type SearchConsoleConfig,
} from '@/lib/server/gsc/types';
import type { SearchConsolePropertySummary } from '@/types/searchConsole';

export function readSearchConsoleConfig(): SearchConsoleConfig {
  const clientId = process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_SEARCH_CONSOLE_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new RouteError(500, 'Integracja Google Search Console nie jest skonfigurowana.', {
      code: 'SEARCH_CONSOLE_CONFIG_ERROR',
    });
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
}

export function buildSearchConsoleAuthorizationUrl(state: string): string {
  const config = readSearchConsoleConfig();
  const authorizationUrl = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);

  authorizationUrl.searchParams.set('client_id', config.clientId);
  authorizationUrl.searchParams.set('redirect_uri', config.redirectUri);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', SEARCH_CONSOLE_SCOPE);
  authorizationUrl.searchParams.set('access_type', 'offline');
  authorizationUrl.searchParams.set('include_granted_scopes', 'true');
  authorizationUrl.searchParams.set('prompt', 'consent');
  authorizationUrl.searchParams.set('state', state);

  return authorizationUrl.toString();
}

export async function exchangeSearchConsoleAuthorizationCode(code: string): Promise<GoogleTokenResponse> {
  const config = readSearchConsoleConfig();
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });

  return requestJson<GoogleTokenResponse>({
    url: GOOGLE_OAUTH_TOKEN_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    errorCode: 'SEARCH_CONSOLE_OAUTH_FAILED',
    errorMessage: 'Nie udalo sie wymienic kodu OAuth dla Search Console.',
  });
}

export async function refreshSearchConsoleAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const config = readSearchConsoleConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  return requestJson<GoogleTokenResponse>({
    url: GOOGLE_OAUTH_TOKEN_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    errorCode: 'SEARCH_CONSOLE_REFRESH_FAILED',
    errorMessage: 'Nie udalo sie odswiezyc dostepu do Search Console.',
  });
}

export async function listSearchConsoleProperties(accessToken: string): Promise<SearchConsolePropertySummary[]> {
  const response = await requestJson<GoogleSitesListResponse>({
    url: GOOGLE_SEARCH_CONSOLE_SITES_URL,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    errorCode: 'SEARCH_CONSOLE_PROPERTIES_FAILED',
    errorMessage: 'Nie udalo sie pobrac listy Search Console properties.',
  });

  const siteEntries = Array.isArray(response.siteEntry) ? response.siteEntry : [];
  const unique = new Map<string, SearchConsolePropertySummary>();

  for (const entry of siteEntries) {
    const siteUrl = typeof entry.siteUrl === 'string' ? entry.siteUrl.trim() : '';
    if (!siteUrl || unique.has(siteUrl)) {
      continue;
    }

    unique.set(siteUrl, {
      siteUrl,
      permissionLevel: typeof entry.permissionLevel === 'string'
        ? entry.permissionLevel
        : 'siteUnverifiedUser',
    });
  }

  return Array.from(unique.values()).sort((left, right) => left.siteUrl.localeCompare(right.siteUrl));
}

export async function querySearchConsoleSearchAnalytics(args: {
  accessToken: string;
  propertySiteUrl: string;
  request: GoogleSearchAnalyticsQueryRequest;
}): Promise<GoogleSearchAnalyticsResponse> {
  const propertySiteUrl = args.propertySiteUrl.trim();
  if (!propertySiteUrl) {
    throw new RouteError(400, 'Brakuje wybranej wlasciwosci Search Console.', {
      code: 'SEARCH_CONSOLE_PROPERTY_INVALID',
      reason: 'missing-property',
    });
  }

  const encodedSiteUrl = encodeURIComponent(propertySiteUrl);
  return requestJson<GoogleSearchAnalyticsResponse>({
    url: `${GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_URL}/${encodedSiteUrl}/searchAnalytics/query`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...args.request,
      type: args.request.type ?? 'web',
    }),
    errorCode: 'SEARCH_CONSOLE_ANALYTICS_FAILED',
    errorMessage: 'Nie udalo sie pobrac danych Search Analytics z Google Search Console.',
  });
}

async function requestJson<T>(options: JsonRequestOptions): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(options.url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });

    const rawText = await response.text();
    let parsed: unknown = null;

    if (rawText) {
      try {
        parsed = JSON.parse(rawText) as unknown;
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      throw new RouteError(502, options.errorMessage, {
        code: options.errorCode,
        providerStatus: response.status,
        providerError: extractProviderError(parsed),
      });
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new RouteError(502, options.errorMessage, {
        code: options.errorCode,
        reason: 'invalid-json',
      });
    }

    return parsed as T;
  } catch (error) {
    if (error instanceof RouteError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new RouteError(504, options.errorMessage, {
        code: `${options.errorCode}_TIMEOUT`,
      });
    }

    throw new RouteError(502, options.errorMessage, {
      code: options.errorCode,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function extractProviderError(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const record = parsed as {
    error?: string | { message?: string };
    error_description?: string;
  };

  if (typeof record.error_description === 'string' && record.error_description.trim()) {
    return record.error_description.trim();
  }

  if (typeof record.error === 'string' && record.error.trim()) {
    return record.error.trim();
  }

  if (record.error && typeof record.error === 'object' && typeof record.error.message === 'string') {
    return record.error.message.trim();
  }

  return null;
}