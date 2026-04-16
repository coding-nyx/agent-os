import React, { useCallback, useMemo } from 'react';
import { GuidedChatSpec } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { AraChat } from '@/core/components/AraChat';
import { useAuth } from '@/lib/auth-context';
import { AtlasProfile, createEmptyAtlasProfile } from '../services/atlas-profile-service';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import type { NeuralStateVectorPatch } from '@/lib/types';
import { AraHandoffService } from '@/lib/services/ara-handoff-service';
import { buildCalibrationPrompt } from '@/lib/services/nsv-ownership';
import { UnifiedOnboardingShell } from '@/core/intake/UnifiedOnboardingShell';
import { ATLAS_BASE_SPEC } from '@/core/intake/onboarding-configs';

interface AtlasOnboardingProps {
  initialProfile?: AtlasProfile | null;
  initialBaseContext?: GlobalBaseIntakeContext;
  onGlobalBaseContextFinalize?: (context: GlobalBaseIntakeContext) => Promise<void> | void;
  onComplete: (profile: AtlasProfile) => void;
}

type AtlasIntakeState = { profile: AtlasProfile; baseContext: GlobalBaseIntakeContext; stepProgress: number };

const ATLAS_ONBOARDING_PROMPT = `
IDENTITY:
You are Atlas Intake Agent.
Collect a concise cognitive scheduling baseline before Atlas active mode.

OBJECTIVE:
1. Confirm Ara handoff context.
2. Capture daily energy peaks and crash windows.
3. Capture current task load and overload triggers.
4. Capture recovery strategies and scheduling constraints.
5. Finalize concise operating summary.

ACTION TAGS:
- <action type="update_atlas_profile">{"summary":"...","energyWave":[{"slot":"09:00-11:00","energy":8,"focus":8,"load":4}],"taskGraph":[{"title":"Deep Work","energyCost":7,"status":"queued"}]}</action>
- <action type="update_global_base_context">{"name":"...","occupation":"...","typicalSleepHours":7}</action>
- After collecting baseline vitals, emit:
  <action type="sync_vitals">{"cognitive":{"energyBudget":6,"focusScore":7,"activeLoad":4}}</action>
- Sync the UI stage with your current conversational focus by emitting:
  <action type="focus_energy_wave">{}</action>
  <action type="focus_load_pressure">{}</action>
  <action type="focus_recovery_constraints">{}</action>
  <action type="focus_execution_baseline">{}</action>
- <action type="complete_atlas_onboarding">{}</action>

RULES:
- Ask short direct questions.
- Emit the relevant focus action whenever you move to a new intake section.
- Keep values practical and bounded.
`.trim();

const ATLAS_STEPS = [
  { key: 'wave', label: 'Energy Wave', helperText: 'Capture high-focus windows and crash zones.' },
  { key: 'load', label: 'Load Pressure', helperText: 'Capture current cognitive load and overload triggers.' },
  { key: 'recovery', label: 'Recovery Constraints', helperText: 'Capture recovery windows and non-negotiable breaks.' },
  { key: 'summary', label: 'Execution Baseline', helperText: 'Finalize Atlas scheduling baseline and activation.' }
] as const;

function buildBasePrompt(context: GlobalBaseIntakeContext): string {
  const chunks = [
    context.name ? `name as ${context.name}` : null,
    context.occupation ? `occupation as ${context.occupation}` : null,
    typeof context.typicalSleepHours === 'number' ? `typical sleep ${context.typicalSleepHours}h` : null
  ].filter(Boolean);
  if (chunks.length === 0) return 'Atlas intake initialized. When during your day is your focus naturally strongest?';
  return `Ara handoff received. I have your ${chunks.join(', ')}. Is that correct before we map your energy wave?`;
}

const PEAK_HOURS_MAP: Record<string, string> = {
  'morning (6–10)': '06:00-10:00', 'morning': '06:00-10:00',
  'midday (10–14)': '10:00-14:00', 'midday': '10:00-14:00',
  'afternoon (14–18)': '14:00-18:00', 'afternoon': '14:00-18:00',
  'evening (18–22)': '18:00-22:00', 'evening': '18:00-22:00',
};

