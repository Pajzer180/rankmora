import 'server-only';

import { z } from 'zod';
import {
  nullableTrimmedString,
  optionalTrimmedString,
} from '@/lib/server/schemas/shared';
import { normalizeWordPressSiteUrl } from '@/lib/wordpress/client';

const MAX_ID_LENGTH = 200;
const MAX_URL_LENGTH = 2_048;
const MAX_USERNAME_LENGTH = 255;
const MAX_SECRET_LENGTH = 1_000;
const MAX_SUMMARY_LENGTH = 10_000;
const MAX_TEXT_LENGTH = 1_000_000;

const projectIdSchema = optionalTrimmedString(MAX_ID_LENGTH);
const endpointSchema = z.string().trim().min(1).max(MAX_URL_LENGTH);
const pageUrlSchema = z.string().trim().min(1).max(MAX_URL_LENGTH);
const nonEmptyTrimmedString = (maxLength: number) => z.string().trim().min(1).max(maxLength);

const wordpressSiteUrlSchema = z.string().trim().min(1).max(MAX_URL_LENGTH).superRefine((value, ctx) => {
  try {
    normalizeWordPressSiteUrl(value);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : 'Invalid WordPress site URL.',
    });
  }
});

const applicationPasswordSchema = z.string().max(MAX_SECRET_LENGTH).refine(
  (value) => value.replace(/\s+/g, '').trim().length > 0,
  {
    message: 'Application password is required.',
  },
);

const changeSourceSchema = z.enum([
  'chat',
  'snippet',
  'wordpress_api',
  'future_automation',
]);

const actionTypeSchema = z.enum([
  'update_title',
  'update_meta_description',
  'update_content',
  'update_h1',
  'update_h2',
  'update_canonical',
  'update_robots',
  'update_other',
]);

const entityTypeSchema = z.enum(['page', 'post', 'homepage', 'unknown']);

const payloadSchema = z.record(z.string(), z.unknown());
const previewTextValueSchema = z.string().max(MAX_TEXT_LENGTH).optional();

function hasPreviewTextValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export const wordpressConnectRequestSchema = z.object({
  projectId: projectIdSchema,
  siteUrl: wordpressSiteUrlSchema,
  wpUsername: nonEmptyTrimmedString(MAX_USERNAME_LENGTH),
  applicationPassword: applicationPasswordSchema,
}).strict();

export const wordpressTestRequestSchema = wordpressConnectRequestSchema;

export const wordpressFetchRequestSchema = z.object({
  projectId: projectIdSchema,
  targetType: z.enum(['pages', 'posts']),
  search: optionalTrimmedString(100),
}).strict();

export const wordpressPreviewRequestSchema = z.object({
  projectId: projectIdSchema,
  targetType: z.enum(['page', 'post']),
  targetId: z.number().int().positive(),
  suggestedTitle: previewTextValueSchema,
  suggestedContent: previewTextValueSchema,
  suggestedMetaDescription: previewTextValueSchema,
}).strict().superRefine((value, ctx) => {
  if (!hasPreviewTextValue(value.suggestedTitle)
    && !hasPreviewTextValue(value.suggestedContent)
    && !hasPreviewTextValue(value.suggestedMetaDescription)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide suggestedTitle, suggestedContent, or suggestedMetaDescription.',
      path: ['suggestedTitle'],
    });
  }
});

export const wordpressApplyJobRequestSchema = z.object({
  jobId: nonEmptyTrimmedString(MAX_ID_LENGTH),
}).strict();

export const wordpressRollbackRequestSchema = wordpressApplyJobRequestSchema;

export const wordpressLegacyApplyRequestSchema = z.object({
  projectId: nonEmptyTrimmedString(MAX_ID_LENGTH),
  siteUrl: nonEmptyTrimmedString(MAX_URL_LENGTH),
  pageUrl: pageUrlSchema,
  actionType: actionTypeSchema,
  source: changeSourceSchema.optional(),
  beforeValue: z.string().max(MAX_TEXT_LENGTH).optional(),
  afterValue: z.string().max(MAX_TEXT_LENGTH),
  summary: nonEmptyTrimmedString(MAX_SUMMARY_LENGTH),
  entityType: entityTypeSchema.optional(),
  entityId: nullableTrimmedString(MAX_ID_LENGTH),
  requestId: nullableTrimmedString(MAX_ID_LENGTH),
  actionId: nullableTrimmedString(MAX_ID_LENGTH),
  endpoint: endpointSchema,
  method: z.enum(['POST', 'PUT', 'PATCH']).optional(),
  payload: z.union([payloadSchema, z.null()]).optional(),
}).strict();

export const wordpressApplyRequestSchema = z.union([
  wordpressApplyJobRequestSchema,
  wordpressLegacyApplyRequestSchema,
]);

export const wordpressDisconnectRequestSchema = z.object({
  projectId: nonEmptyTrimmedString(MAX_ID_LENGTH),
}).strict();

export type WordPressConnectRequestInput = z.infer<typeof wordpressConnectRequestSchema>;
export type WordPressFetchRequestInput = z.infer<typeof wordpressFetchRequestSchema>;
export type WordPressPreviewRequestInput = z.infer<typeof wordpressPreviewRequestSchema>;
export type WordPressApplyRequestInput = z.infer<typeof wordpressApplyRequestSchema>;
export type WordPressLegacyApplyRequestInput = z.infer<typeof wordpressLegacyApplyRequestSchema>;
export type WordPressRollbackRequestInput = z.infer<typeof wordpressRollbackRequestSchema>;
export type WordPressDisconnectRequestInput = z.infer<typeof wordpressDisconnectRequestSchema>;
