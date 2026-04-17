import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AraChat } from '@/core/components/AraChat';
import { useAuth } from '@/lib/auth-context';
import { useDataLayer } from '@/lib/data-layer/provider';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';
import type { Message, GuestQuota, MessageContent, SpineEvent } from '@/lib/types';
import { CommandPalette } from './CommandPalette';
import { useGlobalSoulActions } from '@/lib/global-soul-context';
import { useAraCrossModuleBlocker } from '@/lib/hooks/use-ara-cross-module-blocker';
import { useAraConflictBlocker } from '@/lib/hooks/use-ara-conflict-blocker';
import { MasterThreadService } from '@/lib/services/master-thread-service';
import type { ThreadExecutionArtifact, ThreadParticipant, MasterThreadMessage, MasterThreadTurn } from '@/lib/contracts/orchestration';
import {
  areThreadParticipantsEqual,
  useOrchestrationStore,
} from '@/lib/stores/orchestration-store';
import { useShallow } from 'zustand/react/shallow';
import { useRoutineProposals } from '@/lib/hooks/use-routine-proposals';
import { useAliveEntityRetrieval } from '@/lib/hooks/useAliveEntityRetrieval';
import type { AliveEntityRuntimeReference } from '@/lib/contracts/orchestration';
import { AliveEntityInjectionService } from '@/lib/services/alive-entity-injection-service';
import { useAraSynthesis } from '../hooks/useAraSynthesis';
import { useAraPlanningSuggestion, buildPlanningExecutionVisibleContent } from '../hooks/useAraPlanningSuggestion';
import { useAraDocumentUpload } from '../hooks/useAraDocumentUpload';
import { useAraSilentHistory } from '../hooks/useAraSilentHistory';
import { AraOperationsWorkspace } from './AraOperationsWorkspace';
import { AraDashboardHeader } from './AraDashboardHeader';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import { useAraCoordination } from '../hooks/useAraCoordination';
import { ProposalCoordinatorService } from '@/lib/services/proposal-coordinator-service';

interface AraDashboardProps {
  ai: {
    messages: Message[];
    isProcessing: boolean;
    streamingText: string;
    error: string | null;
    quota: GuestQuota | null;
    lastParsedCommand?: ParsedCommandEnvelope | null;
    handleSendMessage: (
      content: MessageContent,
      onActionParsed?: (type: string, payload: Record<string, unknown>) => void,
      options?: { isRecoveryReplay?: boolean; visibleContent?: MessageContent; threadId?: string }
    ) => Promise<void>;
    setMessages: (msgs: Message[]) => void;
    clearSession: () => Promise<void>;
  };
  agentName: string;
  surfaceMode?: 'chat' | 'operations';
}

const EMPTY_THREAD_PARTICIPANTS: ThreadParticipant[] = [];
const EMPTY_THREAD_MESSAGES: MasterThreadMessage[] = [];
const EMPTY_THREAD_TURNS: MasterThreadTurn[] = [];

function getAraGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function isTrackedParticipantModule(value: unknown): value is ModuleId {
  return typeof value === 'string' && value in MODULE_MANIFEST && value !== 'ara';
}

function upsertThreadParticipant(
  participants: ThreadParticipant[],
  moduleId: ModuleId,
  patch: Partial<ThreadParticipant>,
  now: string,
) {
  const existingIndex = participants.findIndex((participant) => participant.moduleId === moduleId);
  const baseParticipant: ThreadParticipant = existingIndex >= 0
    ? participants[existingIndex]
    : {
        moduleId,
        role: 'secondary',
        joinedAt: now,
        state: 'joined',
        presence: 'idle',
      };

  const nextParticipant: ThreadParticipant = {
    ...baseParticipant,
    ...patch,
    moduleId,
    role: 'secondary',
    joinedAt: baseParticipant.joinedAt ?? now,
  };

  if (existingIndex >= 0) {
    return participants.map((participant, index) => (index === existingIndex ? nextParticipant : participant));
  }

  return [...participants, nextParticipant];
}

