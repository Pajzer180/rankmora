import 'server-only';

import { getFirebaseAdminDb } from '@/lib/server/firebaseAdmin';
import type { Project } from '@/types/project';
import type {
  ProjectSearchConsoleState,
  SearchConsoleConnectionRecord,
} from '@/types/searchConsole';

function projectsCollection() {
  return getFirebaseAdminDb().collection('projects');
}

function searchConsoleConnectionsCollection() {
  return getFirebaseAdminDb().collection('search_console_connections');
}

export async function getSearchConsoleProject(projectId: string): Promise<Project | null> {
  const snapshot = await projectsCollection().doc(projectId).get();
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
  const snapshot = await searchConsoleConnectionsCollection().doc(projectId).get();
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
  await searchConsoleConnectionsCollection().doc(connection.projectId).set(connection);

  return {
    id: connection.projectId,
    ...connection,
  };
}

export async function updateProjectSearchConsoleSummary(
  projectId: string,
  summary: ProjectSearchConsoleState | null,
): Promise<void> {
  await projectsCollection().doc(projectId).update({
    searchConsole: summary,
    updatedAt: Date.now(),
  });
}
