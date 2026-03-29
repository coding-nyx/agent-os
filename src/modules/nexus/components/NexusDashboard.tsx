import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { NexusChat } from '@/core/components/NexusChat';
import { useAuth } from '@/lib/auth-context';
import { useDataLayer } from '@/lib/data-layer/provider';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';
import type { Message, GuestQuota, MessageContent, SpineEvent } from '@/lib/types';
import { CommandPalette } from './CommandPalette';
import { useGlobalSoulActions } from '@/lib/global-soul-context';
import { useAI } from '@/llm-engine/ai-context';
import { type DocumentPipelineStage } from '@/lib/services/document-pipeline';
import { useNexusCrossModuleBlocker } from '@/lib/hooks/use-nexus-cross-module-blocker';
import { useNexusConflictBlocker } from '@/lib/hooks/use-nexus-conflict-blocker';
import { prepareDocumentChatPrompt } from '@/lib/services/document-chat-handoff-service';
import type { DocumentUploadRequest } from '@/lib/services/document-upload-message';
import { OrchestrationHistoryService } from '@/lib/services/orchestration-history-service';
import { MasterThreadService } from '@/lib/services/master-thread-service';
import type { SilentHistoryEntry, ThreadExecutionArtifact, ThreadParticipant } from '@/lib/contracts/orchestration';
import {
  areThreadParticipantsEqual,
  useOrchestrationStore,
} from '@/lib/stores/orchestration-store';
import { useRoutineProposals } from '@/lib/hooks/use-routine-proposals';
import { useAliveEntityRetrieval } from '@/lib/hooks/useAliveEntityRetrieval';
import type { AliveEntityRuntimeReference } from '@/lib/contracts/orchestration';
import { AliveEntityInjectionService } from '@/lib/services/alive-entity-injection-service';
import { useNexusSynthesis } from '../hooks/useNexusSynthesis';
import { AnticipatoryPlanningService } from '@/lib/services/anticipatory-planning-service';
import { NexusActionPlannerService } from '@/lib/services/nexus-action-planner-service';
import { OrchestrationInteractionGateService } from '@/lib/services/orchestration-interaction-gate-service';
import { NexusOperationsWorkspace } from './NexusOperationsWorkspace';
import { NexusAgentPresenceStack } from '@/core/components/NexusAgentPresenceStack';
import { Spine } from '@/lib/spine/spine-event-bus';
import { OrchestrationStatusChip } from '@/core/components/OrchestrationStatusChip';
import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import { useNexusCoordination } from '../hooks/useNexusCoordination';
import { ProposalCoordinatorService } from '@/lib/services/proposal-coordinator-service';
import { SlidersHorizontal, Trash2 } from 'lucide-react';

interface NexusDashboardProps {
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
    clearSession: () => Promise<void>;
  };
  agentName: string;
  surfaceMode?: 'chat' | 'operations';
}

const EMPTY_THREAD_PARTICIPANTS: ThreadParticipant[] = [];

function getNexusGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function isTrackedParticipantModule(value: unknown): value is ModuleId {
  return typeof value === 'string' && value in MODULE_MANIFEST && value !== 'nexus';
}

