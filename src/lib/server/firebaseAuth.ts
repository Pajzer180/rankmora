import 'server-only';

import { doc, getDoc } from 'firebase/firestore';
import type { FirebaseAuthError } from 'firebase-admin/auth';
import { getClientDb } from '@/lib/firebase';
import { getFirebaseAdminAuth } from '@/lib/server/firebaseAdmin';
import { RouteError } from '@/lib/server/routeError';

export { RouteError, toRouteErrorResponse, jsonErrorResponse } from '@/lib/server/routeError';

const INVALID_BEARER_TOKEN_MESSAGE = 'Sesja Bress wygasla albo token jest nieprawidlowy. Zaloguj sie ponownie.';
const MISSING_BEARER_TOKEN_MESSAGE = 'Request nie zawiera aktywnej sesji Bress. Zaloguj sie ponownie.';

export async function resolveUidFromBearerToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization') ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const idToken = match[1]?.trim();
  if (!idToken) return null;

  try {
    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);
    return decodedToken.uid ?? null;
  } catch (error) {
    const firebaseCode = getFirebaseAuthErrorCode(error);
    if (firebaseCode && isInvalidUserTokenErrorCode(firebaseCode)) {
      throw new RouteError(401, INVALID_BEARER_TOKEN_MESSAGE, {
        code: 'AUTH_INVALID_ID_TOKEN',
        firebaseCode,
      });
    }

    throw error;
  }
}

export async function requireAuthenticatedUid(req: Request): Promise<string> {
  const uid = await resolveUidFromBearerToken(req);
  if (!uid) {
    throw new RouteError(401, MISSING_BEARER_TOKEN_MESSAGE, {
      code: 'AUTH_MISSING_BEARER_TOKEN',
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

function getFirebaseAuthErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }

  if (error.name !== 'FirebaseAuthError') {
    return null;
  }

  const code = (error as FirebaseAuthError).code;
  return typeof code === 'string' && code.startsWith('auth/')
    ? code
    : null;
}

function isInvalidUserTokenErrorCode(code: string): boolean {
  return code === 'auth/id-token-expired'
    || code === 'auth/id-token-revoked'
    || code === 'auth/invalid-id-token'
    || code === 'auth/argument-error'
    || code === 'auth/user-disabled'
    || code === 'auth/user-not-found';
}
