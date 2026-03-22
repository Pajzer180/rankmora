import { NextResponse } from 'next/server';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { getSearchConsoleSites } from '@/lib/server/gsc/service';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { gscSitesQuerySchema } from '@/lib/server/schemas/gsc';
import type { SearchConsoleSitesResponse } from '@/types/searchConsole';
import { parseSearchParamsWithSchema } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'gsc-sites', uid });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const url = new URL(req.url);
    const { projectId } = parseSearchParamsWithSchema(url.searchParams, gscSitesQuerySchema);

    await assertProjectOwnedByUser(uid, projectId);

    const result = await getSearchConsoleSites(projectId);
    return NextResponse.json({
      ok: true,
      items: result.items,
      selectedPropertyUrl: result.selectedPropertyUrl,
      lastSyncedAt: result.lastSyncedAt,
    } satisfies SearchConsoleSitesResponse);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}