export function AtlasOnboarding({ initialProfile, initialBaseContext, onGlobalBaseContextFinalize, onComplete }: AtlasOnboardingProps) {
  const { user } = useAuth();
  const initialContext = useMemo(() => initialBaseContext ?? {}, [initialBaseContext]);

  const handleExpressComplete = useCallback(async (values: Record<string, unknown>) => {
    const now = new Date().toISOString();
    const peakKey = String(values.peak_hours ?? '');
    const peakSlot = PEAK_HOURS_MAP[peakKey.toLowerCase()] ?? peakKey ?? '09:00-12:00';
    const loadValue = typeof values.load_pressure === 'number' ? values.load_pressure : 5;
    const profile: AtlasProfile = {
      ...createEmptyAtlasProfile(),
      onboardingComplete: true,
      energyWave: [{ id: 'ex-wave-0', slot: peakSlot, energy: 8, focus: 8, load: loadValue }],
      summary: `Express onboarding: Peak ${peakSlot}, Load: ${loadValue}/10. Focus: ${values.task_focus ?? 'flexible'}.`,
      preferences: undefined,
      createdAt: now,
      updatedAt: now,
    };
    onComplete(profile);
  }, [onComplete]);

  const chatSpec = useMemo<GuidedChatSpec<AtlasIntakeState>>(
    () => ({
      initialState: { profile: initialProfile ?? createEmptyAtlasProfile(), baseContext: initialContext, stepProgress: 0 },
      initialMessages: [{ role: 'assistant', content: buildBasePrompt(initialContext) }],
      initialStep: 0,
      steps: [...ATLAS_STEPS],
      summary: 'Atlas cognitive onboarding intake.',
      placeholder: 'Describe your energy peaks, crashes, and task pressure...',
      buildContext: (state, history) => ({
        moduleId: 'atlas',
        systemPrompt: `${ATLAS_ONBOARDING_PROMPT}
[PREFILLED_BASE_CONTEXT]
- Name: ${state.baseContext.name || 'Unknown'}
- Occupation: ${state.baseContext.occupation || 'Unknown'}
- Sleep: ${typeof state.baseContext.typicalSleepHours === 'number' ? state.baseContext.typicalSleepHours : 'Unknown'}h
`,
        memoryContext: [],
        summary: 'Atlas onboarding intake.',
        history
      }),
      onResponse: async (response, state) => {
        const nextProfile = { ...state.profile };
        const nextBaseContext = { ...state.baseContext };
        let nextStep = state.stepProgress;

        const profileUpdates = response.actions.filter(a => a.type === 'update_atlas_profile').map(a => a.payload as Partial<AtlasProfile>);
        for (const update of profileUpdates) {
          if (typeof update.summary === 'string' && update.summary.trim()) nextProfile.summary = update.summary.trim();
          if (Array.isArray(update.energyWave)) {
            nextProfile.energyWave = (update.energyWave as unknown[])
              .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
              .map((point, i) => ({ id: typeof point.id === 'string' ? point.id : `wave_${i}`, slot: typeof point.slot === 'string' ? point.slot : `Slot ${i+1}`, energy: typeof point.energy === 'number' ? Math.max(0, Math.min(10, point.energy)) : 5, focus: typeof point.focus === 'number' ? Math.max(0, Math.min(10, point.focus)) : 5, load: typeof point.load === 'number' ? Math.max(0, Math.min(10, point.load)) : 5 }))
              .slice(0, 48);
          }
          if (Array.isArray(update.taskGraph)) {
            nextProfile.taskGraph = (update.taskGraph as unknown[])
              .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
              .map((task, i) => ({ id: typeof task.id === 'string' ? task.id : `task_${i}`, title: typeof task.title === 'string' ? task.title : `Task ${i+1}`, energyCost: typeof task.energyCost === 'number' ? Math.max(0, Math.min(10, task.energyCost)) : 4, status: (task.status === 'active' || task.status === 'done' ? task.status : 'queued') as 'active' | 'queued' | 'done', dependencies: Array.isArray(task.dependencies) ? task.dependencies.filter((d: unknown): d is string => typeof d === 'string') : undefined }))
              .slice(0, 100);
          }
          nextProfile.updatedAt = new Date().toISOString();
        }

        const baseContextUpdates = response.actions.filter(a => a.type === 'update_global_base_context').map(a => a.payload as Partial<GlobalBaseIntakeContext>);
        for (const update of baseContextUpdates) {
          if (typeof update.name === 'string' && update.name.trim()) nextBaseContext.name = update.name.trim();
          if (typeof update.pronouns === 'string' && update.pronouns.trim()) nextBaseContext.pronouns = update.pronouns.trim();
          if (typeof update.occupation === 'string' && update.occupation.trim()) nextBaseContext.occupation = update.occupation.trim();
          if (typeof update.typicalSleepHours === 'number' && Number.isFinite(update.typicalSleepHours) && update.typicalSleepHours > 0 && update.typicalSleepHours <= 24) nextBaseContext.typicalSleepHours = update.typicalSleepHours;
        }

        const focusAction = [...response.actions].reverse().find((a) =>
          ['focus_energy_wave', 'focus_load_pressure', 'focus_recovery_constraints', 'focus_execution_baseline'].includes(a.type)
        );
        if (focusAction) {
          if (focusAction.type === 'focus_energy_wave') nextStep = Math.max(nextStep, 0);
          if (focusAction.type === 'focus_load_pressure') nextStep = Math.max(nextStep, 1);
          if (focusAction.type === 'focus_recovery_constraints') nextStep = Math.max(nextStep, 2);
          if (focusAction.type === 'focus_execution_baseline') nextStep = Math.max(nextStep, 3);
        }

        let completed = response.actions.some(a => a.type === 'complete_atlas_onboarding');
        // Validate minimum required fields before accepting completion
        if (completed) {
          const hasEnergyWave = (nextProfile.energyWave?.length ?? 0) >= 1;
          const hasSummary = typeof nextProfile.summary === 'string' && nextProfile.summary.trim().length > 0;
          if (!hasEnergyWave || !hasSummary) {
            completed = false;
            return {
              nextState: { profile: nextProfile, baseContext: nextBaseContext, stepProgress: nextStep },
              nextStep,
              completed: false,
              assistantMessage: 'Before we finalize, I still need ' +
                (!hasEnergyWave ? 'at least one energy/focus window' : '') +
                (!hasEnergyWave && !hasSummary ? ' and ' : '') +
                (!hasSummary ? 'a summary of your operating pattern' : '') + '.',
            };
          }
          nextProfile.onboardingComplete = true; nextProfile.updatedAt = new Date().toISOString(); nextStep = ATLAS_STEPS.length - 1;
        }

        const rawVitals = response.actions.filter(a => a.type === 'sync_vitals').map(a => a.payload as Partial<NeuralStateVectorPatch>);
        let vitalsPatch: NeuralStateVectorPatch = {};
        if (rawVitals.length > 0) {
          const payload = rawVitals[rawVitals.length - 1];
          if (payload?.cognitive && typeof payload.cognitive === 'object') {
            const cog: NonNullable<NeuralStateVectorPatch['cognitive']> = {};
            if (typeof payload.cognitive.energyBudget === 'number' && Number.isFinite(payload.cognitive.energyBudget)) cog.energyBudget = Math.max(0, Math.min(10, payload.cognitive.energyBudget));
            if (typeof payload.cognitive.focusScore === 'number' && Number.isFinite(payload.cognitive.focusScore)) cog.focusScore = Math.max(0, Math.min(10, payload.cognitive.focusScore));
            if (typeof payload.cognitive.activeLoad === 'number' && Number.isFinite(payload.cognitive.activeLoad)) cog.activeLoad = Math.max(0, Math.min(10, payload.cognitive.activeLoad));
            vitalsPatch = { cognitive: cog };
          }
        }
        if (user?.uid && Object.keys(vitalsPatch).length > 0 && Object.keys(vitalsPatch.cognitive || {}).length > 0) {
          await GlobalProjectionService.updateCrossFunctionalState(user.uid, vitalsPatch).catch(console.error);
        }
        if (completed && Object.keys(vitalsPatch).length === 0) {
          AraHandoffService.store({ moduleId: 'atlas', type: 'delegate', content: buildCalibrationPrompt('atlas'), reason: 'calibration_request', sourceModuleId: 'atlas', createdAt: new Date().toISOString() });
        }

        return { nextState: { profile: nextProfile, baseContext: nextBaseContext, stepProgress: nextStep }, nextStep, completed };
      }
    }),
    [initialContext, initialProfile, user]
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
      spec={ATLAS_BASE_SPEC}
      onExpressComplete={handleExpressComplete}
      guidedContent={
        <AraChat
          ai={{ messages: intake.messages, isProcessing: intake.isProcessing, streamingText: intake.streamingText, error: intake.error, quota: null, handleSendMessage: intake.handleSendMessage }}
          agentName="Atlas Intake"
          themeColor="emerald"
          placeholder={chatSpec.placeholder}
          showInternalSignals={false}
        />
      }
    />
  );
}
