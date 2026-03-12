import 'server-only';

import { randomUUID } from 'crypto';
import { writeChangeHistory } from '@/lib/changeHistory';
import {
  createChangeJob,
  getChangeJob,
  markChangeJobApplied,
  markChangeJobFailed,
  updateChangeJob,
} from '@/lib/server/changeJobs';
import {
  assertProjectOwnedByUser,
  RouteError,
} from '@/lib/server/firebaseAuth';
import { decryptSecret, encryptSecret } from '@/lib/server/secretCrypto';
import {
  normalizeWordPressSiteUrl,
  wordpressRequest,
  WordPressApiError,
} from '@/lib/wordpress/client';
import {
  createWordPressJob,
  getWordPressConnection,
  getWordPressJob,
  saveWordPressConnection,
  updateProjectWordPressSummary,
  updateWordPressJob,
} from '@/lib/wordpress/repository';
import type {
  ChangeJobChangeType,
  ChangeJobErrorPayload,
  ChangeJobRecord,
  ChangeJobValue,
} from '@/types/changeJobs';
import type { ActionType, ChangeSource, EntityType } from '@/types/history';
import type { ProjectWordPressState } from '@/types/project';
import type {
  WordPressApplyResponse,
  WordPressChangedField,
  WordPressConnectResponse,
  WordPressConnectionRecord,
  WordPressFetchResponse,
  WordPressItemSummary,
  WordPressJobRecord,
  WordPressPreviewResponse,
  WordPressTargetType,
  WordPressTargetTypePlural,
} from '@/types/wordpress';

interface WordPressUserResponse {
  id?: number;
  name?: string;
  slug?: string;
}

interface WordPressTextField {
  raw?: string;
  rendered?: string;
}

interface WordPressYoastHeadJson {
  description?: string;
}

interface WordPressResourceResponse {
  id: number;
  slug?: string;
  status?: string;
  link?: string;
  title?: WordPressTextField;
  content?: WordPressTextField;
  meta?: Record<string, unknown>;
  yoast_head_json?: WordPressYoastHeadJson | null;
}

interface ConnectWordPressArgs {
  uid: string;
  projectId?: string | null;
  siteUrl: string;
  wpUsername: string;
  applicationPassword: string;
}

interface PreviewWordPressArgs {
  uid: string;
  projectId?: string | null;
  targetType: WordPressTargetType;
  targetId: number;
  suggestedTitle?: string;
  suggestedContent?: string;
  suggestedMetaDescription?: string;
}

interface PreparedPreviewChangeSet {
  changeType: ChangeJobChangeType;
  changedFields: WordPressChangedField[];
  beforeValue: Record<string, unknown>;
  proposedValue: Record<string, unknown>;
  legacyAfter: WordPressJobRecord['after'];
  previewSummary: string;
  suggestedTitle: string;
  suggestedContent: string;
  suggestedMetaDescription: string;
}

interface CurrentWordPressSnapshot {
  title: string;
  content: string;
  metaDescription: string | null;
}

interface CanonicalWordPressApplyPlan {
  targetType: WordPressTargetType;
  targetId: number;
  beforeValue: Record<string, unknown>;
  proposedValue: Record<string, unknown>;
  changedFields: WordPressChangedField[];
}

const META_DESCRIPTION_KEYS = [
  'description',
  'meta_description',
  '_yoast_wpseo_metadesc',
  'yoast_wpseo_metadesc',
  'rank_math_description',
  '_aioseo_description',
  'aioseo_description',
] as const;

function nowIso(): string {
  return new Date().toISOString();
}

function pluralizeTargetType(targetType: WordPressTargetType): WordPressTargetTypePlural {
  return targetType === 'page' ? 'pages' : 'posts';
}

function singularizeTargetType(targetType: WordPressTargetTypePlural): WordPressTargetType {
  return targetType === 'pages' ? 'page' : 'post';
}

function normalizeUsername(input: string): string {
  const value = input.trim();
  if (!value) {
    throw new RouteError(400, 'Podaj WP Username.');
  }
  return value;
}

function normalizeApplicationPassword(input: string): string {
  const value = input.replace(/\s+/g, '').trim();
  if (!value) {
    throw new RouteError(400, 'Podaj Application Password.');
  }
  return value;
}

function extractFieldValue(field?: WordPressTextField): string {
  if (typeof field?.raw === 'string') return field.raw;
  if (typeof field?.rendered === 'string') return field.rendered;
  return '';
}

function extractOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getMetaDescriptionCandidates(resource: WordPressResourceResponse): Array<{
  key: string;
  value: string | null;
}> {
  const meta = resource.meta;
  if (!meta || typeof meta !== 'object') {
    return [];
  }

  return META_DESCRIPTION_KEYS
    .filter((key) => key in meta)
    .map((key) => ({
      key,
      value: extractOptionalString(meta[key]),
    }));
}

function extractMetaDescription(resource: WordPressResourceResponse): string | null {
  const yoastDescription = extractOptionalString(resource.yoast_head_json?.description);
  if (yoastDescription) {
    return yoastDescription;
  }

  const candidate = getMetaDescriptionCandidates(resource)
    .find((entry) => entry.value !== null);

  return candidate?.value ?? null;
}

