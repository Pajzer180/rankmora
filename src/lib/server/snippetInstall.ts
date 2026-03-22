import 'server-only';

import { readFileSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';
import {
  getDocument,
  setDocument,
  updateDocument,
  queryCollection,
} from '@/lib/server/firestoreRest';
import type { Project, SiteInstall } from '@/lib/snippetActions';
import { RouteError } from '@/lib/server/routeError';

const SNIPPET_AGENT_PATH = join(process.cwd(), 'src', 'lib', 'snippet', 'agent.js');

let cachedSnippetAgentScript: string | null = null;

export const SNIPPET_BEACON_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface SiteInstallUpdateData {
  domain: string;
  pageUrl: string;
  pageTitle: string;
  userAgent: string;
  viewportWidth: number | null;
  viewportHeight: number | null;
}

export interface SnippetBeaconInstallInput {
  token: string;
  hostname: string;
  url: string;
  title: string;
  userAgent: string;
  vw: number | null;
  vh: number | null;
}

export function createSnippetAgentResponse(cacheControl: string): NextResponse {
  return new NextResponse(getSnippetAgentScript(), {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': cacheControl,
    },
  });
}

export function createSnippetAgentErrorResponse(comment: string, status: number): NextResponse {
  return new NextResponse(comment, {
    status,
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-store',
    },
  });
}

export async function resolveEnabledSnippetProjectByToken(token: string): Promise<Project> {
  const project = await findProjectByToken(token);

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

  return project;
}

export async function registerSnippetInstallFromBeacon(
  input: SnippetBeaconInstallInput,
): Promise<Project> {
  const project = await resolveEnabledSnippetProjectByToken(input.token);

  await upsertSiteInstall(project, {
    domain: input.hostname,
    pageUrl: input.url,
    pageTitle: input.title,
    userAgent: input.userAgent,
    viewportWidth: input.vw,
    viewportHeight: input.vh,
  });

  return project;
}

function getSnippetAgentScript(): string {
  if (cachedSnippetAgentScript !== null) {
    return cachedSnippetAgentScript;
  }

  cachedSnippetAgentScript = readFileSync(SNIPPET_AGENT_PATH, 'utf-8');
  return cachedSnippetAgentScript;
}

async function findProjectByToken(token: string): Promise<Project | null> {
  const result = await queryCollection(
    'projects',
    [{ field: 'snippetToken', op: 'EQUAL', value: token }],
    1,
  );

  if (result.empty) {
    return null;
  }

  const doc = result.docs[0];
  return { id: doc.id, ...doc.data() } as Project;
}

function siteInstallDocId(projectId: string, domain: string): string {
  return `${projectId}_${domain}`;
}

async function upsertSiteInstall(
  project: Project,
  data: SiteInstallUpdateData,
): Promise<void> {
  const docId = siteInstallDocId(project.id, data.domain);
  const now = Date.now();
  const existingInstall = await getDocument('siteInstalls', docId);

  if (existingInstall.exists) {
    const existing = existingInstall.data() as Record<string, unknown>;
    const currentPingCount = typeof existing.pingCount === 'number' ? existing.pingCount : 0;
    await updateDocument('siteInstalls', docId, {
      lastSeenAt: now,
      pingCount: currentPingCount + 1,
      pageUrl: data.pageUrl,
      pageTitle: data.pageTitle,
      userAgent: data.userAgent,
      viewportWidth: data.viewportWidth,
      viewportHeight: data.viewportHeight,
    });
    return;
  }

  const install: SiteInstall = {
    projectId: project.id,
    uid: project.uid,
    snippetToken: project.snippetToken!,
    domain: data.domain,
    pageUrl: data.pageUrl,
    pageTitle: data.pageTitle,
    userAgent: data.userAgent,
    viewportWidth: data.viewportWidth,
    viewportHeight: data.viewportHeight,
    installedAt: now,
    lastSeenAt: now,
    source: 'js-snippet',
    pingCount: 1,
  };

  await setDocument('siteInstalls', docId, install as unknown as Record<string, unknown>);
}
