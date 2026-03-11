import { NextResponse } from 'next/server';
import { writeChangeHistory } from '@/lib/changeHistory';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  RouteError,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { toWordPressApiPath, wordpressRequest } from '@/lib/wordpress/client';
import {
  applyWordPressPreviewJob,
  getConnectedWordPressCredentials,
} from '@/lib/wordpress/service';
import type { ActionType, ChangeSource, EntityType } from '@/types/history';

type LegacyMethod = 'POST' | 'PUT' | 'PATCH';

interface LegacyWordPressApplyBody {
  projectId?: string;
  siteUrl?: string;
  pageUrl?: string;
  actionType?: ActionType;
  source?: ChangeSource;
  beforeValue?: string;
  afterValue?: string;
  summary?: string;
  entityType?: EntityType;
  entityId?: string | null;
  requestId?: string | null;
  actionId?: string | null;
  endpoint?: string;
  method?: LegacyMethod;
  payload?: Record<string, unknown>;
}

interface ApplyBody extends LegacyWordPressApplyBody {
  jobId?: string;
}

async function writeLegacyFailedHistory(
  uid: string,
  body: LegacyWordPressApplyBody,
  errorMessage: string,
  executionTimeMs: number,
): Promise<void> {
  if (!body.projectId) return;

  await writeChangeHistory({
    projectId: body.projectId,
    userId: uid,
    siteUrl: body.siteUrl ?? '',
    pageUrl: body.pageUrl ?? '',
    actionType: body.actionType ?? 'update_other',
    source: body.source ?? 'wordpress_api',
    status: 'failed',
    beforeValue: body.beforeValue ?? '',
    afterValue: body.afterValue ?? '',
    summary: body.summary ?? 'WordPress apply failed',
    entityType: body.entityType ?? 'unknown',
    entityId: body.entityId ?? null,
    requestId: body.requestId ?? null,
    actionId: body.actionId ?? null,
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

    const body = (await req.json()) as ApplyBody;

    if (body.jobId) {
      const response = await applyWordPressPreviewJob(uid, body.jobId);
      return NextResponse.json(response);
    }

    const legacyBody: LegacyWordPressApplyBody = body;
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

    if (!projectId) {
      throw new RouteError(400, 'Brak wymaganego pola projectId.');
    }

    await assertProjectOwnedByUser(uid, projectId);

    const missing = !siteUrl || !pageUrl || !actionType || !summary || !endpoint || afterValue === undefined;
    if (missing) {
      const routeError = new RouteError(
        400,
        'Brak wymaganych pol: projectId, siteUrl, pageUrl, actionType, summary, endpoint, afterValue',
      );
      await writeLegacyFailedHistory(uid, legacyBody, routeError.message, Date.now() - startedAt);
      return toRouteErrorResponse(routeError);
    }

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
        entityId: entityId ?? null,
        requestId: requestId ?? null,
        actionId: actionId ?? null,
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
