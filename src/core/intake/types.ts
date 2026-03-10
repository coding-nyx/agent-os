import { ConversationContext, Message } from '@/lib/ai-adapters/engine-types';
import { StructuredResponse, ParsedAction } from '@/lib/ai-adapters/engine-types';

export type IntakeThemeColor =
  | 'indigo'
  | 'orange'
  | 'cyan'
  | 'emerald'
  | 'sky'
  | 'lime'
  | 'rose'
  | 'fuchsia'
  | 'violet'
  | 'slate';

export interface GuidedIntakeStep {
  key: string;
  label: string;
  helperText: string;
  /** Keywords in the assistant's response that trigger this step */
  inferredKeywords?: string[];
  /** Explicit action types from the AI that trigger this step */
  focusActions?: string[];
}

export interface GuidedChatResult<TState> {
  nextState?: TState;
  nextStep?: number;
  completed?: boolean;
  assistantMessage?: string;
}

export interface GuidedChatSpec<TState> {
  initialState: TState;
  initialMessages: Message[];
  initialStep?: number;
  steps: GuidedIntakeStep[];
  summary: string;
  placeholder: string;
  canSend?: (state: TState) => boolean;
  buildContext: (state: TState, history: Message[]) => ConversationContext;
  onResponse: (
    response: StructuredResponse,
    state: TState,
    meta?: { latestUserMessage?: string; history: Message[] }
  ) => GuidedChatResult<TState> | Promise<GuidedChatResult<TState>>;
}

/**
 * Standardized configuration for an intake module.
 */
export interface IntakeModuleConfig<TState, TPatch> {
  moduleId: string;
  steps: GuidedIntakeStep[];
  updateActionType: string;
  completeActionType: string;
  /** Logic to apply a data patch to the state */
  applyPatch: (state: TState, patch: TPatch) => TState;
  /** Logic to extract data from raw user messages (optional) */
  extractFromUser?: (message: string) => Partial<TPatch>;
  /** Logic to validate if required fields are present for completion */
  validateCompletion?: (state: TState) => { valid: boolean; error?: string };
}
