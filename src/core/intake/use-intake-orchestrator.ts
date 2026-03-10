import { useMemo, useCallback } from 'react';
import { StructuredResponse } from '@/lib/ai-adapters/engine-types';
import { Message } from '@/lib/ai-adapters/engine-types';
import { 
  GuidedChatSpec, 
  GuidedChatResult, 
  IntakeModuleConfig, 
  GuidedIntakeStep 
} from './types';

/**
 * Common regex for detecting implicit completion signals in AI responses.
 */
function hasImplicitCompletionSignal(text: string): boolean {
  return /\b(onboarding (?:is )?complete|intake (?:is )?complete|(?:(?:have|got) )?(?:all|everything) (?:the )?(?:information|(?:that )?i need|i need)|let'?s (?:finalize|begin|get started|move on|proceed|start our)|we(?:'re| are) (?:done|all set|good to go|ready)|protocol commit|finalize (?:the )?intake|ready to (?:begin|start|proceed)|baseline (?:is )?(?:set|established|complete|synchronized)|intake (?:is )?(?:finalized|done)|neural baseline (?:is )?(?:now )?synchronized)\b/i.test(
    text
  );
}

/**
 * Automates the creation of a GuidedChatSpec from an IntakeModuleConfig.
 */
export function useIntakeOrchestrator<TState extends { stepProgress: number }, TPatch>(
  config: IntakeModuleConfig<TState, TPatch> & {
    initialState: TState;
    initialMessages: Message[];
    summary: string;
    placeholder: string;
    systemPrompt: string;
    canSend?: (state: TState) => boolean;
  }
): GuidedChatSpec<TState> {
  const { 
    moduleId, 
    steps, 
    updateActionType, 
    completeActionType, 
    applyPatch, 
    extractFromUser,
    validateCompletion,
    initialState,
    initialMessages,
    summary,
    placeholder,
    systemPrompt,
    canSend
  } = config;

  const onResponse = useCallback((
    response: StructuredResponse,
    state: TState,
    meta?: { latestUserMessage?: string; history: Message[] }
  ): GuidedChatResult<TState> => {
    let nextState = { ...state };
    let nextStep = state.stepProgress;

    // 1. Process explicit data updates from AI
    const patches = response.actions
      .filter(a => a.type === updateActionType)
      .map(a => a.payload as TPatch);
    
    for (const patch of patches) {
      nextState = applyPatch(nextState, patch);
    }

    // 2. Process implicit data updates from user message (heuristic)
    if (extractFromUser && meta?.latestUserMessage) {
      const userPatch = extractFromUser(meta.latestUserMessage);
      if (Object.keys(userPatch).length > 0) {
        nextState = applyPatch(nextState, userPatch as TPatch);
      }
    }

    // 3. Update step progress based on AI focus actions
    const allFocusActions = steps.flatMap(s => s.focusActions || []);
    const focusAction = [...response.actions].reverse().find(a => allFocusActions.includes(a.type));
    
    if (focusAction) {
      const targetStepIndex = steps.findIndex(s => s.focusActions?.includes(focusAction.type));
      if (targetStepIndex !== -1) {
        nextStep = targetStepIndex;
      }
    } else {
      // 4. Fallback: Step inference from keywords in assistant response
      // We search from the CURRENT step index forward to prevent accidental regressions
      const normalizedText = response.publicText.toLowerCase();
      for (let i = state.stepProgress; i < steps.length; i++) {
        const step = steps[i];
        if (step.inferredKeywords?.some(k => normalizedText.includes(k.toLowerCase()))) {
          nextStep = i;
          break;
        }
      }
    }

    // 5. Check for completion signals
    const explicitCompletion = response.actions.some(a => a.type === completeActionType);
    const implicitCompletion = hasImplicitCompletionSignal(response.publicText);
    // Auto-complete if we've reached the final step and data validates
    const stepBasedCompletion = nextStep >= steps.length - 1 && validateCompletion
      ? validateCompletion(nextState).valid
      : false;
    let completed = explicitCompletion || implicitCompletion || stepBasedCompletion;
    let assistantMessage: string | undefined;

    // 6. Validate completion requirements
    if (completed && validateCompletion) {
      const validation = validateCompletion(nextState);
      if (!validation.valid) {
        completed = false;
        assistantMessage = validation.error || 'Before we finalize, I need a few more details.';
      }
    }

    if (completed) {
      nextStep = steps.length - 1;
    }

    return {
      nextState: {
        ...nextState,
        stepProgress: nextStep
      },
      nextStep,
      completed,
      assistantMessage
    };
  }, [moduleId, steps, updateActionType, completeActionType, applyPatch, extractFromUser, validateCompletion]);

  return useMemo(() => ({
    initialState,
    initialMessages,
    initialStep: 0,
    steps,
    summary,
    placeholder,
    canSend,
    buildContext: (state, history) => ({
      systemPrompt,
      memoryContext: [],
      summary: `${summary} Step: ${steps[state.stepProgress]?.label || 'Intake'}`,
      history
    }),
    onResponse
  }), [initialState, initialMessages, steps, summary, placeholder, systemPrompt, canSend, onResponse]);
}
