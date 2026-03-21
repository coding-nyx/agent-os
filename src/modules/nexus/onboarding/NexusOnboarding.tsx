import React, { useCallback, useMemo } from 'react';
import { GuidedIntakeStep, IntakeModuleConfig } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { useIntakeOrchestrator } from '@/core/intake/use-intake-orchestrator';
import { NexusChat } from '@/core/components/NexusChat';
import { AgentPersonalityProvision, CoreUserProfile } from '@/lib/types';
import { ORCHESTRATOR_ONBOARDING_PERSONA } from '../personas';
import { UnifiedOnboardingShell } from '@/core/intake/UnifiedOnboardingShell';
import { NEXUS_BASE_SPEC } from '@/core/intake/onboarding-configs';
import { applyAgentGender } from '@/core/intake/agent-gender';

type OrchestratorIntakeState = {
  profileUpdates: Partial<CoreUserProfile>;
  stepProgress: number;
};

interface NexusOnboardingProps {
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
    agnes: 'Agnes', titan: 'Titan', soma: 'Soma', ledger: 'Ledger',
    atlas: 'Atlas', scout: 'Scout', forge: 'Forge'
  },
  agentGenders: {
    orchestrator: 'female', agnes: 'female', titan: 'non-binary',
    soma: 'female', ledger: 'female', atlas: 'female', scout: 'female', forge: 'female'
  },
  personaOverlays: {}
};

function compactProfileUpdates(updates: Partial<CoreUserProfile>): Partial<CoreUserProfile> {
  return Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined && value !== null)
  ) as Partial<CoreUserProfile>;
}

function buildProvision(existingProvision: AgentPersonalityProvision): AgentPersonalityProvision {
  const provision: AgentPersonalityProvision = {
    ...DEFAULT_PERSONALITY,
    ...existingProvision,
    moduleAliases: { ...DEFAULT_PERSONALITY.moduleAliases, ...(existingProvision.moduleAliases || {}) },
    agentGenders: { ...DEFAULT_PERSONALITY.agentGenders, ...(existingProvision.agentGenders || {}) },
    personaOverlays: existingProvision.personaOverlays || {}
  };
  provision.orchestratorAlias = existingProvision.orchestratorAlias || 'Nexus';
  return provision;
}

export function NexusOnboarding({ profile, isSubmitting, onComplete }: NexusOnboardingProps) {
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

  const initialValues = useMemo(() => ({
    preferred_name: profile?.preferredName || '',
    pronouns: profile?.pronouns || '',
    occupation: profile?.occupation || '',
    typical_sleep_hours: profile?.typicalSleepHours,
    age: profile?.age,
  }), [profile]);

  // Express complete — maps canonical field IDs to CoreUserProfile
  const handleExpressComplete = useCallback(async (values: Record<string, unknown>) => {
    const provision = buildProvision(existingProvision);
    if (values.agent_gender) {
      provision.agentGenders = applyAgentGender(provision.agentGenders, String(values.agent_gender));
    }
    await onComplete(compactProfileUpdates({
      preferredName: String(values.preferred_name ?? '').trim() || undefined,
      pronouns: String(values.pronouns ?? '').trim() || undefined,
      occupation: String(values.occupation ?? '').trim() || undefined,
      typicalSleepHours: values.typical_sleep_hours != null ? Number(values.typical_sleep_hours) : undefined,
      age: values.age != null ? Number(values.age) : undefined,
      onboardingComplete: true,
      schemaVersion: 2,
      agentPersonalityProvision: provision,
    }));
  }, [existingProvision, onComplete]);

  // Guided chat spec (unchanged logic)
  const config: IntakeModuleConfig<OrchestratorIntakeState, Partial<CoreUserProfile>> = {
    moduleId: 'nexus',
    steps: ORCHESTRATOR_STEPS,
    updateActionType: 'update_orchestrator_intake',
    completeActionType: 'complete_orchestrator_onboarding',
    applyPatch: (state, patch) => ({ ...state, profileUpdates: { ...state.profileUpdates, ...patch } }),
    extractFromUser: (message) => {
      const updates: Partial<CoreUserProfile> = {};
      const pronounsMatch = message.match(/\b(she\/her|he\/him|they\/them|she her|he him|they them)\b/i);
      if (pronounsMatch) updates.pronouns = pronounsMatch[1].replace(/\s+/g, '/').toLowerCase();
      const occupationMatch = message.match(/\b(?:i(?:'m| am)|i work as|occupation is|my job is)\s+([a-z][a-z0-9'/&,\- ]{1,50})/i);
      if (occupationMatch) updates.occupation = occupationMatch[1].trim();
      const sleepMatch = message.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:hours?|hrs?)\b/i);
      if (sleepMatch) {
        const parsed = Number.parseFloat(sleepMatch[1]);
        if (Number.isFinite(parsed) && parsed > 0 && parsed <= 24) updates.typicalSleepHours = parsed;
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

  const chatSpec = useIntakeOrchestrator({
    ...config,
    initialState: { profileUpdates: initialProfileUpdates, stepProgress: 0 },
    initialMessages: [{ role: 'assistant', content: 'Welcome to Nexus guided onboarding. I only need your core identity and Nexus preferences. What should I call you, and what pronouns should I use?' }],
    summary: 'Nexus onboarding intake.',
    placeholder: 'Respond to Nexus...',
    systemPrompt: ORCHESTRATOR_ONBOARDING_PERSONA,
    canSend: () => !isSubmitting
  });

  const intake = useGuidedChatIntake({
    spec: chatSpec,
    onComplete: async (state) => {
      const safeUpdates = compactProfileUpdates(state.profileUpdates);
      await onComplete({
        ...safeUpdates,
        onboardingComplete: true,
        schemaVersion: 2,
        agentPersonalityProvision: buildProvision(existingProvision)
      });
    }
  });

  return (
    <UnifiedOnboardingShell
      spec={NEXUS_BASE_SPEC}
      initialValues={initialValues}
      onExpressComplete={handleExpressComplete}
      guidedContent={
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
          placeholder={chatSpec.placeholder}
          showInternalSignals={false}
        />
      }
    />
  );
}
