import 'server-only';

/**
 * Lightweight Firestore REST client for Cloudflare Workers.
 *
 * Replaces firebase-admin/firestore which uses protobufjs (requires eval()).
 * Uses Google Cloud Firestore REST API v1 with service account JWT auth.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface FirestoreRestConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

let _config: FirestoreRestConfig | null = null;

function getConfig(): FirestoreRestConfig {
  if (_config) return _config;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.trim();

  if (!projectId || !clientEmail || !rawKey) {
    const missing = [
      !projectId && 'FIREBASE_ADMIN_PROJECT_ID',
      !clientEmail && 'FIREBASE_ADMIN_CLIENT_EMAIL',
      !rawKey && 'FIREBASE_ADMIN_PRIVATE_KEY',
    ].filter(Boolean);
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }

  const privateKey = (rawKey.startsWith('"') && rawKey.endsWith('"') ? rawKey.slice(1, -1) : rawKey)
    .replace(/\\n/g, '\n');

  _config = { projectId, clientEmail, privateKey };
  return _config;
}

function getBasePath(): string {
  const { projectId } = getConfig();
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

// ---------------------------------------------------------------------------
// JWT / Access Token
// ---------------------------------------------------------------------------

let _cachedToken: { token: string; expiresAt: number } | null = null;

function base64url(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function getAccessToken(): Promise<string> {
  if (_cachedToken && _cachedToken.expiresAt > Date.now() + 60_000) {
    return _cachedToken.token;
  }

  const config = getConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: config.clientEmail,
    sub: config.clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform',
  }));

  const signingInput = `${header}.${payload}`;
  const key = await importPrivateKey(config.privateKey);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${base64url(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get access token: ${response.status} ${text}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  _cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return _cachedToken.token;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Firestore value encoding / decoding
// ---------------------------------------------------------------------------

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { mapValue: { fields: Record<string, FirestoreValue> } }
  | { arrayValue: { values?: FirestoreValue[] } };

function encode(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value) && Math.abs(value) < Number.MAX_SAFE_INTEGER) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encode) } };
  }
  if (typeof value === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = encode(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function decode(fv: FirestoreValue): unknown {
  if ('nullValue' in fv) return null;
  if ('booleanValue' in fv) return fv.booleanValue;
  if ('integerValue' in fv) return Number(fv.integerValue);
  if ('doubleValue' in fv) return fv.doubleValue;
  if ('stringValue' in fv) return fv.stringValue;
  if ('arrayValue' in fv) {
    return (fv.arrayValue.values ?? []).map(decode);
  }
  if ('mapValue' in fv) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fv.mapValue.fields ?? {})) {
      result[k] = decode(v);
    }
    return result;
  }
  return null;
}

function encodeFields(data: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      fields[k] = encode(v);
    }
  }
  return fields;
}

function decodeDocument(doc: { name: string; fields?: Record<string, FirestoreValue> }): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) {
    result[k] = decode(v);
  }
  return result;
}

function extractDocId(name: string): string {
  const parts = name.split('/');
  return parts[parts.length - 1];
}

// ---------------------------------------------------------------------------
// Public API — drop-in replacements for firebase-admin patterns
// ---------------------------------------------------------------------------

export interface FirestoreDoc {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface FirestoreQueryResult {
  docs: FirestoreDoc[];
  empty: boolean;
}

// --- GET document ---

export async function getDocument(collectionPath: string, docId: string): Promise<FirestoreDoc> {
  const url = `${getBasePath()}/${collectionPath}/${docId}`;
  const headers = await authHeaders();
  const response = await fetch(url, { headers });

  if (response.status === 404) {
    return { id: docId, exists: false, data: () => undefined };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore GET ${collectionPath}/${docId} failed: ${response.status} ${text}`);
  }

  const doc = await response.json() as { name: string; fields?: Record<string, FirestoreValue> };
  const decoded = decodeDocument(doc);
  return { id: extractDocId(doc.name), exists: true, data: () => decoded };
}

// --- SET document (create or overwrite) ---

export async function setDocument(
  collectionPath: string,
  docId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const url = `${getBasePath()}/${collectionPath}/${docId}`;
  const headers = await authHeaders();
  const response = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: encodeFields(data) }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore SET ${collectionPath}/${docId} failed: ${response.status} ${text}`);
  }
}

// --- UPDATE document (partial) ---

export async function updateDocument(
  collectionPath: string,
  docId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const fieldPaths = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const url = `${getBasePath()}/${collectionPath}/${docId}?${fieldPaths}`;
  const headers = await authHeaders();
  const response = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: encodeFields(data) }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore UPDATE ${collectionPath}/${docId} failed: ${response.status} ${text}`);
  }
}

// --- DELETE document ---

export async function deleteDocument(collectionPath: string, docId: string): Promise<void> {
  const url = `${getBasePath()}/${collectionPath}/${docId}`;
  const headers = await authHeaders();
  const response = await fetch(url, { method: 'DELETE', headers });

  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Firestore DELETE ${collectionPath}/${docId} failed: ${response.status} ${text}`);
  }
}

// --- CREATE document (auto-ID) ---

export async function createDocument(
  collectionPath: string,
  data: Record<string, unknown>,
): Promise<string> {
  const url = `${getBasePath()}/${collectionPath}`;
  const headers = await authHeaders();
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fields: encodeFields(data) }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore CREATE ${collectionPath} failed: ${response.status} ${text}`);
  }

  const doc = await response.json() as { name: string };
  return extractDocId(doc.name);
}

// --- QUERY (where + optional orderBy) ---

interface QueryFilter {
  field: string;
  op: 'EQUAL';
  value: unknown;
}

export async function queryCollection(
  collectionPath: string,
  filters: QueryFilter[],
  limitCount?: number,
): Promise<FirestoreQueryResult> {
  const { projectId } = getConfig();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const headers = await authHeaders();

  const collectionId = collectionPath.split('/').pop()!;
  const parent = collectionPath.includes('/')
    ? `projects/${projectId}/databases/(default)/documents/${collectionPath.split('/').slice(0, -1).join('/')}`
    : `projects/${projectId}/databases/(default)/documents`;

  const where = filters.length === 1
    ? {
        fieldFilter: {
          field: { fieldPath: filters[0].field },
          op: filters[0].op,
          value: encode(filters[0].value),
        },
      }
    : filters.length > 1
      ? {
          compositeFilter: {
            op: 'AND',
            filters: filters.map((f) => ({
              fieldFilter: {
                field: { fieldPath: f.field },
                op: f.op,
                value: encode(f.value),
              },
            })),
          },
        }
      : undefined;

  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId }],
  };
  if (where) structuredQuery.where = where;
  if (limitCount) structuredQuery.limit = limitCount;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ structuredQuery, parent }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore QUERY ${collectionPath} failed: ${response.status} ${text}`);
  }

  const results = await response.json() as Array<{ document?: { name: string; fields?: Record<string, FirestoreValue> } }>;

  const docs: FirestoreDoc[] = [];
  for (const result of results) {
    if (!result.document) continue;
    const decoded = decodeDocument(result.document);
    const id = extractDocId(result.document.name);
    docs.push({ id, exists: true, data: () => decoded });
  }

  return { docs, empty: docs.length === 0 };
}

// --- BATCH WRITE (set + delete, max 500 per call) ---

interface BatchSetOp {
  kind: 'set';
  collection: string;
  docId: string;
  data: Record<string, unknown>;
}

interface BatchDeleteOp {
  kind: 'delete';
  collection: string;
  docId: string;
}

type BatchOp = BatchSetOp | BatchDeleteOp;

const MAX_BATCH_SIZE = 400;

export async function batchWrite(operations: BatchOp[]): Promise<void> {
  if (operations.length === 0) return;

  const { projectId } = getConfig();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  const headers = await authHeaders();
  const dbPath = `projects/${projectId}/databases/(default)/documents`;

  for (let i = 0; i < operations.length; i += MAX_BATCH_SIZE) {
    const chunk = operations.slice(i, i + MAX_BATCH_SIZE);
    const writes = chunk.map((op) => {
      if (op.kind === 'delete') {
        return { delete: `${dbPath}/${op.collection}/${op.docId}` };
      }
      return {
        update: {
          name: `${dbPath}/${op.collection}/${op.docId}`,
          fields: encodeFields(op.data),
        },
      };
    });

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ writes }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Firestore BATCH COMMIT failed: ${response.status} ${text}`);
    }
  }
}

// --- TRANSACTION (read-then-delete for OAuth state) ---

export async function runTransaction<T>(
  readPath: { collection: string; docId: string },
  callback: (doc: FirestoreDoc) => { deletes: Array<{ collection: string; docId: string }> },
): Promise<{ doc: FirestoreDoc }> {
  const { projectId } = getConfig();
  const headers = await authHeaders();
  const dbPath = `projects/${projectId}/databases/(default)/documents`;
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`;

  // Begin transaction
  const beginRes = await fetch(`${baseUrl}/documents:beginTransaction`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  if (!beginRes.ok) {
    const text = await beginRes.text();
    throw new Error(`Firestore BEGIN_TRANSACTION failed: ${beginRes.status} ${text}`);
  }

  const { transaction } = await beginRes.json() as { transaction: string };

  // Read document within transaction
  const docUrl = `${dbPath}/${readPath.collection}/${readPath.docId}?transaction=${encodeURIComponent(transaction)}`;
  const getRes = await fetch(docUrl, { headers });

  let firestoreDoc: FirestoreDoc;
  if (getRes.status === 404) {
    firestoreDoc = { id: readPath.docId, exists: false, data: () => undefined };
  } else if (getRes.ok) {
    const rawDoc = await getRes.json() as { name: string; fields?: Record<string, FirestoreValue> };
    if (!rawDoc.fields) {
      firestoreDoc = { id: readPath.docId, exists: false, data: () => undefined };
    } else {
      const decoded = decodeDocument(rawDoc);
      firestoreDoc = { id: extractDocId(rawDoc.name), exists: true, data: () => decoded };
    }
  } else {
    const text = await getRes.text();
    throw new Error(`Firestore TX GET failed: ${getRes.status} ${text}`);
  }

  const { deletes } = callback(firestoreDoc);

  // Commit transaction with deletes
  const writes = deletes.map((d) => ({
    delete: `${dbPath}/${d.collection}/${d.docId}`,
  }));

  const commitRes = await fetch(`${baseUrl}/documents:commit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ transaction, writes }),
  });

  if (!commitRes.ok) {
    const text = await commitRes.text();
    throw new Error(`Firestore TX COMMIT failed: ${commitRes.status} ${text}`);
  }

  return { doc: firestoreDoc };
}

// --- QUERY ALL (no filters, just list all docs in a collection) ---

export async function listCollection(
  collectionPath: string,
): Promise<FirestoreQueryResult> {
  const url = `${getBasePath()}/${collectionPath}`;
  const headers = await authHeaders();
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore LIST ${collectionPath} failed: ${response.status} ${text}`);
  }

  const data = await response.json() as { documents?: Array<{ name: string; fields?: Record<string, FirestoreValue> }> };
  const docs: FirestoreDoc[] = (data.documents ?? []).map((doc) => {
    const decoded = decodeDocument(doc);
    return { id: extractDocId(doc.name), exists: true, data: () => decoded };
  });

  return { docs, empty: docs.length === 0 };
}
