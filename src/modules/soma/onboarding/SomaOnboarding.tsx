import React, { useMemo } from 'react';
import { GuidedIntakeFrame } from '@/core/intake/GuidedIntakeFrame';
import { GuidedChatSpec } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { NexusChat } from '@/core/components/NexusChat';
import { StructuredResponse } from '@/llm-engine/engine/types';
import { useAuth } from '@/lib/auth-context';
import {
  SomaProfile,
  createEmptySomaProfile
} from '../services/soma-profile-service';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { mergeNSVPatch } from '@/lib/services/nsv-service';
import { NyxHandoffService } from '@/lib/services/nyx-handoff-service';
import { buildCalibrationPrompt } from '@/lib/services/nsv-ownership';

interface SomaOnboardingProps {
  initialProfile?: SomaProfile | null;
  initialBaseContext?: GlobalBaseIntakeContext;
  onGlobalBaseContextFinalize?: (context: GlobalBaseIntakeContext) => Promise<void> | void;
  onComplete: (profile: SomaProfile) => void;
}

type SomaIntakeState = {
  profile: SomaProfile;
  baseContext: GlobalBaseIntakeContext;
  stepProgress: number;
};

const SOMA_ONBOARDING_PROMPT = `
IDENTITY:
You are Soma Intake Agent.
Collect a concise biological baseline before active physician chat begins.

OBJECTIVE:
1. Confirm Nyx handoff context.
2. Capture known conditions and current medications.
3. Capture allergies/contraindications.
4. Capture most relevant recent biomarkers or lab findings.
5. Finalize summary.

ACTION TAGS:
- <action type="update_soma_profile">{"knownConditions":["..."],"medications":["..."],"allergies":["..."],"summary":"..."}</action>
- <action type="update_global_base_context">{"name":"...","pronouns":"...","age":28,"assignedSexAtBirth":"female"}</action>
- After collecting baseline vitals, emit a bulk update (only once the user has provided actual data):
  <action type="sync_vitals">{"biological":{"cnsFatigue":null,"sleepQuality":null,"recoveryScore":null,"hormonalContext":"..."}}</action>
- Sync the UI stage with your current conversational focus by emitting:
  <action type="focus_conditions">{}</action>
  <action type="focus_contraindications">{}</action>
  <action type="focus_biomarkers">{}</action>
  <action type="focus_baseline_summary">{}</action>
- <action type="complete_soma_onboarding">{}</action>

RULES:
- Ask short direct questions.
- Keep questions concise and sequential.
- Emit the relevant focus action whenever you move to a new intake section or if the user redirects you.
- Never provide a medical diagnosis.
- For emergencies, advise local emergency care.
`.trim();

const SOMA_STEPS = [
  {
    key: 'conditions',
    label: 'Conditions',
    helperText: 'Capture known conditions and current medications.'
  },
  {
    key: 'contraindications',
    label: 'Allergies',
    helperText: 'Capture allergies and contraindications.'
  },
  {
    key: 'biomarkers',
    label: 'Biomarkers',
    helperText: 'Capture relevant biomarker/lab baseline.'
  },
  {
    key: 'summary',
    label: 'Baseline Summary',
    helperText: 'Finalize baseline and enable Soma session mode.'
  }
] as const;

function hasBaseContext(context: GlobalBaseIntakeContext): boolean {
  return Boolean(
    context.name ||
      context.pronouns ||
      typeof context.age === 'number' ||
      context.assignedSexAtBirth ||
      context.genderIdentity ||
      context.occupation
  );
}

function buildBasePrompt(context: GlobalBaseIntakeContext): string {
  const chunks = [
    context.name ? `name as ${context.name}` : null,
    context.pronouns ? `pronouns as ${context.pronouns}` : null,
    typeof context.age === 'number' ? `age ${context.age}` : null,
    context.assignedSexAtBirth ? `assigned sex at birth ${context.assignedSexAtBirth}` : null
  ].filter(Boolean);

  if (chunks.length === 0) {
    return 'Soma intake initialized. What known conditions or active medications should I account for first?';
  }

  return `Nyx handoff received. I have your ${chunks.join(', ')}. Is that correct before we start biological intake?`;
}

