import 'server-only';

import { doc, getDoc } from 'firebase/firestore';
import { getClientDb } from '@/lib/firebase';
import { RouteError } from '@/lib/server/routeError';
import {
  readResponseTextWithinLimit,
  safeRemoteFetch,
} from '@/lib/server/safeRemoteFetch';

interface AccountsLookupResponse {
  users?: Array<{ localId?: string }>;
}

const FIREBASE_ACCOUNTS_LOOKUP_TIMEOUT_MS = 5_000;
const FIREBASE_ACCOUNTS_LOOKUP_MAX_RESPONSE_BYTES = 256_000;

export { RouteError, toRouteErrorResponse, jsonErrorResponse } from '@/lib/server/routeError';

export async function resolveUidFromBearerToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization') ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const idToken = match[1]?.trim();
  if (!idToken) return null;

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new RouteError(500, 'Missing NEXT_PUBLIC_FIREBASE_API_KEY');
  }

  const response = await safeRemoteFetch({
    url: `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
    cache: 'no-store',
    timeoutMs: FIREBASE_ACCOUNTS_LOOKUP_TIMEOUT_MS,
  });

  if (!response.ok) return null;

  const rawText = await readResponseTextWithinLimit(response, FIREBASE_ACCOUNTS_LOOKUP_MAX_RESPONSE_BYTES);
  const data = (rawText ? JSON.parse(rawText) : {}) as AccountsLookupResponse;
  return data.users?.[0]?.localId ?? null;
}

export async function requireAuthenticatedUid(req: Request): Promise<string> {
  const uid = await resolveUidFromBearerToken(req);
  if (!uid) {
    throw new RouteError(401, 'Unauthorized', {
      code: 'AUTH_UNAUTHORIZED',
    });
  }
  return uid;
}

export async function assertProjectOwnedByUser(uid: string, projectId: string): Promise<void> {
  const db = getClientDb();
  const projectSnap = await getDoc(doc(db, 'projects', projectId));

  if (!projectSnap.exists()) {
    throw new RouteError(403, 'Forbidden');
  }

  const project = projectSnap.data() as { uid?: string };
  if (project.uid !== uid) {
    throw new RouteError(403, 'Forbidden');
  }
}
