import 'server-only';

import { decryptGscSecret, encryptGscSecret } from '@/lib/server/secretCrypto';
import { RouteError } from '@/lib/server/routeError';
import {
  buildSearchConsoleAuthorizationUrl,
  exchangeSearchConsoleAuthorizationCode,
  listSearchConsoleProperties,
  refreshSearchConsoleAccessToken,
} from '@/lib/server/gsc/client';
import {
  consumeSearchConsoleOAuthState,
  createSearchConsoleOAuthState,
} from '@/lib/server/gsc/oauthState';
import {
  SEARCH_CONSOLE_SCOPE,
  type SearchConsoleCallbackArgs,
  type SearchConsoleCallbackResult,
  type SearchConsoleSitesResult,
  type SearchConsoleSyncContext,
  type StartSearchConsoleConnectionArgs,
} from '@/lib/server/gsc/types';
import {
  getSearchConsoleConnection,
  getSearchConsoleProject,
  saveSearchConsoleConnection,
  updateProjectSearchConsoleSummary,
} from '@/lib/searchConsole/repository';
import type {
  ProjectSearchConsoleState,
  SearchConsoleConnectionRecord,
  SearchConsolePropertySummary,
} from '@/types/searchConsole';

export async function startSearchConsoleConnection(
  args: StartSearchConsoleConnectionArgs,
): Promise<{ authorizationUrl: string }> {
  const state = await createSearchConsoleOAuthState(args);

  return {
    authorizationUrl: buildSearchConsoleAuthorizationUrl(state),
  };
}

export async function completeSearchConsoleCallback(
  args: SearchConsoleCallbackArgs,
): Promise<SearchConsoleCallbackResult> {
  const state = await consumeSearchConsoleOAuthState(args.state);
  const project = await getSearchConsoleProject(state.projectId);

  if (!project || project.uid !== state.uid) {
    throw new RouteError(403, 'Forbidden', {
      code: 'SEARCH_CONSOLE_PROJECT_FORBIDDEN',
    });
  }

  const existingConnection = await getSearchConsoleConnection(state.projectId);

  if (args.error) {
    await persistSearchConsoleFailure(
      state.projectId,
      state.uid,
      existingConnection,
      humanizeGoogleOauthError(args.error),
    );

    return {
      returnTo: state.returnTo,
      status: 'error',
      reason: args.error === 'access_denied' ? 'oauth-denied' : 'oauth-error',
    };
  }

  if (!args.code) {
    throw new RouteError(400, 'Missing Search Console OAuth code.', {
      code: 'SEARCH_CONSOLE_CALLBACK_INVALID',
      reason: 'missing-code',
    });
  }

  try {
    const tokenResponse = await exchangeSearchConsoleAuthorizationCode(args.code);
    const accessToken = tokenResponse.access_token?.trim();

    if (!accessToken) {
      throw new RouteError(502, 'Google nie zwrocil access token dla Search Console.', {
        code: 'SEARCH_CONSOLE_OAUTH_FAILED',
        reason: 'missing-access-token',
      });
    }

    const refreshTokenEncrypted = resolveRefreshTokenEncrypted(tokenResponse.refresh_token, existingConnection);
    const availableProperties = await listSearchConsoleProperties(accessToken);
    const selectedPropertyUrl = pickSelectedPropertyUrl({
      availableProperties,
      projectDomain: project.domain,
      previousSelection: existingConnection?.selectedPropertyUrl ?? project.searchConsole?.selectedPropertyUrl ?? null,
    });

    await persistConnectedSearchConsoleConnection({
      projectId: state.projectId,
      userId: state.uid,
      refreshTokenEncrypted,
      scope: tokenResponse.scope?.trim() || existingConnection?.scope || SEARCH_CONSOLE_SCOPE,
      tokenType: tokenResponse.token_type?.trim() || existingConnection?.tokenType || null,
      availableProperties,
      selectedPropertyUrl,
      connectedAt: existingConnection?.connectedAt ?? null,
      lastSyncedAt: Date.now(),
    });

    return {
      returnTo: state.returnTo,
      status: 'connected',
    };
  } catch (error) {
    const routeError = toSearchConsoleRouteError(
      error,
      'Nie udalo sie zakonczyc polaczenia z Google Search Console.',
    );

    await persistSearchConsoleFailure(
      state.projectId,
      state.uid,
      existingConnection,
      routeError.message,
    );

    return {
      returnTo: state.returnTo,
      status: 'error',
      reason: 'callback-failed',
    };
  }
}

