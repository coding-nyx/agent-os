import React, { useEffect, useMemo, useState } from 'react';
import { Shield, Sparkles, Zap, Lock } from 'lucide-react';
import { GuidedIntakeFrame } from '@/core/intake/GuidedIntakeFrame';
import { GuidedChatSpec } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { NexusChat } from '@/core/components/NexusChat';
import { cn } from '@/lib/utils';
import { TitanProfile, TitanPrivacyLevel, EquipmentType } from '@/lib/types';
import { StructuredResponse } from '@/lib/ai-adapters/engine-types';
import { useAuth } from '@/lib/auth-context';
import { buildTitanOnboardingPrompt } from '../prompts/titan-onboarding-prompt';
import { mergeTitanProfile, normalizeRoutines } from '../utils';
import { saveGuestTitanProfile } from '../services/titan-profile-service';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { mergeNSVPatch } from '@/lib/services/nsv-service';
import type { NeuralStateVectorPatch, Routine } from '@/lib/types';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { buildCalibrationPrompt } from '@/lib/services/nsv-ownership';
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
import { useFastTrackValidation } from '@/lib/onboarding/fast-track-validation';

// ---------------------------------------------------------------------------
// Chip data constants
// ---------------------------------------------------------------------------

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

/** Maps chip selection values to valid EquipmentType union values. */
const EQUIPMENT_TYPE_MAP: Record<EquipmentChipValue, EquipmentType> = {
  barbell: 'barbell',
  dumbbell: 'dumbbells',
  cable: 'cables',
  machine: 'machines',
  bodyweight: 'bodyweight',
  resistance_band: 'bands',
  kettlebell: 'kettlebells',
  pull_up_bar: 'bodyweight', // pull-up bars are a bodyweight-class tool
};

// ---------------------------------------------------------------------------

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
  {
    key: 'nutrition',
    label: 'Nutrition Intake',
    helperText: 'Capture supplements, meal structure, and macro baseline.'
  },
  {
    key: 'activity',
    label: 'Physical Data',
    helperText: 'Capture training frequency, workload, sleep, and recovery.'
  },
  {
    key: 'history',
    label: 'History, Goals & Routine Setup',
    helperText: 'Capture injuries, past training, and measurable targets — then finalize the profile and lock routine-ready state.'
  }
] as const;

function createEmptyProfile(privacyLevel: TitanPrivacyLevel): TitanProfile {
  return {
    onboardingComplete: false,
    privacyLevel,
    trackingLevel: privacyLevel === 'complete' ? 'indepth' : 'standard',
    nutrition: { supplements: [] },
    activity: {},
    history: {},
    summary: '',
    routines: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // Medical fields (absorbed from Soma)
    medicalOnboardingComplete: false,
    knownConditions: [],
    medications: [],
    allergies: [],
    biomarkers: [],
    labSummaries: [],
    clearances: [],
    medicalImageAnalyses: [],
    medicalSummary: '',
  };
}

function hasCompletionClaim(response: string): boolean {
  return /\b(onboarding (?:is )?complete|intake (?:is )?complete|all (?:the )?information (?:i )?(?:need|needed)|profile (?:is )?(?:ready|synced|synchronized)|we(?:'re| are) done)\b/i.test(
    response
  );
}

function formatMissingSections(missing: RequiredSectionKey[]): string {
  return missing
    .map((key) => {
      if (key === 'nutrition') return 'nutrition baseline';
      if (key === 'activity') return 'activity baseline';
      return 'training history and goals';
    })
    .join(', ');
}

function deriveStepFromMissingSections(missing: RequiredSectionKey[]): number {
  if (missing.includes('nutrition')) return 0;
  if (missing.includes('activity')) return 1;
  if (missing.includes('history')) return 2;
  return TRAINER_STEPS.length - 1;
}

function sectionSnapshot(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || serialized === '{}' || serialized === '[]') return 'Missing';
    return serialized.length <= 360 ? serialized : `${serialized.slice(0, 360)}...`;
  } catch {
    return 'Missing';
  }
}

function nextMissingQuestion(firstMissing: RequiredSectionKey | undefined): string {
  if (firstMissing === 'nutrition') {
    return 'Before finalizing, share your typical nutrition baseline: meals, supplements, and any known macro/calorie targets.';
  }
  if (firstMissing === 'activity') {
    return 'Before finalizing, share your activity baseline: workouts per week, daily activity level, and average sleep hours.';
  }
  return 'Before finalizing, share your training history and goals, including any injuries and your primary objective.';
}

