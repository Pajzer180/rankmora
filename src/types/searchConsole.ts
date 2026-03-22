export type SearchConsoleConnectionStatus = 'connected' | 'failed' | 'disconnected';
export type SearchConsolePropertyPermissionLevel =
  | 'siteOwner'
  | 'siteFullUser'
  | 'siteRestrictedUser'
  | 'siteUnverifiedUser';
export type SearchConsoleSyncRunStatus = 'success' | 'failed';
export type SearchConsoleProjectSyncStatus = 'synced' | 'skipped' | 'failed';
export type SearchConsolePagesSortBy = 'clicks' | 'impressions' | 'ctr' | 'position';
export type SearchConsoleSortDir = 'asc' | 'desc';

export interface SearchConsolePropertySummary {
  siteUrl: string;
  permissionLevel: SearchConsolePropertyPermissionLevel | string;
}

export interface ProjectSearchConsoleState {
  connectionId: string;
  status: SearchConsoleConnectionStatus;
  selectedPropertyUrl: string | null;
  availableProperties: SearchConsolePropertySummary[];
  connectedAt: number | null;
  updatedAt: number;
  lastSyncedAt: number | null;
  lastError: string | null;
}

export interface SearchConsoleConnectionRecord {
  id: string;
  projectId: string;
  userId: string;
  refreshTokenEncrypted: string;
  scope: string;
  tokenType: string | null;
  status: SearchConsoleConnectionStatus;
  selectedPropertyUrl: string | null;
  availableProperties: SearchConsolePropertySummary[];
  connectedAt: string;
  updatedAt: string;
  lastError: string | null;
}

export interface SearchConsoleDailyMetricRecord {
  projectId: string;
  uid: string;
  propertySiteUrl: string;
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  source: 'gsc';
  syncedAt: number;
}

export interface SearchConsolePageMetricRecord {
  projectId: string;
  uid: string;
  propertySiteUrl: string;
  pageUrl: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  windowDays: number;
  startDate: string;
  endDate: string;
  syncedAt: number;
}

export interface SearchConsoleSyncRunRecord {
  id: string;
  projectId: string;
  uid: string;
  propertySiteUrl: string;
  status: SearchConsoleSyncRunStatus;
  startedAt: number;
  finishedAt: number;
  error: string | null;
  counts: SearchConsoleProjectSyncCounts;
}

export interface SearchConsoleProjectSyncCounts {
  dailyDocumentsWritten: number;
  pageDocumentsWritten: number;
  pageDocumentsDeleted: number;
}

export interface SearchConsoleProjectSyncResult {
  projectId: string;
  uid: string | null;
  propertySiteUrl: string | null;
  status: SearchConsoleProjectSyncStatus;
  reason?: string;
  error?: string;
  startDate?: string;
  endDate?: string;
  counts?: SearchConsoleProjectSyncCounts;
}

export interface SearchConsoleSummaryDailyPoint {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleSummaryResponse {
  projectId: string;
  propertySiteUrl: string;
  windowDays: number;
  totals: {
    clicks: number;
    impressions: number;
    avgCtr: number;
    avgPosition: number;
  };
  trend: {
    daily: SearchConsoleSummaryDailyPoint[];
  };
  freshness: {
    hasData: boolean;
    lastSyncedAt: number | null;
  };
  connected: boolean;
  selectedPropertyUrl: string | null;
}

export interface SearchConsolePagesQuery {
  projectId: string;
  limit: number;
  sortBy: SearchConsolePagesSortBy;
  sortDir: SearchConsoleSortDir;
  search: string;
}

export interface SearchConsolePagesRow {
  pageUrl: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  startDate: string;
  endDate: string;
  syncedAt: number;
}

export interface SearchConsolePagesResponse {
  projectId: string;
  propertySiteUrl: string;
  windowDays: number;
  count: number;
  lastSyncedAt: number | null;
  rows: SearchConsolePagesRow[];
}

export interface SearchConsoleConnectRequestBody {
  projectId: string;
  returnTo?: string;
}

export interface SearchConsoleConnectResponse {
  ok: true;
  authorizationUrl: string;
}

export interface SearchConsoleSitesQuery {
  projectId: string;
}

export interface SearchConsoleSitesResponse {
  ok: true;
  items: SearchConsolePropertySummary[];
  selectedPropertyUrl: string | null;
  lastSyncedAt: number | null;
}

export interface SearchConsoleSelectPropertyRequestBody {
  projectId: string;
  propertyUrl: string;
}

export interface SearchConsoleSelectPropertyResponse {
  ok: true;
  selectedPropertyUrl: string;
}

export interface SearchConsoleCronSyncResponse {
  ok: true;
  startedAt: number;
  finishedAt: number;
  totalConnections: number;
  eligibleProjects: number;
  syncedProjects: number;
  skippedProjects: number;
  failedProjects: number;
  dailyDocumentsWritten: number;
  pageDocumentsWritten: number;
  pageDocumentsDeleted: number;
  results: SearchConsoleProjectSyncResult[];
}