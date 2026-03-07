import React, { useMemo, useState } from 'react';
import { GuidedIntakeFrame } from '@/core/intake/GuidedIntakeFrame';
import { GuidedIntakeStep, IntakeModuleConfig } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { useIntakeOrchestrator } from '@/core/intake/use-intake-orchestrator';
import { NexusChat } from '@/core/components/NexusChat';
import { Zap } from 'lucide-react';
import { AgentPersonalityProvision, CoreUserProfile } from '@/lib/types';
import { ORCHESTRATOR_ONBOARDING_PERSONA } from '../personas';

type OrchestratorIntakeState = {
  profileUpdates: Partial<CoreUserProfile>;
  stepProgress: number;
};

interface OrchestratorOnboardingProps {
  profile: CoreUserProfile | null;
  isSubmitting: boolean;
  onComplete: (updates: Partial<CoreUserProfile>) => Promise<void>;
}

const ORCHESTRATOR_STEPS: GuidedIntakeStep[] = [
  {
    key: 'identity',
    label: 'Identity Baseline',
    helperText: 'Capture preferred name and pronouns for Nexus session continuity.',
    inferredKeywords: ['preferred name', 'pronouns', 'what should i call you'],
    focusActions: ['focus_identity']
  },
  {
    key: 'bio',
    label: 'Bio Context (Optional)',
    helperText: 'Capture optional biological and lifestyle context for smarter cross-module recommendations.',
    inferredKeywords: ['age', 'assigned sex', 'sex at birth', 'gender identity', 'bio context', 'biological', 'occupation', 'sleep'],
    focusActions: ['focus_bio']
  },
  {
    key: 'review',
    label: 'Protocol Commit',
    helperText: 'Review and commit Nexus onboarding to unlock orchestrator chat.',
    inferredKeywords: ['review', 'confirm', 'finaliz', 'commit', 'complete'],
    focusActions: ['focus_review']
  }
];

const DEFAULT_PERSONALITY: AgentPersonalityProvision = {
  orchestratorAlias: 'Nexus',
  moduleAliases: {
    agnes: 'Agnes',
    titan: 'Titan',
    soma: 'Soma',
    ledger: 'Ledger',
    atlas: 'Atlas',
    scout: 'Scout',
    forge: 'Forge',
    pulse: 'Pulse'
  },
  agentGenders: {
    orchestrator: 'female',
    agnes: 'female',
    titan: 'female',
    soma: 'female',
    ledger: 'female',
    atlas: 'female',
    scout: 'female',
    forge: 'female',
    pulse: 'female'
  },
  personaOverlays: {}
};

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function compactProfileUpdates(updates: Partial<CoreUserProfile>): Partial<CoreUserProfile> {
  return Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined && value !== null)
  ) as Partial<CoreUserProfile>;
}