export function TitanOnboarding({
  onComplete,
  onGlobalBaseContextFinalize,
  initialBaseContext,
  initialProfile
}: TitanOnboardingProps) {
  const { user } = useAuth();
  const [fastGoal, setFastGoal] = useState<GoalChipValue | ''>('');
  const [fastExperience, setFastExperience] = useState<ExperienceChipValue | ''>('');
  const [fastSupplements, setFastSupplements] = useState('');
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [equipment, setEquipment] = useState<EquipmentChipValue[]>([]);
  const [fastInjuries, setFastInjuries] = useState('');
  const [fastTrackError, setFastTrackError] = useState<string | null>(null);
  const [isValidatingFastTrack, setIsValidatingFastTrack] = useState(false);
  const { validateFastTrack } = useFastTrackValidation('titan');

  const handleFastTrack = async () => {
    if (!fastGoal || !fastExperience) return;
    setFastTrackError(null);
    setIsValidatingFastTrack(true);
    const privacyLevel = (state?.privacyLevel ?? 'basic') as TitanPrivacyLevel;
    const now = new Date().toISOString();
    const supplements = fastSupplements.trim()
      ? fastSupplements.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const mappedEquipment: EquipmentType[] = Array.from(
      new Set(equipment.map(e => EQUIPMENT_TYPE_MAP[e]))
    );

    const goalLabel = GOAL_CHIPS.find(c => c.value === fastGoal)?.label ?? fastGoal;
    const equipmentLabel = equipment.length > 0
      ? EQUIPMENT_CHIPS.filter(c => equipment.includes(c.value)).map(c => c.label).join(', ')
      : 'no specific equipment listed';
    const summary = `I want to ${goalLabel.toLowerCase()}. I am ${fastExperience} level, training ${daysPerWeek} days/week. Equipment available: ${equipmentLabel}. Generate my training program.`;

    const profile: TitanProfile = {
      onboardingComplete: true,
      privacyLevel,
      trackingLevel: privacyLevel === 'complete' ? 'indepth' : 'standard',
      nutrition: { supplements: supplements.map(name => ({ name })) },
      activity: {
        workoutsPerWeek: daysPerWeek,
        ...(mappedEquipment.length > 0 ? { equipment: mappedEquipment } : {})
      },
      history: {
        goals: [fastGoal],
        pastTraining: fastExperience,
        ...(fastInjuries.trim() ? { injuries: [fastInjuries.trim()] } : {})
      },
      summary,
      routines: [],
      createdAt: now,
      updatedAt: now,
      // Deprecated medical fields — kept as empty stubs during dual-write phase
      medicalOnboardingComplete: false,
      knownConditions: [],
      medications: [],
      allergies: [],
      biomarkers: [],
      labSummaries: [],
      clearances: [],
      medicalImageAnalyses: [],
      medicalSummary: '',
    };

    const validation = await validateFastTrack(profile as unknown as Record<string, unknown>, {
      requiredFields: ['history.goals', 'history.pastTraining', 'privacyLevel'],
      objective: 'Confirm Titan fast-track includes enough training baseline for safe routine generation.'
    });
    setIsValidatingFastTrack(false);
    if (!validation.accepted) {
      setFastTrackError('Fast-track validation failed. Continue guided onboarding to complete your training baseline.');
      return;
    }

    onComplete(profile);
  };

  const hasBaseContext = (context: GlobalBaseIntakeContext) =>
    Boolean(context.name || context.pronouns || context.occupation || typeof context.typicalSleepHours === 'number');

  const buildBaseContextPrompt = (context: GlobalBaseIntakeContext) => {
    const chunks = [
      context.name ? `name as ${context.name}` : null,
      context.pronouns ? `pronouns as ${context.pronouns}` : null,
      context.occupation ? `occupation as ${context.occupation}` : null,
      typeof context.typicalSleepHours === 'number' ? `typical sleep around ${context.typicalSleepHours} hours/night` : null
    ].filter(Boolean);

    if (chunks.length === 0) {
      return "Onboarding initialized. Let's start with nutrition: what do you typically eat and which supplements do you take?";
    }

    return `Nexus handoff received. I have your ${chunks.join(', ')}. Is that correct before we continue your training intake?`;
  };

  const initialContext = useMemo(() => initialBaseContext ?? {}, [initialBaseContext]);
  const initialAccumulator = useMemo(() => createAccumulatorFromProfile(initialProfile), [initialProfile]);

  const spec = useMemo<GuidedChatSpec<TitanIntakeState>>(
    () => ({
      initialState: {
        privacyLevel: initialProfile?.privacyLevel ?? null,
        profile: initialProfile ?? null,
        accumulator: initialAccumulator,
        baseContext: initialContext,
        stepProgress: 0,
        protocolViolationCount: 0,
      },
      initialMessages: [],
      initialStep: 0,
      steps: [...TRAINER_STEPS],
      summary: 'Titan onboarding intake.',
      placeholder: 'Select data level to begin',
      canSend: (state) => Boolean(state.privacyLevel && state.profile),
      buildContext: (state, history) => {
        const missing = getMissingSectionsFromAccumulator(state.accumulator);

        return {
          systemPrompt: `${buildTitanOnboardingPrompt(state.privacyLevel || 'basic', state.baseContext)}

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
      onResponse: async (response, state, meta) => {
        if (!state.profile) {
          return {};
        }

        let nextProfile = { ...state.profile };
        let nextAccumulator = { ...state.accumulator };
        const nextBaseContext = { ...state.baseContext };
        let assistantMessage: string | undefined;

        const profileUpdates = response.actions
          .filter(a => a.type === 'update_titan_profile')
          .map(a => a.payload as Partial<TitanProfile>);

        if (profileUpdates.length > 0) {
          for (const parsed of profileUpdates) {
            const normalizedPatch = normalizeTitanProfilePatch(parsed);
            nextProfile = mergeTitanProfile(nextProfile, normalizedPatch);
            nextAccumulator = appendProfilePatch(nextAccumulator, normalizedPatch);
          }
        }

        const routineUpdates = response.actions
          .filter(a => a.type === 'update_routine')
          .map(a => a.payload as { routines?: Routine[] });

        if (routineUpdates.length > 0) {
          for (const parsed of routineUpdates) {
            if (parsed.routines) {
              nextProfile.routines = normalizeRoutines(parsed.routines as Routine[]);
              nextAccumulator.routines = nextProfile.routines;
            }
          }
        }

        const baseContextUpdates = response.actions
          .filter((a) => a.type === 'update_global_base_context')
          .map((a) => a.payload as Partial<GlobalBaseIntakeContext>);

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

        const focusAction = [...response.actions].reverse().find((a) => 
          ['focus_nutrition', 'focus_physical_data', 'focus_history_goals'].includes(a.type)
        );
        let explicitFocus: number | undefined;
        if (focusAction) {
          if (focusAction.type === 'focus_nutrition') explicitFocus = 0;
          if (focusAction.type === 'focus_physical_data') explicitFocus = 1;
          if (focusAction.type === 'focus_history_goals') explicitFocus = 2;
        }

        nextAccumulator = appendFromUserMessage(nextAccumulator, meta?.latestUserMessage);
        if (meta?.history?.length) {
          nextAccumulator = backfillFromHistory(nextAccumulator, meta.history);
        }

        const projectedPatch = toProfilePatchFromAccumulator(nextAccumulator);
        nextProfile = mergeTitanProfile(nextProfile, projectedPatch);

        const missingSections = getMissingSectionsFromAccumulator(nextAccumulator);
        const hasRequiredData = missingSections.length === 0;
        
        // Step must never regress: take the max of the previous step, data-derived step,
        // and the LLM's explicit focus so progress only moves forward.
        const dataStep = deriveStepFromMissingSections(missingSections);
        let nextStep = explicitFocus !== undefined
          ? Math.max(state.stepProgress, dataStep, explicitFocus)
          : Math.max(state.stepProgress, dataStep);

        const hasCompletionAction = response.actions.some((a) => a.type === 'complete_titan_onboarding');
        const completionClaim = hasCompletionClaim(response.publicText);
        const completionActionWithoutRequiredData = hasCompletionAction && !hasRequiredData;
        const nearCompleteImplicitFinalize = completionClaim && !hasCompletionAction && hasRequiredData;
        const completionClaimWithoutRequiredData = completionClaim && !hasRequiredData;

        let nextViolationCount = state.protocolViolationCount;
        if (completionActionWithoutRequiredData || completionClaimWithoutRequiredData) {
          nextViolationCount += 1;
        } else {
          nextViolationCount = 0;
        }

        const completed = (hasCompletionAction && hasRequiredData) || nearCompleteImplicitFinalize;

        if (completed) {
          nextProfile.onboardingComplete = true;
          nextStep = TRAINER_STEPS.length - 1;
          assistantMessage = 'Titan onboarding complete. Profile synchronized and ready for routine generation.';
        } else if (completionClaimWithoutRequiredData || completionActionWithoutRequiredData) {
          assistantMessage = nextMissingQuestion(missingSections[0]);
        }

        // Fallback: LLM responded with only action tags and no visible text
        if (!assistantMessage && !response.publicText.trim()) {
          const firstMissing = missingSections[0];
          if (firstMissing) {
            assistantMessage = nextMissingQuestion(firstMissing);
          } else {
            assistantMessage = 'Data captured. Preparing to finalize your profile.';
          }
        }

        nextProfile.updatedAt = new Date().toISOString();

        const isFullyCompleted = completed;

        const vitalsPatch = response.actions
          .filter((action) => action.type === 'sync_vitals')
          .map((action) => action.payload as Partial<NeuralStateVectorPatch>)
          .reduce((acc, payload) => mergeNSVPatch(acc, payload), {} as NeuralStateVectorPatch);

        if (user?.uid && Object.keys(vitalsPatch).length > 0) {
          await GlobalProjectionService.updateCrossFunctionalState(user.uid, vitalsPatch).catch((e) => {
            console.error('Titan onboarding sync_vitals failed:', e);
          });
        }
        if (isFullyCompleted && Object.keys(vitalsPatch).length === 0) {
          NexusHandoffService.store({
            moduleId: 'titan',
            type: 'delegate',
            content: buildCalibrationPrompt('titan'),
            reason: 'calibration_request',
            sourceModuleId: 'titan',
            createdAt: new Date().toISOString()
          });
        }

        return {
          nextState: {
            ...state,
            profile: nextProfile,
            accumulator: nextAccumulator,
            baseContext: nextBaseContext,
            stepProgress: nextStep,
            protocolViolationCount: nextViolationCount,
          },
          nextStep,
          completed: isFullyCompleted,
          assistantMessage
        };
      }
    }),
    [initialAccumulator, initialContext, initialProfile]
  );

  const intake = useGuidedChatIntake({
    spec,
    onComplete: async (state) => {
      if (state.profile) {
        if (onGlobalBaseContextFinalize) {
          try {
            await onGlobalBaseContextFinalize(state.baseContext);
          } catch (e) {
            console.error('Titan onboarding global base context sync failed:', e);
          }
        }
        onComplete({ ...state.profile, onboardingComplete: true });
      }
    }
  });

  const { state, setState, stepIndex, messages, setMessages, isProcessing, error, streamingText, handleSendMessage } = intake;

  useEffect(() => {
    if (state.profile && !state.profile.onboardingComplete) {
      saveGuestTitanProfile(state.profile);
    }
  }, [state.profile]);

  useEffect(() => {
    if (!state.privacyLevel || messages.length > 0) {
      return;
    }

    const profile = state.profile ?? initialProfile ?? createEmptyProfile(state.privacyLevel);
    const introPrefix =
      state.privacyLevel === 'complete'
        ? "Onboarding initialized. We'll go deep to build a complete performance profile."
        : "Onboarding initialized. We'll keep this focused on non-intrusive data.";
    const intro = hasBaseContext(state.baseContext)
      ? `${introPrefix} ${buildBaseContextPrompt(state.baseContext)}`
      : `${introPrefix} Let's start with nutrition: what do you typically eat and which supplements do you take?`;

    if (!state.profile) {
      setState((prev) => ({
        ...prev,
        profile,
        accumulator: createAccumulatorFromProfile(profile)
      }));
    }
    setMessages([{ role: 'assistant', content: intro }]);
  }, [initialProfile, messages.length, setMessages, setState, state.baseContext, state.privacyLevel, state.profile]);

  return (
    <GuidedIntakeFrame
      title="Titan Guided Intake"
      subtitle="Calibrating a performance profile for safe routine generation."
      statusLabel={state.privacyLevel ? (state.privacyLevel === 'complete' ? 'COMPLETE_DATA' : 'BASIC_DATA') : 'SELECT_PRIVACY'}
      steps={[...TRAINER_STEPS]}
      currentStep={stepIndex}
      themeColor="orange"
      preludeCollapsible={!!state.privacyLevel}
      prelude={
        !state.privacyLevel ? (
          <div className="p-6">
            <p className="text-[10px] text-white/50 uppercase font-black tracking-[0.2em] mb-4">Select Data Sharing Level</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setState((prev) => ({ ...prev, privacyLevel: 'basic' }))}
                className={cn('p-5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left group')}
              >
                <Shield className="w-6 h-6 text-orange-400 mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="text-sm font-black uppercase tracking-wider mb-2">Basic Data</h3>
                <p className="text-xs text-white/50 leading-relaxed">Non-intrusive intake. Skips intimate and gender-dependent questions.</p>
              </button>

              <button
                onClick={() => setState((prev) => ({ ...prev, privacyLevel: 'complete' }))}
                className={cn('p-5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left group')}
              >
                <Sparkles className="w-6 h-6 text-orange-400 mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="text-sm font-black uppercase tracking-wider mb-2">Complete Data</h3>
                <p className="text-xs text-white/50 leading-relaxed">Full intake including biological and intimate factors for maximum optimization.</p>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 md:p-6 flex flex-col gap-5 border-b border-orange-500/20 bg-orange-500/5">
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-400 flex items-center gap-2">
              <Zap className="w-3 h-3" /> Fast Track Initialization
            </p>

            {/* Goal chips */}
            <div className="space-y-2">
              <p className="text-[9px] text-white/40 uppercase tracking-wider">Primary Goal</p>
              <div className="flex flex-wrap gap-2">
                {GOAL_CHIPS.map(chip => (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => setFastGoal(chip.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-bold border transition-all',
                      fastGoal === chip.value
                        ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
                        : 'bg-white/5 border-white/10 text-white/50 hover:border-white/20 hover:text-white/70'
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience chips */}
            <div className="space-y-2">
              <p className="text-[9px] text-white/40 uppercase tracking-wider">Experience Level</p>
              <div className="flex flex-wrap gap-2">
                {EXPERIENCE_CHIPS.map(chip => (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => setFastExperience(chip.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5',
                      fastExperience === chip.value
                        ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
                        : 'bg-white/5 border-white/10 text-white/50 hover:border-white/20 hover:text-white/70'
                    )}
                  >
                    {chip.label}
                    <span className={cn(
                      'text-[9px] font-normal',
                      fastExperience === chip.value ? 'text-orange-300/70' : 'text-white/30'
                    )}>
                      {chip.sub}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Days per week stepper */}
            <div className="space-y-2">
              <p className="text-[9px] text-white/40 uppercase tracking-wider">Training Days / Week</p>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setDaysPerWeek(d => Math.max(1, d - 1))}
                  className="w-8 h-8 rounded-full bg-white/10 text-white/70 font-bold hover:bg-white/20 transition-colors"
                >
                  –
                </button>
                <span className="text-2xl font-black text-white tabular-nums w-6 text-center">
                  {daysPerWeek}
                </span>
                <button
                  type="button"
                  onClick={() => setDaysPerWeek(d => Math.min(7, d + 1))}
                  className="w-8 h-8 rounded-full bg-white/10 text-white/70 font-bold hover:bg-white/20 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {/* Equipment multi-select */}
            <div className="space-y-2">
              <p className="text-[9px] text-white/40 uppercase tracking-wider">Available Equipment</p>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_CHIPS.map(chip => (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => setEquipment(prev =>
                      prev.includes(chip.value)
                        ? prev.filter(e => e !== chip.value)
                        : [...prev, chip.value]
                    )}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-bold border transition-all',
                      equipment.includes(chip.value)
                        ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
                        : 'bg-white/5 border-white/10 text-white/50 hover:border-white/20 hover:text-white/70'
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional text fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                placeholder="Supplements (comma-separated, optional)"
                value={fastSupplements}
                onChange={e => setFastSupplements(e.target.value)}
                className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-orange-500/50"
              />
              <input
                placeholder="Injuries or limitations (optional)"
                value={fastInjuries}
                onChange={e => setFastInjuries(e.target.value)}
                className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-orange-500/50"
              />
            </div>

            <div className="flex justify-between items-center">
              <p className="text-[9px] text-white/40 uppercase tracking-tight">
                Bypass conversational intake. Requires goal and experience level.
              </p>
              <button
                onClick={handleFastTrack}
                disabled={!fastGoal || !fastExperience || isValidatingFastTrack}
                className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isValidatingFastTrack ? 'Validating…' : 'Execute'}
              </button>
            </div>

            {fastTrackError && (
              <p className="text-[10px] text-rose-300">{fastTrackError}</p>
            )}

            <div className="flex items-center gap-1.5 text-[9px] text-white/30 uppercase tracking-tight">
              <Lock className="w-3 h-3" />
              <span>Or chat with Titan below to build your profile conversationally.</span>
            </div>
          </div>
        )
      }
    >
      <NexusChat
        ai={{
          messages,
          isProcessing,
          streamingText,
          error,
          quota: null,
          handleSendMessage
        }}
        agentName="Titan Intake"
        themeColor="orange"
        placeholder={state.privacyLevel ? 'Share your response...' : spec.placeholder}
        showInternalSignals={false}
      />
    </GuidedIntakeFrame>
  );
}
