import 'server-only';

import { createHash } from 'crypto';
import {
  queryCollection,
  setDocument,
  createDocument,
  batchWrite,
} from '@/lib/server/firestoreRest';
import { RouteError } from '@/lib/server/routeError';
import {
  SEARCH_CONSOLE_DAILY_COLLECTION,
  SEARCH_CONSOLE_PAGES_28D_COLLECTION,
  SEARCH_CONSOLE_SYNC_RUNS_COLLECTION,
  type SearchConsoleCacheContext,
} from '@/lib/server/gsc/types';
import {
  getSearchConsoleConnection,
  getSearchConsoleProject,
} from '@/lib/searchConsole/repository';
import type {
  SearchConsoleConnectionRecord,
  SearchConsoleDailyMetricRecord,
  SearchConsolePageMetricRecord,
  SearchConsoleSyncRunRecord,
} from '@/types/searchConsole';

export async function listConnectedSearchConsoleConnections(): Promise<SearchConsoleConnectionRecord[]> {
  const result = await queryCollection(
    'search_console_connections',
    [{ field: 'status', op: 'EQUAL', value: 'connected' }],
  );

  return result.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<SearchConsoleConnectionRecord, 'id'>),
  }));
}

export async function getSearchConsoleCacheContext(projectId: string): Promise<SearchConsoleCacheContext> {
  const project = await getSearchConsoleProject(projectId);
  if (!project) {
    throw new RouteError(404, 'Project not found.', {
      code: 'SEARCH_CONSOLE_PROJECT_NOT_FOUND',
    });
  }

  const connection = await getSearchConsoleConnection(projectId);
  if (!connection || connection.status !== 'connected') {
    throw new RouteError(409, 'Najpierw polacz Google Search Console dla tego projektu.', {
      code: 'SEARCH_CONSOLE_NOT_CONNECTED',
    });
  }

  const propertySiteUrl = project.searchConsole?.selectedPropertyUrl?.trim() ?? '';
  if (!propertySiteUrl) {
    throw new RouteError(409, 'Brakuje wybranej wlasciwosci Search Console dla projektu.', {
      code: 'SEARCH_CONSOLE_PROPERTY_INVALID',
      reason: 'missing-selected-property',
    });
  }

  return {
    project,
    connection,
    propertySiteUrl,
  };
}

export async function listSearchConsoleDailyMetrics(projectId: string): Promise<SearchConsoleDailyMetricRecord[]> {
  const result = await queryCollection(
    SEARCH_CONSOLE_DAILY_COLLECTION,
    [{ field: 'projectId', op: 'EQUAL', value: projectId }],
  );

  return result.docs.map((doc) => doc.data() as unknown as SearchConsoleDailyMetricRecord);
}

export async function listSearchConsolePageMetrics(projectId: string): Promise<SearchConsolePageMetricRecord[]> {
  const result = await queryCollection(
    SEARCH_CONSOLE_PAGES_28D_COLLECTION,
    [{ field: 'projectId', op: 'EQUAL', value: projectId }],
  );

  return result.docs.map((doc) => doc.data() as unknown as SearchConsolePageMetricRecord);
}

export async function getLatestSearchConsoleSyncRun(projectId: string): Promise<SearchConsoleSyncRunRecord | null> {
  const result = await queryCollection(
    SEARCH_CONSOLE_SYNC_RUNS_COLLECTION,
    [{ field: 'projectId', op: 'EQUAL', value: projectId }],
  );

  const runs = result.docs
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<SearchConsoleSyncRunRecord, 'id'>),
    }))
    .sort((left, right) => {
      if (right.finishedAt !== left.finishedAt) {
        return right.finishedAt - left.finishedAt;
      }

      return right.startedAt - left.startedAt;
    });

  return runs[0] ?? null;
}

export function buildSearchConsoleDailyDocId(projectId: string, date: string): string {
  return `${projectId}_${date}`;
}

export function buildSearchConsolePageDocId(projectId: string, pageUrl: string): string {
  const pageHash = createHash('sha256').update(pageUrl).digest('hex').slice(0, 24);
  return `${projectId}_${pageHash}`;
}

export async function writeSearchConsoleDailyMetrics(records: SearchConsoleDailyMetricRecord[]): Promise<number> {
  const ops = records.map((record) => ({
    kind: 'set' as const,
    collection: SEARCH_CONSOLE_DAILY_COLLECTION,
    docId: buildSearchConsoleDailyDocId(record.projectId, record.date),
    data: record as unknown as Record<string, unknown>,
  }));

  await batchWrite(ops);
  return records.length;
}

export async function replaceSearchConsolePageMetrics(args: {
  projectId: string;
  records: SearchConsolePageMetricRecord[];
}): Promise<{ written: number; deleted: number }> {
  const existingResult = await queryCollection(
    SEARCH_CONSOLE_PAGES_28D_COLLECTION,
    [{ field: 'projectId', op: 'EQUAL', value: args.projectId }],
  );

  const nextIds = new Set<string>();
  const ops: Array<{ kind: 'set'; collection: string; docId: string; data: Record<string, unknown> } | { kind: 'delete'; collection: string; docId: string }> = [];

  for (const record of args.records) {
    const docId = buildSearchConsolePageDocId(record.projectId, record.pageUrl);
    nextIds.add(docId);
    ops.push({
      kind: 'set',
      collection: SEARCH_CONSOLE_PAGES_28D_COLLECTION,
      docId,
      data: record as unknown as Record<string, unknown>,
    });
  }

  let deleted = 0;
  for (const doc of existingResult.docs) {
    if (nextIds.has(doc.id)) {
      continue;
    }

    deleted += 1;
    ops.push({
      kind: 'delete',
      collection: SEARCH_CONSOLE_PAGES_28D_COLLECTION,
      docId: doc.id,
    });
  }

  await batchWrite(ops);

  return {
    written: args.records.length,
    deleted,
  };
}

export async function recordSearchConsoleSyncRun(
  run: Omit<SearchConsoleSyncRunRecord, 'id'>,
): Promise<SearchConsoleSyncRunRecord> {
  const newId = await createDocument(SEARCH_CONSOLE_SYNC_RUNS_COLLECTION, {
    projectId: run.projectId,
    uid: run.uid,
    propertySiteUrl: run.propertySiteUrl,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    error: run.error,
    counts: run.counts,
  } as unknown as Record<string, unknown>);

  return {
    id: newId,
    ...run,
  };
}
