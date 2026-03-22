import 'server-only';

import { z } from 'zod';
import { optionalTrimmedString } from '@/lib/server/schemas/shared';

export const generateSeoActionSchema = z.object({
  action: z.string().trim().min(1).max(500),
  selector: z.string().trim().min(1).max(500),
  value: z.string().max(20_000),
  type: z.enum(['replace_text', 'replace_meta', 'add_class']),
}).strict();

export const generateRequestSchema = z.object({
  instruction: z.string().trim().min(1).max(10_000),
  clientId: optionalTrimmedString(200).transform((value) => value ?? '123'),
  projectId: optionalTrimmedString(200),
  userId: optionalTrimmedString(200),
  siteUrl: optionalTrimmedString(2048),
  pageUrl: optionalTrimmedString(2048),
  source: z.enum(['chat', 'snippet', 'wordpress_api', 'future_automation']).optional().default('chat'),
  entityType: z.enum(['page', 'post', 'homepage', 'unknown']).optional().default('unknown'),
  entityId: z.preprocess(
    (value) => value === null ? null : value,
    z.union([optionalTrimmedString(200), z.null()]),
  ).transform((value) => value ?? null),
}).strict();

export type GenerateRequestInput = z.infer<typeof generateRequestSchema>;
export type GenerateSeoAction = z.infer<typeof generateSeoActionSchema>;
