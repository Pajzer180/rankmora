import 'server-only';

import dns from 'node:dns/promises';
import net from 'node:net';
import { RouteError } from '@/lib/server/routeError';

const BLOCKED_HOSTNAMES = new Set([
  'gateway.docker.internal',
  'host.docker.internal',
  'ip6-localhost',
  'kubernetes',
  'kubernetes.default',
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  '.cluster.local',
  '.corp',
  '.home',
  '.internal',
  '.intranet',
  '.lan',
  '.local',
  '.localdomain',
  '.localhost',
  '.svc',
];

const SENSITIVE_REDIRECT_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
]);

const BLOCKED_OR_INVALID_URL_MESSAGE = 'Blocked or invalid remote URL.';
const REMOTE_FETCH_FAILED_MESSAGE = 'Remote fetch failed.';
const REMOTE_FETCH_TIMEOUT_MESSAGE = 'Remote request timed out.';
const REMOTE_FETCH_TOO_LARGE_MESSAGE = 'Remote response exceeded size limit.';
const TIMEOUT_ABORT_REASON = 'remote-fetch-timeout';

type RemoteUrlErrorCode =
  | 'REMOTE_FETCH_FAILED'
  | 'REMOTE_FETCH_TIMEOUT'
  | 'REMOTE_FETCH_TOO_LARGE'
  | 'REMOTE_URL_BLOCKED'
  | 'REMOTE_URL_INVALID'
  | 'REMOTE_URL_REDIRECT_BLOCKED'
  | 'REMOTE_URL_TOO_MANY_REDIRECTS';

interface NormalizeRemoteHttpUrlOptions {
  defaultProtocol?: 'http:' | 'https:';
}

export interface SafeRemoteFetchOptions extends Omit<RequestInit, 'redirect' | 'signal'> {
  timeoutMs: number;
  url: string | URL;
  maxRedirects?: number;
  signal?: AbortSignal;
}

export const DEFAULT_REMOTE_MAX_REDIRECTS = 3;

export function normalizeRemoteHttpUrl(
  input: string | URL,
  options: NormalizeRemoteHttpUrlOptions = {},
): URL {
  const raw = typeof input === 'string' ? input.trim() : input.toString();
  if (!raw) {
    throw invalidUrlError('REMOTE_URL_INVALID', 'empty-url');
  }

  const hasExplicitProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  const candidate = !hasExplicitProtocol && options.defaultProtocol
    ? `${options.defaultProtocol}//${raw}`
    : raw;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw invalidUrlError('REMOTE_URL_INVALID', 'malformed-url');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw invalidUrlError('REMOTE_URL_INVALID', 'protocol-not-allowed');
  }

  if (!url.hostname) {
    throw invalidUrlError('REMOTE_URL_INVALID', 'missing-hostname');
  }

  return url;
}

export async function assertSafeRemoteUrl(input: string | URL): Promise<URL> {
  const url = normalizeRemoteHttpUrl(input);
  const hostname = normalizeHostname(url.hostname);

  if (!hostname) {
    throw invalidUrlError('REMOTE_URL_INVALID', 'missing-hostname');
  }

  const blockedHostnameReason = classifyBlockedHostname(hostname);
  if (blockedHostnameReason) {
    throw invalidUrlError('REMOTE_URL_BLOCKED', blockedHostnameReason);
  }

  const ipVersion = net.isIP(hostname);
  if (ipVersion !== 0) {
    const blockedIpReason = classifyIpAddress(hostname);
    if (blockedIpReason) {
      throw invalidUrlError('REMOTE_URL_BLOCKED', blockedIpReason);
    }

    return url;
  }

  let resolvedAddresses: Array<{ address: string; family: number }>;
  try {
    resolvedAddresses = await dns.lookup(hostname, {
      all: true,
      family: 0,
      verbatim: true,
    });
  } catch {
    throw invalidUrlError('REMOTE_URL_INVALID', 'dns-unresolved');
  }

  if (!resolvedAddresses.length) {
    throw invalidUrlError('REMOTE_URL_INVALID', 'dns-unresolved');
  }

  for (const entry of resolvedAddresses) {
    const blockedIpReason = classifyIpAddress(entry.address);
    if (blockedIpReason) {
      throw invalidUrlError('REMOTE_URL_BLOCKED', blockedIpReason);
    }
  }

  return url;
}

