import { NextResponse } from 'next/server';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { selectSearchConsoleProperty } from '@/lib/server/gsc/service';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { gscSelectSiteRequestSchema } from '@/lib/server/schemas/gsc';
import type { SearchConsoleSelectPropertyResponse } from '@/types/searchConsole';
import { readJsonRequestBody } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'gsc-select-site', uid });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { projectId, propertyUrl } = await readJsonRequestBody(req, gscSelectSiteRequestSchema);
    await assertProjectOwnedByUser(uid, projectId);

    const result = await selectSearchConsoleProperty(projectId, propertyUrl);

    return NextResponse.json({
      ok: true,
      selectedPropertyUrl: result.selectedPropertyUrl,
    } satisfies SearchConsoleSelectPropertyResponse);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}