function buildCurrentWordPressSnapshot(resource: WordPressResourceResponse): CurrentWordPressSnapshot {
  return {
    title: extractFieldValue(resource.title),
    content: extractFieldValue(resource.content),
    metaDescription: extractMetaDescription(resource),
  };
}

function normalizeWordPressItem(
  resource: WordPressResourceResponse,
  targetType: WordPressTargetType,
): WordPressItemSummary {
  return {
    id: resource.id,
    title: extractFieldValue(resource.title) || '(bez tytulu)',
    slug: resource.slug ?? '',
    status: resource.status ?? 'unknown',
    link: resource.link ?? '',
    targetType,
  };
}

function buildProjectWordPressState(
  connectionId: string,
  siteUrl: string,
  wpUsername: string,
  status: ProjectWordPressState['status'],
  lastError: string | null,
  lastVerifiedUser?: string | null,
): ProjectWordPressState {
  return {
    connectionId,
    siteUrl,
    wpUsername,
    status,
    lastCheckedAt: Date.now(),
    lastError,
    lastVerifiedUser: lastVerifiedUser ?? null,
  };
}

function normalizePreviewInput(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return value.trim().length > 0 ? value : undefined;
}

function resolvePreviewProjectId(
  explicitProjectId: string | null | undefined,
  connection: WordPressConnectionRecord,
): string {
  const requestedProjectId = explicitProjectId?.trim() ?? '';
  const connectionProjectId = connection.projectId?.trim() ?? '';

  if (requestedProjectId && connectionProjectId && requestedProjectId !== connectionProjectId) {
    throw new RouteError(409, 'To polaczenie WordPress jest przypisane do innego projektu.', {
      code: 'WORDPRESS_PROJECT_MISMATCH',
    });
  }

  const resolvedProjectId = requestedProjectId || connectionProjectId;
  if (!resolvedProjectId) {
    throw new RouteError(409, 'Brakuje projektu dla polaczenia WordPress.', {
      code: 'WORDPRESS_PROJECT_MISSING',
    });
  }

  return resolvedProjectId;
}

function mapSingleFieldToChangeType(field: WordPressChangedField): ChangeJobChangeType {
  switch (field) {
    case 'title':
      return 'title';
    case 'content':
      return 'content';
    case 'meta_description':
      return 'meta_description';
    default:
      return 'other';
  }
}

function formatChangedField(field: WordPressChangedField): string {
  if (field === 'meta_description') {
    return 'meta description';
  }

  return field;
}

function buildPreviewSummary(args: {
  targetType: WordPressTargetType;
  targetId: number;
  targetUrl: string;
  currentTitle: string;
  changedFields: WordPressChangedField[];
}): string {
  const fieldSummary = args.changedFields.map(formatChangedField).join(', ');
  const entityLabel = args.targetType === 'page' ? 'strony' : 'wpisu';
  const targetLabel = args.currentTitle.trim() || args.targetUrl || `ID ${args.targetId}`;
  return `Zmiana ${fieldSummary} dla ${entityLabel} ${targetLabel}`;
}

function supportsLegacyWordPressPreview(changedFields: WordPressChangedField[]): boolean {
  return changedFields.length > 0
    && changedFields.every((field) => field === 'title' || field === 'content');
}

