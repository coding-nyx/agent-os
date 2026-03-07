
import { Message } from '../types';

export enum ModelTier {
  S_REASONING = 'S_REASONING',
  A_STANDARD = 'A_STANDARD',
  B_ECONOMY = 'B_ECONOMY',
  C_EMERGENCY = 'C_EMERGENCY'
}

export interface ModelMetadata {
  id: string;
  name: string;
  provider: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  tier: ModelTier;
  isFree: boolean;
  isReasoning: boolean;
  supportsVision?: boolean;
}

export interface CognitiveContext {
  systemPrompt: string;
  facts: string[];
  longTermSummary: string;
  activeMessages: Message[];
  tokenCount: {
    system: number;
    facts: number;
    summary: number;
    chat: number;
    total: number;
  };
}

export interface OrchestratorState {
  activeModelId: string;
  provider: 'openrouter' | 'grok' | 'google' | 'mock';
}

export interface EngineConfig {
  openrouterKey?: string;
  grokKey?: string;
  googleKey?: string;
  preferredModelId?: string;
  isMockMode?: boolean;
  freeModelsOnly?: boolean;
}

export interface ParsedAction {
  type: string;
  payload: Record<string, unknown>;
  raw?: string;
}

export interface StructuredResponse {
  fullText: string;
  publicText: string;
  internalThoughts: string | null;
  actions: ParsedAction[];
  isInterrupted: boolean;
}
