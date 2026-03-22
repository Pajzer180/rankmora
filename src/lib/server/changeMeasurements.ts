import 'server-only';

import { getFirestoreAdmin } from '@/lib/server/firestoreAdmin';
import { listChangeJobsByStatus } from '@/lib/server/changeJobs';
import { listSearchConsolePageMetrics } from '@/lib/server/gsc/storage';
import type { ChangeJobRecord } from '@/types/changeJobs';
import type {
  ChangeMeasurementMetricSnapshot,
  ChangeMeasurementRecord,
  ChangeMeasurementRefreshCronResponse,
  ChangeMeasurementWindow,
} from '@/types/changeMeasurements';
import type { SearchConsolePageMetricRecord } from '@/types/searchConsole';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const CHANGE_MEASUREMENTS_COLLECTION = 'change_measurements';
const CHANGE_MEASUREMENT_WINDOWS: Array<{ window: ChangeMeasurementWindow; days: number }> = [
  { window: '7d', days: 7 },
  { window: '14d', days: 14 },
  { window: '30d', days: 30 },
];

function changeMeasurementsCollection() {
  return getFirestoreAdmin().collection(CHANGE_MEASUREMENTS_COLLECTION);
}

export function buildChangeMeasurementDocId(jobId: string, window: ChangeMeasurementWindow): string {
  return `${jobId}_${window}`;
}

export async function getChangeMeasurementsByJob(jobId: string): Promise<ChangeMeasurementRecord[]> {
  const snapshot = await changeMeasurementsCollection()
    .where('jobId', '==', jobId)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<ChangeMeasurementRecord, 'id'>),
  }));
}

export async function captureBaselineMeasurementsForAppliedJob(job: ChangeJobRecord): Promise<void> {
  const pageMetrics = await listSearchConsolePageMetrics(job.projectId);
  await ensureChangeMeasurementBaselines(job, pageMetrics);
}

export async function refreshChangeMeasurementsFromCache(): Promise<ChangeMeasurementRefreshCronResponse> {
  const startedAt = Date.now();
  const jobs = await listChangeJobsByStatus('applied');
  const pageMetricsCache = new Map<string, Promise<SearchConsolePageMetricRecord[]>>();
  const results: ChangeMeasurementRefreshCronResponse['results'] = [];
  let measured = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      if (!job.appliedAt || job.appliedAt <= 0) {
        skipped += 1;
        results.push({
          jobId: job.id,
          projectId: job.projectId,
          status: 'skipped',
          windowsUpdated: [],
          reason: 'missing-applied-at',
        });
        continue;
      }

      const appliedAt = job.appliedAt;
      const now = Date.now();
      const eligibleWindows = CHANGE_MEASUREMENT_WINDOWS
        .filter((entry) => now - appliedAt >= entry.days * DAY_IN_MS);

      if (!eligibleWindows.length) {
        skipped += 1;
        results.push({
          jobId: job.id,
          projectId: job.projectId,
          status: 'skipped',
          windowsUpdated: [],
          reason: 'window-not-ready',
        });
        continue;
      }

      const pageMetricsPromise = pageMetricsCache.get(job.projectId)
        ?? Promise.resolve(listSearchConsolePageMetrics(job.projectId));
      if (!pageMetricsCache.has(job.projectId)) {
        pageMetricsCache.set(job.projectId, pageMetricsPromise);
      }

      const pageMetrics = await pageMetricsPromise;
      const existingMeasurements = await ensureChangeMeasurementBaselines(job, pageMetrics);
      const measurementByWindow = new Map(existingMeasurements.map((record) => [record.window, record]));
      const pageMetric = findPageMetricForUrl(pageMetrics, job.pageUrl);

      if (!pageMetric) {
        skipped += 1;
        results.push({
          jobId: job.id,
          projectId: job.projectId,
          status: 'skipped',
          windowsUpdated: [],
          reason: 'page-cache-missing',
        });
        continue;
      }

      const currentSnapshot = toMetricSnapshot(pageMetric);
      const measuredAt = Date.now();
      const recordsToWrite: ChangeMeasurementRecord[] = [];
      const windowsUpdated: ChangeMeasurementWindow[] = [];

      for (const entry of eligibleWindows) {
        const existing = measurementByWindow.get(entry.window);
        const baseline = existing?.baseline ?? null;
        recordsToWrite.push({
          id: buildChangeMeasurementDocId(job.id, entry.window),
          jobId: job.id,
          projectId: job.projectId,
          uid: job.uid,
          pageUrl: job.pageUrl,
          window: entry.window,
          baseline,
          current: currentSnapshot,
          delta: baseline ? computeMetricDelta(baseline, currentSnapshot) : null,
          baselineStartDate: existing?.baselineStartDate ?? pageMetric.startDate ?? null,
          baselineEndDate: existing?.baselineEndDate ?? pageMetric.endDate ?? null,
          currentStartDate: pageMetric.startDate,
          currentEndDate: pageMetric.endDate,
          measuredAt,
          lastSyncedAt: pageMetric.syncedAt,
          sourceWindowDays: pageMetric.windowDays,
        });
        windowsUpdated.push(entry.window);
      }

      await writeChangeMeasurements(recordsToWrite);
      measured += 1;
      results.push({
        jobId: job.id,
        projectId: job.projectId,
        status: 'measured',
        windowsUpdated,
      });
    } catch (error) {
      failed += 1;
      results.push({
        jobId: job.id,
        projectId: job.projectId,
        status: 'failed',
        windowsUpdated: [],
        error: error instanceof Error ? error.message : 'Measurement refresh failed.',
      });
    }
  }

  return {
    ok: true,
    startedAt,
    finishedAt: Date.now(),
    processed: jobs.length,
    measured,
    skipped,
    failed,
    results,
  };
}

