import React, { useCallback, useEffect, useMemo } from 'react';
import { Shield, Sparkles } from 'lucide-react';
import { GuidedChatSpec } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { AraChat } from '@/core/components/AraChat';
import { cn } from '@/lib/utils';
import { TitanProfile, TitanPrivacyLevel, EquipmentType, BodyWeightEntry } from '@/lib/types';
import { StructuredResponse } from '@/lib/ai-adapters/engine-types';
import { useAuth } from '@/lib/auth-context';
import { TitanPromptBuilderJs } from '@cortex-logic';
import { mergeTitanProfile, normalizeRoutines } from '../utils';
import { saveGuestTitanProfile } from '../services/titan-profile-service';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { mergeNSVPatch } from '@/lib/services/nsv-service';
import type { NeuralStateVectorPatch, Routine } from '@/lib/types';
import { AraHandoffService } from '@/lib/services/ara-handoff-service';
import { buildCalibrationPrompt } from '@/lib/services/nsv-ownership';
import { NeuralButton } from '@/core/components/NeuralButton';
import {
  RequiredSectionKey,
  TitanIntakeAccumulator,
  appendFromUserMessage,
  appendProfilePatch,
  backfillFromHistory,
  createAccumulatorFromProfile,
  getMissingSectionsFromAccumulator,
  normalizeTitanProfilePatch,
  toProfilePatchFromAccumulator
} from './intake-accumulator';
import { UnifiedOnboardingShell } from '@/core/intake/UnifiedOnboardingShell';
import { TITAN_BASE_SPEC } from '@/core/intake/onboarding-configs';

// ---- Chip data -----------------------------------------------------------

// TitanPromptBuilderJs is lazy-guarded; construct on first use so a missing
// KMP export doesn't crash the entire Titan module at import time.
let _titanPromptBuilder: InstanceType<NonNullable<typeof TitanPromptBuilderJs>> | null = null;
function getTitanPromptBuilder() {
  if (!TitanPromptBuilderJs) throw new Error('[TitanOnboarding] TitanPromptBuilderJs is not available in the current cortex-logic build.');
  if (!_titanPromptBuilder) _titanPromptBuilder = new TitanPromptBuilderJs() as InstanceType<NonNullable<typeof TitanPromptBuilderJs>>;
  return _titanPromptBuilder;
}

const GOAL_CHIPS = [
  { value: 'strength', label: 'Build Strength' },
  { value: 'muscle', label: 'Build Muscle' },
  { value: 'fat_loss', label: 'Lose Fat' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'athletic', label: 'Athletic Performance' },
  { value: 'maintenance', label: 'Maintenance' },
] as const;

const EXPERIENCE_CHIPS = [
  { value: 'beginner', label: 'Beginner', sub: '< 1 year' },
  { value: 'intermediate', label: 'Intermediate', sub: '1–3 years' },
  { value: 'advanced', label: 'Advanced', sub: '3+ years' },
  { value: 'athlete', label: 'Athlete', sub: 'Competitive' },
] as const;

const EQUIPMENT_CHIPS = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbells' },
  { value: 'cable', label: 'Cable Machine' },
  { value: 'machine', label: 'Machines' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'resistance_band', label: 'Bands' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'pull_up_bar', label: 'Pull-up Bar' },
] as const;

type GoalChipValue = typeof GOAL_CHIPS[number]['value'];
type ExperienceChipValue = typeof EXPERIENCE_CHIPS[number]['value'];
type EquipmentChipValue = typeof EQUIPMENT_CHIPS[number]['value'];

const EQUIPMENT_TYPE_MAP: Record<EquipmentChipValue, EquipmentType> = {
  barbell: 'barbell', dumbbell: 'dumbbells', cable: 'cables', machine: 'machines',
  bodyweight: 'bodyweight', resistance_band: 'bands', kettlebell: 'kettlebells', pull_up_bar: 'bodyweight',
};

// ---- Types ---------------------------------------------------------------

interface TitanOnboardingProps {
  onComplete: (profile: TitanProfile) => void;
  onGlobalBaseContextFinalize?: (context: GlobalBaseIntakeContext) => Promise<void> | void;
  initialBaseContext?: GlobalBaseIntakeContext;
  initialProfile?: TitanProfile | null;
}

type TitanIntakeState = {
  privacyLevel: TitanPrivacyLevel | null;
  profile: TitanProfile | null;
  accumulator: TitanIntakeAccumulator;
  baseContext: GlobalBaseIntakeContext;
  stepProgress: number;
  protocolViolationCount: number;
};

