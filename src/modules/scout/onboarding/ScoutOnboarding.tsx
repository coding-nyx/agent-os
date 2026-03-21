import React, { useCallback, useMemo } from 'react';
import { GuidedChatSpec } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { NexusChat } from '@/core/components/NexusChat';
import { StructuredResponse } from '@/lib/ai-adapters/engine-types';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';
import { ScoutProfile, createEmptyScoutProfile } from '../services/scout-knowledge-service';
import { UnifiedOnboardingShell } from '@/core/intake/UnifiedOnboardingShell';
import { SCOUT_BASE_SPEC } from '@/core/intake/onboarding-configs';

interface ScoutOnboardingProps {
  initialProfile?: ScoutProfile | null;
  initialBaseContext?: GlobalBaseIntakeContext;
  onGlobalBaseContextFinalize?: (context: GlobalBaseIntakeContext) => Promise<void> | void;
  onComplete: (profile: ScoutProfile) => void;
}

type ScoutIntakeState = { profile: ScoutProfile; baseContext: GlobalBaseIntakeContext; stepProgress: number };

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
- Emit the relevant focus action whenever you move to a new intake section.
- Avoid fabrication; log uncertainty explicitly.
`.trim();

const SCOUT_STEPS = [
  { key: 'focus', label: 'Research Focus', helperText: 'Capture domains and recurring claim categories.' },
  { key: 'quality', label: 'Evidence Quality', helperText: 'Capture preferred source quality and verification strictness.' },
  { key: 'output', label: 'Output Shape', helperText: 'Capture synthesis format and delivery style.' },
  { key: 'summary', label: 'Baseline Summary', helperText: 'Finalize scout baseline and activate mode.' }
] as const;

function buildBasePrompt(context: GlobalBaseIntakeContext): string {
  const chunks = [
    context.name ? `name as ${context.name}` : null,
    context.occupation ? `occupation as ${context.occupation}` : null
  ].filter(Boolean);
  if (chunks.length === 0) return 'Scout intake initialized. What topics should I continuously track and verify for you?';
  return `Nexus handoff received. I have your ${chunks.join(', ')}. Is that correct before we configure your research baseline?`;
}

export function ScoutOnboarding({ initialProfile, initialBaseContext, onGlobalBaseContextFinalize, onComplete }: ScoutOnboardingProps) {
  const initialContext = useMemo(() => initialBaseContext ?? {}, [initialBaseContext]);

  const handleExpressComplete = useCallback(async (values: Record<string, unknown>) => {
    const now = new Date().toISOString();
    const domains = Array.isArray(values.research_domains) ? values.research_domains as string[] : [];
    onComplete({
      ...createEmptyScoutProfile(),
      onboardingComplete: true,
      researchFocus: domains,
      summary: `Domains: ${domains.join(', ') || 'general'}. Evidence: ${values.evidence_quality ?? 'balanced'}. Format: ${values.output_format ?? 'summary'}.`,
      createdAt: now,
      updatedAt: now,
    });
  }, [onComplete]);

  const chatSpec = useMemo<GuidedChatSpec<ScoutIntakeState>>(
    () => ({
      initialState: { profile: initialProfile ?? createEmptyScoutProfile(), baseContext: initialContext, stepProgress: 0 },
      initialMessages: [{ role: 'assistant', content: buildBasePrompt(initialContext) }],
      initialStep: 0,
      steps: [...SCOUT_STEPS],
      summary: 'Scout onboarding intake.',
      placeholder: 'Share topics, claims, and evidence standards...',
      buildContext: (state, history) => ({
        systemPrompt: `${SCOUT_ONBOARDING_PROMPT}
[PREFILLED_BASE_CONTEXT]
- Name: ${state.baseContext.name || 'Unknown'}
- Occupation: ${state.baseContext.occupation || 'Unknown'}
`,
        memoryContext: [],
        summary: 'Scout onboarding intake.',
        history
      }),
      onResponse: (response: StructuredResponse, state) => {
        let nextProfile = { ...state.profile };
        const nextBaseContext = { ...state.baseContext };
        let nextStep = state.stepProgress;

        const profileUpdates = response.actions.filter(a => a.type === 'update_scout_profile').map(a => a.payload as Partial<ScoutProfile>);
        for (const update of profileUpdates) {
          nextProfile = { ...nextProfile, ...update, updatedAt: new Date().toISOString() };
        }

        const baseContextUpdates = response.actions.filter(a => a.type === 'update_global_base_context').map(a => a.payload as Partial<GlobalBaseIntakeContext>);
        for (const update of baseContextUpdates) {
          if (typeof update.name === 'string' && update.name.trim()) nextBaseContext.name = update.name.trim();
          if (typeof update.occupation === 'string' && update.occupation.trim()) nextBaseContext.occupation = update.occupation.trim();
        }

        const focusAction = [...response.actions].reverse().find((a) =>
          ['focus_research_focus', 'focus_evidence_quality', 'focus_output_shape', 'focus_baseline_summary'].includes(a.type)
        );
        if (focusAction) {
          if (focusAction.type === 'focus_research_focus') nextStep = 0;
          if (focusAction.type === 'focus_evidence_quality') nextStep = 1;
          if (focusAction.type === 'focus_output_shape') nextStep = 2;
          if (focusAction.type === 'focus_baseline_summary') nextStep = 3;
        }

        const completed = response.actions.some(a => a.type === 'complete_scout_onboarding');
        if (completed) { nextProfile.onboardingComplete = true; nextProfile.updatedAt = new Date().toISOString(); nextStep = SCOUT_STEPS.length - 1; }

        return { nextState: { profile: nextProfile, baseContext: nextBaseContext, stepProgress: nextStep }, nextStep, completed };
      }
    }),
    [initialContext, initialProfile]
  );

  const intake = useGuidedChatIntake({
    spec: chatSpec,
    onComplete: async (state) => {
      if (onGlobalBaseContextFinalize) await onGlobalBaseContextFinalize(state.baseContext);
      onComplete({ ...state.profile, onboardingComplete: true });
    }
  });

  return (
    <UnifiedOnboardingShell
      spec={SCOUT_BASE_SPEC}
      onExpressComplete={handleExpressComplete}
      guidedContent={
        <NexusChat
          ai={{ messages: intake.messages, isProcessing: intake.isProcessing, streamingText: intake.streamingText, error: intake.error, quota: null, handleSendMessage: intake.handleSendMessage }}
          agentName="Scout Intake"
          themeColor="sky"
          placeholder={chatSpec.placeholder}
          showInternalSignals={false}
        />
      }
    />
  );
}
