import { NextRequest, NextResponse } from 'next/server';
import { listChangeHistoryByProject } from '@/lib/changeHistory';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId')?.trim();
    const limitRaw = Number(searchParams.get('limit') ?? '50');

    if (!projectId) {
      return NextResponse.json(
        { error: 'Brak parametru projectId' },
        { status: 400 },
      );
    }

    const uid = await requireAuthenticatedUid(req);
    await assertProjectOwnedByUser(uid, projectId);

    const items = await listChangeHistoryByProject(
      projectId,
      Number.isFinite(limitRaw) ? limitRaw : 50,
    );

    return NextResponse.json({ items });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}