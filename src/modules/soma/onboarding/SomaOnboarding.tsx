import React, { useMemo, useState } from 'react';
import { GuidedIntakeFrame } from '@/core/intake/GuidedIntakeFrame';
import { GuidedChatSpec } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { NexusChat } from '@/core/components/NexusChat';
import { Zap } from 'lucide-react';
import { StructuredResponse } from '@/llm-engine/engine/types';
import { useAuth } from '@/lib/auth-context';
import {
  SomaProfile,
  createEmptySomaProfile
} from '../services/soma-profile-service';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { mergeNSVPatch } from '@/lib/services/nsv-service';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { buildCalibrationPrompt } from '@/lib/services/nsv-ownership';
import type { NeuralStateVectorPatch } from '@/lib/types';

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
1. Confirm Nexus handoff context.
2. Capture known conditions and current medications.
3. Capture allergies/contraindications.
4. Capture most relevant recent biomarkers or lab findings.
5. Finalize summary.

ACTION TAGS:
- <action type="update_soma_profile">{"knownConditions":["..."],"medications":["..."],"allergies":["..."],"summary":"..."}</action>
- <action type="update_global_base_context">{"name":"...","pronouns":"...","age":28,"assignedSexAtBirth":"female"}</action>
- After collecting baseline vitals, emit a bulk update with Soma-owned metrics only:
  <action type="sync_vitals">{"biological":{"recoveryScore":7.5,"hormonalContext":"within normal range"}}</action>
  Valid fields: recoveryScore (0-10 number), hormonalContext (string). Do NOT include cnsFatigue or sleepQuality (Trainer-owned).
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

  return `Nexus handoff received. I have your ${chunks.join(', ')}. Is that correct before we start biological intake?`;
}

export function SomaOnboarding({
  initialProfile,
  initialBaseContext,
  onGlobalBaseContextFinalize,
  onComplete
}: SomaOnboardingProps) {
  const { user } = useAuth();
  const initialContext = useMemo(() => initialBaseContext ?? {}, [initialBaseContext]);

  const [fastConditions, setFastConditions] = useState('');
  const [fastMedications, setFastMedications] = useState('');
  const [fastAllergies, setFastAllergies] = useState('');
  const [fastBiomarkers, setFastBiomarkers] = useState('');

  const handleFastTrack = () => {
    const now = new Date().toISOString();
    const conditions = fastConditions.trim()
      ? fastConditions.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const medications = fastMedications.trim()
      ? fastMedications.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const allergies = fastAllergies.trim()
      ? fastAllergies.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const summaryParts = [
      conditions.length > 0 ? `${conditions.length} condition(s)` : null,
      medications.length > 0 ? `${medications.length} medication(s)` : null,
      allergies.length > 0 ? `${allergies.length} allergy(ies)` : null,
      fastBiomarkers.trim() ? 'biomarker notes provided' : null
    ].filter(Boolean);
    const profile: SomaProfile = {
      onboardingComplete: true,
      knownConditions: conditions,
      medications,
      allergies,
      biomarkers: [],
      labSummaries: [],
      clearances: [],
      summary: summaryParts.length > 0
        ? `Express onboarding: ${summaryParts.join(', ')}.${fastBiomarkers.trim() ? ` Notes: ${fastBiomarkers.trim()}` : ''}`
        : 'Express onboarding: No known conditions, medications, or allergies reported.',
      createdAt: now,
      updatedAt: now
    };
    onComplete(profile);
  };

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
${hasBaseContext(state.baseContext) ? '- IMPORTANT: Do NOT ask for name or pronouns again if they are already known in this context. Move directly to the next missing piece of information.' : ''}
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
            // Whitelist: only allow fields documented in the onboarding action tag
            if (Array.isArray(update.knownConditions)) {
              nextProfile.knownConditions = update.knownConditions.filter((c): c is string => typeof c === 'string' && c.trim().length > 0);
            }
            if (Array.isArray(update.medications)) {
              nextProfile.medications = update.medications.filter((m): m is string => typeof m === 'string' && m.trim().length > 0);
            }
            if (Array.isArray(update.allergies)) {
              nextProfile.allergies = update.allergies.filter((a): a is string => typeof a === 'string' && a.trim().length > 0);
            }
            if (typeof update.summary === 'string' && update.summary.trim()) {
              nextProfile.summary = update.summary.trim();
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

        const rawVitalsPayload = response.actions
          .filter((action) => action.type === 'sync_vitals')
          .map((action) => action.payload as Partial<NeuralStateVectorPatch>);

        let vitalsPatch: NeuralStateVectorPatch = {};
        if (rawVitalsPayload.length > 0) {
           const payload = rawVitalsPayload[rawVitalsPayload.length - 1]; // Take the latest sync
           if (payload && payload.biological) {
              const bio: NonNullable<NeuralStateVectorPatch['biological']> = {};
              if (typeof payload.biological.recoveryScore === 'number' &&
                  Number.isFinite(payload.biological.recoveryScore) &&
                  payload.biological.recoveryScore >= 0 && payload.biological.recoveryScore <= 10) {
                bio.recoveryScore = payload.biological.recoveryScore;
              }
              if (typeof payload.biological.hormonalContext === 'string' && payload.biological.hormonalContext.trim()) {
                bio.hormonalContext = payload.biological.hormonalContext.trim();
              }
              vitalsPatch = { biological: bio };
           }
        }

        if (user?.uid && Object.keys(vitalsPatch).length > 0 && Object.keys(vitalsPatch.biological || {}).length > 0) {
          await GlobalProjectionService.updateCrossFunctionalState(user.uid, vitalsPatch).catch((e) => {
            console.error('Soma onboarding sync_vitals failed:', e);
          });
        }
        if (completed && Object.keys(vitalsPatch).length === 0) {
          NexusHandoffService.store({
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
      prelude={
        <div className="p-4 md:p-6 flex flex-col gap-4 border-b border-emerald-500/20 bg-emerald-500/5">
          <div className="flex-1 w-full space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
              <Zap className="w-3 h-3" aria-hidden="true" /> Fast Track Initialization
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="soma-fast-conditions" className="text-xs font-medium text-white/70">Conditions</label>
                <input
                  id="soma-fast-conditions"
                  placeholder="e.g., asthma, diabetes"
                  value={fastConditions}
                  onChange={e => setFastConditions(e.target.value)}
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/60 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="soma-fast-medications" className="text-xs font-medium text-white/70">Medications</label>
                <input
                  id="soma-fast-medications"
                  placeholder="e.g., metformin"
                  value={fastMedications}
                  onChange={e => setFastMedications(e.target.value)}
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/60 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="soma-fast-allergies" className="text-xs font-medium text-white/70">Allergies</label>
                <input
                  id="soma-fast-allergies"
                  placeholder="e.g., penicillin, latex"
                  value={fastAllergies}
                  onChange={e => setFastAllergies(e.target.value)}
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/60 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="soma-fast-biomarkers" className="text-xs font-medium text-white/70">Lab Notes</label>
                <input
                  id="soma-fast-biomarkers"
                  placeholder="Recent lab notes (optional)"
                  value={fastBiomarkers}
                  onChange={e => setFastBiomarkers(e.target.value)}
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/60 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleFastTrack}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center whitespace-nowrap"
              >
                Execute
              </button>
            </div>
            <p className="text-xs text-white/70 uppercase tracking-tight">
              Bypass conversational intake. All fields optional — execute blank for clean baseline.
            </p>
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
        agentName="Soma Intake"
        themeColor="emerald"
        placeholder={spec.placeholder}
        showInternalSignals={false}
      />
    </GuidedIntakeFrame>
  );
}
