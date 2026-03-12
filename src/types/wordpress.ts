import type { ActionType, ChangeSource, EntityType } from '@/types/history';

export type WordPressConnectionStatus = 'connected' | 'failed' | 'disconnected';
export type WordPressJobStatus = 'preview' | 'applied' | 'failed';
export type WordPressTargetType = 'page' | 'post';
export type WordPressTargetTypePlural = 'pages' | 'posts';
export type WordPressChangedField = 'title' | 'content';
export type WordPressApplyMethod = 'POST' | 'PUT' | 'PATCH';

export interface WordPressConnectionRecord {
  id: string;
  userId: string;
  projectId?: string | null;
  siteUrl: string;
  wpUsername: string;
  appPasswordEncrypted: string;
  status: WordPressConnectionStatus;
  lastTestAt: string;
  lastVerifiedUser?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WordPressJobSnapshot {
  title: string;
  content: string;
}

export interface WordPressJobUpdatePayload {
  title?: string;
  content?: string;
}

export interface WordPressJobRecord {
  id: string;
  userId: string;
  connectionId: string;
  projectId?: string | null;
  connectionSiteUrl?: string | null;
  type: 'update_page_title_content';
  targetType: WordPressTargetType;
  targetId: number;
  targetUrl?: string | null;
  before: WordPressJobSnapshot;
  after: WordPressJobUpdatePayload;
  changedFields: WordPressChangedField[];
  status: WordPressJobStatus;
  error?: string | null;
  createdAt: string;
  appliedAt?: string | null;
}

export interface WordPressItemSummary {
  id: number;
  title: string;
  slug: string;
  status: string;
  link: string;
  targetType: WordPressTargetType;
}

export interface WordPressConnectRequestBody {
  projectId?: string;
  siteUrl: string;
  wpUsername: string;
  applicationPassword: string;
}

export interface WordPressConnectResponse {
  ok: true;
  status: 'connected';
  siteUrl: string;
  verifiedUser: string;
  connectionId: string;
}

export interface WordPressFetchRequestBody {
  projectId?: string;
  targetType: WordPressTargetTypePlural;
  search?: string;
}

export interface WordPressFetchResponse {
  ok: true;
  targetType: WordPressTargetTypePlural;
  items: WordPressItemSummary[];
}

export interface WordPressPreviewRequestBody {
  projectId?: string;
  targetType: WordPressTargetType;
  targetId: number;
  suggestedTitle?: string;
  suggestedContent?: string;
}

export interface WordPressPreviewResponse {
  ok: true;
  jobId: string;
  status: 'preview';
  targetType: WordPressTargetType;
  targetId: number;
  targetUrl?: string | null;
  currentTitle: string;
  currentContent: string;
  suggestedTitle: string;
  suggestedContent: string;
  changedFields: WordPressChangedField[];
  createdAt: string;
}

export interface WordPressApplyJobRequestBody {
  jobId: string;
}

export interface WordPressLegacyApplyRequestBody {
  projectId: string;
  siteUrl: string;
  pageUrl: string;
  actionType: ActionType;
  source?: ChangeSource;
  beforeValue?: string;
  afterValue: string;
  summary: string;
  entityType?: EntityType;
  entityId?: string | null;
  requestId?: string | null;
  actionId?: string | null;
  endpoint: string;
  method?: WordPressApplyMethod;
  payload?: Record<string, unknown> | null;
}

export type WordPressApplyRequestBody = WordPressApplyJobRequestBody | WordPressLegacyApplyRequestBody;

export interface WordPressApplyResponse {
  ok: true;
  status: 'applied';
  jobId: string;
  updatedItem: WordPressItemSummary;
}

export interface WordPressDisconnectRequestBody {
  projectId: string;
}

export interface WordPressDisconnectResponse {
  ok: true;
  status: 'disconnected';
}