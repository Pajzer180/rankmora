import { NextResponse } from 'next/server';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { getPageQueries } from '@/lib/server/gsc/pageQueries';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { gscPageQueriesQuerySchema } from '@/lib/server/schemas/gsc';
import { parseSearchParamsWithSchema } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'gsc-pages', uid });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const url = new URL(req.url);
    const query = parseSearchParamsWithSchema(url.searchParams, gscPageQueriesQuerySchema);

    await assertProjectOwnedByUser(uid, query.projectId);

    const result = await getPageQueries(query.projectId, query.pageUrl);
    return NextResponse.json(result);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