export async function safeRemoteFetch(options: SafeRemoteFetchOptions): Promise<Response> {
  const {
    url,
    timeoutMs,
    maxRedirects = DEFAULT_REMOTE_MAX_REDIRECTS,
    method,
    headers,
    body,
    signal,
    ...init
  } = options;

  const startedAt = Date.now();
  let currentUrl = await assertSafeRemoteUrl(url);
  let currentMethod = method?.toUpperCase() ?? 'GET';
  let currentBody = body;
  let currentHeaders = new Headers(headers);

  for (let redirectCount = 0; ; redirectCount += 1) {
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      throw timeoutError();
    }

    const response = await fetchWithTimeout(
      currentUrl,
      {
        ...init,
        body: currentBody,
        headers: currentHeaders,
        method: currentMethod,
        redirect: 'manual',
        signal,
      },
      remainingMs,
    );

    if (!isRedirectResponse(response.status)) {
      return response;
    }

    if (redirectCount >= maxRedirects) {
      throw invalidUrlError('REMOTE_URL_TOO_MANY_REDIRECTS', 'too-many-redirects');
    }

    const location = response.headers.get('location');
    if (!location) {
      throw fetchFailedError();
    }

    const nextUrl = new URL(location, currentUrl);

    let validatedNextUrl: URL;

    try {
      validatedNextUrl = await assertSafeRemoteUrl(nextUrl);
    } catch (error) {
      if (error instanceof RouteError) {
        const reason = extractRouteErrorReason(error);
        throw invalidUrlError('REMOTE_URL_REDIRECT_BLOCKED', reason ?? 'redirect-target-blocked');
      }

      throw error;
    }

    if (isCrossOriginRedirect(currentUrl, validatedNextUrl) && hasSensitiveHeaders(currentHeaders)) {
      throw invalidUrlError('REMOTE_URL_REDIRECT_BLOCKED', 'cross-origin-sensitive-headers');
    }

    currentUrl = validatedNextUrl;

    if (
      response.status === 303
      || ((response.status === 301 || response.status === 302) && currentMethod === 'POST')
    ) {
      currentMethod = 'GET';
      currentBody = undefined;
      currentHeaders = new Headers(currentHeaders);
      currentHeaders.delete('content-length');
      currentHeaders.delete('content-type');
    }
  }
}

export async function readResponseTextWithinLimit(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      throw tooLargeError(maxBytes);
    }
  }

  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw tooLargeError(maxBytes);
      }

      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof RouteError) {
      throw error;
    }

    throw fetchFailedError();
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes).toString('utf8');
}

function invalidUrlError(code: RemoteUrlErrorCode, reason: string): RouteError {
  return new RouteError(400, BLOCKED_OR_INVALID_URL_MESSAGE, {
    code,
    reason,
  });
}

function fetchFailedError(): RouteError {
  return new RouteError(502, REMOTE_FETCH_FAILED_MESSAGE, {
    code: 'REMOTE_FETCH_FAILED',
  });
}

function timeoutError(): RouteError {
  return new RouteError(504, REMOTE_FETCH_TIMEOUT_MESSAGE, {
    code: 'REMOTE_FETCH_TIMEOUT',
  });
}

function tooLargeError(maxBytes: number): RouteError {
  return new RouteError(413, REMOTE_FETCH_TOO_LARGE_MESSAGE, {
    code: 'REMOTE_FETCH_TOO_LARGE',
    maxBytes,
  });
}

function extractRouteErrorReason(error: RouteError): string | null {
  if (!error.details || typeof error.details !== 'object') {
    return null;
  }

  const details = error.details as { reason?: unknown };
  return typeof details.reason === 'string' ? details.reason : null;
}

function normalizeHostname(hostname: string): string {
  const withoutBrackets = hostname.replace(/^\[/, '').replace(/\]$/, '');
  return withoutBrackets.replace(/\.$/, '').toLowerCase();
}

function classifyBlockedHostname(hostname: string): string | null {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return 'localhost';
  }

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return 'internal-hostname';
  }

  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return 'internal-hostname';
  }

  if (!hostname.includes('.') && net.isIP(hostname) === 0) {
    return 'single-label-hostname';
  }

  return null;
}

function classifyIpAddress(address: string): string | null {
  const normalized = normalizeHostname(address);
  const ipVersion = net.isIP(normalized);

  if (ipVersion === 4) {
    return classifyIpv4Address(normalized);
  }

  if (ipVersion === 6) {
    return classifyIpv6Address(normalized);
  }

  return 'invalid-ip';
}

function classifyIpv4Address(address: string): string | null {
  const octets = parseIpv4Octets(address);
  if (!octets) {
    return 'invalid-ip';
  }

  const [a, b] = octets;

  if (a === 127) return 'loopback-ip';
  if (a === 10) return 'private-ipv4';
  if (a === 172 && b >= 16 && b <= 31) return 'private-ipv4';
  if (a === 192 && b === 168) return 'private-ipv4';
  if (a === 169 && b === 254) return 'link-local-ip';
  if (a === 0) return 'unspecified-ip';
  if (a === 100 && b >= 64 && b <= 127) return 'special-ip';
  if (a === 198 && (b === 18 || b === 19)) return 'special-ip';
  if (a >= 224) return 'special-ip';

  return null;
}

