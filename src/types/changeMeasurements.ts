export type ChangeMeasurementWindow = '7d' | '14d' | '30d';

export interface ChangeMeasurementMetricSnapshot {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface ChangeMeasurementRecord {
  id: string;
  jobId: string;
  projectId: string;
  uid: string;
  pageUrl: string;
  window: ChangeMeasurementWindow;
  baseline: ChangeMeasurementMetricSnapshot | null;
  current: ChangeMeasurementMetricSnapshot | null;
  delta: ChangeMeasurementMetricSnapshot | null;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  currentStartDate: string | null;
  currentEndDate: string | null;
  measuredAt: number;
  lastSyncedAt: number | null;
  sourceWindowDays: number | null;
}

export interface ChangeMeasurementRefreshJobResult {
  jobId: string;
  projectId: string;
  status: 'measured' | 'skipped' | 'failed';
  windowsUpdated: ChangeMeasurementWindow[];
  reason?: string;
  error?: string;
}

export interface ChangeMeasurementRefreshCronResponse {
  ok: true;
  startedAt: number;
  finishedAt: number;
  processed: number;
  measured: number;
  skipped: number;
  failed: number;
  results: ChangeMeasurementRefreshJobResult[];
}