import { NextResponse } from 'next/server';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { listChangeJobsByProject } from '@/lib/server/changeJobs';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import type { ChangeJobStatus } from '@/types/changeJobs';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'gsc-pages', uid });
    if (rateLimitResponse) return rateLimitResponse;

    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId')?.trim();
    const status = url.searchParams.get('status')?.trim() || undefined;

    if (!projectId) {
      return NextResponse.json({ error: 'Brakuje projectId.' }, { status: 400 });
    }

    await assertProjectOwnedByUser(uid, projectId);

    const jobs = await listChangeJobsByProject(projectId, {
      status: status as ChangeJobStatus | undefined,
      limit: 50,
    });

    return NextResponse.json({ ok: true, jobs });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
