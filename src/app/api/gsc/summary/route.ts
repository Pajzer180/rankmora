import { NextResponse } from 'next/server';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { getSearchConsoleSummaryFromCache } from '@/lib/server/gsc/read';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { gscSummaryQuerySchema } from '@/lib/server/schemas/gsc';
import { parseSearchParamsWithSchema } from '@/lib/server/validation';
import type { SearchConsoleSummaryResponse } from '@/types/searchConsole';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'gsc-summary', uid });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const url = new URL(req.url);
    const { projectId } = parseSearchParamsWithSchema(url.searchParams, gscSummaryQuerySchema);

    await assertProjectOwnedByUser(uid, projectId);

    const result = await getSearchConsoleSummaryFromCache(projectId);
    return NextResponse.json(result satisfies SearchConsoleSummaryResponse);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}