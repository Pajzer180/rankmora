import { NextResponse } from 'next/server';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { gscSyncRequestSchema } from '@/lib/server/schemas/gsc';
import { readJsonRequestBody } from '@/lib/server/validation';
import { syncSearchConsoleProject } from '@/lib/server/gsc/ingest';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'gsc-sync', uid });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { projectId } = await readJsonRequestBody(req, gscSyncRequestSchema);
    await assertProjectOwnedByUser(uid, projectId);

    console.log('[GSC Sync] Reczna synchronizacja: uid=%s, projectId=%s', uid, projectId);

    const result = await syncSearchConsoleProject(projectId);

    console.log('[GSC Sync] Zakonczona: status=%s, daily=%d, pages=%d',
      result.status,
      result.counts?.dailyDocumentsWritten ?? 0,
      result.counts?.pageDocumentsWritten ?? 0,
    );

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
