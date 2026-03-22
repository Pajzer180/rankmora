import 'server-only';

import {
  getDocument,
  setDocument,
  updateDocument,
  createDocument,
  queryCollection,
} from '@/lib/server/firestoreRest';
import type {
  ChangeJobErrorPayload,
  ChangeJobRecord,
  ChangeJobStatus,
  ChangeJobValue,
} from '@/types/changeJobs';

export const CHANGE_JOBS_COLLECTION = 'change_jobs';

export async function createChangeJob(
  job: Omit<ChangeJobRecord, 'id'>,
  jobId?: string,
): Promise<ChangeJobRecord> {
  if (jobId) {
    await setDocument(CHANGE_JOBS_COLLECTION, jobId, job as unknown as Record<string, unknown>);
    return { id: jobId, ...job };
  }

  const newId = await createDocument(CHANGE_JOBS_COLLECTION, job as unknown as Record<string, unknown>);
  return { id: newId, ...job };
}

export async function getChangeJob(jobId: string): Promise<ChangeJobRecord | null> {
  const snapshot = await getDocument(CHANGE_JOBS_COLLECTION, jobId);
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
  await updateDocument(CHANGE_JOBS_COLLECTION, jobId, patch as Record<string, unknown>);
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
  const filters: Array<{ field: string; op: 'EQUAL'; value: unknown }> = [
    { field: 'projectId', op: 'EQUAL', value: projectId },
  ];

  if (options.status) {
    filters.push({ field: 'status', op: 'EQUAL', value: options.status });
  }

  const result = await queryCollection(CHANGE_JOBS_COLLECTION, filters);

  const limit = typeof options.limit === 'number' && options.limit > 0
    ? Math.floor(options.limit)
    : null;

  const jobs = result.docs
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
  const result = await queryCollection(
    CHANGE_JOBS_COLLECTION,
    [{ field: 'status', op: 'EQUAL', value: status }],
  );

  const limit = typeof limitCount === 'number' && limitCount > 0
    ? Math.floor(limitCount)
    : null;

  const jobs = result.docs
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<ChangeJobRecord, 'id'>),
    }))
    .sort((left, right) => right.createdAt - left.createdAt);

  return limit === null ? jobs : jobs.slice(0, limit);
}