const TRAINER_STEPS = [
  { key: 'nutrition', label: 'Nutrition Intake', helperText: 'Capture supplements, meal structure, and macro baseline.' },
  { key: 'activity', label: 'Physical Data', helperText: 'Capture training frequency, workload, sleep, and recovery.' },
  { key: 'history', label: 'History, Goals & Routine Setup', helperText: 'Capture injuries, past training, and measurable targets.' }
] as const;

function createEmptyProfile(privacyLevel: TitanPrivacyLevel): TitanProfile {
  return {
    onboardingComplete: false, privacyLevel, trackingLevel: privacyLevel === 'complete' ? 'indepth' : 'standard',
    nutrition: { supplements: [] }, activity: {}, history: {}, summary: '', routines: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    medicalOnboardingComplete: false, knownConditions: [], medications: [], allergies: [],
    biomarkers: [], labSummaries: [], clearances: [], medicalImageAnalyses: [], medicalSummary: '',
  };
}

function hasCompletionClaim(response: string): boolean {
  return /\b(onboarding (?:is )?complete|intake (?:is )?complete|all (?:the )?information (?:i )?(?:need|needed)|profile (?:is )?(?:ready|synced|synchronized)|we(?:'re| are) done)\b/i.test(response);
}

function formatMissingSections(missing: RequiredSectionKey[]): string {
  return missing.map((key) => key === 'nutrition' ? 'nutrition baseline' : key === 'activity' ? 'activity baseline' : 'training history and goals').join(', ');
}

function deriveStepFromMissingSections(missing: RequiredSectionKey[]): number {
  if (missing.includes('nutrition')) return 0;
  if (missing.includes('activity')) return 1;
  if (missing.includes('history')) return 2;
  return TRAINER_STEPS.length - 1;
}

function sectionSnapshot(value: unknown): string {
  try {
    const s = JSON.stringify(value);
    if (!s || s === '{}' || s === '[]') return 'Missing';
    return s.length <= 360 ? s : `${s.slice(0, 360)}...`;
  } catch { return 'Missing'; }
}

function nextMissingQuestion(firstMissing: RequiredSectionKey | undefined): string {
  if (firstMissing === 'nutrition') return 'Before finalizing, share your typical nutrition baseline: meals, supplements, and any known macro/calorie targets.';
  if (firstMissing === 'activity') return 'Before finalizing, share your activity baseline: workouts per week, daily activity level, and average sleep hours.';
  return 'Before finalizing, share your training history and goals, including any injuries and your primary objective.';
}

// ---- Guided content sub-component ----------------------------------------

interface TitanGuidedContentProps {
  state: TitanIntakeState;
  setState: React.Dispatch<React.SetStateAction<TitanIntakeState>>;
  messages: ReturnType<typeof useGuidedChatIntake>['messages'];
  isProcessing: boolean;
  streamingText: string;
  error: string | null;
  handleSendMessage: ReturnType<typeof useGuidedChatIntake>['handleSendMessage'];
  placeholder: string;
}

function TitanGuidedContent({ state, setState, messages, isProcessing, streamingText, error, handleSendMessage, placeholder }: TitanGuidedContentProps) {
  if (!state.privacyLevel) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-[11px] text-white/50 uppercase font-black tracking-[0.2em] mb-4">Select Data Sharing Level</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg">
          <NeuralButton
            variant="secondary"
            onClick={() => setState((prev) => ({ ...prev, privacyLevel: 'basic' }))}
            className="p-5 h-auto flex-col items-start justify-start text-left group rounded-2xl border-white/[0.12]"
          >
            <Shield className="w-6 h-6 text-orange-400 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-sm font-black uppercase tracking-wider mb-2">Basic Data</h3>
            <p className="text-xs text-white/50 leading-relaxed whitespace-normal font-normal">Non-intrusive intake. Skips intimate and gender-dependent questions.</p>
          </NeuralButton>
          <NeuralButton
            variant="secondary"
            onClick={() => setState((prev) => ({ ...prev, privacyLevel: 'complete' }))}
            className="p-5 h-auto flex-col items-start justify-start text-left group rounded-2xl border-white/[0.12]"
          >
            <Sparkles className="w-6 h-6 text-orange-400 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-sm font-black uppercase tracking-wider mb-2">Complete Data</h3>
            <p className="text-xs text-white/50 leading-relaxed whitespace-normal font-normal">Full intake including biological and intimate factors for maximum optimization.</p>
          </NeuralButton>
        </div>
      </div>
    );
  }

  return (
    <AraChat
      ai={{ messages, isProcessing, streamingText, error, quota: null, handleSendMessage }}
      agentName="Titan Intake"
      themeColor="orange"
      placeholder={state.privacyLevel ? 'Share your response...' : placeholder}
      showInternalSignals={false}
    />
  );
}

