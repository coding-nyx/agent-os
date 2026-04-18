
import { Message } from '../types';

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

export interface EngineConfig {
  /** @deprecated Use credentialStore instead. Kept for backwards compatibility. */
  openrouterKey?: string;
  /** @deprecated Use credentialStore instead. */
  grokKey?: string;
  /** @deprecated Use credentialStore instead. */
  googleKey?: string;
  /** @deprecated Use credentialStore instead. */
  mercuryKey?: string;
  preferredModelId?: string;
  preferredProvider?: 'openrouter' | 'grok' | 'google' | 'mercury';
  isMockMode?: boolean;
  freeModelsOnly?: boolean;
  /** When provided, keys are resolved from the credential store instead of config fields. */
  credentialStore?: import('@cortex-logic').CredentialStoreJs;
}

import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import type { ExtractedMutation } from '../sanitize';

export interface ParsedAction {
  type: string;
  payload: Record<string, unknown>;
  raw?: string;
  commandContext?: {
    parsedCommand?: ParsedCommandEnvelope;
  };
}

export interface StructuredResponse {
  fullText: string;
  publicText: string;
  internalThoughts: string | null;
  actions: ParsedAction[];
  mutations: ExtractedMutation[];
  isInterrupted: boolean;
}

export interface StreamChunk {
  delta: string;
  isThinking: boolean;
  isActing: boolean;
  currentActionType: string | null;
}
