import 'server-only';

import { z } from 'zod';
import { RouteError } from '@/lib/server/routeError';

type ValidationTarget = 'request_body' | 'request_query' | 'model_output';

interface ValidationOptions {
  code?: 'VALIDATION_ERROR' | 'MODEL_OUTPUT_INVALID';
  message: string;
  status: number;
  target: ValidationTarget;
}

const DEFAULT_REQUEST_VALIDATION_OPTIONS: ValidationOptions = {
  code: 'VALIDATION_ERROR',
  message: 'Invalid request body.',
  status: 400,
  target: 'request_body',
};

const DEFAULT_QUERY_VALIDATION_OPTIONS: ValidationOptions = {
  code: 'VALIDATION_ERROR',
  message: 'Invalid request query.',
  status: 400,
  target: 'request_query',
};

const DEFAULT_MODEL_VALIDATION_OPTIONS: ValidationOptions = {
  code: 'MODEL_OUTPUT_INVALID',
  message: 'Invalid model output.',
  status: 500,
  target: 'model_output',
};

export async function readJsonRequestBody<T>(
  req: Request,
  schema: z.ZodType<T>,
  options: Partial<ValidationOptions> = {},
): Promise<T> {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    const resolved = { ...DEFAULT_REQUEST_VALIDATION_OPTIONS, ...options };
    throw new RouteError(resolved.status, resolved.message, {
      code: resolved.code,
      target: resolved.target,
      reason: 'invalid-json',
    });
  }

  return parseWithSchema(schema, body, {
    ...DEFAULT_REQUEST_VALIDATION_OPTIONS,
    ...options,
  });
}

export function parseSearchParamsWithSchema<T>(
  searchParams: URLSearchParams,
  schema: z.ZodType<T>,
  options: Partial<ValidationOptions> = {},
): T {
  return parseWithSchema(
    schema,
    Object.fromEntries(searchParams.entries()),
    {
      ...DEFAULT_QUERY_VALIDATION_OPTIONS,
      ...options,
    },
  );
}

export function parseJsonStringWithSchema<T>(
  rawText: string,
  schema: z.ZodType<T>,
  options: Partial<ValidationOptions> = {},
): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    const resolved = { ...DEFAULT_MODEL_VALIDATION_OPTIONS, ...options };
    throw new RouteError(resolved.status, resolved.message, {
      code: resolved.code,
      target: resolved.target,
      reason: 'invalid-json',
    });
  }

  return parseWithSchema(schema, parsed, {
    ...DEFAULT_MODEL_VALIDATION_OPTIONS,
    ...options,
  });
}

export function parseWithSchema<T>(
  schema: z.ZodType<T>,
  input: unknown,
  options: ValidationOptions,
): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  throw new RouteError(options.status, options.message, {
    code: options.code,
    target: options.target,
    issues: parsed.error.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      path: issue.path.length > 0 ? issue.path.join('.') : '$',
    })),
  });
}