function preparePreviewChangeSet(args: {
  targetType: WordPressTargetType;
  targetId: number;
  targetUrl: string;
  currentTitle: string;
  currentContent: string;
  currentMetaDescription: string | null;
  suggestedTitle?: string;
  suggestedContent?: string;
  suggestedMetaDescription?: string;
}): PreparedPreviewChangeSet {
  const nextTitle = normalizePreviewInput(args.suggestedTitle);
  const nextContent = normalizePreviewInput(args.suggestedContent);
  const nextMetaDescription = normalizePreviewInput(args.suggestedMetaDescription);
  const currentMetaDescription = args.currentMetaDescription;
  const beforeValue: Record<string, unknown> = {};
  const proposedValue: Record<string, unknown> = {};
  const legacyAfter: WordPressJobRecord['after'] = {};
  const changedFields: WordPressChangedField[] = [];

  if (nextTitle !== undefined && nextTitle !== args.currentTitle) {
    beforeValue.title = args.currentTitle;
    proposedValue.title = nextTitle;
    legacyAfter.title = nextTitle;
    changedFields.push('title');
  }

  if (nextContent !== undefined && nextContent !== args.currentContent) {
    beforeValue.content = args.currentContent;
    proposedValue.content = nextContent;
    legacyAfter.content = nextContent;
    changedFields.push('content');
  }

  if (nextMetaDescription !== undefined && nextMetaDescription !== (currentMetaDescription ?? '')) {
    beforeValue.metaDescription = currentMetaDescription;
    proposedValue.metaDescription = nextMetaDescription;
    changedFields.push('meta_description');
  }

  if (!changedFields.length) {
    throw new RouteError(400, 'Podaj nowy title, content lub meta description, aby utworzyc podglad.');
  }

  const changeType = changedFields.length === 1
    ? mapSingleFieldToChangeType(changedFields[0])
    : 'other';

  return {
    changeType,
    changedFields,
    beforeValue,
    proposedValue,
    legacyAfter,
    previewSummary: buildPreviewSummary({
      targetType: args.targetType,
      targetId: args.targetId,
      targetUrl: args.targetUrl,
      currentTitle: args.currentTitle,
      changedFields,
    }),
    suggestedTitle: nextTitle ?? args.currentTitle,
    suggestedContent: nextContent ?? args.currentContent,
    suggestedMetaDescription: nextMetaDescription ?? currentMetaDescription ?? '',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildChangeJobErrorPayload(
  code: string,
  message: string,
  details: Record<string, unknown> | null = null,
): ChangeJobErrorPayload {
  return {
    code,
    message,
    details,
  };
}

function getRouteErrorDetailsRecord(error: RouteError): Record<string, unknown> | null {
  return isRecord(error.details) ? error.details : null;
}

function buildChangeJobFailurePayload(
  error: RouteError,
  fallbackCode: string,
  details: Record<string, unknown> | null = null,
): ChangeJobErrorPayload {
  const errorDetails = getRouteErrorDetailsRecord(error);
  const code = typeof errorDetails?.code === 'string'
    ? errorDetails.code
    : fallbackCode;
  const mergedDetails = {
    ...(errorDetails ?? {}),
    ...(details ?? {}),
  };

  if ('code' in mergedDetails) {
    delete mergedDetails.code;
  }

  return buildChangeJobErrorPayload(
    code,
    error.message,
    Object.keys(mergedDetails).length > 0 ? mergedDetails : null,
  );
}

function resolveChangeJobTargetType(entityType: ChangeJobRecord['entityType']): WordPressTargetType {
  switch (entityType) {
    case 'wp_page':
      return 'page';
    case 'wp_post':
      return 'post';
    default:
      throw new RouteError(409, 'Ten change job nie wspiera WordPress apply.', {
        code: 'CHANGE_JOB_TARGET_UNSUPPORTED',
        entityType,
      });
  }
}

function resolveChangeJobTargetId(entityId: string | null): number {
  const normalized = entityId?.trim() ?? '';
  const parsed = Number(normalized);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RouteError(409, 'Change job ma nieprawidlowy target.', {
      code: 'CHANGE_JOB_TARGET_INVALID',
      entityId,
    });
  }

  return parsed;
}

function normalizeChangeJobValueForApply(
  value: ChangeJobValue,
  changeType: ChangeJobChangeType,
  valueLabel: 'beforeValue' | 'proposedValue',
): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value === 'string') {
    switch (changeType) {
      case 'title':
        return { title: value };
      case 'content':
        return { content: value };
      case 'meta_description':
        return { metaDescription: value };
      default:
        break;
    }
  }

  if (value === null && valueLabel === 'beforeValue' && changeType === 'meta_description') {
    return { metaDescription: null };
  }
  throw new RouteError(409, `Change job ma nieprawidlowe ${valueLabel}.`, {
    code: 'CHANGE_JOB_INVALID_PAYLOAD',
    valueLabel,
    changeType,
  });
}

function extractChangedFieldsFromProposedValue(
  proposedValue: Record<string, unknown>,
): WordPressChangedField[] {
  const changedFields: WordPressChangedField[] = [];

  if ('title' in proposedValue) {
    if (typeof proposedValue.title !== 'string') {
      throw new RouteError(409, 'Change job ma nieprawidlowa proposedValue.title.', {
        code: 'CHANGE_JOB_INVALID_PAYLOAD',
        field: 'title',
      });
    }
    changedFields.push('title');
  }

  if ('content' in proposedValue) {
    if (typeof proposedValue.content !== 'string') {
      throw new RouteError(409, 'Change job ma nieprawidlowa proposedValue.content.', {
        code: 'CHANGE_JOB_INVALID_PAYLOAD',
        field: 'content',
      });
    }
    changedFields.push('content');
  }

  if ('metaDescription' in proposedValue) {
    if (typeof proposedValue.metaDescription !== 'string') {
      throw new RouteError(409, 'Change job ma nieprawidlowa proposedValue.metaDescription.', {
        code: 'CHANGE_JOB_INVALID_PAYLOAD',
        field: 'metaDescription',
      });
    }
    changedFields.push('meta_description');
  }

  if (!changedFields.length) {
    throw new RouteError(409, 'Change job nie zawiera wspieranych zmian do wdrozenia.', {
      code: 'CHANGE_JOB_UNSUPPORTED_CHANGE',
    });
  }

  return changedFields;
}

