import React, { useMemo } from 'react';
import { GuidedIntakeFrame } from '@/core/intake/GuidedIntakeFrame';
import { GuidedChatSpec } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { extractActionPayloads, hasActionSignal } from '@/core/intake/action-parser';
import { NexusChat } from '@/core/components/NexusChat';
import { BaseContext } from '../types';
import { THERAPY_ONBOARDING_PERSONA } from '../personas';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';

interface TherapyOnboardingProps {
  initialBaseContext?: GlobalBaseIntakeContext;
  onComplete: (context: Partial<BaseContext>) => void;
}

type TherapyIntakeState = {
  context: Partial<BaseContext>;
  stepProgress: number;
};

const THERAPY_STEPS = [
  {
    key: 'identity',
    label: 'Identity Anchor',
    helperText: 'Start with name and pronouns to establish safe addressing in every session.'
  },
  {
    key: 'background',
    label: 'Background',
    helperText: 'Capture key life context so advice aligns with lived experience.'
  },
  {
    key: 'struggles',
    label: 'Current Struggles',
    helperText: 'Document active emotional load and recurring stress patterns.'
  },
  {
    key: 'goals',
    label: 'Goals',
    helperText: 'Define what progress should look like over upcoming sessions.'
  },
  {
    key: 'preferences',
    label: 'Therapist Preferences',
    helperText: 'Lock tone, communication style, and therapist-fit preferences.'
  }
] as const;

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

function extractIdentityFromUserMessage(message?: string): { name?: string; pronouns?: string } {
  if (!message) return {};

  const extracted: { name?: string; pronouns?: string } = {};
  const nameMatch = message.match(/\b(?:my name is|call me|i'm)\s+([a-z][a-z' -]{0,30})/i);
  if (nameMatch) {
    const raw = nameMatch[1].trim().split(/\s+/)[0];
    extracted.name = raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  const pronounsMatch = message.match(
    /\b(?:pronouns(?: are)?\s*)?(she\/her|he\/him|they\/them|she her|he him|they them)\b/i
  );
  if (pronounsMatch) {
    extracted.pronouns = pronounsMatch[1].replace(/\s+/g, '/').toLowerCase();
  }

  return extracted;
}

function extractLifestyleFromUserMessage(message?: string): { occupation?: string; typicalSleepHours?: number } {
  if (!message) return {};
  const updates: { occupation?: string; typicalSleepHours?: number } = {};

  const occupationMatch = message.match(/\b(?:i(?:'m| am)|i work as|my job is|occupation is)\s+([a-z][a-z0-9'\/&,\- ]{1,50})/i);
  if (occupationMatch) {
    updates.occupation = occupationMatch[1].trim();
  }

  const sleepMatch = message.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:hours?|hrs?)\b/i);
  if (sleepMatch) {
    const parsed = Number.parseFloat(sleepMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 24) {
      updates.typicalSleepHours = parsed;
    }
  }

  return updates;
}

function isAffirmativeIdentityConfirmation(message?: string): boolean {
  if (!message) return false;
  return /\b(yes|yep|yup|correct|that'?s right|sounds right|exactly)\b/i.test(message);
}

function inferStepFromAssistantResponse(response: string): number | null {
  if (/\b(therapist preferences|preferred therapist|tone|traits)\b/i.test(response)) return 4;
  if (/\b(goals?|what do you hope|outcome)\b/i.test(response)) return 3;
  if (/\b(struggles?|what has been feeling heavy|stress|trauma)\b/i.test(response)) return 2;
  if (/\b(background|childhood|history|upbringing)\b/i.test(response)) return 1;
  if (/\b(name|pronouns)\b/i.test(response)) return 0;
  return null;
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
  const initialContext = useMemo<Partial<BaseContext>>(() => {
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

  const spec = useMemo<GuidedChatSpec<TherapyIntakeState>>(() => ({
    initialState: {
      context: initialContext,
      stepProgress: 0
    },
    initialMessages: [
      {
        role: 'assistant',
        content: buildInitialPrompt(initialBaseContext)
      }
    ],
    initialStep: 0,
    steps: [...THERAPY_STEPS],
    summary: 'Therapy onboarding intake.',
    placeholder: 'Share your response...',
    buildContext: (state, history) => ({
      systemPrompt: `${THERAPY_ONBOARDING_PERSONA}

[PREFILLED_IDENTITY]
- Name: ${resolveIdentity(state.context.identity).name || 'Unknown'}
- Pronouns: ${resolveIdentity(state.context.identity).pronouns || 'Unknown'}
[PREFILLED_LIFESTYLE]
- Occupation: ${state.context.occupation || 'Unknown'}
- Typical Sleep Hours: ${state.context.typicalSleepHours || 'Unknown'}
`,
      insights: [],
      summary: 'Therapy onboarding intake.',
      history
    }),
    onResponse: (response, state, meta) => {
      let nextContext = { ...state.context };
      let nextStep = state.stepProgress;

      const updatePayloads = extractActionPayloads<Partial<BaseContext>>(response, 'update_therapy_context');
      if (updatePayloads.length > 0) {
        for (const parsed of updatePayloads) {
          nextContext = mergeTherapyContext(nextContext, parsed);
        }
        nextStep = Math.min(nextStep + 1, THERAPY_STEPS.length - 1);
      }

      const identityFromUser = extractIdentityFromUserMessage(meta?.latestUserMessage);
      if (identityFromUser.name || identityFromUser.pronouns) {
        nextContext = mergeTherapyContext(nextContext, { identity: identityFromUser });
      }
      const lifestyleFromUser = extractLifestyleFromUserMessage(meta?.latestUserMessage);
      if (lifestyleFromUser.occupation) {
        nextContext.occupation = lifestyleFromUser.occupation;
      }
      if (typeof lifestyleFromUser.typicalSleepHours === 'number') {
        nextContext.typicalSleepHours = lifestyleFromUser.typicalSleepHours;
      }

      const resolvedIdentity = resolveIdentity(nextContext.identity);
      if (resolvedIdentity.name && resolvedIdentity.pronouns) {
        if (isAffirmativeIdentityConfirmation(meta?.latestUserMessage) || identityFromUser.name || identityFromUser.pronouns) {
          nextStep = Math.max(nextStep, 1);
        }
      }

      const inferredStep = inferStepFromAssistantResponse(response);
      if (typeof inferredStep === 'number') {
        nextStep = Math.max(nextStep, inferredStep);
      }

      const completed = hasActionSignal(response, 'complete_therapy_onboarding');
      if (completed) {
        nextStep = THERAPY_STEPS.length - 1;
      }

      return {
        nextState: {
          context: nextContext,
          stepProgress: nextStep
        },
        nextStep,
        completed
      };
    }
  }), [initialContext, initialBaseContext]);

  const intake = useGuidedChatIntake({
    spec,
    onComplete: async (state) => {
      onComplete(state.context);
    }
  });

  return (
    <GuidedIntakeFrame
      title="Agnes Guided Intake"
      subtitle="Building a therapeutic baseline for long-term session continuity."
      statusLabel="ENCRYPTED_ONBOARDING"
      steps={[...THERAPY_STEPS]}
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
