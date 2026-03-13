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
