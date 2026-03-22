export type ActionType =
  | 'update_title'
  | 'update_meta_description'
  | 'update_content'
  | 'update_h1'
  | 'update_h2'
  | 'update_canonical'
  | 'update_robots'
  | 'update_other';

export type ChangeSource =
  | 'chat'
  | 'snippet'
  | 'wordpress_api'
  | 'future_automation';

export type ChangeStatus = 'preview' | 'applied' | 'rolled_back' | 'failed';
export type EntityType = 'page' | 'post' | 'homepage' | 'unknown';

export interface ChangeHistoryEntry {
  id: string;
  projectId: string;
  userId: string;
  siteUrl: string;
  pageUrl: string;
  actionType: ActionType;
  source: ChangeSource;
  status: ChangeStatus;
  beforeValue: string;
  afterValue: string;
  summary: string;
  createdAt: number;
  entityType: EntityType;
  entityId?: string | null;
  errorMessage?: string | null;
  executionTimeMs?: number | null;
  requestId?: string | null;
  actionId?: string | null;
}

export interface ChangeHistoryWriteInput {
  projectId: string;
  userId: string;
  siteUrl: string;
  pageUrl: string;
  actionType: ActionType;
  source: ChangeSource;
  status: ChangeStatus;
  beforeValue: string;
  afterValue: string;
  summary: string;
  createdAt?: number;
  entityType?: EntityType;
  entityId?: string | null;
  errorMessage?: string | null;
  executionTimeMs?: number | null;
  requestId?: string | null;
  actionId?: string | null;
}