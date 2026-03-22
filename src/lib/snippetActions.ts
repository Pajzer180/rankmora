// LEGACY — akcje snippetowe (generowanie tokena, status instalacji). Część z tych funkcji jest nadal używana do pobierania domyślnego projektu.

import {
  doc,
  setDoc,
  updateDoc,
  query,
  collection,
  where,
  limit,
  getDocs,
} from 'firebase/firestore/lite';
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

interface ProjectProfileInput {
  projectName?: string;
  companyName?: string;
  domain: string;
}

function normalizeComparableString(value?: string | null): string {
  return value?.trim().toLowerCase() ?? '';
}

function normalizeComparableDomain(value?: string | null): string {
  const trimmed = normalizeComparableString(value);
  if (!trimmed) {
    return '';
  }

  const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
  const hostname = withoutProtocol.split(/[/?#]/, 1)[0] ?? '';
  return hostname.replace(/^www\./, '').replace(/\.$/, '');
}

function getProjectSelectionPriority(project: Project, profile: ProjectProfileInput): number[] {
  const profileDomain = normalizeComparableDomain(profile.domain);
  const projectDomain = normalizeComparableDomain(project.domain);
  const preferredNames = [profile.projectName, profile.companyName]
    .map((value) => normalizeComparableString(value))
    .filter(Boolean);
  const projectName = normalizeComparableString(project.name);

  const exactDomainMatch = Number(Boolean(profileDomain) && projectDomain === profileDomain);
  const partialDomainMatch = Number(
    !exactDomainMatch
      && Boolean(profileDomain)
      && Boolean(projectDomain)
      && (
        projectDomain.endsWith(`.${profileDomain}`)
        || profileDomain.endsWith(`.${projectDomain}`)
      ),
  );
  const exactNameMatch = Number(preferredNames.includes(projectName));
  const hasWordPressConnected = Number(project.wordpress?.status === 'connected');
  const hasWordPressState = Number(Boolean(project.wordpress));
  const hasSearchConsoleConnected = Number(project.searchConsole?.status === 'connected');
  const hasSearchConsoleState = Number(Boolean(project.searchConsole));
  const hasSnippetToken = Number(Boolean(project.snippetToken));

  return [
    exactDomainMatch,
    partialDomainMatch,
    exactNameMatch,
    hasWordPressConnected,
    hasWordPressState,
    hasSearchConsoleConnected,
    hasSearchConsoleState,
    hasSnippetToken,
    project.updatedAt ?? 0,
    project.createdAt ?? 0,
  ];
}

function compareProjectPriority(left: Project, right: Project, profile: ProjectProfileInput): number {
  const leftPriority = getProjectSelectionPriority(left, profile);
  const rightPriority = getProjectSelectionPriority(right, profile);

  for (let index = 0; index < leftPriority.length; index += 1) {
    const diff = rightPriority[index] - leftPriority[index];
    if (diff !== 0) {
      return diff;
    }
  }

  return right.id.localeCompare(left.id);
}

function selectBestProject(projects: Project[], profile: ProjectProfileInput): Project {
  return [...projects].sort((left, right) => compareProjectPriority(left, right, profile))[0];
}

export async function getOrCreateDefaultProject(
  uid: string,
  profile: ProjectProfileInput,
): Promise<Project> {
  const db = getClientDb();

  const projectsQuery = query(
    collection(db, 'projects'),
    where('uid', '==', uid),
  );
  const snapshot = await getDocs(projectsQuery);

  if (!snapshot.empty) {
    const existingProjects = snapshot.docs.map((projectDoc) => ({
      id: projectDoc.id,
      ...(projectDoc.data() as Omit<Project, 'id'>),
    } as Project));

    return selectBestProject(existingProjects, profile);
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
