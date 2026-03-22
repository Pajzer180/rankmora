import 'server-only';

import { RouteError } from '@/lib/server/routeError';
import { querySearchConsoleSearchAnalytics } from '@/lib/server/gsc/client';
import {
  SEARCH_CONSOLE_DATA_LAG_DAYS,
  SEARCH_CONSOLE_PAGE_ROW_LIMIT,
  SEARCH_CONSOLE_SYNC_WINDOW_DAYS,
  type GoogleSearchAnalyticsRow,
  type SearchConsoleProjectRecord,
  type SearchConsoleSyncContext,
  type SearchConsoleSyncWindow,
} from '@/lib/server/gsc/types';
import {
  listConnectedSearchConsoleConnections,
  recordSearchConsoleSyncRun,
  replaceSearchConsolePageMetrics,
  writeSearchConsoleDailyMetrics,
} from '@/lib/server/gsc/storage';
import {
  getSearchConsoleProject,
  updateProjectSearchConsoleSummary,
} from '@/lib/searchConsole/repository';
import { getSearchConsoleSyncContext } from '@/lib/server/gsc/service';
import type {
  ProjectSearchConsoleState,
  SearchConsoleCronSyncResponse,
  SearchConsoleDailyMetricRecord,
  SearchConsolePageMetricRecord,
  SearchConsoleProjectSyncCounts,
  SearchConsoleProjectSyncResult,
} from '@/types/searchConsole';

export async function syncAllEligibleSearchConsoleProjects(): Promise<SearchConsoleCronSyncResponse> {
  const startedAt = Date.now();
  const connections = await listConnectedSearchConsoleConnections();
  const results: SearchConsoleProjectSyncResult[] = [];
  let eligibleProjects = 0;
  let syncedProjects = 0;
  let skippedProjects = 0;
  let failedProjects = 0;
  let dailyDocumentsWritten = 0;
  let pageDocumentsWritten = 0;
  let pageDocumentsDeleted = 0;

  for (const connection of connections) {
    const project = await getSearchConsoleProject(connection.projectId);
    const propertySiteUrl = project?.searchConsole?.selectedPropertyUrl?.trim() ?? '';

    if (!project) {
      skippedProjects += 1;
      results.push({
        projectId: connection.projectId,
        uid: connection.userId,
        propertySiteUrl: null,
        status: 'skipped',
        reason: 'project-missing',
      });
      continue;
    }

    if (!propertySiteUrl) {
      skippedProjects += 1;
      results.push({
        projectId: project.id,
        uid: project.uid,
        propertySiteUrl: null,
        status: 'skipped',
        reason: 'selected-property-missing',
      });
      continue;
    }

    eligibleProjects += 1;

    try {
      const result = await syncSearchConsoleProject(project.id);
      syncedProjects += 1;
      dailyDocumentsWritten += result.counts?.dailyDocumentsWritten ?? 0;
      pageDocumentsWritten += result.counts?.pageDocumentsWritten ?? 0;
      pageDocumentsDeleted += result.counts?.pageDocumentsDeleted ?? 0;
      results.push(result);
    } catch (error) {
      failedProjects += 1;
      const routeError = toSearchConsoleSyncError(error);
      results.push({
        projectId: project.id,
        uid: project.uid,
        propertySiteUrl,
        status: 'failed',
        error: routeError.message,
      });
      await updateSearchConsoleProjectSyncSummary(project, null, routeError.message);
    }
  }

  return {
    ok: true,
    startedAt,
    finishedAt: Date.now(),
    totalConnections: connections.length,
    eligibleProjects,
    syncedProjects,
    skippedProjects,
    failedProjects,
    dailyDocumentsWritten,
    pageDocumentsWritten,
    pageDocumentsDeleted,
    results,
  };
}

