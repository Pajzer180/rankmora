import { NextResponse } from 'next/server';
import {
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import {
  wordpressRollbackRequestSchema,
} from '@/lib/server/schemas/wordpress';
import { readJsonRequestBody } from '@/lib/server/validation';
import { rollbackWordPressChangeJob } from '@/lib/wordpress/service';
import type { WordPressRollbackResponse } from '@/types/wordpress';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'wordpress-rollback', uid });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { jobId } = await readJsonRequestBody(req, wordpressRollbackRequestSchema);
    const response = await rollbackWordPressChangeJob(uid, jobId);

    return NextResponse.json(response satisfies WordPressRollbackResponse);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}