import 'server-only';

import type {
  ProjectSearchConsoleState,
  SearchConsoleConnectionRecord,
  SearchConsoleDailyMetricRecord,
  SearchConsolePageMetricRecord,
  SearchConsoleProjectSyncCounts,
  SearchConsoleProjectSyncResult,
  SearchConsolePropertySummary,
  SearchConsoleSyncRunRecord,
} from '@/types/searchConsole';

export const GOOGLE_OAUTH_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_SEARCH_CONSOLE_SITES_URL = 'https://www.googleapis.com/webmasters/v3/sites';
export const GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_URL = 'https://www.googleapis.com/webmasters/v3/sites';
export const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const SEARCH_CONSOLE_STATE_MAX_AGE_MS = 10 * 60 * 1000;
export const DEFAULT_SEARCH_CONSOLE_RETURN_TO = '/dashboard/analityka';
export const SEARCH_CONSOLE_OAUTH_STATES_COLLECTION = 'search_console_oauth_states';
export const SEARCH_CONSOLE_DAILY_COLLECTION = 'search_console_daily';
export const SEARCH_CONSOLE_PAGES_28D_COLLECTION = 'search_console_pages_28d';
export const SEARCH_CONSOLE_SYNC_RUNS_COLLECTION = 'search_console_sync_runs';
export const SEARCH_CONSOLE_SYNC_WINDOW_DAYS = 28;
export const SEARCH_CONSOLE_PAGE_ROW_LIMIT = 100;
export const SEARCH_CONSOLE_DATA_LAG_DAYS = 1;

export interface SearchConsoleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface SearchConsoleOAuthStateRecord {
  uid: string;
  projectId: string;
  returnTo: string;
  createdAt: string;
  expiresAt: string;
}

export interface SearchConsoleStoredOAuthState extends SearchConsoleOAuthStateRecord {
  token: string;
}

export interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export interface GoogleSitesListResponse {
  siteEntry?: Array<{
    siteUrl?: string;
    permissionLevel?: string;
  }>;
}

export interface GoogleSearchAnalyticsQueryRequest {
  startDate: string;
  endDate: string;
  dimensions?: Array<'date' | 'page' | 'query'>;
  rowLimit?: number;
  startRow?: number;
  type?: 'web' | 'image' | 'video' | 'news' | 'googleNews' | 'discover';
}

export interface GoogleSearchAnalyticsRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

export interface GoogleSearchAnalyticsResponse {
  rows?: GoogleSearchAnalyticsRow[];
  responseAggregationType?: string;
}

export interface StartSearchConsoleConnectionArgs {
  uid: string;
  projectId: string;
  returnTo?: string;
}

export interface SearchConsoleCallbackArgs {
  code: string | null;
  error: string | null;
  state: string;
}

export interface SearchConsoleCallbackResult {
  returnTo: string;
  status: 'connected' | 'error';
  reason?: string;
}

export interface JsonRequestOptions {
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: BodyInit;
  errorCode: string;
  errorMessage: string;
}

export interface SearchConsoleSitesResult {
  items: SearchConsolePropertySummary[];
  selectedPropertyUrl: string | null;
  lastSyncedAt: number | null;
}

export interface SearchConsoleProjectRecord {
  id: string;
  uid: string;
  domain: string;
  searchConsole?: ProjectSearchConsoleState | null;
}

export interface SearchConsoleConnectionSnapshot {
  project: SearchConsoleProjectRecord;
  connection: SearchConsoleConnectionRecord;
}

export interface SearchConsoleSyncContext {
  project: SearchConsoleProjectRecord;
  connection: SearchConsoleConnectionRecord;
  propertySiteUrl: string;
  accessToken: string;
}

export interface SearchConsoleSyncWindow {
  startDate: string;
  endDate: string;
  windowDays: number;
}

export interface SearchConsolePersistedSyncCounts extends SearchConsoleProjectSyncCounts {
  syncRunId?: string;
}

export interface SearchConsoleProjectIngestPayload {
  projectId: string;
  uid: string;
  propertySiteUrl: string;
  window: SearchConsoleSyncWindow;
  dailyMetrics: SearchConsoleDailyMetricRecord[];
  pageMetrics: SearchConsolePageMetricRecord[];
}

export interface SearchConsoleProjectSyncOutcome extends SearchConsoleProjectSyncResult {
  syncRun?: SearchConsoleSyncRunRecord;
}