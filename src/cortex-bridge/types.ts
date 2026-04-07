
import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export type MessageContent = string | MessageContentPart[];

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: MessageContent;
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
  /** Module that owns this conversation (e.g. 'agnes', 'titan'). Defaults to 'nexus' in the engine. */
  moduleId?: string;
  systemPrompt: string;
  memoryContext: string[]; // Generic strings representing processed facts/history
  summary: string;
  history: Message[];
  parsedCommand?: ParsedCommandEnvelope;
}

// --- Persona-scoped types (engine-local equivalents of lib types) ---

export type PersonaGenderPersonality = 'female' | 'male' | 'non-binary' | 'gender-fluid';

export interface PersonaAgentPersonalityProvision {
  orchestratorAlias: string;
  agentGenders: {
    orchestrator: PersonaGenderPersonality;
    [key: string]: PersonaGenderPersonality;
  };
}

export interface PersonaUserProfile {
  preferredName?: string;
  pronouns?: string;
  assignedSexAtBirth?: 'female' | 'male';
  agentPersonalityProvision: PersonaAgentPersonalityProvision;
}

export interface PersonaGlobalProjection {
  displayNames?: { [moduleId: string]: string };
  agentGenders?: { [moduleId: string]: PersonaGenderPersonality };
}
