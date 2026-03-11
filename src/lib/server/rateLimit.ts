import 'server-only';

import { NextResponse } from 'next/server';
import { jsonErrorResponse } from '@/lib/server/routeError';

export type RateLimitScope =
  | 'chat'
  | 'generate'
  | 'wordpress-connect'
  | 'wordpress-test'
  | 'wordpress-fetch'
  | 'wordpress-preview'
  | 'wordpress-apply';

interface RateLimitPolicyDefinition {
  bucket: string;
  envPrefix: string;
  defaultMax: number;
  defaultWindowMs: number;
}

interface RateLimitPolicy {
  bucket: string;
  max: number;
  windowMs: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitState {
  entries: Map<string, RateLimitEntry>;
  hitsSinceSweep: number;
}

declare global {
  var __bressRateLimitState: RateLimitState | undefined;
}

const POLICY_DEFINITIONS: Record<RateLimitScope, RateLimitPolicyDefinition> = {
  chat: {
    bucket: 'chat',
    envPrefix: 'RATE_LIMIT_CHAT',
    defaultMax: 20,
    defaultWindowMs: 60_000,
  },
  generate: {
    bucket: 'generate',
    envPrefix: 'RATE_LIMIT_GENERATE',
    defaultMax: 10,
    defaultWindowMs: 60_000,
  },
  'wordpress-connect': {
    bucket: 'wordpress-connect',
    envPrefix: 'RATE_LIMIT_WORDPRESS_CONNECT',
    defaultMax: 10,
    defaultWindowMs: 300_000,
  },
  'wordpress-test': {
    bucket: 'wordpress-test',
    envPrefix: 'RATE_LIMIT_WORDPRESS_TEST',
    defaultMax: 10,
    defaultWindowMs: 300_000,
  },
  'wordpress-fetch': {
    bucket: 'wordpress-fetch',
    envPrefix: 'RATE_LIMIT_WORDPRESS_FETCH',
    defaultMax: 30,
    defaultWindowMs: 60_000,
  },
  'wordpress-preview': {
    bucket: 'wordpress-preview',
    envPrefix: 'RATE_LIMIT_WORDPRESS_PREVIEW',
    defaultMax: 10,
    defaultWindowMs: 60_000,
  },
  'wordpress-apply': {
    bucket: 'wordpress-apply',
    envPrefix: 'RATE_LIMIT_WORDPRESS_APPLY',
    defaultMax: 10,
    defaultWindowMs: 300_000,
  },
};

const rateLimitState = globalThis.__bressRateLimitState ??= {
  entries: new Map<string, RateLimitEntry>(),
  hitsSinceSweep: 0,
};

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}`);
  }

  return parsed;
}

function getPolicy(scope: RateLimitScope): RateLimitPolicy {
  const definition = POLICY_DEFINITIONS[scope];
  return {
    bucket: definition.bucket,
    max: readPositiveInt(`${definition.envPrefix}_MAX`, definition.defaultMax),
    windowMs: readPositiveInt(`${definition.envPrefix}_WINDOW_MS`, definition.defaultWindowMs),
  };
}

function extractClientIp(req: Request): string | null {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp.slice(0, 100);
  }

  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp.slice(0, 100);

  const connectingIp = req.headers.get('cf-connecting-ip')?.trim();
  if (connectingIp) return connectingIp.slice(0, 100);

  return null;
}

function resolveRequesterKey(req: Request, uid?: string | null): string {
  const normalizedUid = uid?.trim();
  if (normalizedUid) {
    return `uid:${normalizedUid}`;
  }

  const ip = extractClientIp(req);
  if (ip) {
    return `ip:${ip}`;
  }

  throw new Error('Unable to resolve rate limit key');
}

function maybeSweepExpiredEntries(now: number): void {
  rateLimitState.hitsSinceSweep += 1;

  if (rateLimitState.hitsSinceSweep < 100 && rateLimitState.entries.size < 5_000) {
    return;
  }

  for (const [key, entry] of rateLimitState.entries.entries()) {
    if (entry.resetAt <= now) {
      rateLimitState.entries.delete(key);
    }
  }

  rateLimitState.hitsSinceSweep = 0;
}

function rateLimitExceededResponse(scope: RateLimitScope, policy: RateLimitPolicy, resetAt: number): NextResponse {
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));

  return jsonErrorResponse(
    'Too Many Requests',
    429,
    {
      code: 'RATE_LIMITED',
      bucket: policy.bucket,
      scope,
      limit: policy.max,
      remaining: 0,
      retryAfterSeconds,
      resetAt: new Date(resetAt).toISOString(),
    },
    {
      'Retry-After': String(retryAfterSeconds),
    },
  );
}

function rateLimitUnavailableResponse(scope: RateLimitScope): NextResponse {
  return jsonErrorResponse(
    'Rate limit unavailable',
    503,
    {
      code: 'RATE_LIMIT_UNAVAILABLE',
      bucket: POLICY_DEFINITIONS[scope].bucket,
      scope,
    },
  );
}

export function enforceRateLimit(
  req: Request,
  options: {
    scope: RateLimitScope;
    uid?: string | null;
  },
): NextResponse | null {
  try {
    const policy = getPolicy(options.scope);
    const requesterKey = resolveRequesterKey(req, options.uid);
    const key = `${policy.bucket}:${requesterKey}`;
    const now = Date.now();

    maybeSweepExpiredEntries(now);

    const existing = rateLimitState.entries.get(key);
    const entry = !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + policy.windowMs }
      : existing;

    if (entry.count >= policy.max) {
      rateLimitState.entries.set(key, entry);
      return rateLimitExceededResponse(options.scope, policy, entry.resetAt);
    }

    entry.count += 1;
    rateLimitState.entries.set(key, entry);
    return null;
  } catch {
    return rateLimitUnavailableResponse(options.scope);
  }
}