function ClarificationHintBanner({
  hint,
  onDismiss,
}: {
  hint: { reasons: string[] } | null;
  onDismiss: () => void;
}) {
  if (!hint || hint.reasons.length === 0) return null;
  return (
    <div className="mx-3 mb-2 flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(251,191,36,0.08)]">
      <svg className="mt-0.5 w-3.5 h-3.5 text-amber-400 shrink-0 flex-none" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
      <p className="flex-1 text-[12px] text-amber-200/85 leading-snug">
        {hint.reasons[0]}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-amber-400/50 hover:text-amber-300 text-sm leading-none min-w-[24px] min-h-[24px] flex items-center justify-center"
        aria-label="Dismiss clarification hint"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

export function AraDashboard({ ai, agentName, surfaceMode = 'chat' }: AraDashboardProps) {
  const { user, isGuest, profile } = useAuth();
  const dataLayer = useDataLayer();
  const navigate = useNavigate();
  const { refreshGlobalSoul } = useGlobalSoulActions();
  const { alerts } = useAraSynthesis();
  const { isCrossModuleBusy, pendingTargets } = useAraCrossModuleBlocker();
  const { isConflictBlocking } = useAraConflictBlocker();
  const {
    docUploadBusy,
    docUploadError,
    docStage,
    handleUploadDocuments,
    isAraBusy,
    busyLabel,
    bindLateValues: bindDocUploadLateValues,
  } = useAraDocumentUpload({
    isCrossModuleBusy,
    isConflictBlocking,
    pendingTargets,
    userId: user?.uid,
  });
  const [briefCollapsed, setBriefCollapsed] = useState(false);
  const [threadMonitorVisible, setThreadMonitorVisible] = useState(true);

  // Consolidate orchestration store selectors to reduce subscription overhead.
  // Group 1: Core state values (shallow-compared).
  const { activeThreadId, autopilotLevel, lastTurnRuntime } = useOrchestrationStore(
    useShallow((s) => ({
      activeThreadId: s.activeThreadId,
      autopilotLevel: s.autopilotLevel,
      lastTurnRuntime: s.lastTurnRuntime,
    })),
  );
  const currentThreadId = activeThreadId ?? lastTurnRuntime?.activeThreadId ?? 'ara.dashboard';

  // Thread-aware setMessages: maps a truncated filtered-view back to the full
  // unfiltered history.  The edit/retry hook calls setMessages(msgs) where msgs
  // is a prefix of the thread-filtered array.  We keep every message that does
  // NOT belong to the current thread and replace the current-thread slice with
  // the truncated set, preserving chronological interleaving.
  const threadAwareSetMessages = useCallback(
    (newThreadMsgs: Message[]) => {
      const kept = new Set(newThreadMsgs);
      ai.setMessages(
        ai.messages.filter((m) => {
          const isCurrentThread = m.threadId
            ? m.threadId === currentThreadId
            : currentThreadId === 'ara.dashboard';
          return isCurrentThread ? kept.has(m) : true;
        }),
      );
    },
    [ai, currentThreadId],
  );
  // Group 2: Stable action functions (never change, single shallow selector).
  const {
    setThreadParticipants,
    applyThreadSnapshot,
    setThreadRoutingSuggestion,
    patchThreadRoutingSuggestion,
    clearThreadRoutingSuggestion,
    setThreadPlanningSuggestion,
    patchThreadPlanningSuggestion,
    clearThreadPlanningSuggestion,
  } = useOrchestrationStore(
    useShallow((s) => ({
      setThreadParticipants: s.setThreadParticipants,
      applyThreadSnapshot: s.applyThreadSnapshot,
      setThreadRoutingSuggestion: s.setThreadRoutingSuggestion,
      patchThreadRoutingSuggestion: s.patchThreadRoutingSuggestion,
      clearThreadRoutingSuggestion: s.clearThreadRoutingSuggestion,
      setThreadPlanningSuggestion: s.setThreadPlanningSuggestion,
      patchThreadPlanningSuggestion: s.patchThreadPlanningSuggestion,
      clearThreadPlanningSuggestion: s.clearThreadPlanningSuggestion,
    })),
  );

  // Group 3: Thread-scoped data (depends on currentThreadId, shallow-compared).
  const routingSuggestion = useOrchestrationStore((state) => state.threadRoutingSuggestionByThreadId[currentThreadId] ?? null);
  const planningSuggestion = useOrchestrationStore((state) => state.threadPlanningSuggestionByThreadId[currentThreadId] ?? null);
  const persistedThreadParticipants = useOrchestrationStore(
    (state) => state.threadParticipantsByThreadId[currentThreadId] ?? EMPTY_THREAD_PARTICIPANTS,
  );
  const persistedThreadMessages = useOrchestrationStore(
    (state) => state.threadMessagesByThreadId[currentThreadId] ?? EMPTY_THREAD_MESSAGES,
  );
  const persistedThreadTurns = useOrchestrationStore(
    (state) => state.threadTurnsByThreadId[currentThreadId] ?? EMPTY_THREAD_TURNS,
  );
  const pendingTargetsKey = pendingTargets.join('|');
  const mentionedParticipantsKey = (ai.lastParsedCommand?.mentionedModuleIds ?? []).join('|');
  const [snapshotNow, setSnapshotNow] = useState(() => new Date().toISOString());
  const silentHistoryEntries = useAraSilentHistory(user?.uid, isGuest, currentThreadId, dataLayer);
  const routineProposals = useRoutineProposals('any');
  const aliveEntityState = useAliveEntityRetrieval(dataLayer, isGuest ? undefined : user?.uid);

  // Sync high-priority proposal surfaces to the global ProposalCoordinatorService so
  // NeuralDraftPanel (mounted at App root) defers while routing/routine/conflict UI is visible.
  const isHighPriorityProposalActive = Boolean(routingSuggestion || routineProposals.activeProposal || isConflictBlocking);
  useEffect(() => {
    if (isHighPriorityProposalActive) {
      ProposalCoordinatorService.markHighPriorityActive();
      return () => ProposalCoordinatorService.markHighPriorityIdle();
    }
  }, [isHighPriorityProposalActive]);
  const conversationDepth = ai.messages.filter(m => m.role === 'user').length;
  useAraPlanningSuggestion({
    currentThreadId,
    alerts,
    aliveContext: aliveEntityState.context,
    conversationDepth,
    lastParsedCommand: ai.lastParsedCommand,
    autopilotLevel,
    routingSuggestion,
    routineActiveProposal: routineProposals.activeProposal,
    docUploadBusy,
    isConflictBlocking,
    planningSuggestion,
    setThreadPlanningSuggestion,
    patchThreadPlanningSuggestion,
    clearThreadPlanningSuggestion,
    handleSendMessage: ai.handleSendMessage,
  });
  const {
    memorySearchState,
    handleActionParsed,
    handleAskAboutDomain,
    handleConsultModule,
    handleDismissMemoryResults,
    handleInjectChat,
    handleMemoryResultClick,
    handleMemorySearch,
    clarificationHint,
    dismissClarificationHint,
    handleSendWithRouting,
    presentRoutingSuggestion,
  } = useAraCoordination({
    ai,
    userId: user?.uid,
    isGuest,
    currentThreadId,
    autopilotLevel,
    navigate,
    setThreadRoutingSuggestion,
    patchThreadRoutingSuggestion,
    clearThreadRoutingSuggestion,
  });

  // Bind late values into the document upload hook now that they're available.
  bindDocUploadLateValues({
    currentThreadId,
    presentRoutingSuggestion,
    handleSendMessage: ai.handleSendMessage,
  });

  useEffect(() => {
    setSnapshotNow(new Date().toISOString());
  }, [
    currentThreadId,
    pendingTargetsKey,
    routingSuggestion?.target,
    routingSuggestion?.reason,
    routingSuggestion?.state,
    routineProposals.activeProposal?.id,
    planningSuggestion?.id,
    planningSuggestion?.state,
    docUploadBusy,
    docStage?.label,
    isConflictBlocking,
    lastTurnRuntime,
    mentionedParticipantsKey,
  ]);

  // Auto-collapse brief when chat starts
  React.useEffect(() => {
    if (conversationDepth >= 1 && !briefCollapsed) {
      setBriefCollapsed(true);
    }
  }, [conversationDepth]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (window.innerWidth < 768) setBriefCollapsed(true);
  }, []);

  const handleRouteConfirm = useCallback((proposalKind?: string, proposalId?: string) => {
    if (proposalKind === 'planning_heuristic') {
      if (!planningSuggestion || planningSuggestion.id !== proposalId) return;
      const prompt = planningSuggestion.prompt;
      void ai.handleSendMessage(prompt, undefined, {
        visibleContent: buildPlanningExecutionVisibleContent(planningSuggestion),
      });
      clearThreadPlanningSuggestion(currentThreadId);
      return;
    }
    if (proposalKind === 'routine_proposal' && routineProposals.activeProposal?.id === proposalId) {
      void routineProposals.confirm();
      return;
    }
    if (!routingSuggestion) return;
    // Emit ROUTING_ACCEPTED so DelegationTrackingService moves this module from
    // proposed → pending, and the ROUTING_ACCEPTED Spine handler above upgrades
    // the participant from 'invited' → 'waiting' and clears the suggestion.
    Spine.emit({
      type: 'ROUTING_ACCEPTED',
      source: 'ara',
      target: routingSuggestion.target,
      domain: 'system',
      data: { reason: 'user_accepted_card', confidence: routingSuggestion.confidence },
      cascadeDepth: 0,
      priority: 'info',
    });
    const manifest = MODULE_MANIFEST[routingSuggestion.target];
    if (manifest) {
      navigate(manifest.route);
    }
    // clearThreadRoutingSuggestion is now called by the ROUTING_ACCEPTED handler above,
    // but call it here as a safeguard in case the event hasn't fired yet.
    clearThreadRoutingSuggestion(currentThreadId);
  }, [ai, clearThreadPlanningSuggestion, clearThreadRoutingSuggestion, currentThreadId, navigate, planningSuggestion, routingSuggestion, routineProposals]);

  const handleRouteDismiss = useCallback((proposalKind?: string, proposalId?: string) => {
    if (proposalKind === 'planning_heuristic' && planningSuggestion?.id === proposalId) {
      patchThreadPlanningSuggestion(currentThreadId, { state: 'deferred' });
      return;
    }
    if (proposalKind === 'routine_proposal' && routineProposals.activeProposal?.id === proposalId) {
      void routineProposals.dismiss();
      return;
    }
    patchThreadRoutingSuggestion(currentThreadId, { state: 'deferred' });
  }, [currentThreadId, patchThreadPlanningSuggestion, patchThreadRoutingSuggestion, planningSuggestion, routineProposals]);

  const handleThreadProposalLifecycleChange = useCallback((proposalId: string, nextLifecycle: 'draft' | 'deferred') => {
    if (planningSuggestion?.id === proposalId) {
      patchThreadPlanningSuggestion(currentThreadId, { state: nextLifecycle });
      return;
    }
    if (!routingSuggestion) return;
    const routingProposalId = `${currentThreadId}.proposal.route.${routingSuggestion.target}`;
    if (proposalId !== routingProposalId) return;
    patchThreadRoutingSuggestion(currentThreadId, { state: nextLifecycle });
  }, [currentThreadId, patchThreadPlanningSuggestion, patchThreadRoutingSuggestion, planningSuggestion, routingSuggestion]);

  const handleThreadProposalEdit = useCallback((draft: { targetModuleId?: ModuleId; reason?: string }) => {
    if (!draft.targetModuleId) return;
    setThreadRoutingSuggestion(currentThreadId, {
      target: draft.targetModuleId,
      reason: draft.reason?.trim() || undefined,
      state: routingSuggestion?.state ?? 'draft',
    });
  }, [currentThreadId, routingSuggestion?.state, setThreadRoutingSuggestion]);

  const handleExecutionRetry = useCallback((artifact: ThreadExecutionArtifact) => {
    if (!artifact.retryPrompt) return;
    void ai.handleSendMessage(artifact.retryPrompt, undefined, {
      visibleContent: artifact.retryVisibleContent ?? artifact.retrySummary ?? 'Retry failed steps.',
    });
  }, [ai]);


  const handleAliveEntitySelect = useCallback((entity: AliveEntityRuntimeReference) => {
    ai.handleSendMessage(AliveEntityInjectionService.formatForChat(entity), undefined, { threadId: currentThreadId });
  }, [ai, currentThreadId]);

  // Memoize the thread-filtered ai object passed to AraChat to avoid
  // breaking its React.memo on every render.
  const threadFilteredMessages = useMemo(
    () => ai.messages.filter((m) => {
      if (m.threadId) return m.threadId === currentThreadId;
      return currentThreadId === 'ara.dashboard';
    }),
    [ai.messages, currentThreadId],
  );

  const araChatAi = useMemo(
    () => ({
      ...ai,
      messages: threadFilteredMessages,
      setMessages: threadAwareSetMessages,
      handleSendMessage: handleSendWithRouting,
      isProcessing: ai.isProcessing || isAraBusy,
    }),
    [ai, threadFilteredMessages, threadAwareSetMessages, handleSendWithRouting, isAraBusy],
  );

  const masterThreadSnapshot = useMemo(() => {
    return MasterThreadService.createAraShellSnapshot({
      threadId: currentThreadId,
      now: snapshotNow,
      seedParticipants: persistedThreadParticipants,
      seedMessages: persistedThreadMessages,
      seedTurns: persistedThreadTurns,
      liveChatMessages: ai.messages,
      liveStreamingAssistantText: ai.streamingText,
      liveChatAssistantSource: 'ara',
      pendingTargets,
      mentionedParticipants: ai.lastParsedCommand?.mentionedModuleIds ?? [],
      routingSuggestion: routingSuggestion
        ? {
            target: routingSuggestion.target,
            reason: routingSuggestion.reason,
          }
        : null,
      routingSuggestionState: routingSuggestion?.state ?? 'draft',
      routineProposal: routineProposals.activeProposal,
      planningProposal: planningSuggestion,
      docUploadBusy,
      docStageLabel: docStage?.label ?? null,
      isConflictBlocking,
      lastTurnRuntime,
    });
  }, [
    currentThreadId,
    snapshotNow,
    pendingTargets,
    persistedThreadParticipants,
    persistedThreadMessages,
    persistedThreadTurns,
    ai.messages,
    ai.streamingText,
    ai.lastParsedCommand?.mentionedModuleIds,
    routingSuggestion,
    routineProposals.activeProposal,
    planningSuggestion,
    docUploadBusy,
    docStage?.label,
    isConflictBlocking,
    lastTurnRuntime,
  ]);

  const welcomeGreeting = useMemo(() => getAraGreeting(), []);
  const welcomeName = profile?.preferredName?.trim();
  const handleOpenOperations = useCallback(() => {
    navigate('/ara/ops');
  }, [navigate]);
  const handleClearChat = useCallback(() => {
    void ai.clearSession();
  }, [ai]);

  const commandPalette = (
    <CommandPalette
      onSynthesisRefresh={() => {
        handleOpenOperations();
        refreshGlobalSoul();
      }}
      onMemorySearch={async (query) => {
        handleOpenOperations();
        await handleMemorySearch(query);
      }}
      onAskModule={handleConsultModule}
      onExpandBrief={() => {
        setBriefCollapsed(false);
        handleOpenOperations();
      }}
      onOpenOperations={handleOpenOperations}
      onClearSession={handleClearChat}
    />
  );

  useEffect(() => {
    applyThreadSnapshot(masterThreadSnapshot.thread.threadId, {
      participants: masterThreadSnapshot.thread.participants,
      messages: masterThreadSnapshot.thread.messages,
      turns: masterThreadSnapshot.thread.turns,
    });
  }, [
    applyThreadSnapshot,
    masterThreadSnapshot.thread.messages,
    masterThreadSnapshot.thread.participants,
    masterThreadSnapshot.thread.threadId,
    masterThreadSnapshot.thread.turns,
  ]);

  useEffect(() => {
    if (typeof (Spine as any).on !== 'function') return;

    const updateParticipantsFromEvent = (updater: (participants: ThreadParticipant[], now: string) => ThreadParticipant[]) => {
      const now = new Date().toISOString();
      const currentParticipants =
        useOrchestrationStore.getState().threadParticipantsByThreadId[currentThreadId] ?? EMPTY_THREAD_PARTICIPANTS;
      const nextParticipants = updater(currentParticipants, now);
      if (!areThreadParticipantsEqual(currentParticipants, nextParticipants)) {
        setThreadParticipants(currentThreadId, nextParticipants);
      }
    };

    const handleDelegated = (event: SpineEvent) => {
      if (event.source === 'ara' && isTrackedParticipantModule(event.target)) {
        updateParticipantsFromEvent((participants, now) =>
          upsertThreadParticipant(participants, event.target as ModuleId, {
            state: 'waiting',
            presence: 'idle',
            invitedAt: event.timestamp ? new Date(event.timestamp).toISOString() : now,
          }, now),
        );
        return;
      }

      if (event.target === 'ara' && isTrackedParticipantModule(event.source)) {
        const reason = typeof event.data?.reason === 'string' ? event.data.reason : undefined;
        if (reason === 'query_result') {
          updateParticipantsFromEvent((participants, now) =>
            upsertThreadParticipant(participants, event.source as ModuleId, {
              state: 'joined',
              presence: 'online',
              lastActiveAt: event.timestamp ? new Date(event.timestamp).toISOString() : now,
            }, now),
          );
        }
      }
    };

    const handleVitalUpdated = (event: SpineEvent) => {
      if (!isTrackedParticipantModule(event.source)) return;
      updateParticipantsFromEvent((participants, now) =>
        upsertThreadParticipant(participants, event.source as ModuleId, {
          state: 'joined',
          presence: 'online',
          lastActiveAt: event.timestamp ? new Date(event.timestamp).toISOString() : now,
        }, now),
      );
    };

    // ROUTING_PROPOSED: target module is "invited" — proposal is visible but user hasn't accepted.
    // Do NOT use 'waiting' here; waiting means work is in-flight.
    const handleRoutingProposed = (event: SpineEvent) => {
      if (!isTrackedParticipantModule(event.target)) return;
      updateParticipantsFromEvent((participants, now) =>
        upsertThreadParticipant(participants, event.target as ModuleId, {
          state: 'invited',
          presence: 'idle',
          invitedAt: event.timestamp ? new Date(event.timestamp).toISOString() : now,
        }, now),
      );
    };

    // ROUTING_ACCEPTED: user or autopilot confirmed the proposal — upgrade to 'waiting'
    // (work is now in-flight on the target module) and clear the routing suggestion from
    // the orchestration store so the proposal card disappears.
    const handleRoutingAccepted = (event: SpineEvent) => {
      if (isTrackedParticipantModule(event.target)) {
        updateParticipantsFromEvent((participants, now) =>
          upsertThreadParticipant(participants, event.target as ModuleId, {
            state: 'waiting',
            presence: 'idle',
          }, now),
        );
      }
      clearThreadRoutingSuggestion(currentThreadId);
    };

    // ROUTING_DISMISSED: user clicked "Stay Here" / X / auto-dismiss.
    // 1. Patch suggestion to deferred — masterThreadService will see deferred and
    //    join the agent into the thread as 'waiting' (consulted) rather than dismissing it.
    // 2. Directly persist the target as 'waiting' so the state survives any subsequent
    //    routing suggestion reset (e.g. Ara re-proposes the same module on the fallback stream).
    const handleRoutingDismissed = (event: SpineEvent) => {
      patchThreadRoutingSuggestion(currentThreadId, { state: 'deferred' });
      if (isTrackedParticipantModule(event.target)) {
        updateParticipantsFromEvent((participants, now) =>
          upsertThreadParticipant(participants, event.target as ModuleId, {
            state: 'waiting',
            presence: 'idle',
          }, now),
        );
      }
    };

    const unsubDelegated = Spine.on('MODULE_DELEGATED', handleDelegated);
    const unsubRoutingProposed = Spine.on('ROUTING_PROPOSED', handleRoutingProposed);
    const unsubRoutingAccepted = Spine.on('ROUTING_ACCEPTED', handleRoutingAccepted);
    const unsubRoutingDismissed = Spine.on('ROUTING_DISMISSED', handleRoutingDismissed);
    const unsubVitalUpdated = Spine.on('VITAL_UPDATED', handleVitalUpdated);
    // MODULE_PROFILE_UPDATED signals the target module completed its update (same as VITAL_UPDATED).
    const unsubProfileUpdated = Spine.on('MODULE_PROFILE_UPDATED', handleVitalUpdated);

    return () => {
      unsubDelegated?.();
      unsubRoutingProposed?.();
      unsubRoutingAccepted?.();
      unsubRoutingDismissed?.();
      unsubVitalUpdated?.();
      unsubProfileUpdated?.();
    };
  }, [clearThreadRoutingSuggestion, currentThreadId, patchThreadRoutingSuggestion, setThreadParticipants]);

  if (surfaceMode === 'operations') {
    return (
      <>
        <AraOperationsWorkspace
          ai={ai}
          currentThreadId={currentThreadId}
          isGuest={isGuest}
          userId={user?.uid}
          dataLayer={dataLayer}
          isAraBusy={isAraBusy}
          busyLabel={busyLabel}
          threadMonitorVisible={threadMonitorVisible}
          setThreadMonitorVisible={setThreadMonitorVisible}
          masterThreadSnapshot={masterThreadSnapshot}
          silentHistoryEntries={silentHistoryEntries}
          routingSuggestion={routingSuggestion}
          planningSuggestion={planningSuggestion}
          routineProposalLabel={
            routineProposals.activeProposal
              ? `Routine · ${routineProposals.activeProposal.routine.name}`
              : null
          }
          pendingTargets={pendingTargets}
          memorySearchState={memorySearchState}
          aliveEntityState={{
            context: aliveEntityState.context,
            isLoading: aliveEntityState.isLoading,
          }}
          refreshGlobalSoul={refreshGlobalSoul}
          handleInjectChat={handleInjectChat}
          handleConsultModule={handleConsultModule}
          handleMemoryResultClick={handleMemoryResultClick}
          handleDismissMemoryResults={handleDismissMemoryResults}
          handleAliveEntitySelect={handleAliveEntitySelect}
          handleThreadProposalLifecycleChange={handleThreadProposalLifecycleChange}
          handleRouteConfirm={handleRouteConfirm}
          handleRouteDismiss={handleRouteDismiss}
          handleThreadProposalEdit={handleThreadProposalEdit}
          handleExecutionRetry={handleExecutionRetry}
          clarificationHint={clarificationHint}
          onDismissClarificationHint={dismissClarificationHint}
        />
        {commandPalette}
      </>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
      <AraDashboardHeader
        welcomeGreeting={welcomeGreeting}
        welcomeName={welcomeName}
        participants={masterThreadSnapshot.thread.participants}
        onOpenOperations={handleOpenOperations}
        onClearChat={handleClearChat}
      />

      {/* Chat area — fills remaining space */}
      <div className="flex-1 min-h-0 flex flex-col relative pt-2">
        <ClarificationHintBanner hint={clarificationHint} onDismiss={dismissClarificationHint} />
        <AraChat
          ai={araChatAi}
          agentName={agentName}
          themeColor="cyan"
          placeholder="Message Ara…"
          moduleId="orchestrator"
          hideClearHistory
          onActionParsed={handleActionParsed}
          onUploadDocuments={handleUploadDocuments}
          enableSpeechToText
        />
      </div>

      {commandPalette}
    </div>
  );
}
