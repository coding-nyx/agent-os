import { ConversationContext, Message } from '@/llm-engine/types';

export type IntakeThemeColor = 'indigo' | 'orange' | 'cyan';

export interface GuidedIntakeStep {
  key: string;
  label: string;
  helperText: string;
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
    response: string,
    state: TState,
    meta?: { latestUserMessage?: string; history: Message[] }
  ) => GuidedChatResult<TState>;
}
