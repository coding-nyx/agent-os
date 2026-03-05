import React, { useMemo } from 'react';
import { GuidedIntakeFrame } from '@/core/intake/GuidedIntakeFrame';
import { GuidedChatSpec } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { extractActionPayloads, hasActionSignal } from '@/core/intake/action-parser';
import { NexusChat } from '@/core/components/NexusChat';
import { AgentPersonalityProvision, CoreUserProfile, GenderPersonality } from '@/lib/types';
import { ORCHESTRATOR_ONBOARDING_PERSONA } from '../personas';

type OnboardingStepKey = 'identity' | 'bio' | 'persona' | 'review';

type OrchestratorIntakeState = {
  profileUpdates: Partial<CoreUserProfile>;
  orchestratorAlias: string;
  orchestratorGender: GenderPersonality;
  stepProgress: number;
};

type OrchestratorIntakePayload = {
  preferredName?: string;
  pronouns?: string;
  age?: number;
  assignedSexAtBirth?: 'female' | 'male';
  genderIdentity?: string;
  occupation?: string;
  typicalSleepHours?: number;
  orchestratorAlias?: string;
  orchestratorGender?: GenderPersonality;
  step?: OnboardingStepKey;
};

interface OrchestratorOnboardingProps {
  profile: CoreUserProfile | null;
  isSubmitting: boolean;
  onComplete: (updates: Partial<CoreUserProfile>) => Promise<void>;
}

const ORCHESTRATOR_STEPS = [
  {
    key: 'identity',
    label: 'Identity Baseline',
    helperText: 'Capture preferred name and pronouns for Nyx session continuity.'
  },
  {
    key: 'bio',
    label: 'Bio Context (Optional)',
    helperText: 'Capture optional biological and lifestyle context for smarter cross-module recommendations.'
  },
  {
    key: 'persona',
    label: 'Nyx Persona',
    helperText: 'Personalize Nyx alias and gender personality only.'
  },
  {
    key: 'review',
    label: 'Protocol Commit',
    helperText: 'Review and commit Nyx onboarding to unlock orchestrator chat.'
  }
] as const;

const STEP_INDEX: Record<OnboardingStepKey, number> = {
  identity: 0,
  bio: 1,
  persona: 2,
  review: 3
};

const DEFAULT_PERSONALITY: AgentPersonalityProvision = {
  orchestratorAlias: 'Nyx',
  moduleAliases: {
    therapy: 'Agnes',
    trainer: 'Titan',
    ledger: 'Ledger'
  },
  moduleGenderProfiles: {
    orchestrator: 'female',
    therapy: 'female',
    trainer: 'female',
    ledger: 'female'
  },
  personaOverlays: {}
};

function isValidGender(value: unknown): value is GenderPersonality {
  return value === 'female' || value === 'male' || value === 'non-binary' || value === 'gender-fluid';
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function compactProfileUpdates(updates: Partial<CoreUserProfile>): Partial<CoreUserProfile> {
  return Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined)
  ) as Partial<CoreUserProfile>;
}

function hasImplicitCompletionSignal(response: string): boolean {
  return /\b(onboarding (?:is )?complete|intake (?:is )?complete|all the information i need|let'?s finalize|we(?:'re| are) done)\b/i.test(
    response
  );
}

function inferStepFromAssistantResponse(response: string): number | null {
  if (/\b(review|confirm|finaliz|commit|complete)\b/i.test(response)) return STEP_INDEX.review;
  if (/\b(alias|persona|gender personality)\b/i.test(response)) return STEP_INDEX.persona;
  if (/\b(age|assigned sex|sex at birth|gender identity|bio context|biological|occupation|sleep)\b/i.test(response)) return STEP_INDEX.bio;
  if (/\b(preferred name|pronouns|what should i call you)\b/i.test(response)) return STEP_INDEX.identity;
  return null;
}