export async function getSearchConsoleSites(projectId: string): Promise<SearchConsoleSitesResult> {
  const project = await getSearchConsoleProject(projectId);
  if (!project) {
    throw new RouteError(404, 'Project not found.', {
      code: 'SEARCH_CONSOLE_PROJECT_NOT_FOUND',
    });
  }

  const connection = await getSearchConsoleConnection(projectId);
  if (!connection || connection.status !== 'connected') {
    throw new RouteError(409, 'Najpierw polacz Google Search Console dla tego projektu.', {
      code: 'SEARCH_CONSOLE_NOT_CONNECTED',
    });
  }

  try {
    const refreshToken = decryptGscSecret(connection.refreshTokenEncrypted);
    const tokenResponse = await refreshSearchConsoleAccessToken(refreshToken);
    const accessToken = tokenResponse.access_token?.trim();

    if (!accessToken) {
      throw new RouteError(502, 'Google nie zwrocil access token dla Search Console.', {
        code: 'SEARCH_CONSOLE_REFRESH_FAILED',
        reason: 'missing-access-token',
      });
    }

    const items = await listSearchConsoleProperties(accessToken);
    const selectedPropertyUrl = pickSelectedPropertyUrl({
      availableProperties: items,
      projectDomain: project.domain,
      previousSelection: connection.selectedPropertyUrl ?? project.searchConsole?.selectedPropertyUrl ?? null,
    });
    const lastSyncedAt = Date.now();

    await persistConnectedSearchConsoleConnection({
      projectId,
      userId: connection.userId,
      refreshTokenEncrypted: connection.refreshTokenEncrypted,
      scope: connection.scope,
      tokenType: connection.tokenType,
      availableProperties: items,
      selectedPropertyUrl,
      connectedAt: connection.connectedAt,
      lastSyncedAt,
    });

    return {
      items,
      selectedPropertyUrl,
      lastSyncedAt,
    };
  } catch (error) {
    const routeError = toSearchConsoleRouteError(
      error,
      'Nie udalo sie pobrac Search Console properties.',
    );

    await persistSearchConsoleFailure(
      projectId,
      connection.userId,
      connection,
      routeError.message,
    );

    throw routeError;
  }
}

export async function getSearchConsoleSyncContext(projectId: string): Promise<SearchConsoleSyncContext> {
  const project = await getSearchConsoleProject(projectId);
  if (!project) {
    throw new RouteError(404, 'Project not found.', {
      code: 'SEARCH_CONSOLE_PROJECT_NOT_FOUND',
    });
  }

  const connection = await getSearchConsoleConnection(projectId);
  if (!connection || connection.status !== 'connected') {
    throw new RouteError(409, 'Najpierw polacz Google Search Console dla tego projektu.', {
      code: 'SEARCH_CONSOLE_NOT_CONNECTED',
    });
  }

  const propertySiteUrl = project.searchConsole?.selectedPropertyUrl?.trim() ?? '';
  if (!propertySiteUrl) {
    throw new RouteError(409, 'Brakuje wybranej wlasciwosci Search Console dla projektu.', {
      code: 'SEARCH_CONSOLE_PROPERTY_INVALID',
      reason: 'missing-selected-property',
    });
  }

  const refreshToken = decryptGscSecret(connection.refreshTokenEncrypted);
  const tokenResponse = await refreshSearchConsoleAccessToken(refreshToken);
  const accessToken = tokenResponse.access_token?.trim();

  if (!accessToken) {
    throw new RouteError(502, 'Google nie zwrocil access token dla Search Console.', {
      code: 'SEARCH_CONSOLE_REFRESH_FAILED',
      reason: 'missing-access-token',
    });
  }

  return {
    project,
    connection,
    propertySiteUrl,
    accessToken,
  };
}