export async function syncSearchConsoleProject(projectId: string): Promise<SearchConsoleProjectSyncResult> {
  const syncContext = await getSearchConsoleSyncContext(projectId);
  const syncWindow = buildSearchConsoleSyncWindow();
  const startedAt = Date.now();

  try {
    const dailyRows = await fetchDailyRows(syncContext, syncWindow);
    const pageRows = await fetchPageRows(syncContext, syncWindow);
    const syncedAt = Date.now();

    const dailyMetrics = mapDailyMetrics(syncContext, syncWindow, dailyRows, syncedAt);
    const pageMetrics = mapPageMetrics(syncContext, syncWindow, pageRows, syncedAt);

    const counts = await persistSearchConsoleMetrics({
      projectId: syncContext.project.id,
      uid: syncContext.project.uid,
      propertySiteUrl: syncContext.propertySiteUrl,
      dailyMetrics,
      pageMetrics,
    });

    await recordSearchConsoleSyncRun({
      projectId: syncContext.project.id,
      uid: syncContext.project.uid,
      propertySiteUrl: syncContext.propertySiteUrl,
      status: 'success',
      startedAt,
      finishedAt: Date.now(),
      error: null,
      counts,
    });

    await updateSearchConsoleProjectSyncSummary(syncContext.project, syncedAt, null);

    return {
      projectId: syncContext.project.id,
      uid: syncContext.project.uid,
      propertySiteUrl: syncContext.propertySiteUrl,
      status: 'synced',
      startDate: syncWindow.startDate,
      endDate: syncWindow.endDate,
      counts,
    };
  } catch (error) {
    const routeError = toSearchConsoleSyncError(error);
    const failedCounts: SearchConsoleProjectSyncCounts = {
      dailyDocumentsWritten: 0,
      pageDocumentsWritten: 0,
      pageDocumentsDeleted: 0,
    };

    await recordSearchConsoleSyncRun({
      projectId: syncContext.project.id,
      uid: syncContext.project.uid,
      propertySiteUrl: syncContext.propertySiteUrl,
      status: 'failed',
      startedAt,
      finishedAt: Date.now(),
      error: routeError.message,
      counts: failedCounts,
    });

    await updateSearchConsoleProjectSyncSummary(syncContext.project, null, routeError.message);
    throw routeError;
  }
}

function buildSearchConsoleSyncWindow(): SearchConsoleSyncWindow {
  const endDate = addUtcDays(startOfUtcDay(new Date()), -SEARCH_CONSOLE_DATA_LAG_DAYS);
  const startDate = addUtcDays(endDate, -(SEARCH_CONSOLE_SYNC_WINDOW_DAYS - 1));

  return {
    startDate: formatUtcDate(startDate),
    endDate: formatUtcDate(endDate),
    windowDays: SEARCH_CONSOLE_SYNC_WINDOW_DAYS,
  };
}

async function fetchDailyRows(
  syncContext: SearchConsoleSyncContext,
  syncWindow: SearchConsoleSyncWindow,
): Promise<GoogleSearchAnalyticsRow[]> {
  const response = await querySearchConsoleSearchAnalytics({
    accessToken: syncContext.accessToken,
    propertySiteUrl: syncContext.propertySiteUrl,
    request: {
      startDate: syncWindow.startDate,
      endDate: syncWindow.endDate,
      dimensions: ['date'],
      rowLimit: syncWindow.windowDays,
    },
  });

  return Array.isArray(response.rows) ? response.rows : [];
}

async function fetchPageRows(
  syncContext: SearchConsoleSyncContext,
  syncWindow: SearchConsoleSyncWindow,
): Promise<GoogleSearchAnalyticsRow[]> {
  const response = await querySearchConsoleSearchAnalytics({
    accessToken: syncContext.accessToken,
    propertySiteUrl: syncContext.propertySiteUrl,
    request: {
      startDate: syncWindow.startDate,
      endDate: syncWindow.endDate,
      dimensions: ['page'],
      rowLimit: SEARCH_CONSOLE_PAGE_ROW_LIMIT,
    },
  });

  return Array.isArray(response.rows) ? response.rows : [];
}

