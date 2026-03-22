import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  query,
  orderBy,
} from 'firebase/firestore';
import { getClientDb } from '@/lib/firebase';
import type { AgentMode, AgentStyle, ChatMessageDoc } from '@/types/chat';

// ─── Session helpers ──────────────────────────────────────────────────────────

export async function createSession(
  userId: string,
  agentMode: AgentMode,
  agentStyle: AgentStyle,
  title = 'Nowy czat',
): Promise<string> {
  const db = getClientDb();
  const sessionsRef = collection(db, 'chats', userId, 'sessions');
  const now = Date.now();
  const docRef = await addDoc(sessionsRef, {
    title,
    createdAt: now,
    updatedAt: now,
    agentMode,
    agentStyle,
  });
  return docRef.id;
}

export async function updateSession(
  userId: string,
  sessionId: string,
  data: Partial<{ title: string; updatedAt: number; agentMode: AgentMode; agentStyle: AgentStyle }>,
): Promise<void> {
  const db = getClientDb();
  const sessionRef = doc(db, 'chats', userId, 'sessions', sessionId);
  await updateDoc(sessionRef, data);
}

// ─── Message helpers ──────────────────────────────────────────────────────────

export async function saveMessage(
  userId: string,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  const db = getClientDb();
  const messagesRef = collection(db, 'chats', userId, 'sessions', sessionId, 'messages');
  await addDoc(messagesRef, { role, content, createdAt: Date.now() });
}

export async function getMessages(
  userId: string,
  sessionId: string,
): Promise<Array<{ id: string; role: 'user' | 'assistant'; parts: Array<{ type: 'text'; text: string }> }>> {
  const db = getClientDb();
  const messagesRef = collection(db, 'chats', userId, 'sessions', sessionId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => {
    const data = d.data() as Omit<ChatMessageDoc, 'id'>;
    return {
      id: d.id,
      role: data.role,
      parts: [{ type: 'text' as const, text: data.content }],
    };
  });
}
