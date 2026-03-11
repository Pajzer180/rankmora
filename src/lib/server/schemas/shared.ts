import 'server-only';

import { z } from 'zod';

function trimOptionalString(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function trimNullableString(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function optionalTrimmedString(maxLength: number) {
  return z.preprocess(trimOptionalString, z.string().max(maxLength).optional());
}

export function nullableTrimmedString(maxLength: number) {
  return z.preprocess(trimNullableString, z.union([z.string().max(maxLength), z.null()]).optional())
    .transform((value) => value ?? null);
}
