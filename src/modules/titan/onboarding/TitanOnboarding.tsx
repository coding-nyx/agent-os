import React, { useEffect, useMemo, useState } from 'react';
import { Shield, Sparkles, Zap, Stethoscope, Lock } from 'lucide-react';
import { GuidedIntakeFrame } from '@/core/intake/GuidedIntakeFrame';
import { GuidedChatSpec } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { NexusChat } from '@/core/components/NexusChat';
import { cn } from '@/lib/utils';
import { TitanProfile, TitanPrivacyLevel } from '@/lib/types';
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
  medicalPhase: 'pending' | 'active' | 'skipped' | 'done';
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
    label: 'History & Goals',
    helperText: 'Capture injuries, past training, and measurable targets.'
  },
  {
    key: 'sync',
    label: 'Routine Sync',
    helperText: 'Finalize the profile and lock routine-ready state.'
  }
] as const;

const MEDICAL_STEPS = [
  {
    key: 'medical_gate',
    label: 'Health Monitoring',
    helperText: 'Optional: set up integrated health monitoring.'
  },
  {
    key: 'conditions',
    label: 'Conditions',
    helperText: 'Capture known medical conditions.'
  },
  {
    key: 'medications',
    label: 'Medications',
    helperText: 'Capture current medications.'
  },
  {
    key: 'allergies',
    label: 'Allergies',
    helperText: 'Capture allergies and contraindications.'
  },
  {
    key: 'medical_consent',
    label: 'Consent',
    helperText: 'Acknowledge medical disclaimer and finalize.'
  }
] as const;

