import {
  doc,
  setDoc,
  updateDoc,
  query,
  collection,
  where,
  limit,
  getDocs,
} from 'firebase/firestore';
import { getClientDb } from '@/lib/firebase';
import type { ProjectSearchConsoleState } from '@/types/searchConsole';

export interface ProjectWordPressState {
  siteUrl: string;
  wpUsername: string;
  status: 'connected' | 'failed' | 'disconnected';
  lastCheckedAt: number | null;
  lastError: string | null;
  lastVerifiedUser?: string | null;
  connectionId?: string | null;
}

export interface Project {
  id: string;
  uid: string;
  name: string;
  domain: string;
  snippetToken: string | null;
  snippetEnabled: boolean;
  snippetCreatedAt: number | null;
  wordpress?: ProjectWordPressState | null;
  searchConsole?: ProjectSearchConsoleState | null;
  createdAt: number;
  updatedAt: number;
}

export interface SiteInstall {
  projectId: string;
  uid: string;
  snippetToken: string;
  domain: string;
  pageUrl: string;
  pageTitle: string;
  userAgent: string;
  viewportWidth: number | null;
  viewportHeight: number | null;
  installedAt: number;
  lastSeenAt: number;
  source: 'js-snippet';
  pingCount: number;
}

export async function getOrCreateDefaultProject(
  uid: string,
  profile: { projectName?: string; companyName?: string; domain: string },
): Promise<Project> {
  const db = getClientDb();

  const projectsQuery = query(
    collection(db, 'projects'),
    where('uid', '==', uid),
    limit(1),
  );
  const snapshot = await getDocs(projectsQuery);

  if (!snapshot.empty) {
    const existingProject = snapshot.docs[0];
    return { id: existingProject.id, ...existingProject.data() } as Project;
  }

  const now = Date.now();
  const projectRef = doc(collection(db, 'projects'));
  const project: Omit<Project, 'id'> = {
    uid,
    name: profile.projectName || profile.companyName || 'Moj projekt',
    domain: profile.domain,
    snippetToken: null,
    snippetEnabled: true,
    snippetCreatedAt: null,
    wordpress: null,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(projectRef, project);
  return { id: projectRef.id, ...project };
}

function generateSecureToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function generateSnippetToken(projectId: string): Promise<string> {
  const token = generateSecureToken();
  const db = getClientDb();
  const now = Date.now();

  await updateDoc(doc(db, 'projects', projectId), {
    snippetToken: token,
    snippetEnabled: true,
    snippetCreatedAt: now,
    updatedAt: now,
  });

  return token;
}

export async function getSnippetStatus(projectId: string): Promise<SiteInstall | null> {
  const db = getClientDb();

  const installsQuery = query(
    collection(db, 'siteInstalls'),
    where('projectId', '==', projectId),
    limit(10),
  );
  const snapshot = await getDocs(installsQuery);
  if (snapshot.empty) {
    return null;
  }

  const installs = snapshot.docs.map((item) => item.data() as SiteInstall);
  installs.sort((left, right) => right.lastSeenAt - left.lastSeenAt);
  return installs[0];
}
