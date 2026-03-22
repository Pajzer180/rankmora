import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/server/firebaseAdmin';

export function getFirestoreAdmin() {
  return getFirebaseAdminDb();
}

export { FieldValue };
