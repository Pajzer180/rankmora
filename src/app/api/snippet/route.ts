import { NextRequest } from 'next/server';
import {
  createSnippetAgentErrorResponse,
  createSnippetAgentResponse,
} from '@/lib/server/snippetInstall';

// LEGACY — JS snippet serwowany klientom. Nowy core oparty jest o WordPress API + GSC.

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim();
  const clientId = req.nextUrl.searchParams.get('clientId')?.trim();

  if (!token && !clientId) {
    return createSnippetAgentErrorResponse('// missing token or clientId', 400);
  }

  return createSnippetAgentResponse('no-store');
}
