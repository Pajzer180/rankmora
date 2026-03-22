import { NextRequest, NextResponse } from 'next/server';
import { jsonErrorResponse, RouteError } from '@/lib/server/routeError';
import {
  registerSnippetInstallFromBeacon,
  SNIPPET_BEACON_CORS_HEADERS,
} from '@/lib/server/snippetInstall';
import { snippetBeaconBodySchema } from '@/lib/server/schemas/snippet';
import { readJsonRequestBody } from '@/lib/server/validation';

// LEGACY — JS snippet serwowany klientom. Nowy core oparty jest o WordPress API + GSC.

function toBeaconErrorResponse(error: unknown) {
  if (error instanceof RouteError) {
    return jsonErrorResponse(
      error.message,
      error.status,
      error.details,
      SNIPPET_BEACON_CORS_HEADERS,
    );
  }

  console.error('[beacon] ERROR:', error);
  return jsonErrorResponse('internal error', 500, null, SNIPPET_BEACON_CORS_HEADERS);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: SNIPPET_BEACON_CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonRequestBody(req, snippetBeaconBodySchema);
    const { token, hostname } = body;

    console.log('[beacon] received:', { token: token.slice(0, 8), hostname });

    const project = await registerSnippetInstallFromBeacon(body);

    console.log('[beacon] project:', project.id);
    console.log('[beacon] upsert done, returning ok');
    return NextResponse.json({ ok: true }, { headers: SNIPPET_BEACON_CORS_HEADERS });
  } catch (error) {
    return toBeaconErrorResponse(error);
  }
}
