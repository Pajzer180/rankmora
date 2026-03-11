import { NextResponse } from 'next/server';
import {
  requireAuthenticatedUid,
  RouteError,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { createWordPressPreviewJob } from '@/lib/wordpress/service';
import type { WordPressPreviewRequestBody } from '@/types/wordpress';

export async function POST(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'wordpress-preview', uid });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = (await req.json()) as WordPressPreviewRequestBody;

    if (body.targetType !== 'page' && body.targetType !== 'post') {
      throw new RouteError(400, 'targetType musi byc rowne page albo post.');
    }

    const response = await createWordPressPreviewJob({
      uid,
      targetType: body.targetType,
      targetId: body.targetId,
      suggestedTitle: body.suggestedTitle,
      suggestedContent: body.suggestedContent,
    });

    return NextResponse.json(response);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
