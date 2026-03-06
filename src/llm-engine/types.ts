
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface Persona {
  id: string;
  name: string;
  role: string;
  description: string;
  prompt: string; // The system prompt for this persona
}

export interface ConversationContext {
  systemPrompt: string;
  memoryContext: string[]; // Generic strings representing processed facts/history
  summary: string;
  history: Message[];
}

export interface LLMProvider {
  sendMessage(messages: Message[]): Promise<string>;
  streamMessage(messages: Message[], onChunk: (chunk: string) => void): Promise<string>;
}
