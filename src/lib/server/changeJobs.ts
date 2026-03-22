import 'server-only';

import { getFirestoreAdmin } from '@/lib/server/firestoreAdmin';
import type {
  ChangeJobErrorPayload,
  ChangeJobRecord,
  ChangeJobStatus,
  ChangeJobValue,
} from '@/types/changeJobs';

export const CHANGE_JOBS_COLLECTION = 'change_jobs';

function changeJobsCollection() {
  return getFirestoreAdmin().collection(CHANGE_JOBS_COLLECTION);
}

export async function createChangeJob(
  job: Omit<ChangeJobRecord, 'id'>,
  jobId?: string,
): Promise<ChangeJobRecord> {
  const ref = jobId ? changeJobsCollection().doc(jobId) : changeJobsCollection().doc();
  await ref.set(job);

  return {
    id: ref.id,
    ...job,
  };
}

export async function getChangeJob(jobId: string): Promise<ChangeJobRecord | null> {
  const snapshot = await changeJobsCollection().doc(jobId).get();
  if (!snapshot.exists) {
    return null;
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as Omit<ChangeJobRecord, 'id'>),
  };
}

export async function updateChangeJob(
  jobId: string,
  patch: Partial<Omit<ChangeJobRecord, 'id'>>,
): Promise<void> {
  await changeJobsCollection().doc(jobId).update(patch);
}

export async function markChangeJobApplied(
  jobId: string,
  args: {
    appliedValue: ChangeJobValue;
    rollbackValue: ChangeJobValue;
    appliedAt?: number;
  },
): Promise<void> {
  const appliedAt = args.appliedAt ?? Date.now();

  await updateChangeJob(jobId, {
    status: 'applied',
    appliedValue: args.appliedValue,
    rollbackValue: args.rollbackValue,
    appliedAt,
    updatedAt: appliedAt,
    error: null,
  });
}

export async function markChangeJobRolledBack(
  jobId: string,
  args: {
    rolledBackAt?: number;
  },
): Promise<void> {
  const rolledBackAt = args.rolledBackAt ?? Date.now();

  await updateChangeJob(jobId, {
    status: 'rolled_back',
    rolledBackAt,
    updatedAt: rolledBackAt,
    error: null,
  });
}

export async function markChangeJobFailed(
  jobId: string,
  args: {
    error: ChangeJobErrorPayload;
    updatedAt?: number;
  },
): Promise<void> {
  const updatedAt = args.updatedAt ?? Date.now();

  await updateChangeJob(jobId, {
    status: 'failed',
    error: args.error,
    updatedAt,
  });
}

export async function listChangeJobsByProject(
  projectId: string,
  options: {
    status?: ChangeJobStatus;
    limit?: number;
  } = {},
): Promise<ChangeJobRecord[]> {
  let query: FirebaseFirestore.Query = changeJobsCollection()
    .where('projectId', '==', projectId);

  if (options.status) {
    query = query.where('status', '==', options.status);
  }

  const snapshot = await query.get();
  const limit = typeof options.limit === 'number' && options.limit > 0
    ? Math.floor(options.limit)
    : null;

  const jobs = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<ChangeJobRecord, 'id'>),
    }))
    .sort((left, right) => right.createdAt - left.createdAt);

  return limit === null ? jobs : jobs.slice(0, limit);
}
export async function listChangeJobsByStatus(
  status: ChangeJobStatus,
  limitCount?: number,
): Promise<ChangeJobRecord[]> {
  const snapshot = await changeJobsCollection()
    .where('status', '==', status)
    .get();

  const limit = typeof limitCount === 'number' && limitCount > 0
    ? Math.floor(limitCount)
    : null;

  const jobs = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<ChangeJobRecord, 'id'>),
    }))
    .sort((left, right) => right.createdAt - left.createdAt);

  return limit === null ? jobs : jobs.slice(0, limit);
}