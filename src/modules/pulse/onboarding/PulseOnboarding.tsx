import React, { useMemo } from 'react';
import { GuidedIntakeFrame } from '@/core/intake/GuidedIntakeFrame';
import { GuidedChatSpec } from '@/core/intake/types';
import { StructuredResponse } from '@/llm-engine/engine/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { NexusChat } from '@/core/components/NexusChat';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';
import { PulseProfile, createEmptyPulseProfile } from '../services/pulse-profile-service';

interface PulseOnboardingProps {
  initialProfile?: PulseProfile | null;
  initialBaseContext?: GlobalBaseIntakeContext;
  onGlobalBaseContextFinalize?: (context: GlobalBaseIntakeContext) => Promise<void> | void;
  onComplete: (profile: PulseProfile) => void;
}

type PulseIntakeState = {
  profile: PulseProfile;
  baseContext: GlobalBaseIntakeContext;
  stepProgress: number;
};

const PULSE_ONBOARDING_PROMPT = `
IDENTITY:
You are Pulse Intake Agent.
Collect a concise interest-tracking baseline before Pulse active mode.

OBJECTIVE:
1. Confirm Nexus handoff context.
2. Capture domains and topics to track continuously.
3. Capture signal cadence and noise tolerance.
4. Capture preferred synthesis style.
5. Finalize baseline summary.

ACTION TAGS:
- <action type="update_pulse_profile">{"interests":[{"topic":"AI","score":60,"trend":"rising"}],"summary":"..."}</action>
- <action type="update_global_base_context">{"name":"...","occupation":"..."}</action>
- Sync the UI stage with your current conversational focus by emitting:
  <action type="focus_topic_map">{}</action>
  <action type="focus_signal_cadence">{}</action>
  <action type="focus_synthesis_style">{}</action>
  <action type="focus_baseline_summary">{}</action>
- <action type="complete_pulse_onboarding">{}</action>

RULES:
- Keep questions short.
- Keep questions concise and sequential.
- Emit the relevant focus action whenever you move to a new intake section or if the user redirects you.
- Prioritize relevance over volume.
`.trim();

const PULSE_STEPS = [
  { key: 'topics', label: 'Topic Map', helperText: 'Capture primary domains and recurring topics.' },
  { key: 'cadence', label: 'Signal Cadence', helperText: 'Capture update frequency and noise tolerance.' },
  { key: 'synthesis', label: 'Synthesis Style', helperText: 'Capture how trends should be summarized.' },
  { key: 'summary', label: 'Baseline Summary', helperText: 'Finalize pulse baseline and activate mode.' }
] as const;

function hasBaseContext(context: GlobalBaseIntakeContext): boolean {
  return Boolean(context.name || context.occupation);
}

function buildBasePrompt(context: GlobalBaseIntakeContext): string {
  const chunks = [context.name ? `name as ${context.name}` : null, context.occupation ? `occupation as ${context.occupation}` : null].filter(Boolean);
  if (chunks.length === 0) {
    return 'Pulse intake initialized. Which topics should I continuously watch for momentum changes?';
  }
  return `Nexus handoff received. I have your ${chunks.join(', ')}. Is that correct before we configure your topic map?`;
}

export function PulseOnboarding({
  initialProfile,
  initialBaseContext,
  onGlobalBaseContextFinalize,
  onComplete
}: PulseOnboardingProps) {
  const initialContext = useMemo(() => initialBaseContext ?? {}, [initialBaseContext]);

  const spec = useMemo<GuidedChatSpec<PulseIntakeState>>(
    () => ({
      initialState: {
        profile: initialProfile ?? createEmptyPulseProfile(),
        baseContext: initialContext,
        stepProgress: 0
      },
      initialMessages: [{ role: 'assistant', content: buildBasePrompt(initialContext) }],
      initialStep: 0,
      steps: [...PULSE_STEPS],
      summary: 'Pulse onboarding intake.',
      placeholder: 'List topics, trend preferences, and synthesis format...',
      buildContext: (state, history) => ({
        systemPrompt: `${PULSE_ONBOARDING_PROMPT}
[PREFILLED_BASE_CONTEXT]
- Name: ${state.baseContext.name || 'Unknown'}
- Occupation: ${state.baseContext.occupation || 'Unknown'}
${hasBaseContext(state.baseContext) ? '- Confirm/correct this handoff context briefly first.' : ''}
`,
        memoryContext: [],
        summary: 'Pulse onboarding intake.',
        history
      }),
      onResponse: (response, state) => {
        let nextProfile = { ...state.profile };
        let nextBaseContext = { ...state.baseContext };
        let nextStep = state.stepProgress;

        const profileUpdates = response.actions
          .filter(a => a.type === 'update_pulse_profile')
          .map(a => a.payload as Partial<PulseProfile>);

        if (profileUpdates.length > 0) {
          for (const update of profileUpdates) {
            nextProfile = {
              ...nextProfile,
              ...update,
              updatedAt: new Date().toISOString()
            };
          }
        }

        const baseContextUpdates = response.actions
          .filter(a => a.type === 'update_global_base_context')
          .map(a => a.payload as Partial<GlobalBaseIntakeContext>);

        if (baseContextUpdates.length > 0) {
          for (const update of baseContextUpdates) {
            if (typeof update.name === 'string' && update.name.trim()) nextBaseContext.name = update.name.trim();
            if (typeof update.occupation === 'string' && update.occupation.trim()) nextBaseContext.occupation = update.occupation.trim();
          }
        }

        const focusAction = [...response.actions].reverse().find((a) =>
          ['focus_topic_map', 'focus_signal_cadence', 'focus_synthesis_style', 'focus_baseline_summary'].includes(a.type)
        );
        let explicitFocus: number | undefined;
        if (focusAction) {
          if (focusAction.type === 'focus_topic_map') explicitFocus = 0;
          if (focusAction.type === 'focus_signal_cadence') explicitFocus = 1;
          if (focusAction.type === 'focus_synthesis_style') explicitFocus = 2;
          if (focusAction.type === 'focus_baseline_summary') explicitFocus = 3;
        }

        if (explicitFocus !== undefined) {
          nextStep = explicitFocus;
        }

        const completed = response.actions.some(a => a.type === 'complete_pulse_onboarding');
        if (completed) {
          nextProfile.onboardingComplete = true;
          nextProfile.updatedAt = new Date().toISOString();
          nextStep = PULSE_STEPS.length - 1;
        }

        return {
          nextState: { profile: nextProfile, baseContext: nextBaseContext, stepProgress: nextStep },
          nextStep,
          completed
        };
      }
    }),
    [initialContext, initialProfile]
  );

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
      title="Pulse Guided Intake"
      subtitle="Configuring topic momentum tracking and synthesis defaults."
      statusLabel="INTEREST_BASELINE"
      steps={[...PULSE_STEPS]}
      currentStep={intake.stepIndex}
      themeColor="fuchsia"
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
        agentName="Pulse Intake"
        themeColor="cyan"
        placeholder={spec.placeholder}
        showInternalSignals={false}
      />
    </GuidedIntakeFrame>
  );
}
