import 'server-only';

import { z } from 'zod';
import { optionalTrimmedString } from '@/lib/server/schemas/shared';

const projectIdSchema = z.string().trim().min(1).max(200);
const pageSortBySchema = z.enum(['clicks', 'impressions', 'ctr', 'position']);
const sortDirSchema = z.enum(['asc', 'desc']);

const returnToSchema = optionalTrimmedString(500)
  .transform((value) => value ?? '/dashboard/analityka');

export const gscConnectRequestSchema = z.object({
  projectId: projectIdSchema,
  returnTo: returnToSchema,
}).strict();

export const gscSelectSiteRequestSchema = z.object({
  projectId: projectIdSchema,
  propertyUrl: z.string().trim().min(1).max(2_048),
}).strict();

export const gscSitesQuerySchema = z.object({
  projectId: projectIdSchema,
}).strict();

export const gscSummaryQuerySchema = z.object({
  projectId: projectIdSchema,
}).strict();

export const gscPagesQuerySchema = z.object({
  projectId: projectIdSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: pageSortBySchema.default('clicks'),
  sortDir: sortDirSchema.default('desc'),
  search: optionalTrimmedString(2_048).transform((value) => value ?? ''),
}).strict();

export const gscPageQueriesQuerySchema = z.object({
  projectId: projectIdSchema,
  pageUrl: z.string().trim().min(1).max(2048),
}).strict();

export const gscSyncRequestSchema = z.object({
  projectId: projectIdSchema,
}).strict();

export const gscCallbackQuerySchema = z.object({
  code: optionalTrimmedString(4_096),
  error: optionalTrimmedString(200),
  state: z.string().trim().min(1).max(500),
}).superRefine((value, ctx) => {
  if (!value.code && !value.error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['code'],
      message: 'Missing OAuth code or error.',
    });
  }
});