export async function selectSearchConsoleProperty(
  projectId: string,
  propertyUrl: string,
): Promise<{ selectedPropertyUrl: string }> {
  const connection = await getSearchConsoleConnection(projectId);
  if (!connection || connection.status !== 'connected') {
    throw new RouteError(409, 'Najpierw polacz Google Search Console dla tego projektu.', {
      code: 'SEARCH_CONSOLE_NOT_CONNECTED',
    });
  }

  const normalizedPropertyUrl = propertyUrl.trim();
  if (!normalizedPropertyUrl) {
    throw new RouteError(400, 'Wybierz wlasciwosc Search Console.', {
      code: 'SEARCH_CONSOLE_PROPERTY_INVALID',
      reason: 'missing-property',
    });
  }

  if (!connection.availableProperties.some((property) => property.siteUrl === normalizedPropertyUrl)) {
    throw new RouteError(400, 'Wybrana wlasciwosc Search Console nie nalezy do tego projektu.', {
      code: 'SEARCH_CONSOLE_PROPERTY_INVALID',
      reason: 'unknown-property',
    });
  }

  const timestamp = new Date().toISOString();
  const updatedConnection = await saveSearchConsoleConnection({
    projectId: connection.projectId,
    userId: connection.userId,
    refreshTokenEncrypted: connection.refreshTokenEncrypted,
    scope: connection.scope,
    tokenType: connection.tokenType,
    status: connection.status,
    selectedPropertyUrl: normalizedPropertyUrl,
    availableProperties: connection.availableProperties,
    connectedAt: connection.connectedAt,
    updatedAt: timestamp,
    lastError: null,
  });

  await updateProjectSearchConsoleSummary(
    projectId,
    buildProjectSearchConsoleState(
      updatedConnection,
      parseTimestamp(connection.updatedAt),
    ),
  );

  return {
    selectedPropertyUrl: normalizedPropertyUrl,
  };
}

