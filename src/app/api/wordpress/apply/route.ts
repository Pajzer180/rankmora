import { NextResponse } from 'next/server';
import { writeChangeHistory } from '@/lib/changeHistory';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  RouteError,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import {
  type WordPressLegacyApplyRequestInput,
  wordpressApplyRequestSchema,
} from '@/lib/server/schemas/wordpress';
import { readJsonRequestBody } from '@/lib/server/validation';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { toWordPressApiPath, wordpressRequest } from '@/lib/wordpress/client';
import {
  applyWordPressChangeJob,
  getConnectedWordPressCredentials,
} from '@/lib/wordpress/service';

async function writeLegacyFailedHistory(
  uid: string,
  body: WordPressLegacyApplyRequestInput,
  errorMessage: string,
  executionTimeMs: number,
): Promise<void> {
  await writeChangeHistory({
    projectId: body.projectId,
    userId: uid,
    siteUrl: body.siteUrl,
    pageUrl: body.pageUrl,
    actionType: body.actionType,
    source: body.source ?? 'wordpress_api',
    status: 'failed',
    beforeValue: body.beforeValue ?? '',
    afterValue: body.afterValue,
    summary: body.summary,
    entityType: body.entityType ?? 'unknown',
    entityId: body.entityId,
    requestId: body.requestId,
    actionId: body.actionId,
    errorMessage,
    executionTimeMs,
  });
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'wordpress-apply', uid });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = await readJsonRequestBody(req, wordpressApplyRequestSchema);

    if ('jobId' in body) {
      const response = await applyWordPressChangeJob(uid, body.jobId);
      return NextResponse.json(response);
    }

    const legacyBody: WordPressLegacyApplyRequestInput = body;
    const {
      projectId,
      siteUrl,
      pageUrl,
      actionType,
      summary,
      endpoint,
      afterValue,
      beforeValue,
      source,
      entityType,
      entityId,
      requestId,
      actionId,
      method,
      payload,
    } = legacyBody;

    await assertProjectOwnedByUser(uid, projectId);

    try {
      const { connection, applicationPassword } = await getConnectedWordPressCredentials(uid);
      const path = toWordPressApiPath(connection.siteUrl, endpoint);
      const wpResult = await wordpressRequest<unknown>({
        siteUrl: connection.siteUrl,
        username: connection.wpUsername,
        applicationPassword,
        path,
        method: method ?? 'POST',
        body: payload ?? {},
      });

      const executionTimeMs = Date.now() - startedAt;
      await writeChangeHistory({
        projectId,
        userId: uid,
        siteUrl,
        pageUrl,
        actionType,
        source: source ?? 'wordpress_api',
        status: 'applied',
        beforeValue: beforeValue ?? '',
        afterValue,
        summary,
        entityType: entityType ?? 'unknown',
        entityId,
        requestId,
        actionId,
        executionTimeMs,
      });

      return NextResponse.json({
        ok: true,
        executionTimeMs,
        wpResult,
      });
    } catch (error) {
      const routeError = error instanceof RouteError
        ? error
        : new RouteError(500, error instanceof Error ? error.message : 'WordPress apply failed');

      const executionTimeMs = Date.now() - startedAt;
      await writeLegacyFailedHistory(uid, legacyBody, routeError.message, executionTimeMs);
      return toRouteErrorResponse(routeError);
    }
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
