'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { BarChart2, Target, MessageSquare, History, Globe, Settings, LogOut, Code } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Analityka',   href: '/dashboard/analityka',   icon: BarChart2     },
  { label: 'Cele',        href: '/dashboard/cele',         icon: Target        },
  { label: 'Chat',        href: '/dashboard/chat',         icon: MessageSquare },
  { label: 'Historia',    href: '/dashboard/historia',     icon: History       },
  { label: 'Strona',      href: '/dashboard/strona',       icon: Globe         },
  { label: 'Instalacja',  href: '/dashboard/instalacja',   icon: Code          },
  { label: 'Ustawienia',  href: '/dashboard/ustawienia',   icon: Settings      },
];

export default function DashboardTopNav() {
  const pathname  = usePathname();
  const router    = useRouter();
  const { user, profile, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const userInitial = profile?.firstName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? 'U';
  const displayName = profile?.firstName ?? user?.email ?? '';

  return (
    <header className="group sticky top-0 z-50 h-11 hover:h-14 w-full border-b border-white/5 bg-black flex items-center justify-between px-6 transition-all duration-300 ease-in-out">
      {/* Logo */}
      <span className="flex-shrink-0 cursor-pointer bg-gradient-to-r from-purple-400 to-purple-200 bg-clip-text text-lg font-bold text-transparent hover:opacity-80 transition-all duration-300">
        Bress.io
      </span>

      {/* Navigation */}
      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center justify-center px-4 cursor-pointer transition-all duration-300 group/item"
            >
              <Icon className={`h-4 w-4 transition-colors duration-200 ${active ? 'text-purple-400' : 'text-zinc-500 group-hover/item:text-purple-400'}`} />
              <span className={`max-h-0 opacity-0 overflow-hidden text-[11px] group-hover:max-h-4 group-hover:opacity-100 transition-all duration-300 ease-in-out ${active ? 'font-semibold text-purple-300' : 'font-medium text-zinc-500 group-hover/item:text-purple-400'}`}>
                {label}
              </span>
              {active && (
                <span className="w-4 h-0.5 bg-purple-500 rounded-full mt-0.5 transition-all duration-300" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User area */}
      <div className="flex flex-shrink-0 items-center gap-3">
        <div className="w-px h-5 bg-white/10" />
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 group-hover:h-8 group-hover:w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-600 text-sm font-semibold text-white ring-1 ring-purple-500/40 ring-offset-1 ring-offset-black transition-all duration-300">
            {userInitial}
          </div>
          <span className="max-w-0 opacity-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 text-sm font-medium text-zinc-300">
            {displayName}
          </span>
        </div>
        <button
          onClick={handleSignOut}
          className="hidden group-hover:flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-200 transition-colors duration-200"
        >
          <LogOut className="h-4 w-4" />
          <span>Wyloguj się</span>
        </button>
      </div>

      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/20 to-transparent" />
    </header>
  );
}