function buildPlanningExecutionVisibleContent(planningSuggestion: {
  title: string;
  summary: string;
  targetModuleId?: ModuleId;
  nodeCount?: number;
}): string {
  const targetLabel = planningSuggestion.targetModuleId
    ? MODULE_MANIFEST[planningSuggestion.targetModuleId]?.alias ?? planningSuggestion.targetModuleId
    : 'Nexus';
  if (planningSuggestion.nodeCount && planningSuggestion.nodeCount > 1) {
    return `Execute the proposed ${planningSuggestion.nodeCount}-step ${targetLabel} plan. ${planningSuggestion.summary}`;
  }
  return `Execute the proposed ${planningSuggestion.title.toLowerCase()} via ${targetLabel}.`;
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

export function NexusDashboard({ ai, agentName, surfaceMode = 'chat' }: NexusDashboardProps) {
  const { user, isGuest, profile } = useAuth();
  const dataLayer = useDataLayer();
  const navigate = useNavigate();
  const { refreshGlobalSoul } = useGlobalSoulActions();
  const { alerts } = useNexusSynthesis();
  const { isCrossModuleBusy, pendingTargets } = useNexusCrossModuleBlocker();
  const { isConflictBlocking } = useNexusConflictBlocker();
  const [docUploadBusy, setDocUploadBusy] = useState(false);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const [docStage, setDocStage] = useState<DocumentPipelineStage | null>(null);
  // Some unit tests render this component without an `AIProvider`.
  // `useAI()` throws in that scenario, so we fall back to a no-op sender
  // (document-upload features won't be exercised by those tests).
  let sendMessage: ReturnType<typeof useAI>['sendMessage'] | undefined;
  let analyzeImage: ReturnType<typeof useAI>['analyzeImage'] | undefined;
  try {
    // `useAI()` must still be invoked to preserve hook order.
    const aiContext = useAI();
    sendMessage = aiContext.sendMessage;
    analyzeImage = aiContext.analyzeImage;
  } catch {
    sendMessage = undefined;
    analyzeImage = undefined;
  }
  const [briefCollapsed, setBriefCollapsed] = useState(false);
  const [threadMonitorVisible, setThreadMonitorVisible] = useState(true);
  const activeThreadId = useOrchestrationStore((state) => state.activeThreadId);
  const autopilotLevel = useOrchestrationStore((state) => state.autopilotLevel);
  const lastTurnRuntime = useOrchestrationStore((state) => state.lastTurnRuntime);
  const currentThreadId = activeThreadId ?? lastTurnRuntime?.activeThreadId ?? 'nexus.dashboard';
  const setThreadParticipants = useOrchestrationStore((state) => state.setThreadParticipants);
  const applyThreadSnapshot = useOrchestrationStore((state) => state.applyThreadSnapshot);
  const threadParticipantsByThreadId = useOrchestrationStore((state) => state.threadParticipantsByThreadId);
  const threadMessagesByThreadId = useOrchestrationStore((state) => state.threadMessagesByThreadId);
  const threadTurnsByThreadId = useOrchestrationStore((state) => state.threadTurnsByThreadId);
  const routingSuggestion = useOrchestrationStore((state) => state.threadRoutingSuggestionByThreadId[currentThreadId] ?? null);
  const setThreadRoutingSuggestion = useOrchestrationStore((state) => state.setThreadRoutingSuggestion);
  const patchThreadRoutingSuggestion = useOrchestrationStore((state) => state.patchThreadRoutingSuggestion);
  const clearThreadRoutingSuggestion = useOrchestrationStore((state) => state.clearThreadRoutingSuggestion);
  const planningSuggestion = useOrchestrationStore((state) => state.threadPlanningSuggestionByThreadId[currentThreadId] ?? null);
  const setThreadPlanningSuggestion = useOrchestrationStore((state) => state.setThreadPlanningSuggestion);
  const patchThreadPlanningSuggestion = useOrchestrationStore((state) => state.patchThreadPlanningSuggestion);
  const clearThreadPlanningSuggestion = useOrchestrationStore((state) => state.clearThreadPlanningSuggestion);
  const persistedThreadParticipants = threadParticipantsByThreadId[currentThreadId] ?? EMPTY_THREAD_PARTICIPANTS;
  const persistedThreadMessages = threadMessagesByThreadId[currentThreadId] ?? [];
  const persistedThreadTurns = threadTurnsByThreadId[currentThreadId] ?? [];
  const pendingTargetsKey = pendingTargets.join('|');
  const mentionedParticipantsKey = (ai.lastParsedCommand?.mentionedModuleIds ?? []).join('|');
  const [snapshotNow, setSnapshotNow] = useState(() => new Date().toISOString());
  const [silentHistoryEntries, setSilentHistoryEntries] = useState<SilentHistoryEntry[]>([]);
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
  const anticipatoryPlanningProposal = useMemo(() => AnticipatoryPlanningService.buildProposal({
    threadId: currentThreadId,
    alerts,
    aliveContext: aliveEntityState.context,
    conversationDepth,
  }), [alerts, aliveEntityState.context, conversationDepth, currentThreadId]);
  const parsedCommandPlanningProposal = useMemo(() => NexusActionPlannerService.buildPlanningSuggestion({
    threadId: currentThreadId,
    parsedCommand: ai.lastParsedCommand ?? null,
    conversationDepth,
  }), [ai.lastParsedCommand, conversationDepth, currentThreadId]);
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
  } = useNexusCoordination({
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

  useEffect(() => {
    if (routingSuggestion || routineProposals.activeProposal || docUploadBusy || isConflictBlocking) {
      clearThreadPlanningSuggestion(currentThreadId);
      return;
    }

    const activePlanningProposal = anticipatoryPlanningProposal ?? parsedCommandPlanningProposal;

    if (!activePlanningProposal) {
      clearThreadPlanningSuggestion(currentThreadId);
      return;
    }

    const planningDecision = OrchestrationInteractionGateService.evaluate({
      autopilotLevel,
      candidate: {
        kind: 'planning',
        sourceModuleId: 'nexus',
        targetModuleId: activePlanningProposal.targetModuleId,
        threadId: currentThreadId,
        confidence: activePlanningProposal.confidence,
        canAutoDispatch: true,
      },
    });
    if (planningDecision.mode === 'silent_execute') {
      const proposalKey = `planning:${activePlanningProposal.id}:${activePlanningProposal.confidence ?? ''}`;
      if (automatedProposalKeyRef.current === proposalKey) return;
      automatedProposalKeyRef.current = proposalKey;
      clearThreadPlanningSuggestion(currentThreadId);
      void ai.handleSendMessage(activePlanningProposal.prompt, undefined, {
        visibleContent: buildPlanningExecutionVisibleContent(activePlanningProposal),
      });
      return;
    }

    setThreadPlanningSuggestion(currentThreadId, {
      ...activePlanningProposal,
      state:
        planningSuggestion?.id === activePlanningProposal.id
          ? planningSuggestion.state
          : activePlanningProposal.state,
    });
  }, [
    anticipatoryPlanningProposal,
    clearThreadPlanningSuggestion,
    currentThreadId,
    docUploadBusy,
    isConflictBlocking,
    autopilotLevel,
    parsedCommandPlanningProposal,
    planningSuggestion?.id,
    planningSuggestion?.state,
    routingSuggestion,
    routineProposals.activeProposal,
    setThreadPlanningSuggestion,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (!user?.uid || isGuest) {
      setSilentHistoryEntries([]);
      return () => {
        cancelled = true;
      };
    }

    void OrchestrationHistoryService.listSilentHistoryForThread(user.uid, currentThreadId, {
      dataLayer,
      limit: 6,
    })
      .then((entries) => {
        if (cancelled) return;
        setSilentHistoryEntries(entries);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[NexusDashboard] Failed to load silent history:', error);
          setSilentHistoryEntries([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentThreadId, dataLayer, isGuest, user?.uid]);

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
    const manifest = MODULE_MANIFEST[routingSuggestion.target];
    if (manifest) {
      navigate(manifest.route);
    }
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

  const automatedProposalKeyRef = useRef<string | null>(null);

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

  const handleUploadDocuments = useCallback(async (request: DocumentUploadRequest) => {
    if (!sendMessage) {
      throw new Error('AI sendMessage unavailable (missing AIProvider).');
    }
    const llmPrimary = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        systemPrompt: 'You are a neutral document analyst. Follow the instructions exactly. Do NOT emit action tags.',
        memoryContext: [],
        summary: 'Nexus document analysis.',
        history: []
      });
      return response.publicText;
    };

    const llmFallback = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        systemPrompt: 'Return a concise summary and key points. No action tags.',
        memoryContext: [],
        summary: 'Nexus document fallback.',
        history: []
      });
      return response.publicText;
    };

    setDocUploadError(null);
    setDocUploadBusy(true);
    setDocStage({ id: 'parsing', label: request.files.length > 1 ? 'Uploading documents…' : 'Uploading document…' });

    try {
      const result = await prepareDocumentChatPrompt({
        moduleId: 'nexus',
        files: request.files,
        sendMessage: llmPrimary,
        sendMessageFallback: llmFallback,
        analyzeImage: analyzeImage ? (imageDataUrl, prompt) => analyzeImage(imageDataUrl, prompt) : undefined,
        userContext: request.caption,
        onStageChange: (stage) => setDocStage(stage),
      });

      const routeCandidate = result.insights
        .filter((insight) =>
          !insight.requiresUserTypeSelection &&
          insight.targetModule &&
          insight.targetModule !== 'nexus' &&
          (insight.targetConfidence ?? 0) >= 0.75
        )
        .sort((a, b) => (b.targetConfidence ?? 0) - (a.targetConfidence ?? 0))[0];

      if (routeCandidate?.targetModule) {
        presentRoutingSuggestion(
          routeCandidate.targetModule,
          `Document classified as ${routeCandidate.docType} (${Math.round((routeCandidate.targetConfidence ?? 0) * 100)}% confidence).`,
        );
      }

      setDocStage((prev) => prev ?? { id: 'done', label: 'Document analyzed.' });
      await ai.handleSendMessage(result.prompt, undefined, { visibleContent: request.visibleContent, threadId: currentThreadId });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Document analysis failed.';
      setDocUploadError(message);
      setDocStage({ id: 'error', label: 'Analysis failed.' });
    } finally {
      setDocUploadBusy(false);
    }
  }, [ai, analyzeImage, presentRoutingSuggestion, sendMessage]);

  const isNexusBusy = isCrossModuleBusy || docUploadBusy || isConflictBlocking;
  const busyLabel = (() => {
    if (docUploadBusy) return docStage?.label ?? 'Uploading and analyzing…';
    if (docUploadError) return docStage?.label ?? 'Analysis failed.';
    if (isConflictBlocking) return 'Conflict active: resolve it in the overlay to continue…';
    if (isCrossModuleBusy) {
      const names = pendingTargets
        .slice(0, 3)
        .map((id) => MODULE_MANIFEST[id]?.alias || id)
        .join(', ');
      return pendingTargets.length > 0
        ? `Waiting for module response: ${names}…`
        : 'Waiting for module response…';
    }
    return '';
  })();

  const masterThreadSnapshot = useMemo(() => {
    return MasterThreadService.createNexusShellSnapshot({
      threadId: currentThreadId,
      now: snapshotNow,
      seedParticipants: persistedThreadParticipants,
      seedMessages: persistedThreadMessages,
      seedTurns: persistedThreadTurns,
      liveChatMessages: ai.messages,
      liveStreamingAssistantText: ai.streamingText,
      liveChatAssistantSource: 'nexus',
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

  const welcomeGreeting = useMemo(() => getNexusGreeting(), []);
  const welcomeName = profile?.preferredName?.trim();
  const handleOpenOperations = useCallback(() => {
    navigate('/nexus/ops');
  }, [navigate]);
  const handleClearChat = useCallback(() => {
    void ai.clearSession();
  }, [ai]);

  const headerOpsBtn = (
    <button
      type="button"
      data-testid="nexus-open-ops"
      onClick={handleOpenOperations}
      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.08] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.10em] text-cyan-300 transition-all hover:border-cyan-300/45 hover:bg-cyan-300/[0.12] active:scale-95 min-h-[32px]"
    >
      Ops
    </button>
  );
  const headerClearBtn = (
    <button
      type="button"
      data-testid="nexus-clear-chat"
      onClick={handleClearChat}
      className="inline-flex items-center rounded-lg border border-white/[0.09] bg-white/[0.045] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.10em] text-white/50 transition-all hover:border-white/15 hover:bg-white/[0.07] hover:text-white/80 active:scale-95 min-h-[32px]"
    >
      Clear
    </button>
  );
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
      if (event.source === 'nexus' && isTrackedParticipantModule(event.target)) {
        updateParticipantsFromEvent((participants, now) =>
          upsertThreadParticipant(participants, event.target as ModuleId, {
            state: 'waiting',
            presence: 'idle',
            invitedAt: event.timestamp ? new Date(event.timestamp).toISOString() : now,
          }, now),
        );
        return;
      }

      if (event.target === 'nexus' && isTrackedParticipantModule(event.source)) {
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

    const unsubDelegated = Spine.on('MODULE_DELEGATED', handleDelegated);
    const unsubVitalUpdated = Spine.on('VITAL_UPDATED', handleVitalUpdated);

    return () => {
      unsubDelegated?.();
      unsubVitalUpdated?.();
    };
  }, [currentThreadId, setThreadParticipants]);

  if (surfaceMode === 'operations') {
    return (
      <>
        <NexusOperationsWorkspace
          ai={ai}
          currentThreadId={currentThreadId}
          isGuest={isGuest}
          userId={user?.uid}
          dataLayer={dataLayer}
          isNexusBusy={isNexusBusy}
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
      <div className="shrink-0 px-3 pt-2 sm:px-4 sm:pt-3">
        {/* ── Mobile header (< sm): flat minimal bar ── */}
        <div className="flex sm:hidden items-center gap-2 py-1">
          {/* Status dot */}
          <div className="shrink-0 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]" />
          {/* Greeting */}
          <div className="flex-1 min-w-0">
            <p className="text-[0.8125rem] font-semibold text-white truncate leading-tight">
              {welcomeGreeting}{welcomeName ? `, ${welcomeName}` : ''}
            </p>
          </div>
          {/* Icon-only actions */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              data-testid="nexus-open-ops"
              onClick={handleOpenOperations}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-cyan-400/70 hover:text-cyan-300 hover:bg-cyan-400/[0.08] active:scale-90 transition-all"
              aria-label="Open operations"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <button
              type="button"
              data-testid="nexus-clear-chat"
              onClick={handleClearChat}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.05] active:scale-90 transition-all"
              aria-label="Clear chat"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Desktop header (≥ sm): full row with status ── */}
        <div className="hidden sm:block rounded-2xl border border-cyan-500/20 bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,0.10)_0%,transparent_60%),linear-gradient(160deg,rgba(10,18,30,0.98)_0%,rgba(5,8,14,0.99)_100%)] px-5 py-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(34,211,238,0.10)]">
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center shadow-[0_0_10px_rgba(34,211,238,0.15)]">
              <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold leading-tight tracking-tight text-white font-display truncate">
                {welcomeGreeting}{welcomeName ? `, ${welcomeName}` : ''}
              </h1>
              <p className="text-[11px] text-cyan-400/55 font-medium leading-tight mt-0.5">Nexus · Orchestrator</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <OrchestrationStatusChip compact variant="minimal" />
              <NexusAgentPresenceStack participants={masterThreadSnapshot.thread.participants} />
              <div className="w-px h-4 bg-white/10" />
              {headerOpsBtn}
              {headerClearBtn}
            </div>
          </div>
        </div>
      </div>

      {/* Chat area — fills remaining space */}
      <div className="flex-1 min-h-0 flex flex-col relative pt-2">
        <ClarificationHintBanner hint={clarificationHint} onDismiss={dismissClarificationHint} />
        <NexusChat
          ai={{
            ...ai,
            messages: ai.messages.filter((m) => {
              if (m.threadId) return m.threadId === currentThreadId;
              return currentThreadId === 'nexus.dashboard';
            }),
            // Disable edit/retry in the Nexus dashboard because messages are filtered
            // by thread; setMessages operates on the full history and is not safe here.
            setMessages: undefined,
            handleSendMessage: handleSendWithRouting,
            isProcessing: ai.isProcessing || isNexusBusy,
          }}
          agentName={agentName}
          themeColor="cyan"
          placeholder="Message Nexus…"
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
