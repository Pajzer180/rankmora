import { NextRequest, NextResponse } from 'next/server';
import { queryCollection } from '@/lib/server/firestoreRest';

// LEGACY — endpoint serwujący akcje SEO dla JS snippetu. Nowy core nie używa snippetu.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');

  if (!clientId) {
    return NextResponse.json(
      { error: 'Brak parametru clientId' },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const result = await queryCollection(
    'seo_actions',
    [{ field: 'clientId', op: 'EQUAL', value: clientId }],
  );

  const actions = result.docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((d) => d.status === 'active')
    .map((d) => d.actionData);

  return NextResponse.json(actions, { headers: CORS_HEADERS });
}
