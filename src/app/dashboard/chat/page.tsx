import { Suspense } from 'react';
import ChatLayout from '@/components/chat/ChatLayout';

function ChatFallback() {
  return (
    <div className="flex flex-1 items-center justify-center bg-black">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatFallback />}>
      <ChatLayout />
    </Suspense>
  );
}
