import 'server-only';

import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Server-only Firebase Admin bootstrap for Node runtimes.
 *
 * Credentials come from env vars so deployments can inject secrets directly
 * without committing service-account JSON files to the repo. Server-side auth
 * verification now uses this module, while server-side Firestore callers can
 * migrate to Admin incrementally in later steps.
 */
interface FirebaseAdminConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

type FirebaseAdminEnvName =
  | 'FIREBASE_ADMIN_PROJECT_ID'
  | 'FIREBASE_ADMIN_CLIENT_EMAIL'
  | 'FIREBASE_ADMIN_PRIVATE_KEY';

function readRequiredEnv(name: FirebaseAdminEnvName): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function normalizePrivateKey(rawPrivateKey: string): string {
  const withoutWrappingQuotes = rawPrivateKey.startsWith('"') && rawPrivateKey.endsWith('"')
    ? rawPrivateKey.slice(1, -1)
    : rawPrivateKey;

  return withoutWrappingQuotes.replace(/\\n/g, '\n');
}

function getFirebaseAdminConfig(): FirebaseAdminConfig {
  return {
    projectId: readRequiredEnv('FIREBASE_ADMIN_PROJECT_ID'),
    clientEmail: readRequiredEnv('FIREBASE_ADMIN_CLIENT_EMAIL'),
    privateKey: normalizePrivateKey(readRequiredEnv('FIREBASE_ADMIN_PRIVATE_KEY')),
  };
}

function toServiceAccount(config: FirebaseAdminConfig): ServiceAccount {
  return {
    projectId: config.projectId,
    clientEmail: config.clientEmail,
    privateKey: config.privateKey,
  };
}

export function getFirebaseAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const config = getFirebaseAdminConfig();

  return initializeApp({
    credential: cert(toServiceAccount(config)),
    projectId: config.projectId,
  });
}

export function getFirebaseAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminDb(): Firestore {
  return getFirestore(getFirebaseAdminApp());
}
