import React, { useMemo, useState } from 'react';
import { GuidedIntakeFrame } from '@/core/intake/GuidedIntakeFrame';
import { GuidedChatSpec, GuidedIntakeStep, IntakeModuleConfig } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { useIntakeOrchestrator } from '@/core/intake/use-intake-orchestrator';
import { NexusChat } from '@/core/components/NexusChat';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { BaseContext } from '../types';
import { THERAPY_ONBOARDING_PERSONA } from '../personas';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { mergeNSVPatch } from '@/lib/services/nsv-service';
import type { NeuralStateVectorPatch } from '@/lib/types';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { buildCalibrationPrompt } from '@/lib/services/nsv-ownership';
import { useFastTrackValidation } from '@/lib/onboarding/fast-track-validation';

interface AgnesOnboardingProps {
  initialBaseContext?: GlobalBaseIntakeContext;
  onComplete: (context: Partial<BaseContext>) => void;
}

type AgnesIntakeState = {
  context: Partial<BaseContext>;
  stepProgress: number;
};

const THERAPY_STEPS: GuidedIntakeStep[] = [
  {
    key: 'identity',
    label: 'Identity Anchor',
    helperText: 'Start with name and pronouns to establish safe addressing in every session.',
    inferredKeywords: ['name', 'pronouns', 'call you', 'identity'],
    focusActions: ['focus_identity']
  },
  {
    key: 'background',
    label: 'Background',
    helperText: 'Capture key life context so advice aligns with lived experience.',
    inferredKeywords: ['background', 'childhood', 'growing up', 'past', 'history', 'life context'],
    focusActions: ['focus_background']
  },
  {
    key: 'struggles',
    label: 'Current Struggles',
    helperText: 'Document active emotional load and recurring stress patterns.',
    inferredKeywords: ['struggle', 'heavy', 'hard', 'difficult', 'challenge', 'stress', 'trauma', 'lately', 'distress'],
    focusActions: ['focus_struggles']
  },
  {
    key: 'goals',
    label: 'Goals',
    helperText: 'Define what progress should look like over upcoming sessions.',
    inferredKeywords: ['goal', 'hope to achieve', 'work on', 'explore together', 'outcome', 'breakthrough'],
    focusActions: ['focus_goals']
  },
  {
    key: 'preferences',
    label: 'Agnes Preferences',
    helperText: 'Lock tone, communication style, and agnes-fit preferences.',
    inferredKeywords: ['preference', 'tone', 'gender', 'style', 'communication', 'approach'],
    focusActions: ['focus_preferences']
  }
];

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveIdentity(identity: BaseContext['identity']): { name?: string; pronouns?: string } {
  if (!identity) return {};
  if (typeof identity === 'string') {
    const name = normalizeOptionalString(identity);
    return name ? { name } : {};
  }
  return {
    name: normalizeOptionalString(identity.name),
    pronouns: normalizeOptionalString(identity.pronouns)
  };
}

function mergeAgnesContext(current: Partial<BaseContext>, patch: Partial<BaseContext>): Partial<BaseContext> {
  const merged: Partial<BaseContext> = { ...current, ...patch };

  if (patch.identity !== undefined) {
    const currentIdentity = resolveIdentity(current.identity);
    const patchIdentity = resolveIdentity(patch.identity);
    const nextIdentity = {
      ...currentIdentity,
      ...patchIdentity
    };

    merged.identity = nextIdentity.name || nextIdentity.pronouns ? nextIdentity : current.identity;
  }

  return merged;
}

function buildInitialPrompt(initialBaseContext?: GlobalBaseIntakeContext): string {
  const name = normalizeOptionalString(initialBaseContext?.name);
  const pronouns = normalizeOptionalString(initialBaseContext?.pronouns);
  const occupation = normalizeOptionalString(initialBaseContext?.occupation);
  const sleep = typeof initialBaseContext?.typicalSleepHours === 'number' ? initialBaseContext.typicalSleepHours : undefined;

  if (name && pronouns) {
    const lifestyleChunk = [
      occupation ? `occupation as ${occupation}` : null,
      typeof sleep === 'number' ? `typical sleep around ${sleep} hours/night` : null
    ]
      .filter(Boolean)
      .join(', ');
    if (lifestyleChunk) {
      return `Welcome to Agnes Intake. I have your name as ${name}, pronouns as ${pronouns}, and ${lifestyleChunk}. Is that correct before we continue?`;
    }
    return `Welcome to Agnes Intake. I have your name as ${name} and pronouns as ${pronouns}. Is that correct before we continue?`;
  }
  if (name && !pronouns) {
    return `Welcome to Agnes Intake. I have your name as ${name}. What pronouns should I use for you?`;
  }
  if (!name && pronouns) {
    return `Welcome to Agnes Intake. I have your pronouns as ${pronouns}. What should I call you?`;
  }
  return "Welcome to Agnes Intake. Before we begin deeper work, what should I call you and what pronouns should I use?";
}

