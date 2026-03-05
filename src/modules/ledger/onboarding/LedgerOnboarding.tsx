import React, { useMemo } from 'react';
import { GuidedIntakeFrame } from '@/core/intake/GuidedIntakeFrame';
import { GuidedChatSpec } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { extractActionPayloads, hasActionSignal } from '@/core/intake/action-parser';
import { NexusChat } from '@/core/components/NexusChat';
import { LedgerIntakeProfile, createEmptyLedgerProfile } from '../services/ledger-intake-service';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';

interface LedgerOnboardingProps {
  initialProfile?: LedgerIntakeProfile | null;
  initialBaseContext?: GlobalBaseIntakeContext;
  onGlobalBaseContextFinalize?: (context: GlobalBaseIntakeContext) => Promise<void> | void;
  onComplete: (profile: LedgerIntakeProfile) => void;
}

type LedgerIntakeState = {
  profile: LedgerIntakeProfile;
  baseContext: GlobalBaseIntakeContext;
  stepProgress: number;
};

const LEDGER_ONBOARDING_PROMPT = `
IDENTITY:
You are The Ledger Intake Agent.
You are collecting a safe clinical baseline before diagnostic chat begins.

OBJECTIVE:
Collect this data in sequence, one theme at a time:
1. Confirm Nyx handoff context (name/pronouns/occupation/sleep) if present.
2. Primary health concerns and current symptoms.
3. Existing conditions and medications/supplements.
4. Contraindications, allergies, or known treatment limits.
5. Short summary of what the user needs from Ledger.

ACTION TAGS:
- <action type="update_ledger_profile">{"primaryConcerns": ["..."], "medications": ["..."], "contraindications": ["..."], "summary": "..."}</action>
- <action type="update_global_base_context">{"name":"...","pronouns":"...","occupation":"...","typicalSleepHours":7}</action>
- <action type="complete_ledger_onboarding">{}</action>

RULES:
- Ask short direct questions.
- Be cautious and clinical.
- Never diagnose; only baseline collection.
`.trim();

const LEDGER_STEPS = [
  {
    key: 'concerns',
    label: 'Clinical Concerns',
    helperText: 'Capture top symptoms or health priorities requiring monitoring.'
  },
  {
    key: 'medications',
    label: 'Medication Stack',
    helperText: 'Capture medications and supplements currently in use.'
  },
  {
    key: 'contraindications',
    label: 'Contraindications',
    helperText: 'Capture allergies and known treatment boundaries.'
  },
  {
    key: 'summary',
    label: 'Intake Summary',
    helperText: 'Finalize the baseline and unlock full ledger diagnostics.'
  }
] as const;

function hasBaseContext(context: GlobalBaseIntakeContext): boolean {
  return Boolean(context.name || context.pronouns || context.occupation || typeof context.typicalSleepHours === 'number');
}

function buildBasePrompt(context: GlobalBaseIntakeContext): string {
  const chunks = [
    context.name ? `name as ${context.name}` : null,
    context.pronouns ? `pronouns as ${context.pronouns}` : null,
    context.occupation ? `occupation as ${context.occupation}` : null,
    typeof context.typicalSleepHours === 'number' ? `typical sleep around ${context.typicalSleepHours} hours/night` : null
  ].filter(Boolean);

  if (chunks.length === 0) {
    return 'Ledger intake initialized. What are your top current health concerns or symptoms to monitor?';
  }

  return `Nyx handoff received. I have your ${chunks.join(', ')}. Is that correct before we start medical intake?`;
}

