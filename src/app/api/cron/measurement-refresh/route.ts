import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { refreshChangeMeasurementsFromCache } from '@/lib/server/changeMeasurements';
import { RouteError, toRouteErrorResponse } from '@/lib/server/routeError';
import type { ChangeMeasurementRefreshCronResponse } from '@/types/changeMeasurements';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    assertCronAuthorized(req);
    const result = await refreshChangeMeasurementsFromCache();

    return NextResponse.json(result satisfies ChangeMeasurementRefreshCronResponse);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}

function assertCronAuthorized(req: Request): void {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) {
    throw new RouteError(500, 'CRON_SECRET is not configured.', {
      code: 'CRON_CONFIG_ERROR',
    });
  }

  const providedSecret = readProvidedSecret(req);
  if (!providedSecret) {
    throw new RouteError(401, 'Unauthorized', {
      code: 'CRON_UNAUTHORIZED',
      reason: 'missing-secret',
    });
  }

  if (!safeEqual(providedSecret, configuredSecret)) {
    throw new RouteError(401, 'Unauthorized', {
      code: 'CRON_UNAUTHORIZED',
      reason: 'invalid-secret',
    });
  }
}

function readProvidedSecret(req: Request): string {
  const authHeader = req.headers.get('authorization') ?? '';
  const authMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (authMatch?.[1]?.trim()) {
    return authMatch[1].trim();
  }

  return req.headers.get('x-cron-secret')?.trim() ?? '';
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}