function mapDailyMetrics(
  syncContext: SearchConsoleSyncContext,
  syncWindow: SearchConsoleSyncWindow,
  rows: GoogleSearchAnalyticsRow[],
  syncedAt: number,
): SearchConsoleDailyMetricRecord[] {
  const rowsByDate = new Map<string, GoogleSearchAnalyticsRow>();
  for (const row of rows) {
    const date = row.keys?.[0]?.trim();
    if (!date) {
      continue;
    }

    rowsByDate.set(date, row);
  }

  const records: SearchConsoleDailyMetricRecord[] = [];
  for (const date of enumerateUtcDateRange(syncWindow.startDate, syncWindow.endDate)) {
    const row = rowsByDate.get(date);
    records.push({
      projectId: syncContext.project.id,
      uid: syncContext.project.uid,
      propertySiteUrl: syncContext.propertySiteUrl,
      date,
      clicks: normalizeMetric(row?.clicks),
      impressions: normalizeMetric(row?.impressions),
      ctr: normalizeMetric(row?.ctr),
      position: normalizeMetric(row?.position),
      source: 'gsc',
      syncedAt,
    });
  }

  return records;
}

function mapPageMetrics(
  syncContext: SearchConsoleSyncContext,
  syncWindow: SearchConsoleSyncWindow,
  rows: GoogleSearchAnalyticsRow[],
  syncedAt: number,
): SearchConsolePageMetricRecord[] {
  return rows
    .map((row) => {
      const pageUrl = row.keys?.[0]?.trim() ?? '';
      if (!pageUrl) {
        return null;
      }

      return {
        projectId: syncContext.project.id,
        uid: syncContext.project.uid,
        propertySiteUrl: syncContext.propertySiteUrl,
        pageUrl,
        clicks: normalizeMetric(row.clicks),
        impressions: normalizeMetric(row.impressions),
        ctr: normalizeMetric(row.ctr),
        position: normalizeMetric(row.position),
        windowDays: syncWindow.windowDays,
        startDate: syncWindow.startDate,
        endDate: syncWindow.endDate,
        syncedAt,
      } satisfies SearchConsolePageMetricRecord;
    })
    .filter((row): row is SearchConsolePageMetricRecord => row !== null);
}

async function persistSearchConsoleMetrics(args: {
  projectId: string;
  uid: string;
  propertySiteUrl: string;
  dailyMetrics: SearchConsoleDailyMetricRecord[];
  pageMetrics: SearchConsolePageMetricRecord[];
}): Promise<SearchConsoleProjectSyncCounts> {
  const dailyDocumentsWritten = await writeSearchConsoleDailyMetrics(args.dailyMetrics);
  const pageResult = await replaceSearchConsolePageMetrics({
    projectId: args.projectId,
    records: args.pageMetrics,
  });

  return {
    dailyDocumentsWritten,
    pageDocumentsWritten: pageResult.written,
    pageDocumentsDeleted: pageResult.deleted,
  };
}

async function updateSearchConsoleProjectSyncSummary(
  project: SearchConsoleProjectRecord,
  lastSyncedAt: number | null,
  lastError: string | null,
): Promise<void> {
  const currentSummary = project.searchConsole;
  if (!currentSummary) {
    return;
  }

  const nextSummary: ProjectSearchConsoleState = {
    ...currentSummary,
    updatedAt: Date.now(),
    lastSyncedAt: lastSyncedAt ?? currentSummary.lastSyncedAt ?? null,
    lastError,
  };

  await updateProjectSearchConsoleSummary(project.id, nextSummary);
}

function toSearchConsoleSyncError(error: unknown): RouteError {
  if (error instanceof RouteError) {
    return error;
  }

  return new RouteError(500, 'Nie udalo sie zsynchronizowac danych Google Search Console.', {
    code: 'SEARCH_CONSOLE_SYNC_FAILED',
  });
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + (days * 24 * 60 * 60 * 1000));
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function enumerateUtcDateRange(startDate: string, endDate: string): string[] {
  const results: string[] = [];
  let cursor = parseUtcDate(startDate);
  const last = parseUtcDate(endDate);

  while (cursor.getTime() <= last.getTime()) {
    results.push(formatUtcDate(cursor));
    cursor = addUtcDays(cursor, 1);
  }

  return results;
}

function parseUtcDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) {
    throw new RouteError(500, 'Nieprawidlowa data synchronizacji Search Console.', {
      code: 'SEARCH_CONSOLE_SYNC_DATE_INVALID',
    });
  }

  return parsed;
}

function normalizeMetric(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return value;
}