function getBeforeFieldValue(
  beforeValue: Record<string, unknown>,
  field: WordPressChangedField,
): string | null {
  switch (field) {
    case 'title':
      if (typeof beforeValue.title !== 'string') {
        throw new RouteError(409, 'Change job ma nieprawidlowa beforeValue.title.', {
          code: 'CHANGE_JOB_INVALID_PAYLOAD',
          field: 'title',
        });
      }
      return beforeValue.title;
    case 'content':
      if (typeof beforeValue.content !== 'string') {
        throw new RouteError(409, 'Change job ma nieprawidlowa beforeValue.content.', {
          code: 'CHANGE_JOB_INVALID_PAYLOAD',
          field: 'content',
        });
      }
      return beforeValue.content;
    case 'meta_description':
      if (beforeValue.metaDescription !== null && typeof beforeValue.metaDescription !== 'string') {
        throw new RouteError(409, 'Change job ma nieprawidlowa beforeValue.metaDescription.', {
          code: 'CHANGE_JOB_INVALID_PAYLOAD',
          field: 'metaDescription',
        });
      }
      return (beforeValue.metaDescription as string | null | undefined) ?? null;
    default:
      return null;
  }
}

function getProposedFieldValue(
  proposedValue: Record<string, unknown>,
  field: WordPressChangedField,
): string {
  switch (field) {
    case 'title':
      if (typeof proposedValue.title !== 'string') {
        throw new RouteError(409, 'Change job ma nieprawidlowa proposedValue.title.', {
          code: 'CHANGE_JOB_INVALID_PAYLOAD',
          field: 'title',
        });
      }
      return proposedValue.title;
    case 'content':
      if (typeof proposedValue.content !== 'string') {
        throw new RouteError(409, 'Change job ma nieprawidlowa proposedValue.content.', {
          code: 'CHANGE_JOB_INVALID_PAYLOAD',
          field: 'content',
        });
      }
      return proposedValue.content;
    case 'meta_description':
      if (typeof proposedValue.metaDescription !== 'string') {
        throw new RouteError(409, 'Change job ma nieprawidlowa proposedValue.metaDescription.', {
          code: 'CHANGE_JOB_INVALID_PAYLOAD',
          field: 'metaDescription',
        });
      }
      return proposedValue.metaDescription;
    default:
      return '';
  }
}

function getCurrentFieldValue(
  snapshot: CurrentWordPressSnapshot,
  field: WordPressChangedField,
): string | null {
  switch (field) {
    case 'title':
      return snapshot.title;
    case 'content':
      return snapshot.content;
    case 'meta_description':
      return snapshot.metaDescription;
    default:
      return null;
  }
}

function detectChangeJobConflictFields(args: {
  changedFields: WordPressChangedField[];
  beforeValue: Record<string, unknown>;
  currentSnapshot: CurrentWordPressSnapshot;
}): WordPressChangedField[] {
  const conflicts: WordPressChangedField[] = [];

  for (const field of args.changedFields) {
    const expectedValue = getBeforeFieldValue(args.beforeValue, field);
    const currentValue = getCurrentFieldValue(args.currentSnapshot, field);
    if (currentValue !== expectedValue) {
      conflicts.push(field);
    }
  }

  return conflicts;
}

function resolveMetaDescriptionUpdateKeys(
  resource: WordPressResourceResponse,
  expectedBeforeValue: string | null,
): string[] {
  const candidates = getMetaDescriptionCandidates(resource);
  if (!candidates.length) {
    return [];
  }

  const matchingKeys = candidates
    .filter((candidate) => candidate.value === expectedBeforeValue)
    .map((candidate) => candidate.key);

  return matchingKeys.length > 0
    ? matchingKeys
    : [candidates[0].key];
}

function buildWordPressApplyPayload(args: {
  resource: WordPressResourceResponse;
  changedFields: WordPressChangedField[];
  beforeValue: Record<string, unknown>;
  proposedValue: Record<string, unknown>;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const field of args.changedFields) {
    switch (field) {
      case 'title':
        payload.title = getProposedFieldValue(args.proposedValue, 'title');
        break;
      case 'content':
        payload.content = getProposedFieldValue(args.proposedValue, 'content');
        break;
      case 'meta_description': {
        const expectedBeforeValue = getBeforeFieldValue(args.beforeValue, 'meta_description');
        const nextValue = getProposedFieldValue(args.proposedValue, 'meta_description');
        const keys = resolveMetaDescriptionUpdateKeys(args.resource, expectedBeforeValue);
        if (!keys.length) {
          throw new RouteError(409, 'Nie mozna zastosowac meta description dla tego change job.', {
            code: 'CHANGE_JOB_TARGET_UNSUPPORTED',
            field: 'metaDescription',
          });
        }

        const metaPayload: Record<string, string> = {};
        for (const key of keys) {
          metaPayload[key] = nextValue;
        }
        payload.meta = metaPayload;
        break;
      }
      default:
        break;
    }
  }

  if (!Object.keys(payload).length) {
    throw new RouteError(409, 'Change job nie zawiera wspieranych zmian do wdrozenia.', {
      code: 'CHANGE_JOB_UNSUPPORTED_CHANGE',
    });
  }

  return payload;
}

