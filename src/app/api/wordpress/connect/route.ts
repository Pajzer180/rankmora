import { NextResponse } from 'next/server';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { wordpressConnectRequestSchema } from '@/lib/server/schemas/wordpress';
import { readJsonRequestBody } from '@/lib/server/validation';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { connectWordPressConnection } from '@/lib/wordpress/service';

export async function POST(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'wordpress-connect', uid });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { projectId, siteUrl, wpUsername, applicationPassword } = await readJsonRequestBody(
      req,
      wordpressConnectRequestSchema,
    );

    if (projectId) {
      await assertProjectOwnedByUser(uid, projectId);
    }

    const response = await connectWordPressConnection({
      uid,
      projectId: projectId ?? null,
      siteUrl,
      wpUsername,
      applicationPassword,
    });

    return NextResponse.json(response);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
