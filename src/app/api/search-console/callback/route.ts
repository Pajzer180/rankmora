import { NextResponse } from 'next/server';
import { completeSearchConsoleCallback } from '@/lib/server/gsc/service';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { gscCallbackQuerySchema } from '@/lib/server/schemas/gsc';
import { toRouteErrorResponse } from '@/lib/server/routeError';
import { parseSearchParamsWithSchema } from '@/lib/server/validation';

export const runtime = 'nodejs';

function buildCallbackRedirect(
  request: Request,
  returnTo: string,
  status: 'connected' | 'error',
  reason?: string,
): NextResponse {
  const redirectUrl = new URL(returnTo, request.url);
  redirectUrl.searchParams.set('gsc', status);
  if (reason) {
    redirectUrl.searchParams.set('gscReason', reason);
  }

  return NextResponse.redirect(redirectUrl);
}

export async function GET(req: Request) {
  const rateLimitResponse = enforceRateLimit(req, { scope: 'gsc-callback' });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const url = new URL(req.url);
    const { code, error, state } = parseSearchParamsWithSchema(
      url.searchParams,
      gscCallbackQuerySchema,
    );

    const result = await completeSearchConsoleCallback({
      code: code ?? null,
      error: error ?? null,
      state,
    });

    return buildCallbackRedirect(req, result.returnTo, result.status, result.reason);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}