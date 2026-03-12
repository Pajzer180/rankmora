import { NextResponse } from 'next/server';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { wordpressFetchRequestSchema } from '@/lib/server/schemas/wordpress';
import { readJsonRequestBody } from '@/lib/server/validation';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { fetchWordPressItems } from '@/lib/wordpress/service';

export async function POST(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'wordpress-fetch', uid });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { projectId, targetType, search } = await readJsonRequestBody(
      req,
      wordpressFetchRequestSchema,
    );

    if (projectId) {
      await assertProjectOwnedByUser(uid, projectId);
    }

    const response = await fetchWordPressItems(uid, targetType, search);
    return NextResponse.json(response);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
