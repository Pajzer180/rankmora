import 'server-only';

import { getFirestoreAdmin } from '@/lib/server/firestoreAdmin';
import type { ProjectWordPressState } from '@/types/project';
import type {
  WordPressConnectionRecord,
  WordPressJobRecord,
} from '@/types/wordpress';

function getConnectionRef(userId: string) {
  return getFirestoreAdmin().collection('wordpress_connections').doc(userId);
}

function wordPressJobsCollection() {
  return getFirestoreAdmin().collection('wordpress_jobs');
}

export async function getWordPressConnection(
  userId: string,
): Promise<WordPressConnectionRecord | null> {
  const snap = await getConnectionRef(userId).get();
  if (!snap.exists) return null;

  return {
    id: snap.id,
    ...(snap.data() as Omit<WordPressConnectionRecord, 'id'>),
  };
}

export async function saveWordPressConnection(
  connection: Omit<WordPressConnectionRecord, 'id'>,
): Promise<WordPressConnectionRecord> {
  await getConnectionRef(connection.userId).set(connection);
  return {
    id: connection.userId,
    ...connection,
  };
}

export async function updateProjectWordPressSummary(
  projectId: string,
  summary: ProjectWordPressState | null,
): Promise<void> {
  await getFirestoreAdmin().collection('projects').doc(projectId).update({
    wordpress: summary,
    updatedAt: Date.now(),
  });
}

export async function createWordPressJob(
  job: Omit<WordPressJobRecord, 'id'>,
  jobId?: string,
): Promise<WordPressJobRecord> {
  const ref = jobId ? wordPressJobsCollection().doc(jobId) : wordPressJobsCollection().doc();
  await ref.set(job);
  return {
    id: ref.id,
    ...job,
  };
}

export async function getWordPressJob(
  jobId: string,
): Promise<WordPressJobRecord | null> {
  const snap = await wordPressJobsCollection().doc(jobId).get();
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
  await wordPressJobsCollection().doc(jobId).update(patch);
}

export async function listWordPressJobsByUser(
  userId: string,
  limitCount = 20,
): Promise<WordPressJobRecord[]> {
  const snap = await wordPressJobsCollection()
    .where('userId', '==', userId)
    .limit(limitCount)
    .get();

  return snap.docs
    .map((item) => ({
      id: item.id,
      ...(item.data() as Omit<WordPressJobRecord, 'id'>),
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}