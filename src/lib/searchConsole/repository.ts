import 'server-only';

import {
  getDocument,
  setDocument,
  updateDocument,
} from '@/lib/server/firestoreRest';
import type { Project } from '@/types/project';
import type {
  ProjectSearchConsoleState,
  SearchConsoleConnectionRecord,
} from '@/types/searchConsole';

export async function getSearchConsoleProject(projectId: string): Promise<Project | null> {
  const snapshot = await getDocument('projects', projectId);
  if (!snapshot.exists) {
    return null;
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as Omit<Project, 'id'>),
  };
}

export async function getSearchConsoleConnection(
  projectId: string,
): Promise<SearchConsoleConnectionRecord | null> {
  const snapshot = await getDocument('search_console_connections', projectId);
  if (!snapshot.exists) {
    return null;
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as Omit<SearchConsoleConnectionRecord, 'id'>),
  };
}

export async function saveSearchConsoleConnection(
  connection: Omit<SearchConsoleConnectionRecord, 'id'>,
): Promise<SearchConsoleConnectionRecord> {
  await setDocument('search_console_connections', connection.projectId, connection as unknown as Record<string, unknown>);

  return {
    id: connection.projectId,
    ...connection,
  };
}

export async function updateProjectSearchConsoleSummary(
  projectId: string,
  summary: ProjectSearchConsoleState | null,
): Promise<void> {
  await updateDocument('projects', projectId, {
    searchConsole: summary,
    updatedAt: Date.now(),
  });
}
