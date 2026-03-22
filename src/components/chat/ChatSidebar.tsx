'use client';

import { MessageSquare, PanelLeftClose } from 'lucide-react';
import type { ChatSession } from '@/types/chat';

interface Props {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCollapse: () => void;
}

function formatRelativeDate(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'dziś';
  if (days === 1) return 'wczoraj';
  if (days < 7) return `${days} dni temu`;
  return new Date(timestamp).toLocaleDateString('pl-PL');
}

export default function ChatSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onCollapse,
}: Props) {
  return (
    <aside className="flex h-full w-[240px] flex-shrink-0 flex-col border-r border-white/5 bg-black">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <span className="text-sm font-medium text-zinc-400">Historia chatów</span>
        <button
          onClick={onCollapse}
          className="text-zinc-600 transition-colors hover:text-zinc-300"
          title="Schowaj sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto p-3">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <MessageSquare className="h-6 w-6 text-zinc-700" />
            <p className="text-xs text-zinc-600">Brak historii chatów</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <li key={session.id}>
                  <button
                    onClick={() => onSelectSession(session.id)}
                    className={`flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      isActive
                        ? 'border-l-2 border-purple-500 bg-white/5 text-white'
                        : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="truncate text-sm">{session.title}</span>
                    <span className="text-[10px] text-zinc-600">
                      {formatRelativeDate(session.updatedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
