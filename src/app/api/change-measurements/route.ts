import { NextResponse } from 'next/server';
import {
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { getChangeJob } from '@/lib/server/changeJobs';
import { getChangeMeasurementsByJob } from '@/lib/server/changeMeasurements';
import { enforceRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'gsc-pages', uid });
    if (rateLimitResponse) return rateLimitResponse;

    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId')?.trim();

    if (!jobId) {
      return NextResponse.json({ error: 'Brakuje jobId.' }, { status: 400 });
    }

    const job = await getChangeJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Change job nie znaleziony.' }, { status: 404 });
    }

    if (job.uid !== uid) {
      return NextResponse.json({ error: 'Brak dostepu.' }, { status: 403 });
    }

    const measurements = await getChangeMeasurementsByJob(jobId);
    return NextResponse.json({ ok: true, measurements });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