export function OrchestratorOnboarding({ profile, isSubmitting, onComplete }: OrchestratorOnboardingProps) {
  const existingProvision = profile?.agentPersonalityProvision ?? DEFAULT_PERSONALITY;

  const initialProfileUpdates = useMemo(() => compactProfileUpdates({
    preferredName: profile?.preferredName,
    pronouns: profile?.pronouns,
    age: profile?.age,
    assignedSexAtBirth: profile?.assignedSexAtBirth,
    genderIdentity: profile?.genderIdentity,
    occupation: profile?.occupation,
    typicalSleepHours: profile?.typicalSleepHours
  }), [profile]);

  const [fastName, setFastName] = useState('');
  const [fastPronouns, setFastPronouns] = useState('');

  const handleFastTrack = async () => {
    if (!fastName.trim() || !fastPronouns.trim()) return;
    const provision: AgentPersonalityProvision = {
        ...DEFAULT_PERSONALITY,
        ...existingProvision,
        moduleAliases: {
          ...DEFAULT_PERSONALITY.moduleAliases,
          ...(existingProvision.moduleAliases || {})
        },
        agentGenders: {
          ...DEFAULT_PERSONALITY.agentGenders,
          ...(existingProvision.agentGenders || {})
        },
        personaOverlays: existingProvision.personaOverlays || {}
    };

    provision.orchestratorAlias = existingProvision.orchestratorAlias || 'Nexus';

    await onComplete({
      preferredName: fastName.trim(),
      pronouns: fastPronouns.trim(),
      onboardingComplete: true,
      schemaVersion: 2,
      agentPersonalityProvision: provision
    });
  };

  const config: IntakeModuleConfig<OrchestratorIntakeState, Partial<CoreUserProfile>> = {
    moduleId: 'orchestrator',
    steps: ORCHESTRATOR_STEPS,
    updateActionType: 'update_orchestrator_intake',
    completeActionType: 'complete_orchestrator_onboarding',
    applyPatch: (state, patch) => ({
      ...state,
      profileUpdates: { ...state.profileUpdates, ...patch }
    }),
    extractFromUser: (message) => {
        const updates: Partial<CoreUserProfile> = {};

        const pronounsMatch = message.match(/\b(she\/her|he\/him|they\/them|she her|he him|they them)\b/i);
        if (pronounsMatch) {
            updates.pronouns = pronounsMatch[1].replace(/\s+/g, '/').toLowerCase();
        }

        const occupationMatch = message.match(/\b(?:i(?:'m| am)|i work as|occupation is|my job is)\s+([a-z][a-z0-9'\/&,\- ]{1,50})/i);
        if (occupationMatch) {
            updates.occupation = occupationMatch[1].trim();
        }

        const sleepMatch = message.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:hours?|hrs?)\b/i);
        if (sleepMatch) {
            const parsed = Number.parseFloat(sleepMatch[1]);
            if (Number.isFinite(parsed) && parsed > 0 && parsed <= 24) {
                updates.typicalSleepHours = parsed;
            }
        }

        const nameMatch = message.match(/\b(?:my name is|call me|i'm)\s+([a-z][a-z' -]{0,30})/i);
        if (nameMatch) {
            const raw = nameMatch[1].trim().split(/\s+/)[0];
            updates.preferredName = raw.charAt(0).toUpperCase() + raw.slice(1);
        }

        return updates;
    },
    validateCompletion: (state) => {
        if (!state.profileUpdates.preferredName || !state.profileUpdates.pronouns) {
            return { valid: false, error: 'Before we finalize, share your preferred name and pronouns so Nexus can address you correctly.' };
        }
        return { valid: true };
    }
  };

  const spec = useIntakeOrchestrator({
    ...config,
    initialState: {
      profileUpdates: initialProfileUpdates,
      stepProgress: 0
    },
    initialMessages: [
      {
        role: 'assistant',
        content: `Welcome to Nexus guided onboarding. I only need your core identity and Nexus preferences. What should I call you, and what pronouns should I use?`
      }
    ],
    summary: 'Nexus onboarding intake.',
    placeholder: 'Respond to Nexus...',
    systemPrompt: ORCHESTRATOR_ONBOARDING_PERSONA,
    canSend: () => !isSubmitting
  });

  const intake = useGuidedChatIntake({
    spec,
    onComplete: async (state) => {
      const provision: AgentPersonalityProvision = {
        ...DEFAULT_PERSONALITY,
        ...existingProvision,
        moduleAliases: {
          ...DEFAULT_PERSONALITY.moduleAliases,
          ...(existingProvision.moduleAliases || {})
        },
        agentGenders: {
          ...DEFAULT_PERSONALITY.agentGenders,
          ...(existingProvision.agentGenders || {})
        },
        personaOverlays: existingProvision.personaOverlays || {}
      };

      provision.orchestratorAlias = existingProvision.orchestratorAlias || 'Nexus';

      const safeUpdates = compactProfileUpdates(state.profileUpdates);
      await onComplete({
        ...safeUpdates,
        onboardingComplete: true,
        schemaVersion: 2,
        agentPersonalityProvision: provision
      });
    }
  });

  return (
    <GuidedIntakeFrame
      title="Nexus Interactive Intake"
      subtitle="Configure your core identity and Nexus only. Other bots onboard independently."
      statusLabel="NYX_ONBOARDING"
      steps={ORCHESTRATOR_STEPS}
      currentStep={intake.stepIndex}
      themeColor="indigo"
      prelude={
        <div className="p-4 md:p-6 flex flex-col sm:flex-row items-center gap-4 border-b border-indigo-500/20 bg-indigo-500/5">
          <div className="flex-1 w-full space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-2">
              <Zap className="w-3 h-3" /> Fast Track Initialization
            </p>
            <div className="flex gap-2">
              <input
                placeholder="Preferred Name"
                value={fastName}
                onChange={e => setFastName(e.target.value)}
                className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-indigo-500/50"
              />
              <input
                placeholder="Pronouns (e.g., they/them)"
                value={fastPronouns}
                onChange={e => setFastPronouns(e.target.value)}
                className="flex-[1.5] bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-indigo-500/50"
              />
              <button
                onClick={handleFastTrack}
                disabled={!fastName.trim() || !fastPronouns.trim() || isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center whitespace-nowrap"
              >
                Execute
              </button>
            </div>
            <p className="text-[9px] text-white/40 uppercase tracking-tight">
              Bypass conversational proxy. Requires name and pronouns.
            </p>
          </div>
        </div>
      }
    >
      <NexusChat
        ai={{
          messages: intake.messages,
          isProcessing: intake.isProcessing || isSubmitting,
          streamingText: intake.streamingText,
          error: intake.error,
          quota: null,
          handleSendMessage: intake.handleSendMessage
        }}
        agentName="Nexus Intake"
        themeColor="indigo"
        placeholder={spec.placeholder}
        showInternalSignals={false}
      />
    </GuidedIntakeFrame>
  );
}
