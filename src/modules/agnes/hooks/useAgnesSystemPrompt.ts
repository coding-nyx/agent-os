import { useMemo, useCallback } from 'react';
import { useGlobalSoulStore } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { AGNES_PERSONA } from '../personas';
import { buildAgnesSessionPrompt } from '../prompts/agnes-session-prompt';
import { computeSessionProgress, buildSessionProgressBlock } from '../session-arc';
import { formatNSVForModulePrompt } from '@/lib/services/nsv-service';
import { NSV_READ_PERMISSIONS } from '@/lib/services/nsv-ownership';
import type { NeuralStateVector, Message } from '@/lib/types';
import type { AgnesEngagementMode } from '../engagement-modes';
import type { AgnesPromptContinuity } from '../engagement-modes';
import type { TherapyIntakeProfile } from '../services/agnes-profile-service';

interface UseAgnesSystemPromptParams {
  profile: TherapyIntakeProfile | null;
  engagementMode: AgnesEngagementMode;
  modeContinuity: AgnesPromptContinuity | undefined;
  isImpromptu: boolean;
  activeBeliefContext: { triggeringBeliefs: string[]; rationale: string[] } | null;
  sessionStartedAt: number;
  /** Ref to current messages array — updated by session hook each render. */
  messagesRef: React.RefObject<Message[]>;
  /** Set when Firestore subscription fails — profile data may be stale or missing. */
  profileError?: 'subscription_failed' | null;
  /** True while the initial profile load is still in progress. */
  isLoading?: boolean;
}

export function useAgnesSystemPrompt({
  profile,
  engagementMode,
  modeContinuity,
  isImpromptu,
  activeBeliefContext,
  sessionStartedAt,
  messagesRef,
  profileError,
  isLoading,
}: UseAgnesSystemPromptParams) {
  const globalSoul = useGlobalSoulStore((s) => s.globalSoul);
  const { profile: coreProfile } = useAuth();

  // Fingerprint only the NSV fields Agnes is permitted to read (per NSV_READ_PERMISSIONS).
  // This prevents the systemPrompt from rebuilding on every NSV write — only the fields
  // Agnes actually uses need to trigger a rebuild.
  const agnesNsvFingerprint = useMemo(() => {
    const nsv = globalSoul?.crossFunctionalState as NeuralStateVector | undefined;
    if (!nsv) return '';
    return JSON.stringify({
      bio: {
        cnsFatigue: nsv.biological?.cnsFatigue,
        sleepQuality: nsv.biological?.sleepQuality,
        hormonalContext: nsv.biological?.hormonalContext,
      },
      emo: {
        emotionalResilience: nsv.emotional?.emotionalResilience,
        stressLoad: nsv.emotional?.stressLoad,
        moodTrend: nsv.emotional?.moodTrend,
        traumaMarkers: nsv.emotional?.traumaMarkers,
      },
      cog: {
        energyBudget: nsv.cognitive?.energyBudget,
        activeLoad: nsv.cognitive?.activeLoad,
      },
      plan: { streakHealth: nsv.planning?.streakHealth },
      res: { financialFriction: nsv.resource?.financialFriction },
    });
  }, [globalSoul?.crossFunctionalState]);

  const systemPrompt = useMemo(
    () => {
      const nsv = globalSoul?.crossFunctionalState as NeuralStateVector | undefined;
      const nsvBlock = (!isImpromptu && nsv)
        ? formatNSVForModulePrompt(nsv, NSV_READ_PERMISSIONS['agnes'])
        : undefined;

      // Build a profile-status preamble so the LLM never mistakes a load
      // failure or in-flight fetch for a genuinely empty profile.
      let profileStatusPreamble: string | undefined;
      if (profileError === 'subscription_failed') {
        profileStatusPreamble =
          '[SYSTEM NOTE: The user\'s therapy profile data is temporarily unavailable due to a data access issue. ' +
          'Do NOT assume the user has no history — acknowledge the data issue and offer to continue without it.]';
      } else if (!profile && isLoading) {
        profileStatusPreamble =
          '[SYSTEM NOTE: The user\'s therapy profile is still loading. ' +
          'Ask them to wait a moment before starting a session.]';
      }

      const basePrompt = buildAgnesSessionPrompt(
        AGNES_PERSONA,
        isImpromptu ? null : profile?.baseContext,
        coreProfile?.agentPersonalityProvision?.agentGenders?.agnes,
        {
          engagementMode,
          continuity: modeContinuity,
          nsvBlock,
          beliefInvitationContext: (!isImpromptu && activeBeliefContext) ? activeBeliefContext : undefined,
        },
      );

      return profileStatusPreamble
        ? `${profileStatusPreamble}\n\n${basePrompt}`
        : basePrompt;
    },
    // `globalSoul.crossFunctionalState` is read inside but intentionally not a dep;
    // `agnesNsvFingerprint` is a stable hash of the NSV fields Agnes cares about,
    // preventing excessive prompt rebuilds when unrelated NSV domains change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isImpromptu, profile?.baseContext, coreProfile?.agentPersonalityProvision?.agentGenders?.agnes, engagementMode, modeContinuity, agnesNsvFingerprint, activeBeliefContext, profileError, isLoading],
  );

  const getSessionProgressBlock = useCallback((): string | null => {
    if (isImpromptu) return null;
    const userExchanges = (messagesRef.current ?? []).filter((m) => m.role === 'user').length;
    if (userExchanges === 0) return null;
    const progress = computeSessionProgress(userExchanges, sessionStartedAt, engagementMode);
    return buildSessionProgressBlock(progress, engagementMode);
  }, [isImpromptu, sessionStartedAt, engagementMode, messagesRef]);

  return {
    systemPrompt,
    getSessionProgressBlock,
  };
}
