import { NextResponse } from 'next/server';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { disconnectWordPressConnection } from '@/lib/wordpress/service';
import type { WordPressDisconnectRequestBody } from '@/types/wordpress';

export async function POST(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const body = (await req.json()) as WordPressDisconnectRequestBody;

    if (body.projectId) {
      await assertProjectOwnedByUser(uid, body.projectId);
    }

    await disconnectWordPressConnection(uid, body.projectId ?? null);
    return NextResponse.json({ ok: true, status: 'disconnected' });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
