import { NextRequest } from 'next/server';
import {
  createSnippetAgentErrorResponse,
  createSnippetAgentResponse,
} from '@/lib/server/snippetInstall';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim();

  if (!token) {
    return createSnippetAgentErrorResponse('// missing token', 400);
  }

  return createSnippetAgentResponse('public, max-age=3600');
}
