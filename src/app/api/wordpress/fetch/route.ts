import { NextResponse } from 'next/server';
import {
  requireAuthenticatedUid,
  RouteError,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { fetchWordPressItems } from '@/lib/wordpress/service';
import type { WordPressFetchRequestBody } from '@/types/wordpress';

export async function POST(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'wordpress-fetch', uid });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = (await req.json()) as WordPressFetchRequestBody;

    if (body.targetType !== 'pages' && body.targetType !== 'posts') {
      throw new RouteError(400, 'targetType musi byc rowne pages albo posts.');
    }

    const response = await fetchWordPressItems(uid, body.targetType, body.search);
    return NextResponse.json(response);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
