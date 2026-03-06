import React, { useMemo } from 'react';
import { GuidedIntakeFrame } from '@/core/intake/GuidedIntakeFrame';
import { GuidedChatSpec } from '@/core/intake/types';
import { StructuredResponse } from '@/llm-engine/engine/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { NexusChat } from '@/core/components/NexusChat';
import { useAuth } from '@/lib/auth-context';
import {
  AtlasProfile,
  createEmptyAtlasProfile
} from '../services/atlas-profile-service';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { mergeNSVPatch } from '@/lib/services/nsv-service';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { buildCalibrationPrompt } from '@/lib/services/nsv-ownership';

interface AtlasOnboardingProps {
  initialProfile?: AtlasProfile | null;
  initialBaseContext?: GlobalBaseIntakeContext;
  onGlobalBaseContextFinalize?: (context: GlobalBaseIntakeContext) => Promise<void> | void;
  onComplete: (profile: AtlasProfile) => void;
}

type AtlasIntakeState = {
  profile: AtlasProfile;
  baseContext: GlobalBaseIntakeContext;
  stepProgress: number;
};

const ATLAS_ONBOARDING_PROMPT = `
IDENTITY:
You are Atlas Intake Agent.
Collect a concise cognitive scheduling baseline before Atlas active mode.

OBJECTIVE:
1. Confirm Nexus handoff context.
2. Capture daily energy peaks and crash windows.
3. Capture current task load and overload triggers.
4. Capture recovery strategies and scheduling constraints.
5. Finalize concise operating summary.

ACTION TAGS:
- <action type="update_atlas_profile">{"summary":"...","energyWave":[{"slot":"09:00-11:00","energy":8,"focus":8,"load":4}],"taskGraph":[{"title":"Deep Work","energyCost":7,"status":"queued"}]}</action>
- <action type="update_global_base_context">{"name":"...","occupation":"...","typicalSleepHours":7}</action>
- After collecting baseline vitals, emit a bulk update (only once the user has provided actual data):
  <action type="sync_vitals">{"cognitive":{"energyBudget":null,"focusScore":null,"activeLoad":null}}</action>
- Sync the UI stage with your current conversational focus by emitting:
  <action type="focus_energy_wave">{}</action>
  <action type="focus_load_pressure">{}</action>
  <action type="focus_recovery_constraints">{}</action>
  <action type="focus_execution_baseline">{}</action>
- <action type="complete_atlas_onboarding">{}</action>

RULES:
- Ask short direct questions.
- Keep questions concise and sequential.
- Emit the relevant focus action whenever you move to a new intake section or if the user redirects you.
- Keep values practical and bounded.
`.trim();

const ATLAS_STEPS = [
  {
    key: 'wave',
    label: 'Energy Wave',
    helperText: 'Capture high-focus windows and crash zones.'
  },
  {
    key: 'load',
    label: 'Load Pressure',
    helperText: 'Capture current cognitive load and overload triggers.'
  },
  {
    key: 'recovery',
    label: 'Recovery Constraints',
    helperText: 'Capture recovery windows and non-negotiable breaks.'
  },
  {
    key: 'summary',
    label: 'Execution Baseline',
    helperText: 'Finalize Atlas scheduling baseline and activation.'
  }
] as const;

function hasBaseContext(context: GlobalBaseIntakeContext): boolean {
  return Boolean(
    context.name ||
      context.pronouns ||
      context.occupation ||
      typeof context.typicalSleepHours === 'number'
  );
}

function buildBasePrompt(context: GlobalBaseIntakeContext): string {
  const chunks = [
    context.name ? `name as ${context.name}` : null,
    context.pronouns ? `pronouns as ${context.pronouns}` : null,
    context.occupation ? `occupation as ${context.occupation}` : null,
    typeof context.typicalSleepHours === 'number' ? `typical sleep around ${context.typicalSleepHours} hours/night` : null
  ].filter(Boolean);

  if (chunks.length === 0) {
    return 'Atlas intake initialized. When during your day is your focus naturally strongest?';
  }

  return `Nexus handoff received. I have your ${chunks.join(', ')}. Is that correct before we map your energy wave?`;
}

