import { NextRequest, NextResponse } from 'next/server';
import { findProjectByToken, upsertSiteInstall } from '@/lib/snippetActions';
import { jsonErrorResponse, RouteError } from '@/lib/server/routeError';
import { snippetBeaconBodySchema } from '@/lib/server/schemas/snippet';
import { readJsonRequestBody } from '@/lib/server/validation';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function toBeaconErrorResponse(error: unknown) {
  if (error instanceof RouteError) {
    return jsonErrorResponse(error.message, error.status, error.details, CORS);
  }

  console.error('[beacon] ERROR:', error);
  return jsonErrorResponse('internal error', 500, null, CORS);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonRequestBody(req, snippetBeaconBodySchema);
    const { token, hostname, url, title, userAgent, vw, vh } = body;

    console.log('[beacon] received:', { token: token.slice(0, 8), hostname });

    const project = await findProjectByToken(token);
    console.log('[beacon] project:', project ? project.id : 'NOT FOUND');

    if (!project) {
      throw new RouteError(404, 'invalid token', {
        code: 'SNIPPET_TOKEN_INVALID',
      });
    }

    if (!project.snippetEnabled) {
      throw new RouteError(403, 'snippet disabled', {
        code: 'SNIPPET_DISABLED',
      });
    }

    await upsertSiteInstall(project, {
      domain: hostname,
      pageUrl: url,
      pageTitle: title,
      userAgent,
      viewportWidth: vw,
      viewportHeight: vh,
    });

    console.log('[beacon] upsert done, returning ok');
    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (error) {
    return toBeaconErrorResponse(error);
  }
}
