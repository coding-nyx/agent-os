import React, { useCallback, useMemo } from 'react';
import { GuidedChatSpec } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { NexusChat } from '@/core/components/NexusChat';
import { StructuredResponse } from '@/lib/ai-adapters/engine-types';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';
import { ForgeProfile, createEmptyForgeProfile } from '../services/forge-session-service';
import { UnifiedOnboardingShell } from '@/core/intake/UnifiedOnboardingShell';
import { FORGE_BASE_SPEC } from '@/core/intake/onboarding-configs';

interface ForgeOnboardingProps {
  initialProfile?: ForgeProfile | null;
  initialBaseContext?: GlobalBaseIntakeContext;
  onGlobalBaseContextFinalize?: (context: GlobalBaseIntakeContext) => Promise<void> | void;
  onComplete: (profile: ForgeProfile) => void;
}

type ForgeIntakeState = { profile: ForgeProfile; baseContext: GlobalBaseIntakeContext; stepProgress: number };

const FORGE_ONBOARDING_PROMPT = `
IDENTITY:
You are Forge Intake Agent.
Collect minimal execution preferences before Forge active mode.

OBJECTIVE:
1. Confirm Nexus handoff context.
2. Capture preferred execution environment (local/cloud/hybrid).
3. Capture safety strictness for command execution.
4. Capture preferred reporting format.
5. Finalize baseline summary.

ACTION TAGS:
- <action type="update_forge_profile">{"environment":"local","safetyMode":"strict","summary":"..."}</action>
- <action type="update_global_base_context">{"name":"...","occupation":"..."}</action>
- Sync the UI stage with your current conversational focus by emitting:
  <action type="focus_environment">{}</action> (Step 0)
  <action type="focus_safety">{}</action> (Step 1)
  <action type="focus_reporting">{}</action> (Step 2)
  <action type="focus_summary">{}</action> (Step 3)
- <action type="complete_forge_onboarding">{}</action>

RULES:
- Keep instructions operational and explicit.
- Emit the relevant focus action whenever you move to a new intake section.
- Never imply command execution happened unless action-tagged.
`.trim();

const FORGE_STEPS = [
  { key: 'environment', label: 'Execution Context', helperText: 'Capture local/cloud/hybrid preference.' },
  { key: 'safety', label: 'Safety Mode', helperText: 'Capture strict vs balanced execution policy.' },
  { key: 'reporting', label: 'Report Style', helperText: 'Capture concise vs detailed execution reporting.' },
  { key: 'summary', label: 'Baseline Summary', helperText: 'Finalize Forge baseline and activate mode.' }
] as const;

function buildBasePrompt(context: GlobalBaseIntakeContext): string {
  const chunks = [context.name ? `name as ${context.name}` : null, context.occupation ? `occupation as ${context.occupation}` : null].filter(Boolean);
  if (chunks.length === 0) return 'Forge intake initialized. Should I default to local execution with strict safety mode?';
  return `Nexus handoff received. I have your ${chunks.join(', ')}. Is that correct before we configure execution defaults?`;
}

