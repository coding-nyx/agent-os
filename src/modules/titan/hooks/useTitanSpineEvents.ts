/**
 * useTitanSpineEvents
 *
 * Centralises all Spine event listeners for TitanContent:
 *  - TITAN_PROPOSAL  → surfaces AI proposal cards
 *  - MODULE_HANDOFF_RECEIVED → routes incoming delegate / query_result payloads
 *  - COMMITMENT_MISSED → triggers re-planning prompt for physical commitments
 *  - FINANCIAL_STRESS  → factors cortisol load into training intensity
 *  - Focus redirect from location.state (deep-link into a session)
 *
 * Also owns `handleProposalAction` (ActionHub execution for proposals) and
 * the `parseRecoveryConsult` helper used when routing handoffs.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { AuthUser } from '@/lib/services/auth-service';
import type { TitanProfile, GlobalProjection } from '@/lib/types';
import type { TitanProposal } from '../components/TitanProposalCard';
import type { RecoveryConsultResult } from '../components/RecoveryPlanModal';
import type { NexusHandoff } from '@/lib/services/nexus-handoff-service';
import { useSpineEvent, Spine } from '@/lib/spine/spine-event-bus';
import { ActionHub } from '@/lib/actions/action-hub';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { isPhysicalCommitmentMissed } from '@/lib/spine/flow-contracts';
import type { TitanTab } from './types';

interface UseTitanSpineEventsParams {
  profile: TitanProfile | null;
  encryptionKey: CryptoKey | null;
  user: AuthUser | null;
  isGuest: boolean;
  /** Ref that always holds the latest globalSoul — avoids re-render deps. */
  globalSoulRef: React.RefObject<GlobalProjection | null>;
  /** Open chat panel and send a prompt. */
  openChatAndSend: (prompt: string) => void;
  /** Direct send without opening chat. */
  handleSendMessage: (msg: string) => void;
  /** Recovery hook setters needed to route consult results. */
  setSomaConsult: (v: RecoveryConsultResult) => void;
  setAgnesConsult: (v: RecoveryConsultResult) => void;
  setPendingConsults: React.Dispatch<React.SetStateAction<{ soma: boolean; agnes: boolean }>>;
  setActiveTab: React.Dispatch<React.SetStateAction<TitanTab>>;
  /** Location state for focus redirects. */
  locationState: unknown;
}

