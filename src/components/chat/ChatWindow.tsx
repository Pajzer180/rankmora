'use client';

import { useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Bot } from 'lucide-react';
import { getClientAuth } from '@/lib/firebase';
import type { AgentMode, AgentStyle } from '@/types/chat';
import { createSession, saveMessage, updateSession } from '@/lib/chatFirestore';
import ChatMessage from './ChatMessage';
import QuickActions from './QuickActions';
import ChatInput from './ChatInput';

interface MessagePart {
  type: string;
  [key: string]: unknown;
}

interface InitialMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
}

interface Props {
  activeSessionId: string | null;
  onSessionCreate: (id: string) => void;
  initialMessages: InitialMessage[];
  agentMode: AgentMode;
  agentStyle: AgentStyle;
  userId: string;
  userInitial: string;
  onAgentModeChange: (mode: AgentMode) => void;
  onAgentStyleChange: (style: AgentStyle) => void;
  onNewChat: () => void;
  activeSiteUrl: string | null;
  activeSiteDomain: string | null;
  activeSiteSource: 'snippet' | null;
  projectId: string | null;
  activePageUrl: string | null;
}

function extractText(parts: MessagePart[]): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } & MessagePart => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

async function authenticatedChatFetch(input: RequestInfo | URL, init?: RequestInit) {
  const idToken = await getClientAuth().currentUser?.getIdToken();
  const headers = new Headers(init?.headers);

  if (idToken) {
    headers.set('Authorization', `Bearer ${idToken}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

const chatTransport = new DefaultChatTransport({
  api: '/api/chat',
  fetch: authenticatedChatFetch,
});

export default function ChatWindow({
  activeSessionId,
  onSessionCreate,
  initialMessages,
  agentMode,
  agentStyle,
  userId,
  userInitial,
  onAgentModeChange,
  onAgentStyleChange,
  onNewChat,
  activeSiteUrl,
  activeSiteDomain,
  activeSiteSource,
  projectId,
  activePageUrl,
}: Props) {
  const sessionIdRef  = useRef<string | null>(activeSessionId);
  const prevStatusRef = useRef<string>('ready');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const requestBodyRef = useRef({
    agentMode,
    agentStyle,
    activeSiteUrl,
    activeSiteDomain,
    activeSiteSource,
    projectId,
    activePageUrl,
  });
  useEffect(() => {
    requestBodyRef.current = {
      agentMode,
      agentStyle,
      activeSiteUrl,
      activeSiteDomain,
      activeSiteSource,
      projectId,
      activePageUrl,
    };
  }, [agentMode, agentStyle, activeSiteUrl, activeSiteDomain, activeSiteSource, projectId, activePageUrl]);

  useEffect(() => {
    sessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const { messages, sendMessage, status } = useChat({
    transport: chatTransport,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: initialMessages as any,
  });

  const isBusy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Save assistant message after streaming completes
  useEffect(() => {
    if (prevStatusRef.current === 'streaming' && status === 'ready') {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant' && sessionIdRef.current) {
        const text = extractText(lastMsg.parts as MessagePart[]);
        if (text) {
          const sid = sessionIdRef.current;
          saveMessage(userId, sid, 'assistant', text).catch(() => {});
          updateSession(userId, sid, { updatedAt: Date.now() }).catch(() => {});
        }
      }
    }
    prevStatusRef.current = status;
  }, [status, messages, userId]);

  const handleSend = (text: string) => {
    void (async () => {
      let sid = sessionIdRef.current;
      if (!sid) {
        const title = text.trim().split(/\s+/).slice(0, 5).join(' ');
        sid = await createSession(userId, agentMode, agentStyle, title);
        sessionIdRef.current = sid;
        onSessionCreate(sid);
      }
      await saveMessage(userId, sid, 'user', text);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[CHAT_CONTEXT] client activeSiteUrl=${requestBodyRef.current.activeSiteUrl ?? ''}`);
        console.log(`[CHAT_CONTEXT] client activeSiteDomain=${requestBodyRef.current.activeSiteDomain ?? ''}`);
        console.log(`[CHAT_CONTEXT] client activeSiteSource=${requestBodyRef.current.activeSiteSource ?? ''}`);
      }
      sendMessage({ text }, { body: requestBodyRef.current });
    })();
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-black">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto min-h-0 px-8 pt-8 pb-4">
        {messages.length === 0 ? (
          <QuickActions onQuickAction={handleSend} />
        ) : (
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg as { id: string; role: 'user' | 'assistant'; parts: MessagePart[] }}
                userInitial={userInitial}
              />
            ))}

            {/* Typing indicator */}
            {isBusy && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5">
                  <Bot className="h-4 w-4 text-gray-300" />
                </div>
                <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-white/10 bg-white/5 px-4 py-3">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 [animation-delay:300ms]" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar - in-flow, always at bottom */}
      <div className="flex-shrink-0 px-8 pb-6 pt-3">
        <ChatInput
          onSend={handleSend}
          disabled={isBusy}
          agentMode={agentMode}
          agentStyle={agentStyle}
          onAgentModeChange={onAgentModeChange}
          onAgentStyleChange={onAgentStyleChange}
          onNewChat={onNewChat}
          activeSiteDomain={activeSiteDomain}
        />
      </div>
    </div>
  );
}