function buildCanonicalApplyPlan(job: ChangeJobRecord): CanonicalWordPressApplyPlan {
  const proposedValue = normalizeChangeJobValueForApply(job.proposedValue, job.changeType, 'proposedValue');

  return {
    targetType: resolveChangeJobTargetType(job.entityType),
    targetId: resolveChangeJobTargetId(job.entityId),
    beforeValue: normalizeChangeJobValueForApply(job.beforeValue, job.changeType, 'beforeValue'),
    proposedValue,
    changedFields: extractChangedFieldsFromProposedValue(proposedValue),
  };
}

function mapChangeJobChangeTypeToHistoryActionType(changeType: ChangeJobChangeType): ActionType {
  switch (changeType) {
    case 'title':
      return 'update_title';
    case 'meta_description':
      return 'update_meta_description';
    case 'content':
      return 'update_content';
    case 'h1':
      return 'update_h1';
    default:
      return 'update_other';
  }
}

function mapChangeJobSourceToHistorySource(source: ChangeJobRecord['source']): ChangeSource {
  switch (source) {
    case 'chat':
      return 'chat';
    case 'manual':
      return 'wordpress_api';
    case 'quick_win':
    case 'system':
    default:
      return 'future_automation';
  }
}

function mapChangeJobEntityTypeToHistoryEntityType(entityType: ChangeJobRecord['entityType']): EntityType {
  switch (entityType) {
    case 'wp_page':
      return 'page';
    case 'wp_post':
      return 'post';
    default:
      return 'unknown';
  }
}

