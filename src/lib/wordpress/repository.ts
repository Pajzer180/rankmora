import 'server-only';

import {
  getDocument,
  setDocument,
  updateDocument,
  createDocument,
  queryCollection,
} from '@/lib/server/firestoreRest';
import type { ProjectWordPressState } from '@/types/project';
import type {
  WordPressConnectionRecord,
  WordPressJobRecord,
} from '@/types/wordpress';

export async function getWordPressConnection(
  userId: string,
): Promise<WordPressConnectionRecord | null> {
  const snap = await getDocument('wordpress_connections', userId);
  if (!snap.exists) return null;

  return {
    id: snap.id,
    ...(snap.data() as Omit<WordPressConnectionRecord, 'id'>),
  };
}

export async function saveWordPressConnection(
  connection: Omit<WordPressConnectionRecord, 'id'>,
): Promise<WordPressConnectionRecord> {
  await setDocument('wordpress_connections', connection.userId, connection as unknown as Record<string, unknown>);
  return {
    id: connection.userId,
    ...connection,
  };
}

export async function updateProjectWordPressSummary(
  projectId: string,
  summary: ProjectWordPressState | null,
): Promise<void> {
  await updateDocument('projects', projectId, {
    wordpress: summary,
    updatedAt: Date.now(),
  });
}

export async function createWordPressJob(
  job: Omit<WordPressJobRecord, 'id'>,
  jobId?: string,
): Promise<WordPressJobRecord> {
  if (jobId) {
    await setDocument('wordpress_jobs', jobId, job as unknown as Record<string, unknown>);
    return { id: jobId, ...job };
  }

  const newId = await createDocument('wordpress_jobs', job as unknown as Record<string, unknown>);
  return { id: newId, ...job };
}

export async function getWordPressJob(
  jobId: string,
): Promise<WordPressJobRecord | null> {
  const snap = await getDocument('wordpress_jobs', jobId);
  if (!snap.exists) return null;

  return {
    id: snap.id,
    ...(snap.data() as Omit<WordPressJobRecord, 'id'>),
  };
}

export async function updateWordPressJob(
  jobId: string,
  patch: Partial<Omit<WordPressJobRecord, 'id'>>,
): Promise<void> {
  await updateDocument('wordpress_jobs', jobId, patch as Record<string, unknown>);
}

export async function listWordPressJobsByUser(
  userId: string,
  limitCount = 20,
): Promise<WordPressJobRecord[]> {
  const result = await queryCollection(
    'wordpress_jobs',
    [{ field: 'userId', op: 'EQUAL', value: userId }],
    limitCount,
  );

  return result.docs
    .map((item) => ({
      id: item.id,
      ...(item.data() as Omit<WordPressJobRecord, 'id'>),
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
