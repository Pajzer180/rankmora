import 'server-only';

import { z } from 'zod';
import { optionalTrimmedString } from '@/lib/server/schemas/shared';

const viewportDimensionSchema = z.number().int().nonnegative().max(10_000).nullable().optional()
  .transform((value) => value ?? null);

export const snippetBeaconBodySchema = z.object({
  token: z.string().trim().min(1).max(512),
  hostname: z.string().trim().min(1).max(255),
  url: optionalTrimmedString(2048).transform((value) => value ?? ''),
  title: optionalTrimmedString(500).transform((value) => value ?? ''),
  userAgent: optionalTrimmedString(1000).transform((value) => value ?? ''),
  vw: viewportDimensionSchema,
  vh: viewportDimensionSchema,
  ts: z.number().int().nonnegative().optional(),
}).passthrough();

export type SnippetBeaconBody = z.infer<typeof snippetBeaconBodySchema>;
