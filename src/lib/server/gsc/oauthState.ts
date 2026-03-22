import 'server-only';

import { randomBytes } from 'crypto';
import {
  getDocument,
  setDocument,
  deleteDocument,
} from '@/lib/server/firestoreRest';
import { RouteError } from '@/lib/server/routeError';
import {
  DEFAULT_SEARCH_CONSOLE_RETURN_TO,
  SEARCH_CONSOLE_OAUTH_STATES_COLLECTION,
  SEARCH_CONSOLE_STATE_MAX_AGE_MS,
  type SearchConsoleOAuthStateRecord,
  type SearchConsoleStoredOAuthState,
} from '@/lib/server/gsc/types';

export function normalizeSearchConsoleReturnTo(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return DEFAULT_SEARCH_CONSOLE_RETURN_TO;
  }

  if (trimmed.startsWith('/dashboard') || trimmed.startsWith('/onboarding')) {
    return trimmed;
  }

  return DEFAULT_SEARCH_CONSOLE_RETURN_TO;
}

export async function createSearchConsoleOAuthState(args: {
  uid: string;
  projectId: string;
  returnTo?: string;
}): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const record: SearchConsoleOAuthStateRecord = {
    uid: args.uid,
    projectId: args.projectId,
    returnTo: normalizeSearchConsoleReturnTo(args.returnTo),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SEARCH_CONSOLE_STATE_MAX_AGE_MS).toISOString(),
  };

  await setDocument(
    SEARCH_CONSOLE_OAUTH_STATES_COLLECTION,
    token,
    record as unknown as Record<string, unknown>,
  );
  console.log('[GSC OAuthState] Utworzono state token dla projectId=%s, returnTo=%s, wygasa=%s',
    args.projectId, record.returnTo, record.expiresAt);
  return token;
}

export async function consumeSearchConsoleOAuthState(token: string): Promise<SearchConsoleStoredOAuthState> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new RouteError(400, 'Invalid Search Console OAuth state.', {
      code: 'SEARCH_CONSOLE_STATE_INVALID',
      reason: 'missing-state',
    });
  }

  // Read-then-delete (no transaction needed — single consumer pattern)
  const snapshot = await getDocument(SEARCH_CONSOLE_OAUTH_STATES_COLLECTION, normalizedToken);

  // Delete immediately regardless of validity
  await deleteDocument(SEARCH_CONSOLE_OAUTH_STATES_COLLECTION, normalizedToken);

  if (!snapshot.exists) {
    console.warn('[GSC OAuthState] State token nie znaleziony w Firestore (moze wygasl lub zuzyt podwojnie).');
    throw new RouteError(400, 'Invalid Search Console OAuth state.', {
      code: 'SEARCH_CONSOLE_STATE_INVALID',
      reason: 'unknown-state',
    });
  }

  const data = snapshot.data() as Partial<SearchConsoleOAuthStateRecord> | undefined;
  if (
    !data
    || typeof data.uid !== 'string'
    || typeof data.projectId !== 'string'
    || typeof data.returnTo !== 'string'
    || typeof data.createdAt !== 'string'
    || typeof data.expiresAt !== 'string'
  ) {
    throw new RouteError(400, 'Invalid Search Console OAuth state.', {
      code: 'SEARCH_CONSOLE_STATE_INVALID',
      reason: 'malformed-state',
    });
  }

  const expiresAt = Date.parse(data.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    console.warn('[GSC OAuthState] State wygasl. expiresAt=%s, now=%s', data.expiresAt, new Date().toISOString());
    throw new RouteError(400, 'Search Console OAuth state expired.', {
      code: 'SEARCH_CONSOLE_STATE_INVALID',
      reason: 'expired-state',
    });
  }

  return {
    token: normalizedToken,
    uid: data.uid,
    projectId: data.projectId,
    returnTo: normalizeSearchConsoleReturnTo(data.returnTo),
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
  };
}