export function AtlasOnboarding({
  initialProfile,
  initialBaseContext,
  onGlobalBaseContextFinalize,
  onComplete
}: AtlasOnboardingProps) {
  const { user } = useAuth();
  const initialContext = useMemo(() => initialBaseContext ?? {}, [initialBaseContext]);

  const spec = useMemo<GuidedChatSpec<AtlasIntakeState>>(
    () => ({
      initialState: {
        profile: initialProfile ?? createEmptyAtlasProfile(),
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
      steps: [...ATLAS_STEPS],
      summary: 'Atlas cognitive onboarding intake.',
      placeholder: 'Describe your energy peaks, crashes, and task pressure...',
      buildContext: (state, history) => ({
        systemPrompt: `${ATLAS_ONBOARDING_PROMPT}
[PREFILLED_BASE_CONTEXT]
- Name: ${state.baseContext.name || 'Unknown'}
- Pronouns: ${state.baseContext.pronouns || 'Unknown'}
- Occupation: ${state.baseContext.occupation || 'Unknown'}
- Typical Sleep Hours: ${
          typeof state.baseContext.typicalSleepHours === 'number' ? state.baseContext.typicalSleepHours : 'Unknown'
        }
${hasBaseContext(state.baseContext) ? '- Confirm/correct this handoff context briefly first.' : ''}
`,
        memoryContext: [],
        summary: 'Atlas onboarding intake.',
        history
      }),
      onResponse: async (response, state) => {
        let nextProfile = { ...state.profile };
        let nextBaseContext = { ...state.baseContext };
        let nextStep = state.stepProgress;

        const profileUpdates = response.actions
          .filter(a => a.type === 'update_atlas_profile')
          .map(a => a.payload as Partial<AtlasProfile>);

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
            if (
              typeof update.typicalSleepHours === 'number' &&
              Number.isFinite(update.typicalSleepHours) &&
              update.typicalSleepHours > 0 &&
              update.typicalSleepHours <= 24
            ) {
              nextBaseContext.typicalSleepHours = update.typicalSleepHours;
            }
          }
        }

        const focusAction = [...response.actions].reverse().find((a) =>
          ['focus_energy_wave', 'focus_load_pressure', 'focus_recovery_constraints', 'focus_execution_baseline'].includes(a.type)
        );
        let explicitFocus: number | undefined;
        if (focusAction) {
          if (focusAction.type === 'focus_energy_wave') explicitFocus = 0;
          if (focusAction.type === 'focus_load_pressure') explicitFocus = 1;
          if (focusAction.type === 'focus_recovery_constraints') explicitFocus = 2;
          if (focusAction.type === 'focus_execution_baseline') explicitFocus = 3;
        }

        if (explicitFocus !== undefined) {
          nextStep = explicitFocus;
        }

        const completed = response.actions.some(a => a.type === 'complete_atlas_onboarding');
        if (completed) {
          nextProfile.onboardingComplete = true;
          nextProfile.updatedAt = new Date().toISOString();
          nextStep = ATLAS_STEPS.length - 1;
        }

        const vitalsPatch = response.actions
          .filter((action) => action.type === 'sync_vitals')
          .map((action) => action.payload as Partial<any>)
          .reduce((acc, payload) => mergeNSVPatch(acc, payload), {} as any);

        if (user?.uid && Object.keys(vitalsPatch).length > 0) {
          await GlobalProjectionService.updateCrossFunctionalState(user.uid, vitalsPatch).catch((e) => {
            console.error('Atlas onboarding sync_vitals failed:', e);
          });
        }
        if (completed && Object.keys(vitalsPatch).length === 0) {
          NexusHandoffService.store({
            moduleId: 'atlas',
            type: 'delegate',
            content: buildCalibrationPrompt('atlas'),
            reason: 'calibration_request',
            sourceModuleId: 'atlas',
            createdAt: new Date().toISOString()
          });
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
      title="Atlas Guided Intake"
      subtitle="Calibrating your cognitive energy architecture."
      statusLabel="COGNITIVE_BASELINE"
      steps={[...ATLAS_STEPS]}
      currentStep={intake.stepIndex}
      themeColor="sky"
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
        agentName="Atlas Intake"
        themeColor="cyan"
        placeholder={spec.placeholder}
        showInternalSignals={false}
      />
    </GuidedIntakeFrame>
  );
}
