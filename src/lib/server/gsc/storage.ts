import 'server-only';

import { createHash } from 'crypto';
import type { WriteBatch } from 'firebase-admin/firestore';
import { getFirestoreAdmin } from '@/lib/server/firestoreAdmin';
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

const MAX_BATCH_OPERATIONS = 400;

function dailyCollection() {
  return getFirestoreAdmin().collection(SEARCH_CONSOLE_DAILY_COLLECTION);
}

function pagesCollection() {
  return getFirestoreAdmin().collection(SEARCH_CONSOLE_PAGES_28D_COLLECTION);
}

function syncRunsCollection() {
  return getFirestoreAdmin().collection(SEARCH_CONSOLE_SYNC_RUNS_COLLECTION);
}

export async function listConnectedSearchConsoleConnections(): Promise<SearchConsoleConnectionRecord[]> {
  const snapshot = await getFirestoreAdmin()
    .collection('search_console_connections')
    .where('status', '==', 'connected')
    .get();

  return snapshot.docs.map((doc) => ({
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
  const snapshot = await dailyCollection()
    .where('projectId', '==', projectId)
    .get();

  return snapshot.docs.map((doc) => doc.data() as SearchConsoleDailyMetricRecord);
}

export async function listSearchConsolePageMetrics(projectId: string): Promise<SearchConsolePageMetricRecord[]> {
  const snapshot = await pagesCollection()
    .where('projectId', '==', projectId)
    .get();

  return snapshot.docs.map((doc) => doc.data() as SearchConsolePageMetricRecord);
}

export async function getLatestSearchConsoleSyncRun(projectId: string): Promise<SearchConsoleSyncRunRecord | null> {
  const snapshot = await syncRunsCollection()
    .where('projectId', '==', projectId)
    .get();

  const runs = snapshot.docs
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
  const mutations = records.map((record) => ({
    kind: 'set' as const,
    ref: dailyCollection().doc(buildSearchConsoleDailyDocId(record.projectId, record.date)),
    data: record,
  }));

  await commitMutations(mutations);
  return records.length;
}

export async function replaceSearchConsolePageMetrics(args: {
  projectId: string;
  records: SearchConsolePageMetricRecord[];
}): Promise<{ written: number; deleted: number }> {
  const existingSnapshot = await pagesCollection()
    .where('projectId', '==', args.projectId)
    .get();

  const nextIds = new Set<string>();
  const mutations: Mutation[] = [];

  for (const record of args.records) {
    const docId = buildSearchConsolePageDocId(record.projectId, record.pageUrl);
    nextIds.add(docId);
    mutations.push({
      kind: 'set',
      ref: pagesCollection().doc(docId),
      data: record,
    });
  }

  let deleted = 0;
  for (const doc of existingSnapshot.docs) {
    if (nextIds.has(doc.id)) {
      continue;
    }

    deleted += 1;
    mutations.push({
      kind: 'delete',
      ref: doc.ref,
    });
  }

  await commitMutations(mutations);

  return {
    written: args.records.length,
    deleted,
  };
}

export async function recordSearchConsoleSyncRun(
  run: Omit<SearchConsoleSyncRunRecord, 'id'>,
): Promise<SearchConsoleSyncRunRecord> {
  const reference = syncRunsCollection().doc();
  const record: SearchConsoleSyncRunRecord = {
    id: reference.id,
    ...run,
  };

  await reference.set({
    projectId: record.projectId,
    uid: record.uid,
    propertySiteUrl: record.propertySiteUrl,
    status: record.status,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    error: record.error,
    counts: record.counts,
  });

  return record;
}

type Mutation =
  | {
    kind: 'set';
    ref: FirebaseFirestore.DocumentReference;
    data: unknown;
  }
  | {
    kind: 'delete';
    ref: FirebaseFirestore.DocumentReference;
  };

async function commitMutations(mutations: Mutation[]): Promise<void> {
  if (mutations.length === 0) {
    return;
  }

  for (let index = 0; index < mutations.length; index += MAX_BATCH_OPERATIONS) {
    const batch = getFirestoreAdmin().batch();
    const chunk = mutations.slice(index, index + MAX_BATCH_OPERATIONS);
    applyMutations(batch, chunk);
    await batch.commit();
  }
}

function applyMutations(batch: WriteBatch, mutations: Mutation[]): void {
  for (const mutation of mutations) {
    if (mutation.kind === 'set') {
      batch.set(mutation.ref, mutation.data);
      continue;
    }

    batch.delete(mutation.ref);
  }
}