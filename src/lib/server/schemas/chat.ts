import 'server-only';

import { z } from 'zod';
import { nullableTrimmedString } from '@/lib/server/schemas/shared';

const chatMessagePartSchema = z.object({
  type: z.string().trim().min(1).max(100),
}).passthrough().superRefine((part, ctx) => {
  if (part.type === 'text' && typeof part.text !== 'string') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Text parts must include a text string.',
      path: ['text'],
    });
  }
});

const chatMessageSchema = z.object({
  id: z.string().trim().min(1).max(200),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  parts: z.array(chatMessagePartSchema).max(200).default([]),
}).passthrough();

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(200),
  agentMode: z.enum(['casual', 'business', 'expert']).optional().default('business'),
  agentStyle: z.enum(['inquisitive', 'action']).optional().default('action'),
  activeSiteUrl: nullableTrimmedString(2048),
  activeSiteDomain: nullableTrimmedString(255),
  activeSiteSource: z.enum(['snippet']).nullable().optional().transform((value) => value ?? null),
  projectId: nullableTrimmedString(200),
  activePageUrl: nullableTrimmedString(2048),
}).passthrough();

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
