import 'server-only';

import { createHash } from 'crypto';
import { getDocument, setDocument } from '@/lib/server/firestoreRest';
import { getSearchConsoleSyncContext } from '@/lib/server/gsc/service';
import { querySearchConsoleSearchAnalytics } from '@/lib/server/gsc/client';
import {
  SEARCH_CONSOLE_DATA_LAG_DAYS,
  SEARCH_CONSOLE_SYNC_WINDOW_DAYS,
} from '@/lib/server/gsc/types';

const PAGE_QUERIES_COLLECTION = 'search_console_page_queries_28d';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PAGE_QUERIES_ROW_LIMIT = 20;

export interface PageQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface PageQueriesCache {
  projectId: string;
  pageUrl: string;
  startDate: string;
  endDate: string;
  windowDays: number;
  syncedAt: number;
  queries: PageQueryRow[];
}

function buildDocId(projectId: string, pageUrl: string): string {
  const hash = createHash('sha256').update(pageUrl).digest('hex').slice(0, 24);
  return `${projectId}_${hash}`;
}

function buildSyncWindow(): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    - SEARCH_CONSOLE_DATA_LAG_DAYS * 24 * 60 * 60 * 1000,
  );
  const startDate = new Date(
    endDate.getTime() - (SEARCH_CONSOLE_SYNC_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000,
  );

  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  };
}

function normalizeMetric(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

export async function getPageQueriesFromCache(
  projectId: string,
  pageUrl: string,
): Promise<PageQueriesCache | null> {
  const docId = buildDocId(projectId, pageUrl);
  const doc = await getDocument(PAGE_QUERIES_COLLECTION, docId);

  if (!doc.exists) return null;

  const data = doc.data() as unknown as PageQueriesCache;
  if (Date.now() - data.syncedAt > CACHE_TTL_MS) return null;

  return data;
}

export async function fetchAndCachePageQueries(
  projectId: string,
  pageUrl: string,
): Promise<PageQueriesCache> {
  const syncContext = await getSearchConsoleSyncContext(projectId);
  const { startDate, endDate } = buildSyncWindow();

  const response = await querySearchConsoleSearchAnalytics({
    accessToken: syncContext.accessToken,
    propertySiteUrl: syncContext.propertySiteUrl,
    request: {
      startDate,
      endDate,
      dimensions: ['query'],
      dimensionFilterGroups: [
        {
          groupType: 'and',
          filters: [
            {
              dimension: 'page',
              operator: 'equals',
              expression: pageUrl,
            },
          ],
        },
      ],
      rowLimit: PAGE_QUERIES_ROW_LIMIT,
    },
  });

  const rows = Array.isArray(response.rows) ? response.rows : [];
  const queries: PageQueryRow[] = rows
    .map((row) => {
      const query = row.keys?.[0]?.trim() ?? '';
      if (!query) return null;

      return {
        query,
        clicks: normalizeMetric(row.clicks),
        impressions: normalizeMetric(row.impressions),
        ctr: normalizeMetric(row.ctr),
        position: normalizeMetric(row.position),
      };
    })
    .filter((row): row is PageQueryRow => row !== null)
    .sort((a, b) => b.clicks - a.clicks);

  const cacheRecord: PageQueriesCache = {
    projectId,
    pageUrl,
    startDate,
    endDate,
    windowDays: SEARCH_CONSOLE_SYNC_WINDOW_DAYS,
    syncedAt: Date.now(),
    queries,
  };

  const docId = buildDocId(projectId, pageUrl);
  await setDocument(PAGE_QUERIES_COLLECTION, docId, cacheRecord as unknown as Record<string, unknown>);

  return cacheRecord;
}

export async function getPageQueries(
  projectId: string,
  pageUrl: string,
): Promise<PageQueriesCache> {
  const cached = await getPageQueriesFromCache(projectId, pageUrl);
  if (cached) return cached;

  return fetchAndCachePageQueries(projectId, pageUrl);
}