export function AgnesOnboarding({ initialBaseContext, onComplete }: AgnesOnboardingProps) {
  const { user } = useAuth();

  const [fastStyle, setFastStyle] = useState<'direct' | 'gentle' | 'analytical' | ''>('');
  const [fastStruggles, setFastStruggles] = useState('');
  const [fastBackground, setFastBackground] = useState('');
  const [fastGoals, setFastGoals] = useState('');
  const [fastGender, setFastGender] = useState<'female' | 'male' | 'non-binary' | 'no-preference' | ''>('');
  const [fastTrauma, setFastTrauma] = useState('');
  const [fastTrackError, setFastTrackError] = useState<string | null>(null);
  const [isValidatingFastTrack, setIsValidatingFastTrack] = useState(false);
  const { validateFastTrack } = useFastTrackValidation('agnes');

  const fastTrackReady = fastStyle && fastBackground.trim() && fastStruggles.trim() && fastGoals.trim();

  const handleFastTrack = async () => {
    if (!fastTrackReady) return;
    setFastTrackError(null);
    setIsValidatingFastTrack(true);

    const name = initialBaseContext?.name;
    const pronouns = initialBaseContext?.pronouns;
    const context: Partial<BaseContext> = {
      communicationStyle: fastStyle || undefined,
      ...(name || pronouns ? { identity: { name, pronouns } } : {}),
      struggles: fastStruggles.trim(),
      backgroundSummary: fastBackground.trim(),
      goals: fastGoals.trim(),
      ...(fastTrauma.trim() ? { trauma: fastTrauma.trim() } : {}),
      ...(fastGender ? { preferredAgnes: { gender: fastGender, tone: fastStyle } } : {}),
      ...(initialBaseContext?.occupation ? { occupation: initialBaseContext.occupation } : {}),
      ...(typeof initialBaseContext?.typicalSleepHours === 'number' ? { typicalSleepHours: initialBaseContext.typicalSleepHours } : {}),
      integratedInsights: []
    };

    const validation = await validateFastTrack(context as Record<string, unknown>, {
      requiredFields: ['communicationStyle', 'backgroundSummary', 'struggles', 'goals'],
      objective: 'Confirm Agnes fast-track has enough emotional baseline to skip guided onboarding.'
    });

    setIsValidatingFastTrack(false);
    if (!validation.accepted) {
      setFastTrackError('Fast-track validation failed. Continue with guided onboarding to complete intake safely.');
      return;
    }

    onComplete(context);
  };
  
  const initialContextState = useMemo<Partial<BaseContext>>(() => {
    const name = normalizeOptionalString(initialBaseContext?.name);
    const pronouns = normalizeOptionalString(initialBaseContext?.pronouns);
    const occupation = normalizeOptionalString(initialBaseContext?.occupation);
    const sleep =
      typeof initialBaseContext?.typicalSleepHours === 'number' && Number.isFinite(initialBaseContext.typicalSleepHours)
        ? initialBaseContext.typicalSleepHours
        : undefined;

    const next: Partial<BaseContext> = {};
    if (name || pronouns) {
      next.identity = {
        ...(name ? { name } : {}),
        ...(pronouns ? { pronouns } : {})
      };
    }
    if (occupation) next.occupation = occupation;
    if (typeof sleep === 'number') next.typicalSleepHours = sleep;
    return next;
  }, [initialBaseContext]);

  const config: IntakeModuleConfig<AgnesIntakeState, Partial<BaseContext>> = {
    moduleId: 'agnes',
    steps: THERAPY_STEPS,
    updateActionType: 'update_agnes_profile',
    completeActionType: 'complete_agnes_onboarding',
    applyPatch: (state, patch) => ({
      ...state,
      context: mergeAgnesContext(state.context, patch)
    }),
    extractFromUser: (message) => {
        const patch: Partial<BaseContext> = {};
        
        const nameMatch = message.match(/\b(?:my name is|call me|i'm)\s+([a-z][a-z' -]{0,30})/i);
        const pronounsMatch = message.match(/\b(?:pronouns(?: are)?\s*)?(she\/her|he\/him|they\/them|she her|he him|they them)\b/i);
        
        if (nameMatch || pronounsMatch) {
            patch.identity = {};
            if (nameMatch) {
                const raw = nameMatch[1].trim().split(/\s+/)[0];
                patch.identity.name = raw.charAt(0).toUpperCase() + raw.slice(1);
            }
            if (pronounsMatch) {
                patch.identity.pronouns = pronounsMatch[1].replace(/\s+/g, '/').toLowerCase();
            }
        }

        const occupationMatch = message.match(/\b(?:i(?:'m| am)|i work as|my job is|occupation is)\s+([a-z][a-z0-9'/&,\- ]{1,50})/i);
        if (occupationMatch) patch.occupation = occupationMatch[1].trim();

        const sleepMatch = message.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:hours?|hrs?)\b/i);
        if (sleepMatch) {
            const parsed = Number.parseFloat(sleepMatch[1]);
            if (Number.isFinite(parsed) && parsed > 0 && parsed <= 24) patch.typicalSleepHours = parsed;
        }

        return patch;
    },
    validateCompletion: (state) => {
        const identity = resolveIdentity(state.context.identity);
        if (!identity.name || !identity.pronouns) {
            return { valid: false, error: "Before we finalize, please confirm your preferred name and pronouns." };
        }
        return { valid: true };
    }
  };

  const spec = useIntakeOrchestrator({
    ...config,
    initialState: {
      context: initialContextState,
      stepProgress: 0
    },
    initialMessages: [
      {
        role: 'assistant',
        content: buildInitialPrompt(initialBaseContext)
      }
    ],
    summary: 'Agnes onboarding intake.',
    placeholder: 'Share your response...',
    systemPrompt: `${THERAPY_ONBOARDING_PERSONA}

[PREFILLED_IDENTITY]
- Name: ${resolveIdentity(initialContextState.identity).name || 'Unknown'}
- Pronouns: ${resolveIdentity(initialContextState.identity).pronouns || 'Unknown'}
[PREFILLED_LIFESTYLE]
- Occupation: ${initialContextState.occupation || 'Unknown'}
- Typical Sleep Hours: ${initialContextState.typicalSleepHours || 'Unknown'}

${(resolveIdentity(initialContextState.identity).name || resolveIdentity(initialContextState.identity).pronouns) ? '- IMPORTANT: Do NOT ask for name or pronouns again if they are already known in this context. Move directly to the next missing piece of information.' : ''}
`
  });

  const intake = useGuidedChatIntake({
    spec: {
        ...spec,
        // Override onResponse to handle specialized actions like sync_vitals
        onResponse: async (response, state, meta) => {
            const result = await spec.onResponse(response, state, meta);
            
            // Handle sync_vitals
            const vitalsPatch = response.actions
                .filter((action) => action.type === 'sync_vitals')
                .map((action) => action.payload as Partial<NeuralStateVectorPatch>)
                .reduce((acc, payload) => mergeNSVPatch(acc, payload), {} as NeuralStateVectorPatch);

            if (user?.uid && Object.keys(vitalsPatch).length > 0) {
                await GlobalProjectionService.updateCrossFunctionalState(user.uid, vitalsPatch).catch((e) => {
                    console.error('Agnes onboarding sync_vitals failed:', e);
                });
            }

            // Handle calibration request on completion
            if (result.completed && Object.keys(vitalsPatch).length === 0) {
                NexusHandoffService.store({
                    moduleId: 'agnes',
                    type: 'delegate',
                    content: buildCalibrationPrompt('agnes'),
                    reason: 'calibration_request',
                    sourceModuleId: 'agnes',
                    createdAt: new Date().toISOString()
                });
            }

            return result;
        }
    },
    onComplete: async (state) => {
      onComplete(state.context);
    }
  });

  return (
    <GuidedIntakeFrame
      title="Agnes Guided Intake"
      subtitle="Building a therapeutic baseline for long-term session continuity."
      statusLabel="ENCRYPTED_ONBOARDING"
      steps={THERAPY_STEPS}
      currentStep={intake.stepIndex}
      themeColor="indigo"
      prelude={
        <div className="p-4 md:p-6 flex flex-col gap-4 border-b border-indigo-500/20 bg-indigo-500/5">
          <div className="flex-1 w-full space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-2">
              <Zap className="w-3 h-3" /> Fast Track Initialization
            </p>
            <div className="space-y-3">
              <div>
                <p className="text-[9px] text-white/40 uppercase tracking-wider mb-2">Communication Style</p>
                <div className="flex gap-2 flex-wrap">
                  {(['direct', 'gentle', 'analytical'] as const).map(style => (
                    <button
                      key={style}
                      onClick={() => setFastStyle(style)}
                      className={cn(
                        'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all',
                        fastStyle === style
                          ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                          : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
                      )}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[9px] text-white/40 uppercase tracking-wider mb-2">Agnes Gender Preference</p>
                <div className="flex gap-2 flex-wrap">
                  {([['female', 'Female'], ['male', 'Male'], ['non-binary', 'Non-binary'], ['no-preference', 'No Preference']] as const).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setFastGender(value)}
                      className={cn(
                        'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all',
                        fastGender === value
                          ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                          : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  placeholder="Background context *"
                  value={fastBackground}
                  onChange={e => setFastBackground(e.target.value)}
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-indigo-500/50"
                />
                <input
                  placeholder="Current struggles *"
                  value={fastStruggles}
                  onChange={e => setFastStruggles(e.target.value)}
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-indigo-500/50"
                />
                <input
                  placeholder="Goals *"
                  value={fastGoals}
                  onChange={e => setFastGoals(e.target.value)}
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              <input
                placeholder="Past trauma or heavy experiences (optional)"
                value={fastTrauma}
                onChange={e => setFastTrauma(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-indigo-500/50"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleFastTrack}
                  disabled={!fastTrackReady || isValidatingFastTrack}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center whitespace-nowrap"
                >
                  {isValidatingFastTrack ? 'Validating...' : 'Execute'}
                </button>
              </div>
            </div>
            <p className="text-[9px] text-white/40 uppercase tracking-tight">
              Skip conversational intake. Fields marked * are required.
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
        agentName="Agnes Intake"
        themeColor="indigo"
        placeholder={spec.placeholder}
        showInternalSignals={false}
      />
    </GuidedIntakeFrame>
  );
}
