import 'server-only';

import { doc, getDoc } from 'firebase/firestore';
import type { FirebaseAuthError } from 'firebase-admin/auth';
import { getClientDb } from '@/lib/firebase';
import { getFirebaseAdminAuth } from '@/lib/server/firebaseAdmin';
import { RouteError } from '@/lib/server/routeError';

export { RouteError, toRouteErrorResponse, jsonErrorResponse } from '@/lib/server/routeError';

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
    if (isFirebaseAuthVerificationError(error)) {
      return null;
    }

    throw error;
  }
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

function isFirebaseAuthVerificationError(error: unknown): error is FirebaseAuthError {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === 'FirebaseAuthError'
    && typeof (error as { code?: unknown }).code === 'string'
    && String((error as { code?: string }).code).startsWith('auth/');
}