export function LedgerOnboarding({
  initialProfile,
  initialBaseContext,
  onGlobalBaseContextFinalize,
  onComplete
}: LedgerOnboardingProps) {
  const initialContext = useMemo(() => initialBaseContext ?? {}, [initialBaseContext]);

  const spec = useMemo<GuidedChatSpec<LedgerIntakeState>>(() => ({
    initialState: {
      profile: initialProfile ?? createEmptyLedgerProfile(),
      baseContext: initialContext,
      stepProgress: 0
    },
    initialMessages: [
      {
        role: 'assistant',
        content: buildBasePrompt(initialContext)
      }
    ],
    initialStep: 0,
    steps: [...LEDGER_STEPS],
    summary: 'Ledger onboarding intake.',
    placeholder: 'Share your health baseline details...',
    buildContext: (state, history) => ({
      systemPrompt: `${LEDGER_ONBOARDING_PROMPT}
[PREFILLED_BASE_CONTEXT]
- Name: ${state.baseContext.name || 'Unknown'}
- Pronouns: ${state.baseContext.pronouns || 'Unknown'}
- Occupation: ${state.baseContext.occupation || 'Unknown'}
- Typical Sleep Hours: ${
  typeof state.baseContext.typicalSleepHours === 'number' ? state.baseContext.typicalSleepHours : 'Unknown'
}
${hasBaseContext(state.baseContext) ? '- Confirm/correct this handoff context briefly first.' : ''}
`,
      insights: [],
      summary: 'Ledger onboarding intake.',
      history
    }),
    onResponse: (response, state) => {
      let nextProfile = { ...state.profile };
      let nextBaseContext = { ...state.baseContext };
      let nextStep = state.stepProgress;

      const updatePayloads = extractActionPayloads<Partial<LedgerIntakeProfile>>(response, 'update_ledger_profile');
      if (updatePayloads.length > 0) {
        for (const parsed of updatePayloads) {
          nextProfile = {
            ...nextProfile,
            ...parsed,
            updatedAt: new Date().toISOString()
          };
        }
        nextStep = Math.min(nextStep + 1, LEDGER_STEPS.length - 1);
      }

      const baseContextUpdates = extractActionPayloads<Partial<GlobalBaseIntakeContext>>(response, 'update_global_base_context');
      if (baseContextUpdates.length > 0) {
        for (const parsed of baseContextUpdates) {
          if (typeof parsed.name === 'string' && parsed.name.trim()) nextBaseContext.name = parsed.name.trim();
          if (typeof parsed.pronouns === 'string' && parsed.pronouns.trim()) nextBaseContext.pronouns = parsed.pronouns.trim();
          if (typeof parsed.occupation === 'string' && parsed.occupation.trim()) nextBaseContext.occupation = parsed.occupation.trim();
          if (
            typeof parsed.typicalSleepHours === 'number' &&
            Number.isFinite(parsed.typicalSleepHours) &&
            parsed.typicalSleepHours > 0 &&
            parsed.typicalSleepHours <= 24
          ) {
            nextBaseContext.typicalSleepHours = parsed.typicalSleepHours;
          }
        }
      }

      const completed = hasActionSignal(response, 'complete_ledger_onboarding');
      if (completed) {
        nextProfile.onboardingComplete = true;
        nextProfile.updatedAt = new Date().toISOString();
        nextStep = LEDGER_STEPS.length - 1;
      }

      return {
        nextState: {
          profile: nextProfile,
          baseContext: nextBaseContext,
          stepProgress: nextStep
        },
        nextStep,
        completed
      };
    }
  }), [initialContext, initialProfile]);

  const intake = useGuidedChatIntake({
    spec,
    onComplete: async (state) => {
      if (onGlobalBaseContextFinalize) {
        await onGlobalBaseContextFinalize(state.baseContext);
      }
      onComplete({ ...state.profile, onboardingComplete: true });
    }
  });

  return (
    <GuidedIntakeFrame
      title="Ledger Guided Intake"
      subtitle="Collecting risk-aware baseline before diagnostics and synthesis."
      statusLabel="MEDICAL_BASELINE"
      steps={[...LEDGER_STEPS]}
      currentStep={intake.stepIndex}
      themeColor="cyan"
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
        agentName="Ledger Intake"
        themeColor="cyan"
        placeholder={spec.placeholder}
        showInternalSignals={false}
      />
    </GuidedIntakeFrame>
  );
}