function serializeChangeJobValueForHistory(
  value: ChangeJobValue,
  changeType: ChangeJobChangeType,
): string {
  if (value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (!isRecord(value)) {
    return JSON.stringify(value);
  }

  switch (changeType) {
    case 'title':
      return typeof value.title === 'string' ? value.title : JSON.stringify(value);
    case 'content':
      return typeof value.content === 'string' ? value.content : JSON.stringify(value);
    case 'meta_description':
      return typeof value.metaDescription === 'string'
        ? value.metaDescription
        : value.metaDescription === null
          ? ''
          : JSON.stringify(value);
    default:
      return JSON.stringify(value);
  }
}

function assertChangeJobApplyState(job: ChangeJobRecord): void {
  switch (job.status) {
    case 'preview_ready':
      return;
    case 'applied':
      throw new RouteError(409, 'Ten change job zostal juz zastosowany.', {
        code: 'CHANGE_JOB_ALREADY_APPLIED',
        jobId: job.id,
      });
    case 'rolled_back':
      throw new RouteError(409, 'Ten change job zostal juz wycofany.', {
        code: 'CHANGE_JOB_ALREADY_ROLLED_BACK',
        jobId: job.id,
      });
    case 'failed':
      throw new RouteError(409, 'Ten change job jest oznaczony jako failed i nie moze byc zastosowany.', {
        code: 'CHANGE_JOB_FAILED',
        jobId: job.id,
      });
    default:
      throw new RouteError(409, 'Ten change job nie jest gotowy do zastosowania.', {
        code: 'CHANGE_JOB_INVALID_STATE',
        jobId: job.id,
        status: job.status,
      });
  }
}

async function writeAppliedChangeJobHistory(args: {
  job: ChangeJobRecord;
  uid: string;
  siteUrl: string;
  executionTimeMs: number;
}): Promise<void> {
  await writeChangeHistory({
    projectId: args.job.projectId,
    userId: args.uid,
    siteUrl: args.siteUrl,
    pageUrl: args.job.pageUrl,
    actionType: mapChangeJobChangeTypeToHistoryActionType(args.job.changeType),
    source: mapChangeJobSourceToHistorySource(args.job.source),
    status: 'applied',
    beforeValue: serializeChangeJobValueForHistory(args.job.beforeValue, args.job.changeType),
    afterValue: serializeChangeJobValueForHistory(args.job.proposedValue, args.job.changeType),
    summary: args.job.previewSummary,
    entityType: mapChangeJobEntityTypeToHistoryEntityType(args.job.entityType),
    entityId: args.job.entityId,
    requestId: args.job.requestId,
    actionId: args.job.id,
    executionTimeMs: args.executionTimeMs,
  });
}

async function failLegacyWordPressJob(jobId: string, message: string): Promise<void> {
  const legacyJob = await getWordPressJob(jobId);
  if (!legacyJob) {
    return;
  }

  await updateWordPressJob(jobId, {
    status: 'failed',
    error: message,
  });
}

async function markLegacyWordPressJobAppliedIfPresent(args: {
  jobId: string;
  targetUrl: string | null;
}): Promise<void> {
  const legacyJob = await getWordPressJob(args.jobId);
  if (!legacyJob) {
    return;
  }

  await updateWordPressJob(args.jobId, {
    status: 'applied',
    appliedAt: nowIso(),
    error: null,
    targetUrl: args.targetUrl,
  });
}

function buildRouteError(error: unknown, fallbackMessage: string): RouteError {
  if (error instanceof RouteError) {
    return error;
  }

  if (error instanceof WordPressApiError) {
    const status = error.status === 401 || error.status === 403 ? 401 : 502;
    return new RouteError(status, error.message || fallbackMessage, error.details);
  }

  return new RouteError(500, fallbackMessage);
}

async function syncProjectSummary(
  projectId: string | null | undefined,
  summary: ProjectWordPressState | null,
): Promise<void> {
  if (!projectId) return;
  await updateProjectWordPressSummary(projectId, summary);
}

async function getConnectedWordPressAuth(uid: string): Promise<{
  connection: WordPressConnectionRecord;
  applicationPassword: string;
}> {
  const connection = await getWordPressConnection(uid);
  if (!connection) {
    throw new RouteError(404, 'Brak zapisanego polaczenia WordPress.');
  }

  if (connection.status !== 'connected' || !connection.appPasswordEncrypted) {
    throw new RouteError(409, 'Najpierw polacz i zweryfikuj WordPress.');
  }

  try {
    const applicationPassword = decryptSecret(connection.appPasswordEncrypted);
    return { connection, applicationPassword };
  } catch {
    throw new RouteError(500, 'Nie mozna odczytac zapisanych danych WordPress.');
  }
}

async function markRuntimeConnectionFailure(
  connection: WordPressConnectionRecord,
  message: string,
): Promise<void> {
  const timestamp = nowIso();
  await saveWordPressConnection({
    userId: connection.userId,
    projectId: connection.projectId ?? null,
    siteUrl: connection.siteUrl,
    wpUsername: connection.wpUsername,
    appPasswordEncrypted: connection.appPasswordEncrypted,
    status: 'failed',
    lastTestAt: timestamp,
    lastVerifiedUser: connection.lastVerifiedUser ?? null,
    lastError: message,
    createdAt: connection.createdAt,
    updatedAt: timestamp,
  });

  await syncProjectSummary(
    connection.projectId,
    buildProjectWordPressState(
      connection.id,
      connection.siteUrl,
      connection.wpUsername,
      'failed',
      message,
      connection.lastVerifiedUser ?? null,
    ),
  );
}

export async function connectWordPressConnection(
  args: ConnectWordPressArgs,
): Promise<WordPressConnectResponse> {
  const timestamp = nowIso();
  const existing = await getWordPressConnection(args.uid);
  const siteUrl = normalizeWordPressSiteUrl(args.siteUrl);
  const wpUsername = normalizeUsername(args.wpUsername);
  const applicationPassword = normalizeApplicationPassword(args.applicationPassword);

  try {
    const verifiedUserResponse = await wordpressRequest<WordPressUserResponse>({
      siteUrl,
      username: wpUsername,
      applicationPassword,
      path: '/wp-json/wp/v2/users/me',
      method: 'GET',
    });

    const verifiedUser = verifiedUserResponse.name?.trim()
      || verifiedUserResponse.slug?.trim()
      || wpUsername;

    const connection = await saveWordPressConnection({
      userId: args.uid,
      projectId: args.projectId ?? existing?.projectId ?? null,
      siteUrl,
      wpUsername,
      appPasswordEncrypted: encryptSecret(applicationPassword),
      status: 'connected',
      lastTestAt: timestamp,
      lastVerifiedUser: verifiedUser,
      lastError: null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });

    await syncProjectSummary(
      connection.projectId,
      buildProjectWordPressState(
        connection.id,
        connection.siteUrl,
        connection.wpUsername,
        'connected',
        null,
        verifiedUser,
      ),
    );

    return {
      ok: true,
      status: 'connected',
      siteUrl: connection.siteUrl,
      verifiedUser,
      connectionId: connection.id,
    };
  } catch (error) {
    const routeError = buildRouteError(error, 'Nie udalo sie zweryfikowac polaczenia WordPress.');

    await saveWordPressConnection({
      userId: args.uid,
      projectId: args.projectId ?? existing?.projectId ?? null,
      siteUrl,
      wpUsername,
      appPasswordEncrypted: '',
      status: 'failed',
      lastTestAt: timestamp,
      lastVerifiedUser: existing?.lastVerifiedUser ?? null,
      lastError: routeError.message,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });

    await syncProjectSummary(
      args.projectId ?? existing?.projectId ?? null,
      buildProjectWordPressState(
        args.uid,
        siteUrl,
        wpUsername,
        'failed',
        routeError.message,
        existing?.lastVerifiedUser ?? null,
      ),
    );

    throw routeError;
  }
}

export async function disconnectWordPressConnection(
  uid: string,
  projectId?: string | null,
): Promise<void> {
  const timestamp = nowIso();
  const connection = await getWordPressConnection(uid);

  if (connection) {
    await saveWordPressConnection({
      userId: uid,
      projectId: projectId ?? connection.projectId ?? null,
      siteUrl: connection.siteUrl,
      wpUsername: connection.wpUsername,
      appPasswordEncrypted: '',
      status: 'disconnected',
      lastTestAt: timestamp,
      lastVerifiedUser: connection.lastVerifiedUser ?? null,
      lastError: null,
      createdAt: connection.createdAt,
      updatedAt: timestamp,
    });
  }

  await syncProjectSummary(
    projectId ?? connection?.projectId ?? null,
    connection
      ? buildProjectWordPressState(
          uid,
          connection.siteUrl,
          connection.wpUsername,
          'disconnected',
          null,
          connection.lastVerifiedUser ?? null,
        )
      : null,
  );
}

export async function fetchWordPressItems(
  uid: string,
  targetType: WordPressTargetTypePlural,
  search?: string,
): Promise<WordPressFetchResponse> {
  const { connection, applicationPassword } = await getConnectedWordPressAuth(uid);
  const normalizedSearch = search?.trim().slice(0, 100) || undefined;
  const singularType = singularizeTargetType(targetType);

  try {
    const resources = await wordpressRequest<WordPressResourceResponse[]>({
      siteUrl: connection.siteUrl,
      username: connection.wpUsername,
      applicationPassword,
      path: `/wp-json/wp/v2/${targetType}`,
      method: 'GET',
      searchParams: {
        per_page: 50,
        search: normalizedSearch,
        _fields: 'id,title,slug,status,link',
      },
    });

    return {
      ok: true,
      targetType,
      items: resources.map((resource) => normalizeWordPressItem(resource, singularType)),
    };
  } catch (error) {
    const routeError = buildRouteError(error, 'Nie udalo sie pobrac listy z WordPress.');
    if (routeError.status === 401) {
      await markRuntimeConnectionFailure(connection, routeError.message);
    }
    throw routeError;
  }
}

export async function createWordPressPreviewJob(
  args: PreviewWordPressArgs,
): Promise<WordPressPreviewResponse> {
  if (!Number.isInteger(args.targetId) || args.targetId <= 0) {
    throw new RouteError(400, 'Nieprawidlowy targetId.');
  }

  const { connection, applicationPassword } = await getConnectedWordPressAuth(args.uid);
  let persistedChangeJobId: string | null = null;

  try {
    const projectId = resolvePreviewProjectId(args.projectId, connection);
    await assertProjectOwnedByUser(args.uid, projectId);

    const resource = await wordpressRequest<WordPressResourceResponse>({
      siteUrl: connection.siteUrl,
      username: connection.wpUsername,
      applicationPassword,
      path: `/wp-json/wp/v2/${pluralizeTargetType(args.targetType)}/${args.targetId}`,
      method: 'GET',
      searchParams: {
        context: 'edit',
      },
    });

    const currentTitle = extractFieldValue(resource.title);
    const currentContent = extractFieldValue(resource.content);
    const currentMetaDescription = extractMetaDescription(resource);
    const targetUrl = resource.link ?? null;
    const pageUrl = targetUrl ?? connection.siteUrl;
    const previewChangeSet = preparePreviewChangeSet({
      targetType: args.targetType,
      targetId: args.targetId,
      targetUrl: pageUrl,
      currentTitle,
      currentContent,
      currentMetaDescription,
      suggestedTitle: args.suggestedTitle,
      suggestedContent: args.suggestedContent,
      suggestedMetaDescription: args.suggestedMetaDescription,
    });

    const createdAt = Date.now();
    const requestId = randomUUID();
    const jobId = `cj_${randomUUID()}`;

    const changeJob = await createChangeJob({
      projectId,
      uid: args.uid,
      quickWinId: null,
      pageUrl,
      entityType: args.targetType === 'page' ? 'wp_page' : 'wp_post',
      entityId: String(args.targetId),
      changeType: previewChangeSet.changeType,
      beforeValue: previewChangeSet.beforeValue,
      proposedValue: previewChangeSet.proposedValue,
      appliedValue: null,
      rollbackValue: null,
      previewSummary: previewChangeSet.previewSummary,
      source: 'manual',
      status: 'preview_ready',
      requestId,
      error: null,
      createdAt,
      updatedAt: createdAt,
      approvedAt: null,
      appliedAt: null,
      rolledBackAt: null,
    }, jobId);
    persistedChangeJobId = changeJob.id;

    if (supportsLegacyWordPressPreview(previewChangeSet.changedFields)) {
      await createWordPressJob({
        userId: args.uid,
        connectionId: connection.id,
        projectId,
        connectionSiteUrl: connection.siteUrl,
        type: 'update_page_title_content',
        targetType: args.targetType,
        targetId: args.targetId,
        targetUrl,
        before: {
          title: currentTitle,
          content: currentContent,
          metaDescription: currentMetaDescription,
        },
        after: previewChangeSet.legacyAfter,
        changedFields: previewChangeSet.changedFields,
        status: 'preview',
        error: null,
        createdAt: nowIso(),
        appliedAt: null,
      }, changeJob.id);
    }

    return {
      ok: true,
      jobId: changeJob.id,
      projectId,
      status: 'preview_ready',
      changeType: previewChangeSet.changeType,
      pageUrl,
      targetType: args.targetType,
      targetId: args.targetId,
      targetUrl,
      beforeValue: changeJob.beforeValue,
      proposedValue: changeJob.proposedValue,
      previewSummary: changeJob.previewSummary,
      requestId: changeJob.requestId,
      currentTitle,
      currentContent,
      currentMetaDescription,
      suggestedTitle: previewChangeSet.suggestedTitle,
      suggestedContent: previewChangeSet.suggestedContent,
      suggestedMetaDescription: previewChangeSet.suggestedMetaDescription,
      changedFields: previewChangeSet.changedFields,
      createdAt: changeJob.createdAt,
    };
  } catch (error) {
    const routeError = buildRouteError(error, 'Nie udalo sie utworzyc podgladu WordPress.');

    if (persistedChangeJobId) {
      try {
        await updateChangeJob(persistedChangeJobId, {
          status: 'failed',
          error: {
            message: routeError.message,
          },
          updatedAt: Date.now(),
        });
      } catch {
        // Ignore secondary persistence errors so the original route error is preserved.
      }
    }

    if (routeError.status === 401) {
      await markRuntimeConnectionFailure(connection, routeError.message);
    }
    throw routeError;
  }
}

export async function applyWordPressChangeJob(
  uid: string,
  jobId: string,
): Promise<WordPressApplyResponse> {
  const startedAt = Date.now();
  const job = await getChangeJob(jobId);

  if (!job) {
    throw new RouteError(404, 'Nie znaleziono change job.', {
      code: 'CHANGE_JOB_NOT_FOUND',
      jobId,
    });
  }

  await assertProjectOwnedByUser(uid, job.projectId);

  if (job.uid !== uid) {
    throw new RouteError(403, 'Forbidden', {
      code: 'CHANGE_JOB_FORBIDDEN',
      jobId,
    });
  }

  assertChangeJobApplyState(job);

  let connection: WordPressConnectionRecord | null = null;

  try {
    const plan = buildCanonicalApplyPlan(job);
    const auth = await getConnectedWordPressAuth(uid);
    connection = auth.connection;
    const applicationPassword = auth.applicationPassword;

    if (connection.projectId?.trim() && connection.projectId.trim() !== job.projectId) {
      throw new RouteError(409, 'To polaczenie WordPress jest przypisane do innego projektu.', {
        code: 'WORDPRESS_PROJECT_MISMATCH',
        jobId: job.id,
      });
    }

    const currentResource = await wordpressRequest<WordPressResourceResponse>({
      siteUrl: connection.siteUrl,
      username: connection.wpUsername,
      applicationPassword,
      path: `/wp-json/wp/v2/${pluralizeTargetType(plan.targetType)}/${plan.targetId}`,
      method: 'GET',
      searchParams: {
        context: 'edit',
      },
    });

    const currentSnapshot = buildCurrentWordPressSnapshot(currentResource);
    const conflictFields = detectChangeJobConflictFields({
      changedFields: plan.changedFields,
      beforeValue: plan.beforeValue,
      currentSnapshot,
    });

    if (conflictFields.length > 0) {
      throw new RouteError(409, 'Apply conflict', {
        code: 'CHANGE_JOB_CONFLICT',
        jobId: job.id,
        conflictFields,
      });
    }

    const payload = buildWordPressApplyPayload({
      resource: currentResource,
      changedFields: plan.changedFields,
      beforeValue: plan.beforeValue,
      proposedValue: plan.proposedValue,
    });

    const updatedResource = await wordpressRequest<WordPressResourceResponse>({
      siteUrl: connection.siteUrl,
      username: connection.wpUsername,
      applicationPassword,
      path: `/wp-json/wp/v2/${pluralizeTargetType(plan.targetType)}/${plan.targetId}`,
      method: 'POST',
      body: payload,
    });

    const appliedAt = Date.now();
    await markChangeJobApplied(job.id, {
      appliedValue: job.proposedValue,
      rollbackValue: job.beforeValue,
      appliedAt,
    });
    await markLegacyWordPressJobAppliedIfPresent({
      jobId: job.id,
      targetUrl: updatedResource.link ?? job.pageUrl,
    });

    const executionTimeMs = Date.now() - startedAt;
    await writeAppliedChangeJobHistory({
      job,
      uid,
      siteUrl: connection.siteUrl,
      executionTimeMs,
    });

    return {
      ok: true,
      jobId: job.id,
      projectId: job.projectId,
      status: 'applied',
      changeType: job.changeType,
      pageUrl: job.pageUrl,
      beforeValue: job.beforeValue,
      appliedValue: job.proposedValue,
      rollbackValue: job.beforeValue,
      requestId: job.requestId,
      updatedItem: normalizeWordPressItem(updatedResource, plan.targetType),
    };
  } catch (error) {
    const routeError = buildRouteError(error, 'Nie udalo sie zastosowac change job w WordPress.');
    const failurePayload = buildChangeJobFailurePayload(routeError, 'CHANGE_JOB_APPLY_FAILED', {
      jobId: job.id,
    });

    await markChangeJobFailed(job.id, {
      error: failurePayload,
      updatedAt: Date.now(),
    });
    await failLegacyWordPressJob(job.id, routeError.message);

    if (routeError.status === 401 && connection) {
      await markRuntimeConnectionFailure(connection, routeError.message);
    }

    throw routeError;
  }
}

export async function getConnectedWordPressCredentials(uid: string): Promise<{
  connection: WordPressConnectionRecord;
  applicationPassword: string;
}> {
  return getConnectedWordPressAuth(uid);
}
