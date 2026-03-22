import 'server-only';

/**
 * Firebase ID Token verifier for Cloudflare Workers.
 *
 * Replaces firebase-admin/auth verifyIdToken() which requires Node.js runtime.
 * Uses Google's public JWKS endpoint + Web Crypto API (works in Workers).
 */

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const FIREBASE_ISSUER_PREFIX = 'https://securetoken.google.com/';

interface JwkKey {
  kid: string;
  kty: string;
  alg: string;
  n: string;
  e: string;
  use?: string;
}

interface JwksResponse {
  keys: JwkKey[];
}

interface FirebaseIdTokenPayload {
  uid: string;
  iss: string;
  aud: string;
  auth_time: number;
  sub: string;
  iat: number;
  exp: number;
  email?: string;
  email_verified?: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// JWKS cache (keys rotate ~daily, cache for 1 hour)
// ---------------------------------------------------------------------------

let _jwksCache: { keys: JwkKey[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getJwks(): Promise<JwkKey[]> {
  if (_jwksCache && Date.now() - _jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return _jwksCache.keys;
  }

  const response = await fetch(GOOGLE_JWKS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Google JWKS: ${response.status}`);
  }

  const data = (await response.json()) as JwksResponse;
  _jwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

// ---------------------------------------------------------------------------
// Base64url decode
// ---------------------------------------------------------------------------

function base64urlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const paddedFull = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(paddedFull);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Import JWK as CryptoKey
// ---------------------------------------------------------------------------

async function importJwkKey(jwk: JwkKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: 'RS256',
      ext: true,
    },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class FirebaseAuthError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'FirebaseAuthError';
    this.code = code;
  }
}

/**
 * Verify a Firebase ID token and return the decoded payload.
 * Drop-in replacement for firebase-admin's auth().verifyIdToken().
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string }> {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error('Missing FIREBASE_ADMIN_PROJECT_ID for token verification');
  }

  // Split JWT
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new FirebaseAuthError('auth/invalid-id-token', 'ID token is not a valid JWT.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Decode header
  let header: { alg?: string; kid?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(base64urlDecode(headerB64)));
  } catch {
    throw new FirebaseAuthError('auth/invalid-id-token', 'Failed to decode token header.');
  }

  if (header.alg !== 'RS256') {
    throw new FirebaseAuthError('auth/invalid-id-token', `Unexpected algorithm: ${header.alg}`);
  }

  if (!header.kid) {
    throw new FirebaseAuthError('auth/invalid-id-token', 'Token header missing kid.');
  }

  // Decode payload
  let payload: FirebaseIdTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
  } catch {
    throw new FirebaseAuthError('auth/invalid-id-token', 'Failed to decode token payload.');
  }

  // Validate claims before signature (fast-fail)
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp <= now) {
    throw new FirebaseAuthError('auth/id-token-expired', 'Firebase ID token has expired.');
  }

  if (payload.iat > now + 300) {
    throw new FirebaseAuthError('auth/invalid-id-token', 'Token iat is in the future.');
  }

  const expectedIssuer = `${FIREBASE_ISSUER_PREFIX}${projectId}`;
  if (payload.iss !== expectedIssuer) {
    throw new FirebaseAuthError('auth/invalid-id-token', `Invalid issuer. Expected ${expectedIssuer}, got ${payload.iss}`);
  }

  if (payload.aud !== projectId) {
    throw new FirebaseAuthError('auth/invalid-id-token', `Invalid audience. Expected ${projectId}, got ${payload.aud}`);
  }

  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new FirebaseAuthError('auth/invalid-id-token', 'Token missing sub claim.');
  }

  // Get signing key
  let keys = await getJwks();
  let jwk = keys.find((k) => k.kid === header.kid);

  // If key not found, force refresh (key may have just rotated)
  if (!jwk) {
    _jwksCache = null;
    keys = await getJwks();
    jwk = keys.find((k) => k.kid === header.kid);
  }

  if (!jwk) {
    throw new FirebaseAuthError('auth/invalid-id-token', `No matching key found for kid: ${header.kid}`);
  }

  // Verify signature
  const cryptoKey = await importJwkKey(jwk);
  const signatureBytes = base64urlDecode(signatureB64);
  const dataBytes = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signatureBytes.buffer as ArrayBuffer, dataBytes);

  if (!valid) {
    throw new FirebaseAuthError('auth/invalid-id-token', 'Token signature verification failed.');
  }

  return { uid: payload.sub };
}
