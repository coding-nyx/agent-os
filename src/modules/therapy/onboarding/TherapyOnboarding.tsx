import React, { useMemo } from 'react';
import { GuidedIntakeFrame } from '@/core/intake/GuidedIntakeFrame';
import { GuidedChatSpec, GuidedIntakeStep, IntakeModuleConfig } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { useIntakeOrchestrator } from '@/core/intake/use-intake-orchestrator';
import { NexusChat } from '@/core/components/NexusChat';
import { useAuth } from '@/lib/auth-context';
import { BaseContext } from '../types';
import { THERAPY_ONBOARDING_PERSONA } from '../personas';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { mergeNSVPatch } from '@/lib/services/nsv-service';
import { NyxHandoffService } from '@/lib/services/nyx-handoff-service';
import { buildCalibrationPrompt } from '@/lib/services/nsv-ownership';

interface TherapyOnboardingProps {
  initialBaseContext?: GlobalBaseIntakeContext;
  onComplete: (context: Partial<BaseContext>) => void;
}

type TherapyIntakeState = {
  context: Partial<BaseContext>;
  stepProgress: number;
};

const THERAPY_STEPS: GuidedIntakeStep[] = [
  {
    key: 'identity',
    label: 'Identity Anchor',
    helperText: 'Start with name and pronouns to establish safe addressing in every session.',
    inferredKeywords: ['name', 'pronouns', 'call you', 'identity'],
    focusActions: ['focus_identity']
  },
  {
    key: 'background',
    label: 'Background',
    helperText: 'Capture key life context so advice aligns with lived experience.',
    inferredKeywords: ['background', 'childhood', 'growing up', 'past', 'history', 'life context'],
    focusActions: ['focus_background']
  },
  {
    key: 'struggles',
    label: 'Current Struggles',
    helperText: 'Document active emotional load and recurring stress patterns.',
    inferredKeywords: ['struggle', 'heavy', 'hard', 'difficult', 'challenge', 'stress', 'trauma', 'lately', 'distress'],
    focusActions: ['focus_struggles']
  },
  {
    key: 'goals',
    label: 'Goals',
    helperText: 'Define what progress should look like over upcoming sessions.',
    inferredKeywords: ['goal', 'hope to achieve', 'work on', 'explore together', 'outcome', 'breakthrough'],
    focusActions: ['focus_goals']
  },
  {
    key: 'preferences',
    label: 'Therapist Preferences',
    helperText: 'Lock tone, communication style, and therapist-fit preferences.',
    inferredKeywords: ['preference', 'tone', 'gender', 'style', 'communication', 'approach'],
    focusActions: ['focus_preferences']
  }
];

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveIdentity(identity: BaseContext['identity']): { name?: string; pronouns?: string } {
  if (!identity) return {};
  if (typeof identity === 'string') {
    const name = normalizeOptionalString(identity);
    return name ? { name } : {};
  }
  return {
    name: normalizeOptionalString(identity.name),
    pronouns: normalizeOptionalString(identity.pronouns)
  };
}

function mergeTherapyContext(current: Partial<BaseContext>, patch: Partial<BaseContext>): Partial<BaseContext> {
  const merged: Partial<BaseContext> = { ...current, ...patch };

  if (patch.identity !== undefined) {
    const currentIdentity = resolveIdentity(current.identity);
    const patchIdentity = resolveIdentity(patch.identity);
    const nextIdentity = {
      ...currentIdentity,
      ...patchIdentity
    };

    merged.identity = nextIdentity.name || nextIdentity.pronouns ? nextIdentity : current.identity;
  }

  return merged;
}

function buildInitialPrompt(initialBaseContext?: GlobalBaseIntakeContext): string {
  const name = normalizeOptionalString(initialBaseContext?.name);
  const pronouns = normalizeOptionalString(initialBaseContext?.pronouns);
  const occupation = normalizeOptionalString(initialBaseContext?.occupation);
  const sleep = typeof initialBaseContext?.typicalSleepHours === 'number' ? initialBaseContext.typicalSleepHours : undefined;

  if (name && pronouns) {
    const lifestyleChunk = [
      occupation ? `occupation as ${occupation}` : null,
      typeof sleep === 'number' ? `typical sleep around ${sleep} hours/night` : null
    ]
      .filter(Boolean)
      .join(', ');
    if (lifestyleChunk) {
      return `Welcome to Agnes Intake. I have your name as ${name}, pronouns as ${pronouns}, and ${lifestyleChunk}. Is that correct before we continue?`;
    }
    return `Welcome to Agnes Intake. I have your name as ${name} and pronouns as ${pronouns}. Is that correct before we continue?`;
  }
  if (name && !pronouns) {
    return `Welcome to Agnes Intake. I have your name as ${name}. What pronouns should I use for you?`;
  }
  if (!name && pronouns) {
    return `Welcome to Agnes Intake. I have your pronouns as ${pronouns}. What should I call you?`;
  }
  return "Welcome to Agnes Intake. Before we begin deeper work, what should I call you and what pronouns should I use?";
}

