export type AgentMode  = 'casual' | 'business' | 'expert';
export type AgentStyle = 'inquisitive' | 'action';

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  agentMode:  AgentMode;
  agentStyle: AgentStyle;
}

export interface ChatMessageDoc {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}