function normalizeDomainForMatching(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return '';
  }

  const withoutPrefix = trimmed.startsWith('sc-domain:')
    ? trimmed.slice('sc-domain:'.length)
    : trimmed.replace(/^https?:\/\//, '');
  const hostname = withoutPrefix.split(/[/?#]/, 1)[0] ?? '';
  return hostname.replace(/^www\./, '').replace(/\.$/, '');
}

function pickSelectedPropertyUrl(args: {
  availableProperties: SearchConsolePropertySummary[];
  projectDomain: string;
  previousSelection: string | null;
}): string | null {
  if (!args.availableProperties.length) {
    return null;
  }

  if (
    args.previousSelection
    && args.availableProperties.some((property) => property.siteUrl === args.previousSelection)
  ) {
    return args.previousSelection;
  }

  const normalizedProjectDomain = normalizeDomainForMatching(args.projectDomain);
  if (normalizedProjectDomain) {
    const exactMatch = args.availableProperties.find((property) => (
      normalizeDomainForMatching(property.siteUrl) === normalizedProjectDomain
    ));
    if (exactMatch) {
      return exactMatch.siteUrl;
    }

    const partialMatch = args.availableProperties.find((property) => {
      const normalizedPropertyDomain = normalizeDomainForMatching(property.siteUrl);
      return normalizedPropertyDomain === normalizedProjectDomain
        || normalizedPropertyDomain.endsWith(`.${normalizedProjectDomain}`)
        || normalizedProjectDomain.endsWith(`.${normalizedPropertyDomain}`);
    });

    if (partialMatch) {
      return partialMatch.siteUrl;
    }
  }

  return args.availableProperties[0]?.siteUrl ?? null;
}

function humanizeGoogleOauthError(error: string): string {
  if (error === 'access_denied') {
    return 'Autoryzacja Google Search Console zostala anulowana.';
  }

  return 'Google Search Console zwrocil blad autoryzacji.';
}

function resolveRefreshTokenEncrypted(
  refreshToken: string | undefined,
  existingConnection: SearchConsoleConnectionRecord | null,
): string {
  const normalizedRefreshToken = refreshToken?.trim();
  if (normalizedRefreshToken) {
    return encryptGscSecret(normalizedRefreshToken);
  }

  if (existingConnection?.refreshTokenEncrypted) {
    return existingConnection.refreshTokenEncrypted;
  }

  throw new RouteError(502, 'Google nie zwrocil refresh token dla Search Console.', {
    code: 'SEARCH_CONSOLE_OAUTH_FAILED',
    reason: 'missing-refresh-token',
  });
}

async function persistConnectedSearchConsoleConnection(args: {
  projectId: string;
  userId: string;
  refreshTokenEncrypted: string;
  scope: string;
  tokenType: string | null;
  availableProperties: SearchConsolePropertySummary[];
  selectedPropertyUrl: string | null;
  connectedAt: string | null;
  lastSyncedAt: number;
}): Promise<SearchConsoleConnectionRecord> {
  const nowIso = new Date().toISOString();
  const connection = await saveSearchConsoleConnection({
    projectId: args.projectId,
    userId: args.userId,
    refreshTokenEncrypted: args.refreshTokenEncrypted,
    scope: args.scope,
    tokenType: args.tokenType,
    status: 'connected',
    selectedPropertyUrl: args.selectedPropertyUrl,
    availableProperties: args.availableProperties,
    connectedAt: args.connectedAt ?? nowIso,
    updatedAt: nowIso,
    lastError: null,
  });

  await updateProjectSearchConsoleSummary(
    args.projectId,
    buildProjectSearchConsoleState(connection, args.lastSyncedAt),
  );

  return connection;
}

async function persistSearchConsoleFailure(
  projectId: string,
  userId: string,
  existingConnection: SearchConsoleConnectionRecord | null,
  message: string,
): Promise<void> {
  if (existingConnection) {
    const timestamp = new Date().toISOString();
    const failedConnection = await saveSearchConsoleConnection({
      projectId,
      userId,
      refreshTokenEncrypted: existingConnection.refreshTokenEncrypted,
      scope: existingConnection.scope,
      tokenType: existingConnection.tokenType,
      status: 'failed',
      selectedPropertyUrl: existingConnection.selectedPropertyUrl,
      availableProperties: existingConnection.availableProperties,
      connectedAt: existingConnection.connectedAt,
      updatedAt: timestamp,
      lastError: message,
    });

    await updateProjectSearchConsoleSummary(
      projectId,
      buildProjectSearchConsoleState(
        failedConnection,
        parseTimestamp(existingConnection.updatedAt),
      ),
    );

    return;
  }

  const fallbackSummary: ProjectSearchConsoleState = {
    connectionId: projectId,
    status: 'failed',
    selectedPropertyUrl: null,
    availableProperties: [],
    connectedAt: null,
    updatedAt: Date.now(),
    lastSyncedAt: null,
    lastError: message,
  };

  await updateProjectSearchConsoleSummary(projectId, fallbackSummary);
}

function buildProjectSearchConsoleState(
  connection: SearchConsoleConnectionRecord,
  lastSyncedAt: number | null,
): ProjectSearchConsoleState {
  return {
    connectionId: connection.id,
    status: connection.status,
    selectedPropertyUrl: connection.selectedPropertyUrl,
    availableProperties: connection.availableProperties,
    connectedAt: parseTimestamp(connection.connectedAt),
    updatedAt: Date.now(),
    lastSyncedAt,
    lastError: connection.lastError,
  };
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toSearchConsoleRouteError(error: unknown, fallbackMessage: string): RouteError {
  if (error instanceof RouteError) {
    return error;
  }

  return new RouteError(500, fallbackMessage, {
    code: 'SEARCH_CONSOLE_UNKNOWN_ERROR',
  });
}