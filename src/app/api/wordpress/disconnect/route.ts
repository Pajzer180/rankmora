import { NextResponse } from 'next/server';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { wordpressDisconnectRequestSchema } from '@/lib/server/schemas/wordpress';
import { readJsonRequestBody } from '@/lib/server/validation';
import { disconnectWordPressConnection } from '@/lib/wordpress/service';

export async function POST(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const { projectId } = await readJsonRequestBody(req, wordpressDisconnectRequestSchema);

    await assertProjectOwnedByUser(uid, projectId);

    await disconnectWordPressConnection(uid, projectId);
    return NextResponse.json({ ok: true, status: 'disconnected' });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}