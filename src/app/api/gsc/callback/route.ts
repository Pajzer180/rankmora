import { NextResponse } from 'next/server';
import { completeSearchConsoleCallback } from '@/lib/server/gsc/service';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { gscCallbackQuerySchema } from '@/lib/server/schemas/gsc';
import { parseSearchParamsWithSchema } from '@/lib/server/validation';
import { DEFAULT_SEARCH_CONSOLE_RETURN_TO } from '@/lib/server/gsc/types';

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

  // Detect port mismatch: if the redirect URI env points to a different port
  // than the current request, log a clear warning.
  const currentOrigin = new URL(req.url).origin;
  const configuredRedirectUri = process.env.GOOGLE_SEARCH_CONSOLE_REDIRECT_URI?.trim();
  if (configuredRedirectUri) {
    try {
      const configuredOrigin = new URL(configuredRedirectUri).origin;
      if (configuredOrigin !== currentOrigin) {
        console.warn(
          '[GSC Callback] PORT MISMATCH: serwer dziala na %s, ale GOOGLE_SEARCH_CONSOLE_REDIRECT_URI wskazuje na %s. ' +
          'To moze powodowac bledy OAuth (redirect_uri_mismatch).',
          currentOrigin,
          configuredOrigin,
        );
      }
    } catch { /* ignore malformed URI */ }
  }

  try {
    const url = new URL(req.url);

    console.log('[GSC Callback] Otrzymano callback. code=%s, error=%s, state=%s',
      url.searchParams.has('code') ? '(present)' : '(missing)',
      url.searchParams.get('error') ?? '(none)',
      url.searchParams.has('state') ? '(present)' : '(missing)',
    );

    const { code, error, state } = parseSearchParamsWithSchema(
      url.searchParams,
      gscCallbackQuerySchema,
    );

    const result = await completeSearchConsoleCallback({
      code: code ?? null,
      error: error ?? null,
      state,
    });

    console.log('[GSC Callback] Wynik: status=%s, reason=%s, returnTo=%s',
      result.status, result.reason ?? '(none)', result.returnTo);

    return buildCallbackRedirect(req, result.returnTo, result.status, result.reason);
  } catch (error) {
    // CRITICAL: Always redirect, never return JSON.
    // If we return JSON here, the user sees a blank/error page instead of
    // being redirected back to onboarding/dashboard with a sensible error.
    const message = error instanceof Error ? error.message : String(error);
    console.error('[GSC Callback] BLAD KRYTYCZNY:', message, error);

    // Try to extract returnTo from state query param if possible
    const returnTo = DEFAULT_SEARCH_CONSOLE_RETURN_TO;
    try {
      const url = new URL(req.url);
      // The state might contain the return path — but we can't decode it here
      // because the state consumption already failed. Use a safe fallback.
      const errorParam = url.searchParams.get('error');
      if (errorParam === 'access_denied') {
        return buildCallbackRedirect(req, returnTo, 'error', 'oauth-denied');
      }
    } catch { /* ignore */ }

    // Map known error types to specific reasons for the UI
    let reason = 'callback-failed';
    if (message.includes('Missing') && message.includes('OAuth')) {
      reason = 'missing-params';
    } else if (message.includes('state')) {
      reason = 'state-invalid';
    } else if (message.includes('rate') || message.includes('Rate')) {
      reason = 'rate-limited';
    }

    return buildCallbackRedirect(req, returnTo, 'error', reason);
  }
}