function classifyIpv6Address(address: string): string | null {
  const bytes = parseIpv6Bytes(address);
  if (!bytes) {
    return 'invalid-ip';
  }

  if (bytes.every((byte) => byte === 0)) {
    return 'unspecified-ip';
  }

  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) {
    return 'loopback-ip';
  }

  const embeddedIpv4 = extractEmbeddedIpv4(bytes);
  if (embeddedIpv4) {
    return classifyIpv4Address(embeddedIpv4);
  }

  if ((bytes[0] & 0xfe) === 0xfc) {
    return 'private-ipv6';
  }

  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) {
    return 'link-local-ip';
  }

  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0xc0) {
    return 'private-ipv6';
  }

  if (bytes[0] === 0xff) {
    return 'special-ip';
  }

  return null;
}

function parseIpv4Octets(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet, index) => String(octet) !== parts[index] || octet < 0 || octet > 255)) {
    return null;
  }

  return octets;
}

function parseIpv6Bytes(address: string): Uint8Array | null {
  const zoneLess = address.split('%')[0]?.toLowerCase();
  if (!zoneLess) {
    return null;
  }

  let normalized = zoneLess;
  if (normalized.includes('.')) {
    const lastColonIndex = normalized.lastIndexOf(':');
    if (lastColonIndex === -1) {
      return null;
    }

    const ipv4Hextets = ipv4TailToHextets(normalized.slice(lastColonIndex + 1));
    if (!ipv4Hextets) {
      return null;
    }

    normalized = `${normalized.slice(0, lastColonIndex)}:${ipv4Hextets}`;
  }

  const parts = normalized.split('::');
  if (parts.length > 2) {
    return null;
  }

  const left = parts[0] ? parts[0].split(':').filter(Boolean) : [];
  const right = parts.length === 2 && parts[1] ? parts[1].split(':').filter(Boolean) : [];
  const missingSegments = 8 - (left.length + right.length);

  if (missingSegments < 0 || (parts.length === 1 && missingSegments !== 0)) {
    return null;
  }

  const hextets = [...left, ...Array(missingSegments).fill('0'), ...right];
  if (hextets.length !== 8) {
    return null;
  }

  const bytes = new Uint8Array(16);

  for (let index = 0; index < hextets.length; index += 1) {
    const value = Number.parseInt(hextets[index], 16);
    if (!Number.isFinite(value) || value < 0 || value > 0xffff) {
      return null;
    }

    bytes[index * 2] = value >> 8;
    bytes[index * 2 + 1] = value & 0xff;
  }

  return bytes;
}

function ipv4TailToHextets(address: string): string | null {
  const octets = parseIpv4Octets(address);
  if (!octets) {
    return null;
  }

  const left = ((octets[0] << 8) | octets[1]).toString(16);
  const right = ((octets[2] << 8) | octets[3]).toString(16);

  return `${left}:${right}`;
}

function extractEmbeddedIpv4(bytes: Uint8Array): string | null {
  const isMappedIpv4 = bytes.slice(0, 10).every((byte) => byte === 0)
    && bytes[10] === 0xff
    && bytes[11] === 0xff;

  const isCompatibleIpv4 = bytes.slice(0, 12).every((byte) => byte === 0);
  if (!isMappedIpv4 && !isCompatibleIpv4) {
    return null;
  }

  return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
}

function hasSensitiveHeaders(headers: Headers): boolean {
  for (const headerName of SENSITIVE_REDIRECT_HEADERS) {
    const value = headers.get(headerName);
    if (value && value.trim().length > 0) {
      return true;
    }
  }

  return false;
}

function isCrossOriginRedirect(fromUrl: URL, toUrl: URL): boolean {
  return fromUrl.origin !== toUrl.origin;
}

function isRedirectResponse(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function fetchWithTimeout(
  url: URL,
  init: RequestInit & { signal?: AbortSignal },
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort(TIMEOUT_ABORT_REASON);
  }, timeoutMs);

  const abortFromParent = () => {
    controller.abort(init.signal?.reason ?? 'remote-fetch-aborted');
  };

  init.signal?.addEventListener('abort', abortFromParent, { once: true });

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted && controller.signal.reason === TIMEOUT_ABORT_REASON) {
      throw timeoutError();
    }

    throw fetchFailedError();
  } finally {
    clearTimeout(timeoutHandle);
    init.signal?.removeEventListener('abort', abortFromParent);
  }
}
