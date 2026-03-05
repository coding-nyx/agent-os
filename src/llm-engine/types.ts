
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface Persona {
  id: string;
  name: string;
  role: string;
  description: string;
  prompt: string; // The system prompt for this persona
}

export interface SessionSummary {
  date: string;
  summary: string;
  keyInsights: string[];
  theme: string;
}

export interface ConversationContext {
  systemPrompt: string;
  insights: SessionSummary[];
  summary: string;
  history: Message[];
}

export interface LLMProvider {
  sendMessage(messages: Message[]): Promise<string>;
  streamMessage(messages: Message[], onChunk: (chunk: string) => void): Promise<string>;
}
