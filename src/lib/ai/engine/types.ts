
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
  currentTier: ModelTier;
  failureCount: number;
  provider: 'openrouter' | 'grok' | 'google' | 'mock';
  isAutoScaling: boolean;
}

export interface EngineConfig {
  openrouterKey?: string;
  grokKey?: string;
  googleKey?: string;
  preferredModelId?: string;
  isMockMode?: boolean;
}
