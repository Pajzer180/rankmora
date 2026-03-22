import {
  createDocument,
  queryCollection,
} from '@/lib/server/firestoreRest';
import type { ChangeHistoryEntry, ChangeHistoryWriteInput } from '@/types/history';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function normalizeLimit(value?: number): number {
  if (!value || Number.isNaN(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(value)), MAX_LIMIT);
}

function historySubcollectionPath(projectId: string): string {
  return `projects/${projectId}/changeHistory`;
}

export async function writeChangeHistory(input: ChangeHistoryWriteInput): Promise<string> {
  const data = {
    ...input,
    createdAt: input.createdAt ?? Date.now(),
    entityType: input.entityType ?? 'unknown',
    entityId: input.entityId ?? null,
    errorMessage: input.errorMessage ?? null,
    executionTimeMs: input.executionTimeMs ?? null,
    requestId: input.requestId ?? null,
    actionId: input.actionId ?? null,
  };

  const newId = await createDocument(
    historySubcollectionPath(input.projectId),
    data as unknown as Record<string, unknown>,
  );
  return newId;
}

export async function listChangeHistoryByProject(
  projectId: string,
  limitCount?: number,
): Promise<ChangeHistoryEntry[]> {
  // Query all history entries for this project subcollection
  const result = await queryCollection(
    historySubcollectionPath(projectId),
    [],
  );

  const entries = result.docs.map((docSnap) => {
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

  // Sort by createdAt descending and apply limit
  const limit = normalizeLimit(limitCount);
  return entries
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, limit);
}
