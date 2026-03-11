import 'server-only';

import { NextResponse } from 'next/server';

export class RouteError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'RouteError';
    this.status = status;
    this.details = details;
  }
}

export function jsonErrorResponse(
  message: string,
  status: number,
  details?: unknown,
  headers?: HeadersInit,
): NextResponse {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has('Cache-Control')) {
    responseHeaders.set('Cache-Control', 'no-store');
  }

  return NextResponse.json(
    { error: message, details: details ?? null },
    {
      status,
      headers: responseHeaders,
    },
  );
}

export function toRouteErrorResponse(error: unknown): NextResponse {
  if (error instanceof RouteError) {
    return jsonErrorResponse(error.message, error.status, error.details);
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  return jsonErrorResponse(message, 500, null);
}