function getAllSteps(medicalPhase: TitanIntakeState['medicalPhase']) {
  if (medicalPhase === 'skipped' || medicalPhase === 'pending') {
    return [...TRAINER_STEPS];
  }
  return [...TRAINER_STEPS, ...MEDICAL_STEPS];
}

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
  const [fastGoal, setFastGoal] = useState('');
  const [fastExperience, setFastExperience] = useState('');
  const [fastSupplements, setFastSupplements] = useState('');
  const [fastTrainingDays, setFastTrainingDays] = useState('');
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
    const trainingDays = fastTrainingDays.trim() ? Number.parseInt(fastTrainingDays) : undefined;
    const profile: TitanProfile = {
      onboardingComplete: true,
      privacyLevel,
      trackingLevel: privacyLevel === 'complete' ? 'indepth' : 'standard',
      nutrition: { supplements: supplements.map(name => ({ name })) },
      activity: {
        ...(Number.isFinite(trainingDays) && trainingDays! > 0 ? { workoutsPerWeek: trainingDays } : {})
      },
      history: {
        goals: [fastGoal],
        pastTraining: fastExperience,
        ...(fastInjuries.trim() ? { injuries: [fastInjuries.trim()] } : {})
      },
      summary: `Express onboarding: ${fastExperience} level, goal: ${fastGoal}.`,
      routines: [],
      createdAt: now,
      updatedAt: now,
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
  const initialMedicalPhase = initialProfile?.medicalOnboardingComplete ? 'done' as const : 'pending' as const;

  const spec = useMemo<GuidedChatSpec<TitanIntakeState>>(
    () => ({
      initialState: {
        privacyLevel: initialProfile?.privacyLevel ?? null,
        profile: initialProfile ?? null,
        accumulator: initialAccumulator,
        baseContext: initialContext,
        stepProgress: 0,
        protocolViolationCount: 0,
        medicalPhase: initialMedicalPhase
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
        let nextBaseContext = { ...state.baseContext };
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
        let nextMedicalPhase = state.medicalPhase;

        if (completed && nextMedicalPhase === 'pending') {
          // Training intake done — don't finalize yet, show medical gate
          nextProfile.onboardingComplete = false;
          nextStep = TRAINER_STEPS.length - 1;
          nextMedicalPhase = 'pending';
          assistantMessage = 'Training profile captured. You can now optionally set up health monitoring, or skip to finish.';
        } else if (completed && (nextMedicalPhase === 'skipped' || nextMedicalPhase === 'done')) {
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

        const isFullyCompleted = completed && (nextMedicalPhase === 'skipped' || nextMedicalPhase === 'done');

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
            medicalPhase: nextMedicalPhase
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

  // Medical intake form state
  const [medicalConditions, setMedicalConditions] = useState('');
  const [medicalMedications, setMedicalMedications] = useState('');
  const [medicalAllergies, setMedicalAllergies] = useState('');
  const [medicalConsent, setMedicalConsent] = useState(false);
  const [medicalStep, setMedicalStep] = useState(0);

  const trainingDone = state.stepProgress >= TRAINER_STEPS.length - 1 &&
    getMissingSectionsFromAccumulator(state.accumulator).length === 0;
  const showMedicalGate = trainingDone && state.medicalPhase === 'pending';
  const showMedicalIntake = state.medicalPhase === 'active';

  const handleSkipMedical = () => {
    if (!state.profile) return;
    const nextProfile: TitanProfile = {
      ...state.profile,
      medicalOnboardingComplete: false,
      onboardingComplete: true,
      updatedAt: new Date().toISOString()
    };
    setState(prev => ({ ...prev, profile: nextProfile, medicalPhase: 'skipped' }));
    onComplete(nextProfile);
  };

  const handleStartMedical = () => {
    setState(prev => ({ ...prev, medicalPhase: 'active' }));
    setMedicalStep(0);
  };

  const handleMedicalComplete = () => {
    if (!state.profile) return;
    const conditions = medicalConditions.trim()
      ? medicalConditions.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const medications = medicalMedications.trim()
      ? medicalMedications.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const allergies = medicalAllergies.trim()
      ? medicalAllergies.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const nextProfile: TitanProfile = {
      ...state.profile,
      medicalOnboardingComplete: true,
      knownConditions: conditions,
      medications,
      allergies,
      medicalSummary: [
        conditions.length > 0 ? `${conditions.length} condition(s)` : null,
        medications.length > 0 ? `${medications.length} medication(s)` : null,
        allergies.length > 0 ? `${allergies.length} allergy(ies)` : null
      ].filter(Boolean).join(', ') || 'No medical data reported.',
      onboardingComplete: true,
      updatedAt: new Date().toISOString()
    };
    setState(prev => ({ ...prev, profile: nextProfile, medicalPhase: 'done' }));
    onComplete(nextProfile);
  };

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

  // Medical Gate: show after training completion
  if (showMedicalGate) {
    return (
      <GuidedIntakeFrame
        title="Titan Guided Intake"
        subtitle="Training profile captured. Optional health monitoring setup."
        statusLabel="MEDICAL_GATE"
        steps={getAllSteps('active').map(s => ({ ...s }))}
        currentStep={TRAINER_STEPS.length}
        themeColor="orange"
      >
        <div className="flex flex-col items-center justify-center p-8 md:p-12 gap-6 min-h-[400px]">
          <Stethoscope className="w-12 h-12 text-orange-400/80" />
          <h2 className="text-lg font-black uppercase tracking-wider text-white text-center">
            Health Monitoring Setup
          </h2>
          <p className="text-sm text-white/60 text-center max-w-md leading-relaxed">
            Would you like to set up integrated health monitoring? This enables biomarker tracking,
            lab result analysis, and medical clearance management within Titan.
          </p>
          <div className="flex items-center gap-1.5 text-[10px] text-white/40 uppercase tracking-wider">
            <Lock className="w-3 h-3" />
            <span>All medical data is encrypted end-to-end</span>
          </div>
          <div className="flex gap-4 mt-2">
            <button
              onClick={handleSkipMedical}
              className="px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all"
            >
              Skip
            </button>
            <button
              onClick={handleStartMedical}
              className="px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest bg-orange-600 hover:bg-orange-500 text-white transition-all flex items-center gap-2"
            >
              <Stethoscope className="w-3.5 h-3.5" />
              Set Up
            </button>
          </div>
          <p className="text-[9px] text-white/30 uppercase tracking-tight text-center">
            You can always configure health monitoring later from your Titan dashboard.
          </p>
        </div>
      </GuidedIntakeFrame>
    );
  }

  // Medical Intake Steps (form-based, not chat)
  if (showMedicalIntake) {
    const medicalStepContent = [
      // Step 0: Known Conditions
      <div key="conditions" className="flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <Stethoscope className="w-5 h-5 text-orange-400" />
          <h3 className="text-sm font-black uppercase tracking-wider text-white">Known Conditions</h3>
        </div>
        <p className="text-xs text-white/50 leading-relaxed">
          List any pre-existing medical conditions. This helps Titan make safer training recommendations.
        </p>
        <textarea
          placeholder="e.g., asthma, type 2 diabetes, hypertension (comma-separated)"
          value={medicalConditions}
          onChange={e => setMedicalConditions(e.target.value)}
          rows={3}
          className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30 transition-colors resize-none"
        />
        <p className="text-[9px] text-white/30 uppercase tracking-tight">Optional — leave blank if none</p>
      </div>,
      // Step 1: Medications
      <div key="medications" className="flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <Stethoscope className="w-5 h-5 text-orange-400" />
          <h3 className="text-sm font-black uppercase tracking-wider text-white">Current Medications</h3>
        </div>
        <p className="text-xs text-white/50 leading-relaxed">
          List any medications you currently take. Some may affect training capacity or recovery.
        </p>
        <textarea
          placeholder="e.g., metformin 500mg, lisinopril 10mg (comma-separated)"
          value={medicalMedications}
          onChange={e => setMedicalMedications(e.target.value)}
          rows={3}
          className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30 transition-colors resize-none"
        />
        <p className="text-[9px] text-white/30 uppercase tracking-tight">Optional — leave blank if none</p>
      </div>,
      // Step 2: Allergies
      <div key="allergies" className="flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <Stethoscope className="w-5 h-5 text-orange-400" />
          <h3 className="text-sm font-black uppercase tracking-wider text-white">Allergies</h3>
        </div>
        <p className="text-xs text-white/50 leading-relaxed">
          List any known allergies or contraindications, including drug allergies and environmental sensitivities.
        </p>
        <textarea
          placeholder="e.g., penicillin, latex, shellfish (comma-separated)"
          value={medicalAllergies}
          onChange={e => setMedicalAllergies(e.target.value)}
          rows={3}
          className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30 transition-colors resize-none"
        />
        <p className="text-[9px] text-white/30 uppercase tracking-tight">Optional — leave blank if none</p>
      </div>,
      // Step 3: Medical Consent
      <div key="consent" className="flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-5 h-5 text-orange-400" />
          <h3 className="text-sm font-black uppercase tracking-wider text-white">Medical Disclaimer</h3>
        </div>
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4 space-y-3">
          <p className="text-xs text-white/70 leading-relaxed">
            Titan provides <strong className="text-white">informational guidance only</strong>. It does not replace professional medical advice,
            diagnosis, or treatment. Always consult qualified healthcare providers for medical decisions.
          </p>
          <p className="text-xs text-white/70 leading-relaxed">
            For emergencies (chest pain, difficulty breathing, severe allergic reactions),
            contact local emergency services immediately.
          </p>
          <div className="flex items-center gap-1.5 text-[10px] text-white/40 uppercase tracking-wider">
            <Lock className="w-3 h-3" />
            <span>All medical data is encrypted end-to-end before storage</span>
          </div>
        </div>
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={medicalConsent}
            onChange={e => setMedicalConsent(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-white/20 bg-black/20 text-orange-500 focus:ring-orange-500/30"
          />
          <span className="text-xs text-white/60 group-hover:text-white/80 transition-colors leading-relaxed">
            I understand that Titan provides informational guidance only and is not a substitute for professional medical care.
          </span>
        </label>
      </div>
    ];

    return (
      <GuidedIntakeFrame
        title="Titan Guided Intake"
        subtitle="Health monitoring setup — all steps are optional."
        statusLabel="MEDICAL_INTAKE"
        steps={getAllSteps('active').map(s => ({ ...s }))}
        currentStep={TRAINER_STEPS.length + 1 + medicalStep}
        themeColor="orange"
      >
        <div className="p-6 md:p-8 flex flex-col gap-6 min-h-[400px]">
          {medicalStepContent[medicalStep]}
          <div className="flex justify-between items-center mt-auto pt-4 border-t border-white/5">
            <button
              onClick={() => {
                if (medicalStep === 0) {
                  handleSkipMedical();
                } else {
                  setMedicalStep(s => s - 1);
                }
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
            >
              {medicalStep === 0 ? 'Skip All' : 'Back'}
            </button>
            <div className="flex gap-2">
              {medicalStep < medicalStepContent.length - 1 && (
                <button
                  onClick={() => setMedicalStep(s => s + 1)}
                  className="px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-orange-600 hover:bg-orange-500 text-white transition-all"
                >
                  {medicalStep === 0 && !medicalConditions.trim() && !medicalMedications.trim() ? 'Skip' : 'Next'}
                </button>
              )}
              {medicalStep === medicalStepContent.length - 1 && (
                <button
                  onClick={handleMedicalComplete}
                  disabled={!medicalConsent}
                  className="px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all flex items-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Complete
                </button>
              )}
            </div>
          </div>
        </div>
      </GuidedIntakeFrame>
    );
  }

  return (
    <GuidedIntakeFrame
      title="Titan Guided Intake"
      subtitle="Calibrating a performance profile for safe routine generation."
      statusLabel={state.privacyLevel ? (state.privacyLevel === 'complete' ? 'COMPLETE_DATA' : 'BASIC_DATA') : 'SELECT_PRIVACY'}
      steps={getAllSteps(state.medicalPhase).map(s => ({ ...s }))}
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
          <div className="p-4 md:p-6 flex flex-col gap-4 border-b border-orange-500/20 bg-orange-500/5">
            <div className="flex-1 w-full space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-400 flex items-center gap-2">
                <Zap className="w-3 h-3" /> Fast Track Initialization
              </p>
              <div className="space-y-3">
                <div>
                  <p className="text-[9px] text-white/40 uppercase tracking-wider mb-2">Primary Goal</p>
                  <div className="flex gap-2 flex-wrap">
                    {['strength', 'hypertrophy', 'weight loss', 'endurance', 'general fitness'].map(goal => (
                      <button
                        key={goal}
                        onClick={() => setFastGoal(goal)}
                        className={cn(
                          'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all',
                          fastGoal === goal
                            ? 'bg-orange-600/30 border-orange-500/50 text-orange-300'
                            : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
                        )}
                      >
                        {goal}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[9px] text-white/40 uppercase tracking-wider mb-2">Experience Level</p>
                  <div className="flex gap-2 flex-wrap">
                    {['beginner', 'intermediate', 'advanced'].map(level => (
                      <button
                        key={level}
                        onClick={() => setFastExperience(level)}
                        className={cn(
                          'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all',
                          fastExperience === level
                            ? 'bg-orange-600/30 border-orange-500/50 text-orange-300'
                            : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
                        )}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    placeholder="Supplements (comma-separated, optional)"
                    value={fastSupplements}
                    onChange={e => setFastSupplements(e.target.value)}
                    className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-orange-500/50"
                  />
                  <input
                    type="number"
                    placeholder="Training days/week (optional)"
                    value={fastTrainingDays}
                    onChange={e => setFastTrainingDays(e.target.value)}
                    className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-orange-500/50"
                  />
                  <input
                    placeholder="Injuries or limitations (optional)"
                    value={fastInjuries}
                    onChange={e => setFastInjuries(e.target.value)}
                    className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-orange-500/50"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleFastTrack}
                    disabled={!fastGoal || !fastExperience || isValidatingFastTrack}
                    className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center whitespace-nowrap"
                  >
                    {isValidatingFastTrack ? 'Validating...' : 'Execute'}
                  </button>
                </div>
                {fastTrackError && (
                  <p className="text-[10px] text-rose-300">{fastTrackError}</p>
                )}
              </div>
              <p className="text-[9px] text-white/40 uppercase tracking-tight">
                Bypass conversational intake. Requires goal and experience level.
              </p>
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
