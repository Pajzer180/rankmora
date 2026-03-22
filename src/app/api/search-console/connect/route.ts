import { NextResponse } from 'next/server';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { startSearchConsoleConnection } from '@/lib/server/gsc/service';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { gscConnectRequestSchema } from '@/lib/server/schemas/gsc';
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

    const { authorizationUrl } = await startSearchConsoleConnection({
      uid,
      projectId,
      returnTo,
    });

    return NextResponse.json({
      ok: true,
      authorizationUrl,
    } satisfies SearchConsoleConnectResponse);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}