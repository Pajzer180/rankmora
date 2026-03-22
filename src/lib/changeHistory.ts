import {
  addDoc,
  collection,
  getDocs,
  limit as limitQuery,
  orderBy,
  query,
} from 'firebase/firestore';
import { getClientDb } from '@/lib/firebase';
import type { ChangeHistoryEntry, ChangeHistoryWriteInput } from '@/types/history';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function normalizeLimit(value?: number): number {
  if (!value || Number.isNaN(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(value)), MAX_LIMIT);
}

function historyCollection(projectId: string) {
  const db = getClientDb();
  return collection(db, 'projects', projectId, 'changeHistory');
}

export async function writeChangeHistory(input: ChangeHistoryWriteInput): Promise<string> {
  const ref = await addDoc(historyCollection(input.projectId), {
    ...input,
    createdAt: input.createdAt ?? Date.now(),
    entityType: input.entityType ?? 'unknown',
    entityId: input.entityId ?? null,
    errorMessage: input.errorMessage ?? null,
    executionTimeMs: input.executionTimeMs ?? null,
    requestId: input.requestId ?? null,
    actionId: input.actionId ?? null,
  });
  return ref.id;
}

export async function listChangeHistoryByProject(
  projectId: string,
  limitCount?: number,
): Promise<ChangeHistoryEntry[]> {
  const q = query(
    historyCollection(projectId),
    orderBy('createdAt', 'desc'),
    limitQuery(normalizeLimit(limitCount)),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as Omit<ChangeHistoryEntry, 'id'>;
    return {
      id: docSnap.id,
      ...data,
      entityType: data.entityType ?? 'unknown',
      entityId: data.entityId ?? null,
      errorMessage: data.errorMessage ?? null,
      executionTimeMs: data.executionTimeMs ?? null,
      requestId: data.requestId ?? null,
      actionId: data.actionId ?? null,
    };
  });
}