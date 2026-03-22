import { NextResponse } from 'next/server';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { createWordPressPreviewJob } from '@/lib/wordpress/service';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { wordpressPreviewRequestSchema } from '@/lib/server/schemas/wordpress';
import { readJsonRequestBody } from '@/lib/server/validation';

export const runtime = 'nodejs';

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
      suggestedMetaDescription,
    } = await readJsonRequestBody(req, wordpressPreviewRequestSchema);

    if (projectId) {
      await assertProjectOwnedByUser(uid, projectId);
    }

    const response = await createWordPressPreviewJob({
      uid,
      projectId,
      targetType,
      targetId,
      suggestedTitle,
      suggestedContent,
      suggestedMetaDescription,
    });

    return NextResponse.json(response);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}