export function SomaOnboarding({
  initialProfile,
  initialBaseContext,
  onGlobalBaseContextFinalize,
  onComplete
}: SomaOnboardingProps) {
  const { user } = useAuth();
  const initialContext = useMemo(() => initialBaseContext ?? {}, [initialBaseContext]);

  const spec = useMemo<GuidedChatSpec<SomaIntakeState>>(
    () => ({
      initialState: {
        profile: initialProfile ?? createEmptySomaProfile(),
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
      steps: [...SOMA_STEPS],
      summary: 'Soma onboarding intake.',
      placeholder: 'Share your biological baseline...',
      buildContext: (state, history) => ({
        systemPrompt: `${SOMA_ONBOARDING_PROMPT}
[PREFILLED_BASE_CONTEXT]
- Name: ${state.baseContext.name || 'Unknown'}
- Pronouns: ${state.baseContext.pronouns || 'Unknown'}
- Age: ${typeof state.baseContext.age === 'number' ? state.baseContext.age : 'Unknown'}
- Assigned Sex At Birth: ${state.baseContext.assignedSexAtBirth || 'Unknown'}
${hasBaseContext(state.baseContext) ? '- Confirm/correct this handoff context briefly first.' : ''}
`,
        memoryContext: [],
        summary: 'Soma onboarding intake.',
        history
      }),
      onResponse: async (response, state) => {
        let nextProfile = { ...state.profile };
        let nextBaseContext = { ...state.baseContext };
        let nextStep = state.stepProgress;

        const profileUpdates = response.actions
          .filter(a => a.type === 'update_soma_profile')
          .map(a => a.payload as Partial<SomaProfile>);

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
            if (typeof update.age === 'number' && Number.isFinite(update.age) && update.age > 0) nextBaseContext.age = update.age;
            if (update.assignedSexAtBirth === 'female' || update.assignedSexAtBirth === 'male') {
              nextBaseContext.assignedSexAtBirth = update.assignedSexAtBirth;
            }
          }
        }

        const focusAction = [...response.actions].reverse().find((a) =>
          ['focus_conditions', 'focus_contraindications', 'focus_biomarkers', 'focus_baseline_summary'].includes(a.type)
        );
        let explicitFocus: number | undefined;
        if (focusAction) {
          if (focusAction.type === 'focus_conditions') explicitFocus = 0;
          if (focusAction.type === 'focus_contraindications') explicitFocus = 1;
          if (focusAction.type === 'focus_biomarkers') explicitFocus = 2;
          if (focusAction.type === 'focus_baseline_summary') explicitFocus = 3;
        }

        if (explicitFocus !== undefined) {
          nextStep = explicitFocus;
        }

        const completed = response.actions.some(a => a.type === 'complete_soma_onboarding');
        if (completed) {
          nextProfile.onboardingComplete = true;
          nextProfile.updatedAt = new Date().toISOString();
          nextStep = SOMA_STEPS.length - 1;
        }

        const vitalsPatch = response.actions
          .filter((action) => action.type === 'sync_vitals')
          .map((action) => action.payload as Partial<any>)
          .reduce((acc, payload) => mergeNSVPatch(acc, payload), {} as any);

        if (user?.uid && Object.keys(vitalsPatch).length > 0) {
          await GlobalProjectionService.updateCrossFunctionalState(user.uid, vitalsPatch).catch((e) => {
            console.error('Soma onboarding sync_vitals failed:', e);
          });
        }
        if (completed && Object.keys(vitalsPatch).length === 0) {
          NyxHandoffService.store({
            moduleId: 'soma',
            type: 'delegate',
            content: buildCalibrationPrompt('soma'),
            reason: 'calibration_request',
            sourceModuleId: 'soma',
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
      title="Soma Guided Intake"
      subtitle="Building your biological source-of-truth baseline."
      statusLabel="BIO_BASELINE"
      steps={[...SOMA_STEPS]}
      currentStep={intake.stepIndex}
      themeColor="emerald"
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
        agentName="Soma Intake"
        themeColor="cyan"
        placeholder={spec.placeholder}
        showInternalSignals={false}
      />
    </GuidedIntakeFrame>
  );
}