async function ensureChangeMeasurementBaselines(
  job: ChangeJobRecord,
  pageMetrics?: SearchConsolePageMetricRecord[],
): Promise<ChangeMeasurementRecord[]> {
  const [existingMeasurements, resolvedPageMetrics] = await Promise.all([
    getChangeMeasurementsByJob(job.id),
    pageMetrics ? Promise.resolve(pageMetrics) : listSearchConsolePageMetrics(job.projectId),
  ]);

  const existingByWindow = new Map(existingMeasurements.map((record) => [record.window, record]));
  const baselineMetric = findPageMetricForUrl(resolvedPageMetrics, job.pageUrl);
  const baselineSnapshot = baselineMetric ? toMetricSnapshot(baselineMetric) : null;
  const measuredAt = Date.now();
  const newRecords: ChangeMeasurementRecord[] = [];

  for (const entry of CHANGE_MEASUREMENT_WINDOWS) {
    if (existingByWindow.has(entry.window)) {
      continue;
    }

    newRecords.push({
      id: buildChangeMeasurementDocId(job.id, entry.window),
      jobId: job.id,
      projectId: job.projectId,
      uid: job.uid,
      pageUrl: job.pageUrl,
      window: entry.window,
      baseline: baselineSnapshot,
      current: null,
      delta: null,
      baselineStartDate: baselineMetric?.startDate ?? null,
      baselineEndDate: baselineMetric?.endDate ?? null,
      currentStartDate: null,
      currentEndDate: null,
      measuredAt,
      lastSyncedAt: baselineMetric?.syncedAt ?? null,
      sourceWindowDays: baselineMetric?.windowDays ?? null,
    });
  }

  if (newRecords.length > 0) {
    await writeChangeMeasurements(newRecords);
  }

  return [...existingMeasurements, ...newRecords].sort((left, right) => left.window.localeCompare(right.window));
}

async function writeChangeMeasurements(records: ChangeMeasurementRecord[]): Promise<void> {
  if (!records.length) {
    return;
  }

  const batch = getFirestoreAdmin().batch();
  for (const record of records) {
    batch.set(changeMeasurementsCollection().doc(record.id), {
      jobId: record.jobId,
      projectId: record.projectId,
      uid: record.uid,
      pageUrl: record.pageUrl,
      window: record.window,
      baseline: record.baseline,
      current: record.current,
      delta: record.delta,
      baselineStartDate: record.baselineStartDate,
      baselineEndDate: record.baselineEndDate,
      currentStartDate: record.currentStartDate,
      currentEndDate: record.currentEndDate,
      measuredAt: record.measuredAt,
      lastSyncedAt: record.lastSyncedAt,
      sourceWindowDays: record.sourceWindowDays,
    });
  }

  await batch.commit();
}

function findPageMetricForUrl(
  pageMetrics: SearchConsolePageMetricRecord[],
  pageUrl: string,
): SearchConsolePageMetricRecord | null {
  const exact = pageMetrics.find((metric) => metric.pageUrl === pageUrl);
  if (exact) {
    return exact;
  }

  const normalizedTarget = normalizeComparablePageUrl(pageUrl);
  const normalizedMatch = pageMetrics.find((metric) => normalizeComparablePageUrl(metric.pageUrl) === normalizedTarget);
  return normalizedMatch ?? null;
}

function normalizeComparablePageUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname === '/'
      ? '/'
      : parsed.pathname.replace(/\/+$/, '');

    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    if (trimmed === '/') {
      return trimmed;
    }

    return trimmed.replace(/\/+$/, '');
  }
}

function toMetricSnapshot(record: SearchConsolePageMetricRecord): ChangeMeasurementMetricSnapshot {
  return {
    clicks: normalizeMetric(record.clicks),
    impressions: normalizeMetric(record.impressions),
    ctr: normalizeMetric(record.ctr),
    position: normalizeMetric(record.position),
  };
}

function computeMetricDelta(
  baseline: ChangeMeasurementMetricSnapshot,
  current: ChangeMeasurementMetricSnapshot,
): ChangeMeasurementMetricSnapshot {
  return {
    clicks: current.clicks - baseline.clicks,
    impressions: current.impressions - baseline.impressions,
    ctr: current.ctr - baseline.ctr,
    position: current.position - baseline.position,
  };
}

function normalizeMetric(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return value;
}