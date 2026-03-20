import React, { useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GuidedIntakeFrame } from '@/core/intake/GuidedIntakeFrame';
import { GuidedChatSpec } from '@/core/intake/types';
import { StructuredResponse } from '@/lib/ai-adapters/engine-types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { NexusChat } from '@/core/components/NexusChat';
import { useAuth } from '@/lib/auth-context';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import {
  AtlasProfile,
  createEmptyAtlasProfile
} from '../services/atlas-profile-service';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import type { NeuralStateVectorPatch } from '@/lib/types';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { buildCalibrationPrompt } from '@/lib/services/nsv-ownership';
import { useFastTrackValidation } from '@/lib/onboarding/fast-track-validation';

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
- After collecting baseline vitals, emit a bulk update with Atlas-owned metrics only:
  <action type="sync_vitals">{"cognitive":{"energyBudget":6,"focusScore":7,"activeLoad":4}}</action>
  Valid fields: energyBudget (0-10), focusScore (0-10), activeLoad (0-10). Do NOT include biological or emotional metrics.
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

  const [fastPeakHours, setFastPeakHours] = useState('');
  const [fastCurrentLoad, setFastCurrentLoad] = useState<'low' | 'medium' | 'high'>('medium');
  const [fastPrimaryTask, setFastPrimaryTask] = useState('');
  const [fastTrackError, setFastTrackError] = useState<string | null>(null);
  const [isValidatingFastTrack, setIsValidatingFastTrack] = useState(false);
  const { validateFastTrack } = useFastTrackValidation('atlas');

  const handleFastTrack = async () => {
    if (!fastPeakHours.trim()) return;
    setFastTrackError(null);
    setIsValidatingFastTrack(true);
    const now = new Date().toISOString();
    
    let activeLoad = 5;
    if (fastCurrentLoad === 'low') activeLoad = 3;
    if (fastCurrentLoad === 'high') activeLoad = 8;
    
    const taskGraph = fastPrimaryTask.trim() ? [
      {
        id: `ft-task-0`,
        title: fastPrimaryTask.trim(),
        energyCost: 6,
        status: 'queued' as const,
        dependencies: []
      }
    ] : [];

    const profile: AtlasProfile = {
      ...createEmptyAtlasProfile(),
      onboardingComplete: true,
      energyWave: [
        {
          id: 'ft-wave-0',
          slot: fastPeakHours.trim(),
          energy: 8,
          focus: 8,
          load: activeLoad
        }
      ],
      taskGraph,
      summary: `Express onboarding: Peak focus ${fastPeakHours}, Load: ${fastCurrentLoad}.`,
      createdAt: now,
      updatedAt: now
    };

    const validation = await validateFastTrack(profile as unknown as Record<string, unknown>, {
      requiredFields: ['energyWave.0.slot', 'summary'],
      objective: 'Confirm Atlas fast-track has enough cognitive baseline data to skip guided intake.'
    });
    setIsValidatingFastTrack(false);
    if (!validation.accepted) {
      setFastTrackError('Fast-track validation failed. Continue guided onboarding to map your cognitive baseline.');
      return;
    }

    onComplete(profile);
  };

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
        const nextProfile = { ...state.profile };
        const nextBaseContext = { ...state.baseContext };
        let nextStep = state.stepProgress;

        const profileUpdates = response.actions
          .filter(a => a.type === 'update_atlas_profile')
          .map(a => a.payload as Partial<AtlasProfile>);

        if (profileUpdates.length > 0) {
          for (const update of profileUpdates) {
            // Whitelist: only allow fields documented in the onboarding action tag
            if (typeof update.summary === 'string' && update.summary.trim()) {
              nextProfile.summary = update.summary.trim();
            }
            if (Array.isArray(update.energyWave)) {
              nextProfile.energyWave = (update.energyWave as unknown[])
                .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
                .map((point, index) => ({
                  id: typeof point.id === 'string' ? point.id : `wave_${Date.now()}_${index}`,
                  slot: typeof point.slot === 'string' ? point.slot : `Slot ${index + 1}`,
                  energy: typeof point.energy === 'number' ? Math.max(0, Math.min(10, point.energy)) : 5,
                  focus: typeof point.focus === 'number' ? Math.max(0, Math.min(10, point.focus)) : 5,
                  load: typeof point.load === 'number' ? Math.max(0, Math.min(10, point.load)) : 5
                }))
                .slice(0, 48);
            }
            if (Array.isArray(update.taskGraph)) {
              nextProfile.taskGraph = (update.taskGraph as unknown[])
                .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
                .map((task, index) => ({
                  id: typeof task.id === 'string' ? task.id : `task_${Date.now()}_${index}`,
                  title: typeof task.title === 'string' ? task.title : `Task ${index + 1}`,
                  energyCost: typeof task.energyCost === 'number' ? Math.max(0, Math.min(10, task.energyCost)) : 4,
                  status: (task.status === 'active' || task.status === 'done' ? task.status : 'queued') as 'active' | 'queued' | 'done',
                  dependencies: Array.isArray(task.dependencies) 
                    ? task.dependencies.filter((d: unknown): d is string => typeof d === 'string')
                    : undefined
                }))
                .slice(0, 100);
            }
            nextProfile.updatedAt = new Date().toISOString();
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

        const rawVitalsPayload = response.actions
          .filter((action) => action.type === 'sync_vitals')
          .map((action) => action.payload as Partial<NeuralStateVectorPatch>);

        let vitalsPatch: NeuralStateVectorPatch = {};
        if (rawVitalsPayload.length > 0) {
          const payload = rawVitalsPayload[rawVitalsPayload.length - 1];
          if (payload && payload.cognitive && typeof payload.cognitive === 'object') {
            // Only write Atlas-owned cognitive metrics
            const cog: NonNullable<NeuralStateVectorPatch['cognitive']> = {};
            if (typeof payload.cognitive.energyBudget === 'number' && Number.isFinite(payload.cognitive.energyBudget)) {
              cog.energyBudget = Math.max(0, Math.min(10, payload.cognitive.energyBudget));
            }
            if (typeof payload.cognitive.focusScore === 'number' && Number.isFinite(payload.cognitive.focusScore)) {
              cog.focusScore = Math.max(0, Math.min(10, payload.cognitive.focusScore));
            }
            if (typeof payload.cognitive.activeLoad === 'number' && Number.isFinite(payload.cognitive.activeLoad)) {
              cog.activeLoad = Math.max(0, Math.min(10, payload.cognitive.activeLoad));
            }
            vitalsPatch = { cognitive: cog };
          }
        }

        if (user?.uid && Object.keys(vitalsPatch).length > 0 && Object.keys(vitalsPatch.cognitive || {}).length > 0) {
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
      statusLabel=""
      steps={[...ATLAS_STEPS]}
      currentStep={intake.stepIndex}
      themeColor="sky"
      preludeCollapsible={false}
      prelude={
        <div className="p-4 md:p-6 flex flex-col gap-4 border-b border-[var(--module-accent-border)] bg-[var(--module-accent-faint)]">
          <div className="flex-1 w-full space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--module-color-400)] flex items-center gap-2">
              <Zap className="w-3 h-3" /> Fast Track Initialization
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <NeuralInput
                  placeholder="Peak focus hours (e.g., 09:00-12:00)"
                  value={fastPeakHours}
                  onChange={e => setFastPeakHours(e.target.value)}
                  className="bg-black/20 border-white/10"
                />
                <NeuralInput
                  placeholder="Primary task / current focus"
                  value={fastPrimaryTask}
                  onChange={e => setFastPrimaryTask(e.target.value)}
                  className="bg-black/20 border-white/10"
                />
              </div>
              <div>
                <p className="text-[9px] text-white/40 uppercase tracking-wider mb-2">Current Load Pressure</p>
                <div className="flex gap-2 flex-wrap">
                  {(['low', 'medium', 'high'] as const).map(l => (
                    <NeuralButton
                      key={l}
                      onClick={() => setFastCurrentLoad(l)}
                      variant={fastCurrentLoad === l ? 'primary' : 'secondary'}
                      themeColor="module"
                      size="sm"
                      className="text-[10px] font-bold uppercase tracking-wider h-9"
                    >
                      {l}
                    </NeuralButton>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <NeuralButton
                  onClick={handleFastTrack}
                  disabled={!fastPeakHours.trim() || isValidatingFastTrack}
                  loading={isValidatingFastTrack}
                  themeColor="module"
                  className="px-8"
                >
                  Execute
                </NeuralButton>
              </div>
            </div>
            <p className="text-[9px] text-white/40 uppercase tracking-tight">
              Bypass conversational intake. Requires peak focus hours.
            </p>
            {fastTrackError && (
              <p className="text-[10px] text-rose-300">{fastTrackError}</p>
            )}
          </div>
        </div>
      }
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
        themeColor="sky"
        placeholder={spec.placeholder}
        showInternalSignals={false}
      />
    </GuidedIntakeFrame>
  );
}
