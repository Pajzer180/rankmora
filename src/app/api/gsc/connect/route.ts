import { NextResponse } from 'next/server';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { gscConnectRequestSchema } from '@/lib/server/schemas/gsc';
import { startSearchConsoleConnection } from '@/lib/server/gsc/service';
import type { SearchConsoleConnectResponse } from '@/types/searchConsole';
import { readJsonRequestBody } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'gsc-connect', uid });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { projectId, returnTo } = await readJsonRequestBody(req, gscConnectRequestSchema);
    await assertProjectOwnedByUser(uid, projectId);

    console.log('[GSC Connect] uid=%s, projectId=%s, returnTo=%s', uid, projectId, returnTo);

    const { authorizationUrl } = await startSearchConsoleConnection({
      uid,
      projectId,
      returnTo,
    });

    console.log('[GSC Connect] Przekierowanie do Google OAuth.');

    return NextResponse.json({
      ok: true,
      authorizationUrl,
    } satisfies SearchConsoleConnectResponse);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}