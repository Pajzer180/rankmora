import 'server-only';

import {
  SEARCH_CONSOLE_SYNC_WINDOW_DAYS,
} from '@/lib/server/gsc/types';
import {
  getLatestSearchConsoleSyncRun,
  getSearchConsoleCacheContext,
  listSearchConsoleDailyMetrics,
  listSearchConsolePageMetrics,
} from '@/lib/server/gsc/storage';
import type {
  SearchConsoleDailyMetricRecord,
  SearchConsolePageMetricRecord,
  SearchConsolePagesQuery,
  SearchConsolePagesResponse,
  SearchConsolePagesRow,
  SearchConsoleSummaryResponse,
} from '@/types/searchConsole';

export async function getSearchConsoleSummaryFromCache(
  projectId: string,
): Promise<SearchConsoleSummaryResponse> {
  const [context, dailyMetrics, latestSyncRun] = await Promise.all([
    getSearchConsoleCacheContext(projectId),
    listSearchConsoleDailyMetrics(projectId),
    getLatestSearchConsoleSyncRun(projectId),
  ]);

  const recentDailyMetrics = takeMostRecentDailyMetrics(dailyMetrics, SEARCH_CONSOLE_SYNC_WINDOW_DAYS);
  const clicks = recentDailyMetrics.reduce((sum, row) => sum + normalizeMetric(row.clicks), 0);
  const impressions = recentDailyMetrics.reduce((sum, row) => sum + normalizeMetric(row.impressions), 0);
  const avgCtr = impressions > 0 ? clicks / impressions : 0;
  const avgPosition = computeAveragePosition(recentDailyMetrics);
  const lastSyncedAt = resolveLastSyncedAt(latestSyncRun?.finishedAt ?? null, recentDailyMetrics);

  return {
    projectId: context.project.id,
    propertySiteUrl: context.propertySiteUrl,
    windowDays: SEARCH_CONSOLE_SYNC_WINDOW_DAYS,
    totals: {
      clicks,
      impressions,
      avgCtr,
      avgPosition,
    },
    trend: {
      daily: recentDailyMetrics.map((row) => ({
        date: row.date,
        clicks: normalizeMetric(row.clicks),
        impressions: normalizeMetric(row.impressions),
        ctr: normalizeMetric(row.ctr),
        position: normalizeMetric(row.position),
      })),
    },
    freshness: {
      hasData: recentDailyMetrics.length > 0,
      lastSyncedAt,
    },
    connected: true,
    selectedPropertyUrl: context.project.searchConsole?.selectedPropertyUrl ?? context.connection.selectedPropertyUrl,
  };
}

export async function getSearchConsolePagesFromCache(
  query: SearchConsolePagesQuery,
): Promise<SearchConsolePagesResponse> {
  const [context, pageMetrics, latestSyncRun] = await Promise.all([
    getSearchConsoleCacheContext(query.projectId),
    listSearchConsolePageMetrics(query.projectId),
    getLatestSearchConsoleSyncRun(query.projectId),
  ]);

  const filteredRows = filterPageMetrics(pageMetrics, query.search);
  const sortedRows = filteredRows.sort((left, right) => comparePageRows(left, right, query));
  const limitedRows = sortedRows.slice(0, query.limit);
  const lastSyncedAt = resolveLastSyncedAt(latestSyncRun?.finishedAt ?? null, filteredRows);
  const windowDays = limitedRows[0]?.windowDays
    ?? filteredRows[0]?.windowDays
    ?? SEARCH_CONSOLE_SYNC_WINDOW_DAYS;

  return {
    projectId: context.project.id,
    propertySiteUrl: context.propertySiteUrl,
    windowDays,
    count: limitedRows.length,
    lastSyncedAt,
    rows: limitedRows.map(mapPageRow),
  };
}

function takeMostRecentDailyMetrics(
  rows: SearchConsoleDailyMetricRecord[],
  limit: number,
): SearchConsoleDailyMetricRecord[] {
  return rows
    .slice()
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, limit)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function computeAveragePosition(rows: SearchConsoleDailyMetricRecord[]): number {
  if (rows.length === 0) {
    return 0;
  }

  const weighted = rows.reduce((sum, row) => sum + (normalizeMetric(row.position) * normalizeMetric(row.impressions)), 0);
  const impressions = rows.reduce((sum, row) => sum + normalizeMetric(row.impressions), 0);
  if (impressions > 0) {
    return weighted / impressions;
  }

  return rows.reduce((sum, row) => sum + normalizeMetric(row.position), 0) / rows.length;
}

function filterPageMetrics(
  rows: SearchConsolePageMetricRecord[],
  search: string,
): SearchConsolePageMetricRecord[] {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return rows.slice();
  }

  return rows.filter((row) => row.pageUrl.toLowerCase().includes(normalizedSearch));
}

function comparePageRows(
  left: SearchConsolePageMetricRecord,
  right: SearchConsolePageMetricRecord,
  query: SearchConsolePagesQuery,
): number {
  const direction = query.sortDir === 'asc' ? 1 : -1;
  const leftValue = getSortablePageMetricValue(left, query.sortBy);
  const rightValue = getSortablePageMetricValue(right, query.sortBy);

  if (leftValue !== rightValue) {
    return (leftValue - rightValue) * direction;
  }

  return left.pageUrl.localeCompare(right.pageUrl);
}

function getSortablePageMetricValue(
  row: SearchConsolePageMetricRecord,
  sortBy: SearchConsolePagesQuery['sortBy'],
): number {
  switch (sortBy) {
    case 'impressions':
      return normalizeMetric(row.impressions);
    case 'ctr':
      return normalizeMetric(row.ctr);
    case 'position':
      return normalizeMetric(row.position);
    case 'clicks':
    default:
      return normalizeMetric(row.clicks);
  }
}

function mapPageRow(row: SearchConsolePageMetricRecord): SearchConsolePagesRow {
  return {
    pageUrl: row.pageUrl,
    clicks: normalizeMetric(row.clicks),
    impressions: normalizeMetric(row.impressions),
    ctr: normalizeMetric(row.ctr),
    position: normalizeMetric(row.position),
    startDate: row.startDate,
    endDate: row.endDate,
    syncedAt: normalizeMetric(row.syncedAt),
  };
}

function resolveLastSyncedAt(
  latestSyncFinishedAt: number | null,
  rows: Array<{ syncedAt: number }>,
): number | null {
  const candidates = rows
    .map((row) => normalizeMetric(row.syncedAt))
    .filter((value) => value > 0);

  if (typeof latestSyncFinishedAt === 'number' && Number.isFinite(latestSyncFinishedAt) && latestSyncFinishedAt > 0) {
    candidates.push(latestSyncFinishedAt);
  }

  if (candidates.length === 0) {
    return null;
  }

  return Math.max(...candidates);
}

function normalizeMetric(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return value;
}