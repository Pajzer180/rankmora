import { NextResponse } from 'next/server';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { wordpressPreviewRequestSchema } from '@/lib/server/schemas/wordpress';
import { readJsonRequestBody } from '@/lib/server/validation';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { createWordPressPreviewJob } from '@/lib/wordpress/service';

export async function POST(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'wordpress-preview', uid });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const {
      projectId,
      targetType,
      targetId,
      suggestedTitle,
      suggestedContent,
    } = await readJsonRequestBody(req, wordpressPreviewRequestSchema);

    if (projectId) {
      await assertProjectOwnedByUser(uid, projectId);
    }

    const response = await createWordPressPreviewJob({
      uid,
      targetType,
      targetId,
      suggestedTitle,
      suggestedContent,
    });

    return NextResponse.json(response);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