export function TherapyOnboarding({ initialBaseContext, onComplete }: TherapyOnboardingProps) {
  const { user } = useAuth();
  
  const initialContextState = useMemo<Partial<BaseContext>>(() => {
    const name = normalizeOptionalString(initialBaseContext?.name);
    const pronouns = normalizeOptionalString(initialBaseContext?.pronouns);
    const occupation = normalizeOptionalString(initialBaseContext?.occupation);
    const sleep =
      typeof initialBaseContext?.typicalSleepHours === 'number' && Number.isFinite(initialBaseContext.typicalSleepHours)
        ? initialBaseContext.typicalSleepHours
        : undefined;

    const next: Partial<BaseContext> = {};
    if (name || pronouns) {
      next.identity = {
        ...(name ? { name } : {}),
        ...(pronouns ? { pronouns } : {})
      };
    }
    if (occupation) next.occupation = occupation;
    if (typeof sleep === 'number') next.typicalSleepHours = sleep;
    return next;
  }, [initialBaseContext]);

  const config: IntakeModuleConfig<TherapyIntakeState, Partial<BaseContext>> = {
    moduleId: 'therapy',
    steps: THERAPY_STEPS,
    updateActionType: 'update_therapy_context',
    completeActionType: 'complete_therapy_onboarding',
    applyPatch: (state, patch) => ({
      ...state,
      context: mergeTherapyContext(state.context, patch)
    }),
    extractFromUser: (message) => {
        const patch: Partial<BaseContext> = {};
        
        const nameMatch = message.match(/\b(?:my name is|call me|i'm)\s+([a-z][a-z' -]{0,30})/i);
        const pronounsMatch = message.match(/\b(?:pronouns(?: are)?\s*)?(she\/her|he\/him|they\/them|she her|he him|they them)\b/i);
        
        if (nameMatch || pronounsMatch) {
            patch.identity = {};
            if (nameMatch) {
                const raw = nameMatch[1].trim().split(/\s+/)[0];
                patch.identity.name = raw.charAt(0).toUpperCase() + raw.slice(1);
            }
            if (pronounsMatch) {
                patch.identity.pronouns = pronounsMatch[1].replace(/\s+/g, '/').toLowerCase();
            }
        }

        const occupationMatch = message.match(/\b(?:i(?:'m| am)|i work as|my job is|occupation is)\s+([a-z][a-z0-9'\/&,\- ]{1,50})/i);
        if (occupationMatch) patch.occupation = occupationMatch[1].trim();

        const sleepMatch = message.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:hours?|hrs?)\b/i);
        if (sleepMatch) {
            const parsed = Number.parseFloat(sleepMatch[1]);
            if (Number.isFinite(parsed) && parsed > 0 && parsed <= 24) patch.typicalSleepHours = parsed;
        }

        return patch;
    },
    validateCompletion: (state) => {
        const identity = resolveIdentity(state.context.identity);
        if (!identity.name || !identity.pronouns) {
            return { valid: false, error: "Before we finalize, please confirm your preferred name and pronouns." };
        }
        return { valid: true };
    }
  };

  const spec = useIntakeOrchestrator({
    ...config,
    initialState: {
      context: initialContextState,
      stepProgress: 0
    },
    initialMessages: [
      {
        role: 'assistant',
        content: buildInitialPrompt(initialBaseContext)
      }
    ],
    summary: 'Therapy onboarding intake.',
    placeholder: 'Share your response...',
    systemPrompt: `${THERAPY_ONBOARDING_PERSONA}

[PREFILLED_IDENTITY]
- Name: ${resolveIdentity(initialContextState.identity).name || 'Unknown'}
- Pronouns: ${resolveIdentity(initialContextState.identity).pronouns || 'Unknown'}
[PREFILLED_LIFESTYLE]
- Occupation: ${initialContextState.occupation || 'Unknown'}
- Typical Sleep Hours: ${initialContextState.typicalSleepHours || 'Unknown'}
`
  });

  const intake = useGuidedChatIntake({
    spec: {
        ...spec,
        // Override onResponse to handle specialized actions like sync_vitals
        onResponse: async (response, state, meta) => {
            const result = await spec.onResponse(response, state, meta);
            
            // Handle sync_vitals
            const vitalsPatch = response.actions
                .filter((action) => action.type === 'sync_vitals')
                .map((action) => action.payload as Partial<any>)
                .reduce((acc, payload) => mergeNSVPatch(acc, payload), {} as any);

            if (user?.uid && Object.keys(vitalsPatch).length > 0) {
                await GlobalProjectionService.updateCrossFunctionalState(user.uid, vitalsPatch).catch((e) => {
                    console.error('Therapy onboarding sync_vitals failed:', e);
                });
            }

            // Handle calibration request on completion
            if (result.completed && Object.keys(vitalsPatch).length === 0) {
                NyxHandoffService.store({
                    moduleId: 'therapy',
                    type: 'delegate',
                    content: buildCalibrationPrompt('therapy'),
                    reason: 'calibration_request',
                    sourceModuleId: 'therapy',
                    createdAt: new Date().toISOString()
                });
            }

            return result;
        }
    },
    onComplete: async (state) => {
      onComplete(state.context);
    }
  });

  return (
    <GuidedIntakeFrame
      title="Agnes Guided Intake"
      subtitle="Building a therapeutic baseline for long-term session continuity."
      statusLabel="ENCRYPTED_ONBOARDING"
      steps={THERAPY_STEPS}
      currentStep={intake.stepIndex}
      themeColor="indigo"
    >
      <NexusChat
        ai={{
          messages: intake.messages,
          isProcessing: intake.isProcessing,
          streamingText: intake.streamingText,
          error: intake.error,
          quota: null,
          handleSendMessage: intake.handleSendMessage
        }}
        agentName="Agnes Intake"
        themeColor="indigo"
        placeholder={spec.placeholder}
        showInternalSignals={false}
      />
    </GuidedIntakeFrame>
  );
}