export function useTitanSpineEvents({
  profile,
  encryptionKey,
  user,
  isGuest,
  globalSoulRef,
  openChatAndSend,
  handleSendMessage,
  setSomaConsult,
  setAgnesConsult,
  setPendingConsults,
  setActiveTab,
  locationState,
}: UseTitanSpineEventsParams) {
  const [activeProposal, setActiveProposal] = useState<TitanProposal | null>(null);

  // ── Focus redirect (deep-link into a session) ─────────────────────────────
  useEffect(() => {
    const focusId = (locationState as { focusId?: string } | null)?.focusId;
    if (!focusId) return;
    if (focusId.startsWith('session:')) setActiveTab('train');
  }, [locationState, setActiveTab]);

  // ── TITAN_PROPOSAL ────────────────────────────────────────────────────────
  useSpineEvent('TITAN_PROPOSAL', useCallback((event) => {
    const proposal = event.data as unknown as TitanProposal;
    if (proposal && (proposal.type === 'routine_proposal' || proposal.type === 'sleep_log_proposal' || proposal.type === 'workout_log_proposal')) {
      setActiveProposal(proposal);
    }
  }, []));

  // ── MODULE_HANDOFF_RECEIVED ──────────────────────────────────────────────
  const parseRecoveryConsult = useCallback((content: string): RecoveryConsultResult | null => {
    if (!content) return null;
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      const json = JSON.parse(content.slice(start, end + 1)) as RecoveryConsultResult;
      if (!json.summary) return null;
      return json;
    } catch {
      return null;
    }
  }, []);

  const handleIncomingHandoff = useCallback((handoff: NexusHandoff) => {
    if (handoff.type === 'query_result' && handoff.content) {
      const parsed = parseRecoveryConsult(handoff.content);
      if (parsed && (handoff.sourceModuleId === 'soma' || handoff.sourceModuleId === 'agnes')) {
        if (handoff.sourceModuleId === 'soma') {
          setSomaConsult(parsed);
          setPendingConsults((prev) => ({ ...prev, soma: false }));
        } else {
          setAgnesConsult(parsed);
          setPendingConsults((prev) => ({ ...prev, agnes: false }));
        }
        return;
      }
    }

    if (handoff.type === 'delegate') {
      if (handoff.sourceModuleId === 'agnes') {
        openChatAndSend(`[Context from Agnes] ${handoff.content}`);
      } else if (handoff.sourceModuleId === 'atlas') {
        openChatAndSend(
          `[Atlas] A physical commitment was missed: "${handoff.content}". ` +
          `Should we reschedule or adjust the training plan?`,
        );
      } else {
        openChatAndSend(`[${handoff.sourceModuleId ?? 'System'}] ${handoff.content}`);
      }
      return;
    }

    if (handoff.type === 'query_result' && handoff.content) {
      openChatAndSend(`[Query Result from ${handoff.sourceModuleId ?? 'module'}] ${handoff.content}`);
    }
  }, [openChatAndSend, parseRecoveryConsult, setSomaConsult, setAgnesConsult, setPendingConsults]);

  useSpineEvent('MODULE_HANDOFF_RECEIVED', useCallback((event) => {
    const handoff = event.data as unknown as NexusHandoff;
    if (handoff && handoff.moduleId === 'titan') handleIncomingHandoff(handoff);
  }, [handleIncomingHandoff]));

  // ── COMMITMENT_MISSED / FINANCIAL_STRESS ─────────────────────────────────
  const handledMiscEventsRef = useRef<Set<string>>(new Set());

  useSpineEvent('COMMITMENT_MISSED', useCallback((event) => {
    if (!profile?.onboardingComplete) return;
    const eventKey = `commitment-missed-${event.id}`;
    if (handledMiscEventsRef.current.has(eventKey)) return;
    handledMiscEventsRef.current.add(eventKey);
    if (!isPhysicalCommitmentMissed(event)) return;
    const title = event.data?.commitmentTitle ?? event.data?.title ?? 'a physical commitment';
    handleSendMessage(
      `[System] You missed ${title as string}. Should we adjust your training plan or reschedule this session?`,
    );
  }, [profile?.onboardingComplete, handleSendMessage]));

  useSpineEvent('FINANCIAL_STRESS', useCallback((event) => {
    if (!profile?.onboardingComplete) return;
    const eventKey = `financial-stress-${event.id}`;
    if (handledMiscEventsRef.current.has(eventKey)) return;
    handledMiscEventsRef.current.add(eventKey);
    const rawLevel = (event.data?.stressLevel ?? event.data?.level) as number | undefined;
    const stressLevel = rawLevel ?? 0;
    if (stressLevel < 7) return;
    handleSendMessage(
      `[System] Financial stress detected at ${stressLevel}/10. This is a cortisol contributor that compresses recovery capacity. Please factor this into today's training intensity and recovery recommendations.`,
    );
  }, [profile?.onboardingComplete, handleSendMessage]));

  // ── Proposal action handler ───────────────────────────────────────────────
  const handleProposalAction = useCallback(async (handler: string, data?: Record<string, unknown>) => {
    if (!user?.uid || !encryptionKey) throw new Error('Not authenticated');

    const actionMap: Record<string, string> = {
      log_sleep: 'log_sleep', saveSleepLog: 'log_sleep',
      log_workout_session: 'log_workout_session', commitWorkoutSession: 'log_workout_session',
      update_routine: 'update_routine', createRoutine: 'update_routine',
    };
    const actionType = actionMap[handler] ?? handler;
    let resolvedPayload: Record<string, unknown> = data ?? {};
    if (actionType === 'update_routine' && !Array.isArray(resolvedPayload.routines)) {
      resolvedPayload = { routines: [resolvedPayload] };
    }

    const success = await ActionHub.execute('titan', actionType, {
      moduleId: 'titan',
      payload: resolvedPayload,
      userId: user.uid,
      isGuest,
      encryptionKey,
      getLatestNSV: () => globalSoulRef.current?.crossFunctionalState ?? {},
      pushAssistantMessage: (_msg: string) => { /* no-op in spine-event context */ },
      emitSpineEvent: (type, payload) => {
        Spine.emit({ type, source: 'titan', domain: 'B', data: payload, cascadeDepth: 0, priority: 'info' });
      },
      updateGlobalSoul: async (patch) => {
        if (user?.uid && !isGuest) {
          await GlobalProjectionService.updateCrossFunctionalState(user.uid, patch);
        }
      },
      delegateToModule: () => {},
    });

    if (!success) throw new Error(`Action "${actionType}" could not be found. Please try again.`);
    setActiveProposal(null);
  }, [user?.uid, isGuest, encryptionKey, globalSoulRef]);

  return {
    activeProposal,
    setActiveProposal,
    handleProposalAction,
  };
}
