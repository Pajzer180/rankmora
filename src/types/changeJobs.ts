export type ChangeJobEntityType = 'wp_post' | 'wp_page' | 'meta' | 'snippet';
export type ChangeJobChangeType = 'title' | 'meta_description' | 'h1' | 'content' | 'internal_link' | 'cta' | 'other';
export type ChangeJobSource = 'manual' | 'quick_win' | 'chat' | 'system';
export type ChangeJobStatus = 'draft' | 'preview_ready' | 'approved' | 'applied' | 'rollback_ready' | 'rolled_back' | 'failed';
export type ChangeJobValue = string | Record<string, unknown> | null;

export interface ChangeJobErrorPayload {
  code?: string;
  message?: string;
  details?: Record<string, unknown> | null;
}

export interface ChangeJobRecord {
  id: string;
  projectId: string;
  uid: string;
  quickWinId: string | null;
  pageUrl: string;
  entityType: ChangeJobEntityType;
  entityId: string | null;
  changeType: ChangeJobChangeType;
  beforeValue: ChangeJobValue;
  proposedValue: Exclude<ChangeJobValue, null>;
  appliedValue: ChangeJobValue;
  rollbackValue: ChangeJobValue;
  previewSummary: string;
  source: ChangeJobSource;
  status: ChangeJobStatus;
  requestId: string;
  error: ChangeJobErrorPayload | null;
  createdAt: number;
  updatedAt: number;
  approvedAt: number | null;
  appliedAt: number | null;
  rolledBackAt: number | null;
}