// ---- Main component -------------------------------------------------------

export function TitanOnboarding({ onComplete, onGlobalBaseContextFinalize, initialBaseContext, initialProfile }: TitanOnboardingProps) {
  const { user } = useAuth();
  const initialContext = useMemo(() => initialBaseContext ?? {}, [initialBaseContext]);
  const initialAccumulator = useMemo(() => createAccumulatorFromProfile(initialProfile), [initialProfile]);

  const hasBaseContext = (context: GlobalBaseIntakeContext) =>
    Boolean(context.name || context.pronouns || context.occupation || typeof context.typicalSleepHours === 'number');
  const buildBaseContextPrompt = (context: GlobalBaseIntakeContext) => {
    const chunks = [context.name ? `name as ${context.name}` : null, context.pronouns ? `pronouns as ${context.pronouns}` : null, context.occupation ? `occupation as ${context.occupation}` : null, typeof context.typicalSleepHours === 'number' ? `typical sleep around ${context.typicalSleepHours} hours/night` : null].filter(Boolean);
    if (chunks.length === 0) return "Let's start with nutrition: what do you typically eat and which supplements do you take?";
    return `Ara handoff received. I have your ${chunks.join(', ')}. Is that correct before we continue your training intake?`;
  };

  // Express complete — maps canonical field IDs to TitanProfile
  const handleExpressComplete = useCallback(async (values: Record<string, unknown>) => {
    const now = new Date().toISOString();
    const goal = String(values.goal ?? 'maintenance') as GoalChipValue;
    const experience = String(values.experience_level ?? 'beginner') as ExperienceChipValue;
    const daysPerWeek = typeof values.days_per_week === 'number' ? Math.round(values.days_per_week) : 3;
    const equipment = Array.isArray(values.equipment) ? (values.equipment as string[]).map(e => EQUIPMENT_TYPE_MAP[e as EquipmentChipValue] ?? e as EquipmentType) : [];
    const supplements = String(values.supplements ?? '').trim() ? String(values.supplements).split(',').map(s => s.trim()).filter(Boolean).map(name => ({ name })) : [];
    const weightKg = typeof values.weight_kg === 'number' ? values.weight_kg : undefined;
    const heightCm = typeof values.height_cm === 'number' ? values.height_cm : undefined;
    const injuries = String(values.injuries ?? '').trim() ? [String(values.injuries).trim()] : [];

    const firstBodyWeightEntry: BodyWeightEntry | null = weightKg != null && weightKg >= 20 && weightKg <= 300
      ? { id: crypto.randomUUID(), date: now.slice(0, 10), weight: weightKg, recordedAt: now }
      : null;

    const profile: TitanProfile = {
      onboardingComplete: true, privacyLevel: 'basic', trackingLevel: 'standard',
      nutrition: { supplements },
      activity: { workoutsPerWeek: daysPerWeek, ...(equipment.length > 0 ? { equipment } : {}), ...(weightKg != null ? { baselineWeight: weightKg } : {}), ...(heightCm != null ? { baselineHeight: heightCm } : {}) },
      history: { goals: [goal], pastTraining: experience, ...(injuries.length > 0 ? { legacyInjuryStrings: injuries } : {}) },
      summary: `Express onboarding: ${goal}, ${experience}, ${daysPerWeek}d/wk.`,
      routines: [], ...(firstBodyWeightEntry ? { bodyWeightLog: [firstBodyWeightEntry] } : {}),
      createdAt: now, updatedAt: now,
      medicalOnboardingComplete: false, knownConditions: [], medications: [], allergies: [],
      biomarkers: [], labSummaries: [], clearances: [], medicalImageAnalyses: [], medicalSummary: '',
    };
    onComplete(profile);
  }, [onComplete]);

  // Guided chat spec (full logic preserved)
  const chatSpec = useMemo<GuidedChatSpec<TitanIntakeState>>(
    () => ({
      initialState: { privacyLevel: initialProfile?.privacyLevel ?? null, profile: initialProfile ?? null, accumulator: initialAccumulator, baseContext: initialContext, stepProgress: 0, protocolViolationCount: 0 },
      initialMessages: [],
      initialStep: 0,
      steps: [...TRAINER_STEPS],
      summary: 'Titan onboarding intake.',
      placeholder: 'Select data level to begin',
      canSend: (state) => Boolean(state.privacyLevel && state.profile),
      buildContext: (state, history) => {
        const missing = getMissingSectionsFromAccumulator(state.accumulator);
        return {
          moduleId: 'titan',
          systemPrompt: `${getTitanPromptBuilder().buildOnboardingPrompt(
            state.privacyLevel || 'basic',
            state.baseContext?.name ?? null,
            state.baseContext?.pronouns ?? null,
            state.baseContext?.occupation ?? null,
            typeof state.baseContext?.typicalSleepHours === 'number' ? state.baseContext.typicalSleepHours : null,
          )}

[CURRENT_CAPTURED_TRAINER_DATA]
- Nutrition: ${sectionSnapshot(state.accumulator.nutrition)}
- Activity: ${sectionSnapshot(state.accumulator.activity)}
- History/Goals: ${sectionSnapshot(state.accumulator.history)}

[MISSING_REQUIRED_SECTIONS]
- ${missing.length > 0 ? formatMissingSections(missing) : 'none'}

[PROTOCOL]
- Append new data to existing context; do not discard previously captured data.
- Do not re-ask already captured data.
- Ask one concise follow-up question for only the next missing section.
- Completion requires: nutrition + activity + training history/goals.
- Emit complete action only when all required sections are captured.
`,
          memoryContext: [],
          summary: 'Titan onboarding intake.',
          history
        };
      },
      onResponse: async (response: StructuredResponse, state, meta) => {
        if (!state.profile) return {};
        let nextProfile = { ...state.profile };
        let nextAccumulator = { ...state.accumulator };
        const nextBaseContext = { ...state.baseContext };
        let assistantMessage: string | undefined;

        const profileUpdates = response.actions.filter(a => a.type === 'update_titan_profile').map(a => a.payload as Partial<TitanProfile>);
        for (const parsed of profileUpdates) {
          const normalizedPatch = normalizeTitanProfilePatch(parsed);
          nextProfile = mergeTitanProfile(nextProfile, normalizedPatch);
          nextAccumulator = appendProfilePatch(nextAccumulator, normalizedPatch);
        }

        const routineUpdates = response.actions.filter(a => a.type === 'update_routine').map(a => a.payload as { routines?: Routine[] });
        for (const parsed of routineUpdates) {
          if (parsed.routines) { nextProfile.routines = normalizeRoutines(parsed.routines as Routine[]); nextAccumulator.routines = nextProfile.routines; }
        }

        const baseContextUpdates = response.actions.filter(a => a.type === 'update_global_base_context').map(a => a.payload as Partial<GlobalBaseIntakeContext>);
        for (const parsed of baseContextUpdates) {
          if (typeof parsed.name === 'string' && parsed.name.trim()) nextBaseContext.name = parsed.name.trim();
          if (typeof parsed.pronouns === 'string' && parsed.pronouns.trim()) nextBaseContext.pronouns = parsed.pronouns.trim();
          if (typeof parsed.occupation === 'string' && parsed.occupation.trim()) nextBaseContext.occupation = parsed.occupation.trim();
          if (typeof parsed.typicalSleepHours === 'number' && Number.isFinite(parsed.typicalSleepHours) && parsed.typicalSleepHours > 0 && parsed.typicalSleepHours <= 24) nextBaseContext.typicalSleepHours = parsed.typicalSleepHours;
        }

        const focusAction = [...response.actions].reverse().find((a) => ['focus_nutrition', 'focus_physical_data', 'focus_history_goals'].includes(a.type));
        let explicitFocus: number | undefined;
        if (focusAction) {
          if (focusAction.type === 'focus_nutrition') explicitFocus = 0;
          if (focusAction.type === 'focus_physical_data') explicitFocus = 1;
          if (focusAction.type === 'focus_history_goals') explicitFocus = 2;
        }

        nextAccumulator = appendFromUserMessage(nextAccumulator, meta?.latestUserMessage);
        if (meta?.history?.length) nextAccumulator = backfillFromHistory(nextAccumulator, meta.history);

        const projectedPatch = toProfilePatchFromAccumulator(nextAccumulator);
        nextProfile = mergeTitanProfile(nextProfile, projectedPatch);

        const missingSections = getMissingSectionsFromAccumulator(nextAccumulator);
        const hasRequiredData = missingSections.length === 0;
        const dataStep = deriveStepFromMissingSections(missingSections);
        const nextStep = explicitFocus !== undefined
          ? Math.max(state.stepProgress, dataStep, explicitFocus)
          : Math.max(state.stepProgress, dataStep);

        const hasCompletionAction = response.actions.some(a => a.type === 'complete_titan_onboarding');
        const completionClaim = hasCompletionClaim(response.publicText);
        const completionActionWithoutRequiredData = hasCompletionAction && !hasRequiredData;
        const nearCompleteImplicitFinalize = completionClaim && !hasCompletionAction && hasRequiredData;
        const completionClaimWithoutRequiredData = completionClaim && !hasRequiredData;

        let nextViolationCount = state.protocolViolationCount;
        if (completionActionWithoutRequiredData || completionClaimWithoutRequiredData) nextViolationCount += 1;
        else nextViolationCount = 0;

        const completed = (hasCompletionAction && hasRequiredData) || nearCompleteImplicitFinalize;
        if (completed) {
          nextProfile.onboardingComplete = true;
          assistantMessage = 'Titan onboarding complete. Profile synchronized and ready for routine generation.';
        } else if (completionClaimWithoutRequiredData || completionActionWithoutRequiredData) {
          assistantMessage = nextMissingQuestion(missingSections[0]);
        }
        if (!assistantMessage && !response.publicText.trim()) {
          assistantMessage = missingSections[0] ? nextMissingQuestion(missingSections[0]) : 'Data captured. Preparing to finalize your profile.';
        }

        nextProfile.updatedAt = new Date().toISOString();

        const vitalsPatch = response.actions.filter(a => a.type === 'sync_vitals').map(a => a.payload as Partial<NeuralStateVectorPatch>).reduce((acc, payload) => mergeNSVPatch(acc, payload), {} as NeuralStateVectorPatch);
        if (user?.uid && Object.keys(vitalsPatch).length > 0) {
          await GlobalProjectionService.updateCrossFunctionalState(user.uid, vitalsPatch).catch(console.error);
        }
        if (completed && Object.keys(vitalsPatch).length === 0) {
          AraHandoffService.store({ moduleId: 'titan', type: 'delegate', content: buildCalibrationPrompt('titan'), reason: 'calibration_request', sourceModuleId: 'titan', createdAt: new Date().toISOString() });
        }

        return { nextState: { ...state, profile: nextProfile, accumulator: nextAccumulator, baseContext: nextBaseContext, stepProgress: nextStep, protocolViolationCount: nextViolationCount }, nextStep, completed, assistantMessage };
      }
    }),
    [initialAccumulator, initialContext, initialProfile, user]
  );

  const intake = useGuidedChatIntake({
    spec: chatSpec,
    onComplete: async (state) => {
      if (state.profile) {
        if (onGlobalBaseContextFinalize) {
          try { await onGlobalBaseContextFinalize(state.baseContext); } catch (e) { console.error('Titan onboarding global base context sync failed:', e); }
        }
        onComplete({ ...state.profile, onboardingComplete: true });
      }
    }
  });

  const { state, setState, stepIndex, messages, setMessages, isProcessing, error, streamingText, handleSendMessage } = intake;

  useEffect(() => {
    if (state.profile && !state.profile.onboardingComplete) saveGuestTitanProfile(state.profile);
  }, [state.profile]);

  useEffect(() => {
    if (!state.privacyLevel || messages.length > 0) return;
    const profile = state.profile ?? initialProfile ?? createEmptyProfile(state.privacyLevel);
    const introPrefix = state.privacyLevel === 'complete'
      ? "Onboarding initialized. We'll go deep to build a complete performance profile."
      : "Onboarding initialized. We'll keep this focused on non-intrusive data.";
    const intro = hasBaseContext(state.baseContext) ? `${introPrefix} ${buildBaseContextPrompt(state.baseContext)}` : `${introPrefix} Let's start with nutrition: what do you typically eat and which supplements do you take?`;
    if (!state.profile) setState((prev) => ({ ...prev, profile, accumulator: createAccumulatorFromProfile(profile) }));
    setMessages([{ role: 'assistant', content: intro }]);
  }, [initialProfile, messages.length, setMessages, setState, state.baseContext, state.privacyLevel, state.profile]);

  return (
    <UnifiedOnboardingShell
      spec={TITAN_BASE_SPEC}
      onExpressComplete={handleExpressComplete}
      guidedContent={
        <TitanGuidedContent
          state={state}
          setState={setState as React.Dispatch<React.SetStateAction<TitanIntakeState>>}
          messages={messages}
          isProcessing={isProcessing}
          streamingText={streamingText}
          error={error}
          handleSendMessage={handleSendMessage}
          placeholder={chatSpec.placeholder}
        />
      }
    />
  );
}
