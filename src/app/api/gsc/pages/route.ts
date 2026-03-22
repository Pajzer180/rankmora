import { NextResponse } from 'next/server';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { getSearchConsolePagesFromCache } from '@/lib/server/gsc/read';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { gscPagesQuerySchema } from '@/lib/server/schemas/gsc';
import { parseSearchParamsWithSchema } from '@/lib/server/validation';
import type { SearchConsolePagesResponse } from '@/types/searchConsole';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'gsc-pages', uid });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const url = new URL(req.url);
    const query = parseSearchParamsWithSchema(url.searchParams, gscPagesQuerySchema);

    await assertProjectOwnedByUser(uid, query.projectId);

    const result = await getSearchConsolePagesFromCache(query);
    return NextResponse.json(result satisfies SearchConsolePagesResponse);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}