function inferIdentityFromUserMessage(message?: string): Partial<CoreUserProfile> {
  if (!message) return {};
  const updates: Partial<CoreUserProfile> = {};

  const pronounsMatch = message.match(/\b(she\/her|he\/him|they\/them|she her|he him|they them)\b/i);
  if (pronounsMatch) {
    updates.pronouns = pronounsMatch[1].replace(/\s+/g, '/').toLowerCase();
  }

  const occupationMatch = message.match(/\b(?:i(?:'m| am)|i work as|occupation is|my job is)\s+([a-z][a-z0-9'\/&,\- ]{1,50})/i);
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

  const nameMatch = message.match(/\b(?:my name is|call me|i'm)\s+([a-z][a-z' -]{0,30})/i);
  if (nameMatch) {
    const raw = nameMatch[1].trim().split(/\s+/)[0];
    updates.preferredName = raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  return updates;
}

export function OrchestratorOnboarding({ profile, isSubmitting, onComplete }: OrchestratorOnboardingProps) {
  const existingProvision = profile?.agentPersonalityProvision ?? DEFAULT_PERSONALITY;
  const initialAlias = existingProvision.orchestratorAlias || 'Nyx';
  const initialGender = existingProvision.moduleGenderProfiles.orchestrator || 'female';
  const initialProfileUpdates = compactProfileUpdates({
    preferredName: profile?.preferredName,
    pronouns: profile?.pronouns,
    age: profile?.age,
    assignedSexAtBirth: profile?.assignedSexAtBirth,
    genderIdentity: profile?.genderIdentity,
    occupation: profile?.occupation,
    typicalSleepHours: profile?.typicalSleepHours
  });

  const spec = useMemo<GuidedChatSpec<OrchestratorIntakeState>>(() => ({
    initialState: {
      profileUpdates: initialProfileUpdates,
      orchestratorAlias: initialAlias,
      orchestratorGender: initialGender,
      stepProgress: 0
    },
    initialMessages: [
      {
        role: 'assistant',
        content: `Welcome to Nyx guided onboarding. I only need your core identity and Nyx preferences. What should I call you, and what pronouns should I use?`
      }
    ],
    initialStep: 0,
    steps: [...ORCHESTRATOR_STEPS],
    summary: 'Orchestrator onboarding intake.',
    placeholder: 'Respond to Nyx...',
    canSend: () => !isSubmitting,
    buildContext: (state, history) => ({
      systemPrompt: ORCHESTRATOR_ONBOARDING_PERSONA,
      insights: [],
      summary: `Orchestrator onboarding intake. Current step index: ${state.stepProgress}.`,
      history
    }),
    onResponse: (response, state, meta) => {
      let nextUpdates: Partial<CoreUserProfile> = { ...state.profileUpdates };
      let nextAlias = state.orchestratorAlias;
      let nextGender = state.orchestratorGender;
      let nextStep = state.stepProgress;
      let sawPersonaUpdate = false;

      const updatePayloads = extractActionPayloads<OrchestratorIntakePayload>(response, 'update_orchestrator_intake');
      if (updatePayloads.length > 0) {
        for (const parsed of updatePayloads) {
          const preferredName = normalizeOptionalString(parsed.preferredName);
          const pronouns = normalizeOptionalString(parsed.pronouns);
          const genderIdentity = normalizeOptionalString(parsed.genderIdentity);
          const occupation = normalizeOptionalString(parsed.occupation);
          const orchestratorAlias = normalizeOptionalString(parsed.orchestratorAlias);

          if (preferredName) nextUpdates.preferredName = preferredName;
          if (pronouns) nextUpdates.pronouns = pronouns;
          if (genderIdentity) nextUpdates.genderIdentity = genderIdentity;
          if (occupation) nextUpdates.occupation = occupation;

          if (typeof parsed.age === 'number' && Number.isFinite(parsed.age) && parsed.age > 0) {
            nextUpdates.age = Math.round(parsed.age);
          }
          if (
            typeof parsed.typicalSleepHours === 'number' &&
            Number.isFinite(parsed.typicalSleepHours) &&
            parsed.typicalSleepHours > 0 &&
            parsed.typicalSleepHours <= 24
          ) {
            nextUpdates.typicalSleepHours = parsed.typicalSleepHours;
          }
          if (parsed.assignedSexAtBirth === 'female' || parsed.assignedSexAtBirth === 'male') {
            nextUpdates.assignedSexAtBirth = parsed.assignedSexAtBirth;
          }

          if (orchestratorAlias) nextAlias = orchestratorAlias;
          if (orchestratorAlias) sawPersonaUpdate = true;
          if (isValidGender(parsed.orchestratorGender)) {
            nextGender = parsed.orchestratorGender;
            sawPersonaUpdate = true;
          }

          if (parsed.step && STEP_INDEX[parsed.step] !== undefined) {
            nextStep = Math.max(nextStep, STEP_INDEX[parsed.step]);
          }
        }
      }

      const inferredIdentity = inferIdentityFromUserMessage(meta?.latestUserMessage);
      if (!nextUpdates.preferredName && inferredIdentity.preferredName) {
        nextUpdates.preferredName = inferredIdentity.preferredName;
      }
      if (!nextUpdates.pronouns && inferredIdentity.pronouns) {
        nextUpdates.pronouns = inferredIdentity.pronouns;
      }

      if (nextUpdates.preferredName && nextUpdates.pronouns) {
        nextStep = Math.max(nextStep, 1);
      }
      if (sawPersonaUpdate) {
        nextStep = Math.max(nextStep, 2);
      }

      const inferredStep = inferStepFromAssistantResponse(response);
      if (typeof inferredStep === 'number') {
        nextStep = Math.max(nextStep, inferredStep);
      }

      const explicitCompletion = hasActionSignal(response, 'complete_orchestrator_onboarding');
      const hasRequiredIdentity = Boolean(nextUpdates.preferredName && nextUpdates.pronouns);
      const implicitCompletion = hasRequiredIdentity && hasImplicitCompletionSignal(response);
      let completed = explicitCompletion || implicitCompletion;
      let assistantMessage: string | undefined;

      if (completed && !hasRequiredIdentity) {
        completed = false;
        assistantMessage = 'Before we finalize, share your preferred name and pronouns so Nyx can address you correctly.';
      }

      if (completed) {
        nextStep = ORCHESTRATOR_STEPS.length - 1;
        assistantMessage = 'Intake complete. Committing Nyx profile configuration now.';
      }

      return {
        nextState: {
          profileUpdates: nextUpdates,
          orchestratorAlias: nextAlias,
          orchestratorGender: nextGender,
          stepProgress: nextStep
        },
        nextStep,
        completed,
        assistantMessage
      };
    }
  }), [
    initialProfileUpdates,
    initialAlias,
    initialGender,
    isSubmitting,
  ]);

  const intake = useGuidedChatIntake({
    spec,
    onComplete: async (state) => {
      const provision: AgentPersonalityProvision = {
        ...DEFAULT_PERSONALITY,
        ...existingProvision,
        moduleAliases: {
          ...DEFAULT_PERSONALITY.moduleAliases,
          ...(existingProvision.moduleAliases || {})
        },
        moduleGenderProfiles: {
          ...DEFAULT_PERSONALITY.moduleGenderProfiles,
          ...(existingProvision.moduleGenderProfiles || {}),
          orchestrator: state.orchestratorGender
        },
        personaOverlays: existingProvision.personaOverlays || {}
      };

      provision.orchestratorAlias = state.orchestratorAlias || existingProvision.orchestratorAlias || 'Nyx';

      const safeUpdates = compactProfileUpdates(state.profileUpdates);
      await onComplete({
        ...safeUpdates,
        onboardingComplete: true,
        schemaVersion: 2,
        agentPersonalityProvision: provision
      });
    }
  });

  return (
    <GuidedIntakeFrame
      title="Nyx Interactive Intake"
      subtitle="Configure your core identity and Nyx only. Other bots onboard independently."
      statusLabel="ORCHESTRATOR_ONBOARDING"
      steps={[...ORCHESTRATOR_STEPS]}
      currentStep={intake.stepIndex}
      themeColor="indigo"
    >
      <NexusChat
        ai={{
          messages: intake.messages,
          isProcessing: intake.isProcessing || isSubmitting,
          streamingText: intake.streamingText,
          error: intake.error,
          quota: null,
          handleSendMessage: intake.handleSendMessage
        }}
        agentName="Nyx Intake"
        themeColor="indigo"
        placeholder={spec.placeholder}
        showInternalSignals={false}
      />
    </GuidedIntakeFrame>
  );
}