export function ForgeOnboarding({ initialProfile, initialBaseContext, onGlobalBaseContextFinalize, onComplete }: ForgeOnboardingProps) {
  const initialContext = useMemo(() => initialBaseContext ?? {}, [initialBaseContext]);

  const handleExpressComplete = useCallback(async (values: Record<string, unknown>) => {
    const now = new Date().toISOString();
    const safetyMap: Record<string, ForgeProfile['safetyMode']> = { sandbox: 'strict', cautious: 'strict', production: 'balanced', balanced: 'balanced', strict: 'strict' };
    const envMap: Record<string, ForgeProfile['environment']> = { local: 'local', cloud: 'cloud', hybrid: 'hybrid' };
    onComplete({
      ...createEmptyForgeProfile(),
      onboardingComplete: true,
      environment: envMap[String(values.execution_context ?? 'local').toLowerCase()] ?? 'cloud',
      safetyMode: safetyMap[String(values.safety_mode ?? 'strict').toLowerCase()] ?? 'strict',
      summary: `Execution: ${values.execution_context ?? 'cloud'}. Safety: ${values.safety_mode ?? 'strict'}. Report: ${values.report_style ?? 'standard'}.`,
      createdAt: now,
      updatedAt: now,
    });
  }, [onComplete]);

  const chatSpec = useMemo<GuidedChatSpec<ForgeIntakeState>>(
    () => ({
      initialState: { profile: initialProfile ?? createEmptyForgeProfile(), baseContext: initialContext, stepProgress: 0 },
      initialMessages: [{ role: 'assistant', content: buildBasePrompt(initialContext) }],
      initialStep: 0,
      steps: [...FORGE_STEPS],
      summary: 'Forge onboarding intake.',
      placeholder: 'Define execution environment, safety preferences, and output style...',
      buildContext: (state, history) => ({
        moduleId: 'forge',
        systemPrompt: `${FORGE_ONBOARDING_PROMPT}
[PREFILLED_BASE_CONTEXT]
- Name: ${state.baseContext.name || 'Unknown'}
- Occupation: ${state.baseContext.occupation || 'Unknown'}
`,
        memoryContext: [],
        summary: 'Forge onboarding intake.',
        history
      }),
      onResponse: (response: StructuredResponse, state) => {
        let nextProfile = { ...state.profile };
        const nextBaseContext = { ...state.baseContext };
        let nextStep = state.stepProgress;

        const focusAction = [...response.actions].reverse().find((a) =>
          ['focus_environment', 'focus_safety', 'focus_reporting', 'focus_summary'].includes(a.type)
        );
        if (focusAction) {
          if (focusAction.type === 'focus_environment') nextStep = Math.max(nextStep, 0);
          if (focusAction.type === 'focus_safety') nextStep = Math.max(nextStep, 1);
          if (focusAction.type === 'focus_reporting') nextStep = Math.max(nextStep, 2);
          if (focusAction.type === 'focus_summary') nextStep = Math.max(nextStep, 3);
        }

        const profileUpdates = response.actions.filter(a => a.type === 'update_forge_profile').map(a => a.payload as Partial<ForgeProfile>);
        for (const update of profileUpdates) {
          // Per-field sanitization — only accept known onboarding fields
          if (typeof update.summary === 'string' && update.summary.trim()) nextProfile.summary = update.summary.trim();
          if (update.environment === 'local' || update.environment === 'cloud' || update.environment === 'hybrid') {
            nextProfile.environment = update.environment;
          }
          if (update.safetyMode === 'strict' || update.safetyMode === 'balanced') {
            nextProfile.safetyMode = update.safetyMode;
          }
          nextProfile.updatedAt = new Date().toISOString();
        }

        const baseContextUpdates = response.actions.filter(a => a.type === 'update_global_base_context').map(a => a.payload as Partial<GlobalBaseIntakeContext>);
        for (const update of baseContextUpdates) {
          if (typeof update.name === 'string' && update.name.trim()) nextBaseContext.name = update.name.trim();
          if (typeof update.occupation === 'string' && update.occupation.trim()) nextBaseContext.occupation = update.occupation.trim();
        }

        let completed = response.actions.some(a => a.type === 'complete_forge_onboarding');
        // Validate minimum required fields before accepting completion
        if (completed) {
          const hasSummary = typeof nextProfile.summary === 'string' && nextProfile.summary.trim().length > 0;
          if (!hasSummary) {
            completed = false;
            return {
              nextState: { profile: nextProfile, baseContext: nextBaseContext, stepProgress: nextStep },
              nextStep,
              completed: false,
              assistantMessage: 'Before we finalize, I still need a summary of your environment and preferences.',
            };
          }
          nextProfile.onboardingComplete = true; nextProfile.updatedAt = new Date().toISOString(); nextStep = FORGE_STEPS.length - 1;
        }

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
      spec={FORGE_BASE_SPEC}
      onExpressComplete={handleExpressComplete}
      guidedContent={
        <NexusChat
          ai={{ messages: intake.messages, isProcessing: intake.isProcessing, streamingText: intake.streamingText, error: intake.error, quota: null, handleSendMessage: intake.handleSendMessage }}
          agentName="Forge Intake"
          themeColor="lime"
          placeholder={chatSpec.placeholder}
          showInternalSignals={false}
        />
      }
    />
  );
}
