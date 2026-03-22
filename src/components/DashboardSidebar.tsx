'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  BarChart2,
  MessageSquare,
  GitCompare,
  Settings,
  LogOut,
  Globe,
  ChevronRight,
} from 'lucide-react';

const NAV_LINKS = [
  { label: 'Analityka',   href: '/dashboard/analityka',   icon: BarChart2     },
  { label: 'Chat',        href: '/dashboard/chat',         icon: MessageSquare },
  { label: 'Zmiany',      href: '/dashboard/zmiany',       icon: GitCompare    },
  { label: 'Ustawienia',  href: '/dashboard/ustawienia',   icon: Settings      },
];

export default function DashboardSidebar() {
  const { user, profile, signOut } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  // Display name and domain from onboarding profile
  const projectLabel = profile?.projectName ?? profile?.companyName ?? 'Mój Projekt';
  const domainLabel  = profile?.domain ?? 'bress.io';

  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-white/10 bg-[#050505]">
      {/* Logo */}
      <div className="border-b border-white/10 px-5 py-4">
        <div className="mb-3">
          <span className="bg-gradient-to-br from-indigo-400 to-violet-500 bg-clip-text text-xl font-bold text-transparent">
            Bress.io
          </span>
        </div>

        {/* Project selector */}
        <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
          <Globe className="h-4 w-4 flex-shrink-0 text-purple-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-100">{projectLabel}</p>
            <p className="truncate text-[10px] text-gray-500">{domainLabel}</p>
          </div>
          <ChevronRight className="ml-auto h-3 w-3 flex-shrink-0 text-gray-600" />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <ul className="flex flex-col gap-1">
          {NAV_LINKS.map(({ label, href, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  isActive(href)
                    ? 'bg-purple-600/10 text-purple-400'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* User profile */}
      <div className="border-t border-white/10 px-5 py-4">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-600/20 text-sm font-semibold text-purple-400">
            {profile?.firstName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-gray-200">
              {profile?.firstName ? `${profile.firstName}` : user?.email}
            </p>
            <p className="text-[10px] text-gray-500">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
        >
          <LogOut className="h-4 w-4" />
          Wyloguj się
        </button>
      </div>
    </aside>
  );
}
