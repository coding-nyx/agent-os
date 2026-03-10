import React, { useMemo } from 'react';
import { GuidedIntakeFrame } from '@/core/intake/GuidedIntakeFrame';
import { GuidedChatSpec } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { NexusChat } from '@/core/components/NexusChat';
import { StructuredResponse } from '@/lib/ai-adapters/engine-types';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';
import {
  ScoutProfile,
  createEmptyScoutProfile
} from '../services/scout-knowledge-service';

interface ScoutOnboardingProps {
  initialProfile?: ScoutProfile | null;
  initialBaseContext?: GlobalBaseIntakeContext;
  onGlobalBaseContextFinalize?: (context: GlobalBaseIntakeContext) => Promise<void> | void;
  onComplete: (profile: ScoutProfile) => void;
}

type ScoutIntakeState = {
  profile: ScoutProfile;
  baseContext: GlobalBaseIntakeContext;
  stepProgress: number;
};

const SCOUT_ONBOARDING_PROMPT = `
IDENTITY:
You are Scout Intake Agent.
Collect a concise research baseline before Scout active mode.

OBJECTIVE:
1. Confirm Nexus handoff context.
2. Capture research domains of interest.
3. Capture preferred verification strictness and source quality preferences.
4. Capture expected output style (brief, detailed, with citations).
5. Finalize baseline summary.

ACTION TAGS:
- <action type="update_scout_profile">{"researchFocus":["..."],"summary":"..."}</action>
- <action type="update_global_base_context">{"name":"...","occupation":"..."}</action>
- Sync the UI stage with your current conversational focus by emitting:
  <action type="focus_research_focus">{}</action>
  <action type="focus_evidence_quality">{}</action>
  <action type="focus_output_shape">{}</action>
  <action type="focus_baseline_summary">{}</action>
- <action type="complete_scout_onboarding">{}</action>

RULES:
- Keep questions short and direct.
- Keep questions concise and sequential.
- Emit the relevant focus action whenever you move to a new intake section or if the user redirects you.
- Avoid fabrication; log uncertainty explicitly.
`.trim();

const SCOUT_STEPS = [
  { key: 'focus', label: 'Research Focus', helperText: 'Capture domains and recurring claim categories.' },
  { key: 'quality', label: 'Evidence Quality', helperText: 'Capture preferred source quality and verification strictness.' },
  { key: 'output', label: 'Output Shape', helperText: 'Capture synthesis format and delivery style.' },
  { key: 'summary', label: 'Baseline Summary', helperText: 'Finalize scout baseline and activate mode.' }
] as const;

function hasBaseContext(context: GlobalBaseIntakeContext): boolean {
  return Boolean(context.name || context.pronouns || context.occupation);
}

function buildBasePrompt(context: GlobalBaseIntakeContext): string {
  const chunks = [
    context.name ? `name as ${context.name}` : null,
    context.pronouns ? `pronouns as ${context.pronouns}` : null,
    context.occupation ? `occupation as ${context.occupation}` : null
  ].filter(Boolean);

  if (chunks.length === 0) {
    return 'Scout intake initialized. What topics should I continuously track and verify for you?';
  }

  return `Nexus handoff received. I have your ${chunks.join(', ')}. Is that correct before we configure your research baseline?`;
}

export function ScoutOnboarding({
  initialProfile,
  initialBaseContext,
  onGlobalBaseContextFinalize,
  onComplete
}: ScoutOnboardingProps) {
  const initialContext = useMemo(() => initialBaseContext ?? {}, [initialBaseContext]);

  const spec = useMemo<GuidedChatSpec<ScoutIntakeState>>(
    () => ({
      initialState: {
        profile: initialProfile ?? createEmptyScoutProfile(),
        baseContext: initialContext,
        stepProgress: 0
      },
      initialMessages: [{ role: 'assistant', content: buildBasePrompt(initialContext) }],
      initialStep: 0,
      steps: [...SCOUT_STEPS],
      summary: 'Scout onboarding intake.',
      placeholder: 'Share topics, claims, and evidence standards...',
      buildContext: (state, history) => ({
        systemPrompt: `${SCOUT_ONBOARDING_PROMPT}
[PREFILLED_BASE_CONTEXT]
- Name: ${state.baseContext.name || 'Unknown'}
- Pronouns: ${state.baseContext.pronouns || 'Unknown'}
- Occupation: ${state.baseContext.occupation || 'Unknown'}
${hasBaseContext(state.baseContext) ? '- Confirm/correct this handoff context briefly first.' : ''}
`,
        memoryContext: [],
        summary: 'Scout onboarding intake.',
        history
      }),
      onResponse: (response, state) => {
        let nextProfile = { ...state.profile };
        let nextBaseContext = { ...state.baseContext };
        let nextStep = state.stepProgress;

        const profileUpdates = response.actions
          .filter(a => a.type === 'update_scout_profile')
          .map(a => a.payload as Partial<ScoutProfile>);

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
            if (typeof update.pronouns === 'string' && update.pronouns.trim()) nextBaseContext.pronouns = update.pronouns.trim();
            if (typeof update.occupation === 'string' && update.occupation.trim()) nextBaseContext.occupation = update.occupation.trim();
          }
        }

        const focusAction = [...response.actions].reverse().find((a) =>
          ['focus_research_focus', 'focus_evidence_quality', 'focus_output_shape', 'focus_baseline_summary'].includes(a.type)
        );
        let explicitFocus: number | undefined;
        if (focusAction) {
          if (focusAction.type === 'focus_research_focus') explicitFocus = 0;
          if (focusAction.type === 'focus_evidence_quality') explicitFocus = 1;
          if (focusAction.type === 'focus_output_shape') explicitFocus = 2;
          if (focusAction.type === 'focus_baseline_summary') explicitFocus = 3;
        }

        if (explicitFocus !== undefined) {
          nextStep = explicitFocus;
        }

        const completed = response.actions.some(a => a.type === 'complete_scout_onboarding');
        if (completed) {
          nextProfile.onboardingComplete = true;
          nextProfile.updatedAt = new Date().toISOString();
          nextStep = SCOUT_STEPS.length - 1;
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
      title="Scout Guided Intake"
      subtitle="Configuring your verification and research baseline."
      statusLabel="RESEARCH_BASELINE"
      steps={[...SCOUT_STEPS]}
      currentStep={intake.stepIndex}
      themeColor="lime"
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
        agentName="Scout Intake"
        themeColor="lime"
        placeholder={spec.placeholder}
        showInternalSignals={false}
      />
    </GuidedIntakeFrame>
  );
}
