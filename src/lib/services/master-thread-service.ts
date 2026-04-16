import type {
  ApprovalRequirement,
  HistoryMode,
  MasterThreadAuthor,
  MasterThreadMessage,
  MasterThreadTurn,
  MutationProposal,
  OrchestrationActionRuntimeEntry,
  OrchestrationTurnRuntimeSummary,
  PatientScope,
  ProposalCard,
  SpecialistConsultationArtifact,
  ThreadExecutionArtifact,
  ThreadParticipantInclusionReason,
  ThreadParticipant,
  ThreadParticipantPresence,
  ThreadResolutionState,
} from '@/lib/contracts/orchestration';
import type { ExecutionMode } from '@/lib/contracts/orchestration';
import {
  compareMasterThreadAuthors,
  compareMasterThreadMessages,
  compareMasterThreadTurns,
} from '@/lib/contracts/orchestration';
import { resolveConversationalActorIdentity } from '@/lib/agent-identity';
import { stripInternalTags } from '@/lib/ai-adapters/sanitize';
import type { ModuleId } from '@/lib/module-manifest';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import type { RoutineProposal } from '@/lib/routines/routine-types';
import type { ThreadPlanningSuggestionDraft } from '@/lib/stores/orchestration-store';
import type { Message, MessageContent } from '@/lib/types';
import { ThreadParticipantServiceJs } from '@/cortex-bridge/cortex-logic-runtime';

// Singleton JS bridge — null when the KMP bundle hasn't been built yet (dev boot path).
const _ps = ThreadParticipantServiceJs
  ? new (ThreadParticipantServiceJs as new () => any)()
  : null;

export interface MasterThreadState {
  threadId: string;
  participants: ThreadParticipant[];
  turns: MasterThreadTurn[];
  messages: MasterThreadMessage[];
  proposals: MutationProposal[];
  resolution: ThreadResolutionState;
}

export type MasterThreadProposalLifecycle =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'auto_approved'
  | 'deferred'
  | 'analysis_only'
  | 'ghost_executed'
  | 'blocked';

export interface MasterThreadProposalSurface {
  id: string;
  proposalId: string;
  title: string;
  summary: string;
  source: ProposalCard['source'];
  status: ProposalCard['status'];
  lifecycle: MasterThreadProposalLifecycle;
  approvalRequirement: ApprovalRequirement;
  executionMode: ExecutionMode;
  historyMode: HistoryMode;
  dispatchStatus: OrchestrationActionRuntimeEntry['dispatchStatus'] | 'transient';
  runtimeDisposition: OrchestrationActionRuntimeEntry['runtime']['disposition'] | 'transient';
  createdAt: string;
  mutable: boolean;
  origin: 'runtime' | 'shell';
  kind: 'routing_suggestion' | 'planning_heuristic' | 'conflict' | 'document_analysis' | 'cross_module_consult' | 'routine_proposal' | 'runtime_action';
  targetModuleId?: ModuleId;
  editReason?: string | null;
  editableFields: Array<'target' | 'reason'>;
  controls: {
    approve: boolean;
    defer: boolean;
    dismiss: boolean;
    reroute: boolean;
    edit: boolean;
  };
}

export interface MasterThreadShellSnapshot {
  thread: MasterThreadState;
  proposalCard: ProposalCard | null;
  proposals: MasterThreadProposalSurface[];
  activeProposalId: string | null;
  runtimeSummary: OrchestrationTurnRuntimeSummary | null;
  aliveContext: OrchestrationTurnRuntimeSummary['aliveContext'];
  mutationSupport: 'transient_only' | 'none';
}

export interface CreateAraShellThreadSnapshotInput {
  threadId: string;
  now: string;
  seedParticipants?: ThreadParticipant[];
  seedMessages?: MasterThreadMessage[];
  seedTurns?: MasterThreadTurn[];
  liveChatMessages?: Message[];
  liveStreamingAssistantText?: string | null;
  liveChatAssistantSource?: ModuleId | 'ara';
  pendingTargets?: ModuleId[];
  mentionedParticipants?: ModuleId[];
  routingSuggestion?: {
    target: ModuleId;
    reason?: string;
  } | null;
  routingSuggestionState?: 'draft' | 'deferred';
  routineProposal?: RoutineProposal | null;
  planningProposal?: ThreadPlanningSuggestionDraft | null;
  docUploadBusy?: boolean;
  docStageLabel?: string | null;
  isConflictBlocking?: boolean;
  patientScope?: PatientScope;
  lastTurnRuntime?: OrchestrationTurnRuntimeSummary | null;
}

const PROPOSAL_PRIORITY: Record<MasterThreadProposalLifecycle, number> = {
  pending_approval: 0,
  blocked: 1,
  draft: 2,
  deferred: 3,
  analysis_only: 4,
  approved: 5,
  auto_approved: 6,
  ghost_executed: 7,
};

export class MasterThreadService {
  static createAraShellSnapshot(input: CreateAraShellThreadSnapshotInput): MasterThreadShellSnapshot {
    const patientScope = input.patientScope ?? 'USER';
    const shellProposalState = input.routingSuggestionState ?? 'draft';
    let thread = this.pruneStaleParticipants(
      this.createThread(input.threadId, input.now, input.seedParticipants ?? []),
      input.now,
    );
    const projectedLiveChatMessages = this.projectConversationMessages(input.threadId, input.liveChatMessages ?? [], {
      assistantSource: input.liveChatAssistantSource ?? 'ara',
      now: input.now,
      streamingAssistantText: input.liveStreamingAssistantText ?? null,
    });
    const seedMessages = [...(input.seedMessages ?? []), ...projectedLiveChatMessages];

    if (seedMessages.length > 0) {
      thread = this.appendMessages(thread, seedMessages);
    } else if ((input.seedTurns?.length ?? 0) > 0) {
      thread = {
        ...thread,
        turns: [...(input.seedTurns ?? [])].sort(compareMasterThreadTurns),
      };
    }

    thread = this.joinParticipant(thread, {
      moduleId: 'ara',
      role: 'primary',
      joinedAt: this.findExistingParticipant(thread, 'ara')?.joinedAt ?? input.now,
      state: 'active',
      presence: 'online',
      lastActiveAt: input.now,
    });

    for (const message of thread.messages) {
      const messageParticipantIds = [
        ...(message.author === 'user' || message.author === 'system' ? [] : [message.author]),
        ...message.participantIds,
      ];
      const inclusionReasons = this.inferInclusionReasonsFromMessage(message);
      for (const participantId of messageParticipantIds) {
        thread = this.joinParticipant(thread, {
          moduleId: participantId,
          role: participantId === 'ara' ? 'primary' : 'secondary',
          joinedAt: this.findExistingParticipant(thread, participantId)?.joinedAt ?? message.createdAt,
          state: 'joined',
          presence: 'online',
          lastActiveAt: message.createdAt,
          inclusionReasons,
        });
      }
    }

    for (const target of input.pendingTargets ?? []) {
      thread = this.joinParticipant(thread, {
        moduleId: target,
        role: 'secondary',
        joinedAt: this.findExistingParticipant(thread, target)?.joinedAt ?? input.now,
        state: 'waiting',
        presence: 'idle',
        inclusionReasons: ['delegated'],
      });
    }

    // Expire any previous-turn mention-only invites before processing current mentions.
    // A participant whose only reason for being here is that they were mentioned in a prior
    // turn — and who never progressed to 'joined'/'active'/'waiting' — is removed so the
    // thread doesn't accumulate stale observers across topics. If the same module is
    // mentioned again this turn the loop below will re-invite it cleanly.
    for (const p of [...thread.participants]) {
      if (
        p.state === 'invited' &&
        p.inclusionReasons !== undefined &&
        p.inclusionReasons.length > 0 &&
        p.inclusionReasons.every((r) => r === 'mentioned')
      ) {
        thread = this.leaveParticipant(thread, {
          moduleId: p.moduleId,
          role: p.role,
          leftAt: input.now,
          state: 'left',
        });
      }
    }

    for (const participantId of input.mentionedParticipants ?? []) {
      if (participantId === 'ara') continue;
      thread = this.inviteParticipant(thread, {
        moduleId: participantId,
        role: 'secondary',
        invitedAt: input.now,
        inclusionReasons: ['mentioned'],
      });
    }

    if (input.routingSuggestion?.target) {
      if (shellProposalState === 'deferred') {
        // User dismissed the routing proposal ("Stay Here") or auto-dismiss fired.
        // The user is staying in Ara — bring the agent INTO the master thread so
        // Ara can consult it inline. Do NOT dismiss it.
        thread = this.joinParticipant(thread, {
          moduleId: input.routingSuggestion.target,
          role: 'secondary',
          joinedAt: this.findExistingParticipant(thread, input.routingSuggestion.target)?.joinedAt ?? input.now,
          state: 'waiting',
          presence: 'idle',
          inclusionReasons: ['consulted'],
        });
      } else {
        thread = this.inviteParticipant(thread, {
          moduleId: input.routingSuggestion.target,
          role: 'secondary',
          invitedAt: input.now,
          inclusionReasons: ['delegated'],
        });
      }
    }

    if (input.routineProposal?.routine.moduleId) {
      thread = this.joinParticipant(thread, {
        moduleId: input.routineProposal.routine.moduleId,
        role: 'secondary',
        joinedAt: this.findExistingParticipant(thread, input.routineProposal.routine.moduleId)?.joinedAt ?? input.now,
        state: 'joined',
        presence: 'idle',
      });
    }

    if (input.planningProposal?.targetModuleId) {
      thread = this.inviteParticipant(thread, {
        moduleId: input.planningProposal.targetModuleId,
        role: 'secondary',
        joinedAt: this.findExistingParticipant(thread, input.planningProposal.targetModuleId)?.joinedAt ?? input.now,
        invitedAt: input.now,
      });
    }

    const runtimeParticipantIds = this.collectRuntimeParticipantIds(input.lastTurnRuntime);
    for (const participantId of runtimeParticipantIds) {
      thread = this.joinParticipant(thread, {
        moduleId: participantId,
        role: 'secondary',
        joinedAt: this.findExistingParticipant(thread, participantId)?.joinedAt ?? input.now,
        state: 'joined',
        presence: 'online',
        inclusionReasons: ['runtime'],
      });
    }

    const shellProposal = this.buildShellProposal(input, patientScope);
    const shellProposalSurface = shellProposal
      ? this.buildShellProposalSurface(shellProposal, input, shellProposalState)
      : null;
    const runtimeProposals = this.buildRuntimeProposalSurfaces(input.lastTurnRuntime);
    const proposals = this.sortProposalSurfaces([
      ...(shellProposalSurface ? [shellProposalSurface] : []),
      ...runtimeProposals,
    ]);
    const activeProposal = proposals[0] ?? null;
    const proposalCard = activeProposal ? this.toProposalCard(activeProposal) : null;

    thread = {
      ...thread,
      proposals: this.buildThreadProposals({
        now: input.now,
        shellProposal,
        runtimeProposals,
      }),
      resolution: {
        threadId: thread.threadId,
        status: this.deriveResolutionStatus(proposals, input.lastTurnRuntime),
        lastUpdatedAt: this.deriveLastUpdatedAt(input.now, proposals, input.lastTurnRuntime),
        winningProposalId: activeProposal?.proposalId,
      },
      participants: thread.participants.map((participant) => ({
        ...participant,
        ...this.deriveParticipantStatus(participant, {
          proposals,
          pendingTargets: input.pendingTargets ?? [],
          routingSuggestionTarget: input.routingSuggestion?.target ?? null,
          routingSuggestionState: shellProposalState,
          resolutionStatus: this.deriveResolutionStatus(proposals, input.lastTurnRuntime),
          now: input.now,
        }),
      })),
    };

    thread = this.appendMessages(thread, this.buildSynthesizedThreadMessages(thread, input));

    return {
      thread,
      proposalCard,
      proposals,
      activeProposalId: activeProposal?.id ?? null,
      runtimeSummary: input.lastTurnRuntime ?? null,
      aliveContext: input.lastTurnRuntime?.aliveContext ?? null,
      mutationSupport: proposals.some((proposal) => proposal.mutable) ? 'transient_only' : 'none',
    };
  }

  static createThread(threadId: string, createdAt: string, participants: ThreadParticipant[] = []): MasterThreadState {
    return {
      threadId,
      participants: participants.length > 0 ? this.sortParticipants(participants.map((participant) => this.normalizeParticipant(participant))) : [],
      turns: [],
      messages: [],
      proposals: [],
      resolution: {
        threadId,
        status: 'open',
        lastUpdatedAt: createdAt,
      },
    };
  }

  static inviteParticipant(
    state: MasterThreadState,
    participant: Pick<ThreadParticipant, 'moduleId' | 'role'> &
      Partial<Omit<ThreadParticipant, 'moduleId' | 'role'>> & {
        invitedAt: string;
      },
  ): MasterThreadState {
    if (_ps) {
      // Restore leftAt (not in Kotlin model) from original participants
      const leftAtMap = new Map(state.participants.map((p) => [p.moduleId, p.leftAt]));
      const updated: ThreadParticipant[] = JSON.parse(
        (_ps as any).inviteParticipant(
          JSON.stringify(state.participants),
          participant.moduleId,
          participant.invitedAt,
          JSON.stringify(participant.inclusionReasons ?? []),
          participant.state ?? null,
        ),
      );
      const participants = updated.map((p) =>
        leftAtMap.has(p.moduleId) && leftAtMap.get(p.moduleId)
          ? { ...p, leftAt: leftAtMap.get(p.moduleId) }
          : p,
      );
      return { ...state, participants };
    }
    const existing = this.findExistingParticipant(state, participant.moduleId);
    // Never downgrade a participant that is already in an active/waiting/joined state.
    // This prevents 'invited' from overwriting 'waiting' when a new routing proposal
    // fires for a module that has already been deferred and is being consulted inline.
    const ACTIVE_STATES: ReadonlySet<string> = new Set(['waiting', 'joined', 'active']);
    const resolvedState = existing && ACTIVE_STATES.has(existing.state)
      ? existing.state
      : (participant.state ?? 'invited');
    return this.upsertParticipant(state, {
      ...existing,
      moduleId: participant.moduleId,
      role: participant.role ?? existing?.role ?? 'secondary',
      joinedAt: existing?.joinedAt ?? participant.joinedAt ?? participant.invitedAt,
      state: resolvedState,
      presence: participant.presence ?? 'idle',
      invitedAt: participant.invitedAt,
      inclusionReasons: this.mergeInclusionReasons(existing?.inclusionReasons, participant.inclusionReasons),
      lastActiveAt: participant.lastActiveAt ?? existing?.lastActiveAt,
      leftAt: participant.leftAt,
    }, participant.invitedAt);
  }

  static joinParticipant(state: MasterThreadState, participant: ThreadParticipant): MasterThreadState {
    if (_ps) {
      const updated: ThreadParticipant[] = JSON.parse(
        (_ps as any).joinParticipant(
          JSON.stringify(state.participants),
          participant.moduleId,
          participant.joinedAt,
          participant.state,
          JSON.stringify(participant.inclusionReasons ?? []),
          participant.lastActiveAt ?? null,
        ),
      );
      // joining participant clears leftAt; restore leftAt for all other participants
      const leftAtMap = new Map(state.participants.map((p) => [p.moduleId, p.leftAt]));
      const participants = updated.map((p) =>
        p.moduleId !== participant.moduleId && leftAtMap.has(p.moduleId) && leftAtMap.get(p.moduleId)
          ? { ...p, leftAt: leftAtMap.get(p.moduleId) }
          : p,
      );
      return { ...state, participants };
    }
    const existing = this.findExistingParticipant(state, participant.moduleId);
    const nextState = participant.state === 'invited' ? 'joined' : participant.state;
    return this.upsertParticipant(state, {
      ...existing,
      ...participant,
      role: participant.role ?? existing?.role ?? 'secondary',
      joinedAt: existing?.joinedAt ?? participant.joinedAt,
      state: nextState,
      presence: participant.presence ?? this.defaultPresenceForState(nextState),
      inclusionReasons: this.mergeInclusionReasons(existing?.inclusionReasons, participant.inclusionReasons),
      invitedAt: participant.invitedAt ?? existing?.invitedAt,
      lastActiveAt:
        participant.lastActiveAt ??
        (nextState === 'active' || nextState === 'joined' ? participant.joinedAt : existing?.lastActiveAt),
      leftAt: undefined,
    }, participant.joinedAt);
  }

  static leaveParticipant(
    state: MasterThreadState,
    participant: Pick<ThreadParticipant, 'moduleId' | 'role'> &
      Partial<Omit<ThreadParticipant, 'moduleId' | 'role'>> & {
        leftAt: string;
        state?: Extract<ThreadParticipant['state'], 'dismissed' | 'left'>;
      },
  ): MasterThreadState {
    if (_ps) {
      const updated: ThreadParticipant[] = JSON.parse(
        (_ps as any).leaveParticipant(
          JSON.stringify(state.participants),
          participant.moduleId,
          participant.state ?? 'left',
        ),
      );
      // Set leftAt on the leaving participant (not in Kotlin model); restore for others
      const leftAtMap = new Map(state.participants.map((p) => [p.moduleId, p.leftAt]));
      const participants = updated.map((p) => {
        if (p.moduleId === participant.moduleId) return { ...p, leftAt: participant.leftAt };
        const prev = leftAtMap.get(p.moduleId);
        return prev ? { ...p, leftAt: prev } : p;
      });
      return { ...state, participants };
    }
    const existing = this.findExistingParticipant(state, participant.moduleId);
    return this.upsertParticipant(state, {
      ...existing,
      moduleId: participant.moduleId,
      role: participant.role ?? existing?.role ?? 'secondary',
      joinedAt: existing?.joinedAt ?? participant.joinedAt ?? participant.leftAt,
      state: participant.state ?? 'left',
      presence: 'offline',
      inclusionReasons: this.mergeInclusionReasons(existing?.inclusionReasons, participant.inclusionReasons),
      invitedAt: participant.invitedAt ?? existing?.invitedAt,
      lastActiveAt: participant.lastActiveAt ?? existing?.lastActiveAt,
      leftAt: participant.leftAt,
    }, participant.leftAt);
  }

  /**
   * Removes `'invited'` participants that have been waiting longer than `staleInviteMs`
   * (default 2 minutes) without progressing to any active state. Ara is always kept.
   * Called at the top of createAraShellSnapshot to prevent stale seeds from accumulating
   * across turns.
   */
  static pruneStaleParticipants(
    state: MasterThreadState,
    nowIso: string,
    staleInviteMs = 2 * 60 * 1000,
  ): MasterThreadState {
    if (_ps) {
      const pruned: ThreadParticipant[] = JSON.parse(
        (_ps as any).pruneStaleParticipants(
          JSON.stringify(state.participants),
          nowIso,
          staleInviteMs,
        ),
      );
      if (pruned.length === state.participants.length) return state;
      // Restore leftAt (not in Kotlin model) for surviving participants
      const leftAtMap = new Map(state.participants.map((p) => [p.moduleId, p.leftAt]));
      const participants = pruned.map((p) => {
        const prev = leftAtMap.get(p.moduleId);
        return prev ? { ...p, leftAt: prev } : p;
      });
      return { ...state, participants };
    }
    const nowMs = new Date(nowIso).getTime();
    const pruned = state.participants.filter((p) => {
      if (p.moduleId === 'ara') return true;
      if (p.state !== 'invited') return true;
      const invitedMs = new Date(p.invitedAt ?? nowIso).getTime();
      return nowMs - invitedMs < staleInviteMs;
    });
    if (pruned.length === state.participants.length) return state;
    return { ...state, participants: pruned };
  }

  static appendMessage(state: MasterThreadState, message: MasterThreadMessage): MasterThreadState {
    return this.appendMessages(state, [message]);
  }

  static appendMessages(state: MasterThreadState, messages: MasterThreadMessage[]): MasterThreadState {
    if (messages.length === 0) return state;

    const orderedMessages = [...messages].sort((left, right) => {
      const createdAtDelta = left.createdAt.localeCompare(right.createdAt);
      if (createdAtDelta !== 0) return createdAtDelta;

      const replyToDelta = (left.replyToMessageId ?? '').localeCompare(right.replyToMessageId ?? '');
      if (replyToDelta !== 0) return replyToDelta;

      const authorDelta = compareMasterThreadAuthors(left.author, right.author);
      if (authorDelta !== 0) return authorDelta;

      return left.id.localeCompare(right.id);
    });

    return orderedMessages.reduce((nextState, nextMessage) => this.appendSingleMessage(nextState, nextMessage), state);
  }

  static projectConversationMessages(
    threadId: string,
    history: Message[],
    options?: {
      assistantSource?: ModuleId | 'ara';
      now?: string;
      streamingAssistantText?: string | null;
    },
  ): MasterThreadMessage[] {
    const assistantSource = options?.assistantSource ?? 'ara';
    const projectedHistory = history.flatMap((message, index) => {
      if (message.role !== 'user' && message.role !== 'assistant') return [];
      
      // Thread Isolation: Only project messages belonging to this thread.
      // Messages with NO threadId are treated as legacy or dashboard-only.
      if (message.threadId) {
        if (message.threadId !== threadId) return [];
      } else if (threadId !== 'ara.dashboard') {
        return [];
      }

      const body = this.normalizeConversationBody(message.role, message.content);
      if (!body) return [];

      const author = message.role === 'user' ? 'user' : assistantSource;
      const createdAt = this.resolveConversationMessageTimestamp(message.timestamp, index, options?.now);
      const idSuffix = message.role === 'user' ? 'user' : assistantSource;

      return [{
        id: `${threadId}.message.chat.${String(index + 1).padStart(4, '0')}.${idSuffix}`,
        threadId,
        author,
        kind: 'conversation',
        body,
        createdAt,
        participantIds: message.role === 'assistant' ? [assistantSource] : [],
        actor: message.role === 'assistant' ? message.actor : undefined,
        dedupeKey: `${threadId}|chat|${index}|${idSuffix}|${body}`,
      } satisfies MasterThreadMessage];
    });

    const streamingBody = this.normalizeConversationBody('assistant', options?.streamingAssistantText ?? '');
    if (!streamingBody) return projectedHistory;

    return [
      ...projectedHistory,
      {
        id: `${threadId}.message.chat.streaming.${assistantSource}`,
        threadId,
        author: assistantSource,
        kind: 'conversation',
        body: streamingBody,
        createdAt: this.resolveConversationMessageTimestamp(undefined, projectedHistory.length, options?.now),
        participantIds: [assistantSource],
        dedupeKey: `${threadId}|chat|streaming|${assistantSource}`,
      },
    ];
  }

  static projectConsultationArtifacts(
    threadId: string,
    artifacts: SpecialistConsultationArtifact[],
  ): MasterThreadMessage[] {
    return artifacts.flatMap((artifact) => {
      const requestMessage: MasterThreadMessage = {
        id: `${artifact.id}.request`,
        threadId,
        author: 'ara',
        kind: 'consultation_request',
        body: artifact.question,
        createdAt: artifact.requestedAt,
        participantIds: [artifact.targetModuleId],
        consultation: artifact,
        dedupeKey: `${artifact.id}|request`,
      };

      const resultMessage: MasterThreadMessage = {
        id: `${artifact.id}.result`,
        threadId,
        author: artifact.status === 'completed' ? artifact.targetModuleId : 'system',
        kind: artifact.status === 'completed' ? 'consultation_result' : 'consultation_failure',
        body: artifact.responseText ?? artifact.summary,
        createdAt: artifact.resolvedAt,
        participantIds: [artifact.targetModuleId],
        consultation: artifact,
        replyToMessageId: requestMessage.id,
        dedupeKey: `${artifact.id}|result|${artifact.status}`,
      };

      return [requestMessage, resultMessage];
    });
  }

  static mergeMessages(
    threadId: string,
    existingMessages: MasterThreadMessage[],
    incomingMessages: MasterThreadMessage[],
    now: string,
  ): MasterThreadMessage[] {
    let state = this.createThread(threadId, now);
    state = this.appendMessages(state, existingMessages);
    state = this.appendMessages(state, incomingMessages);
    return state.messages;
  }

  private static appendSingleMessage(state: MasterThreadState, message: MasterThreadMessage): MasterThreadState {
    const normalizedMessage = this.normalizeMessage(state, message);
    const duplicate = state.messages.find((entry) => this.isDuplicateMessage(entry, normalizedMessage));

    if (duplicate && duplicate.id !== normalizedMessage.id) {
      return state;
    }

    const nextMessages = this.sortMessages([
      ...state.messages.filter((entry) => entry.id !== normalizedMessage.id),
      normalizedMessage,
    ]);
    const nextTurns = this.rebuildTurns(state.threadId, nextMessages);

    return {
      ...state,
      turns: nextTurns,
      messages: nextMessages,
      resolution: {
        ...state.resolution,
        lastUpdatedAt:
          state.resolution.lastUpdatedAt.localeCompare(normalizedMessage.createdAt) > 0
            ? state.resolution.lastUpdatedAt
            : normalizedMessage.createdAt,
      },
    };
  }

  static upsertProposal(state: MasterThreadState, proposal: MutationProposal): MasterThreadState {
    const proposals = [...state.proposals.filter((entry) => entry.id !== proposal.id), proposal].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );

    return {
      ...state,
      proposals,
      resolution: {
        ...state.resolution,
        status: proposal.requiresApproval ? 'awaiting_approval' : state.resolution.status,
        lastUpdatedAt: proposal.createdAt,
      },
    };
  }

  static resolveThread(
    state: MasterThreadState,
    input: {
      status: ThreadResolutionState['status'];
      winningProposalId?: string;
      updatedAt: string;
    },
  ): MasterThreadState {
    return {
      ...state,
      resolution: {
        threadId: state.threadId,
        status: input.status,
        winningProposalId: input.winningProposalId,
        lastUpdatedAt: input.updatedAt,
      },
      participants: state.participants.map((participant) => ({
        ...participant,
        state:
          input.status === 'open' || input.status === 'awaiting_approval'
            ? participant.state
            : participant.state === 'dismissed' || participant.state === 'left'
              ? participant.state
              : 'resolved',
        presence:
          participant.state === 'dismissed' || participant.state === 'left'
            ? 'offline'
            : input.status === 'open' || input.status === 'awaiting_approval'
              ? participant.presence
              : 'idle',
      })),
    };
  }

  static buildProposalCard(
    proposal: MutationProposal,
    options: {
      title: string;
      summary: string;
      approvalRequirement: ApprovalRequirement;
      executionMode: ExecutionMode;
      historyMode: HistoryMode;
      status?: ProposalCard['status'];
    },
  ): ProposalCard {
    return {
      id: `card.${proposal.id}`,
      proposalId: proposal.id,
      title: options.title,
      summary: options.summary,
      source: proposal.source === 'ara' ? 'ara' : proposal.source,
      status: options.status ?? (options.approvalRequirement.required ? 'pending_approval' : 'approved'),
      approvalRequirement: options.approvalRequirement,
      executionMode: options.executionMode,
      historyMode: options.historyMode,
    };
  }

  private static sortParticipants(participants: ThreadParticipant[]): ThreadParticipant[] {
    return [...participants].sort((left, right) => {
      if (left.role !== right.role) {
        if (left.role === 'primary') return -1;
        if (right.role === 'primary') return 1;
      }
      if (left.state !== right.state) {
        const stateDelta = this.getParticipantStateSortRank(left.state) - this.getParticipantStateSortRank(right.state);
        if (stateDelta !== 0) return stateDelta;
      }
      return left.joinedAt.localeCompare(right.joinedAt);
    });
  }

  private static buildShellProposal(
    input: CreateAraShellThreadSnapshotInput,
    patientScope: PatientScope,
  ): MutationProposal | null {
    if (input.isConflictBlocking) {
      return {
        id: `${input.threadId}.proposal.conflict`,
        source: 'ara',
        intent: 'Resolve active orchestration conflict',
        confidence: 0.95,
        requiresApproval: true,
        patientScope,
        createdAt: input.now,
        metadata: {
          kind: 'conflict',
        },
      };
    }

    if (input.routingSuggestion?.target) {
      return {
        id: `${input.threadId}.proposal.route.${input.routingSuggestion.target}`,
        source: 'ara',
        intent: `Route conversation to ${input.routingSuggestion.target}`,
        confidence: 0.78,
        patientScope,
        createdAt: input.now,
        metadata: {
          kind: 'routing_suggestion',
          reason: input.routingSuggestion.reason,
          target: input.routingSuggestion.target,
        },
      };
    }

    if (input.routineProposal) {
      return {
        id: input.routineProposal.id,
        source: input.routineProposal.routine.moduleId,
        intent: `Confirm routine ${input.routineProposal.routine.name}`,
        confidence: 0.81,
        requiresApproval: true,
        patientScope,
        createdAt: input.routineProposal.routine.updatedAt,
        metadata: {
          kind: 'routine_proposal',
          target: input.routineProposal.routine.moduleId,
          routineId: input.routineProposal.routine.id,
          routineName: input.routineProposal.routine.name,
          routineCategory: input.routineProposal.routine.category ?? null,
          triggerType: input.routineProposal.routine.trigger.type,
        },
      };
    }

    if (input.planningProposal) {
      return {
        id: input.planningProposal.id,
        source: 'ara',
        intent: input.planningProposal.title,
        confidence: 0.72,
        patientScope,
        createdAt: input.now,
        metadata: {
          kind: 'planning_heuristic',
          target: input.planningProposal.targetModuleId,
          summary: input.planningProposal.summary,
          prompt: input.planningProposal.prompt,
          nodeCount: input.planningProposal.nodeCount ?? null,
          supportingTargets: input.planningProposal.supportingModuleIds ?? [],
          sourceSignals: input.planningProposal.sourceSignalIds,
          state: input.planningProposal.state,
        },
      };
    }

    if (input.docUploadBusy) {
      return {
        id: `${input.threadId}.proposal.document-analysis`,
        source: 'ara',
        intent: 'Analyze uploaded documents',
        confidence: 0.83,
        patientScope,
        createdAt: input.now,
        metadata: {
          kind: 'document_analysis',
          label: input.docStageLabel ?? null,
        },
      };
    }

    const [firstPendingTarget] = input.pendingTargets ?? [];
    if (!firstPendingTarget) {
      return null;
    }

    return {
      id: `${input.threadId}.proposal.consult.${firstPendingTarget}`,
      source: 'ara',
      intent: `Consult ${firstPendingTarget}`,
      confidence: 0.74,
      patientScope,
      createdAt: input.now,
      metadata: {
        kind: 'cross_module_consult',
        target: firstPendingTarget,
        targets: input.pendingTargets ?? [],
      },
    };
  }

  private static buildShellProposalSurface(
    proposal: MutationProposal,
    input: CreateAraShellThreadSnapshotInput,
    routingSuggestionState: 'draft' | 'deferred',
  ): MasterThreadProposalSurface {
    const card = this.buildShellProposalCard(proposal, input, routingSuggestionState);
    const kind = proposal.metadata?.kind;

    let lifecycle: MasterThreadProposalLifecycle = 'approved';
    if (card.status === 'pending_approval') lifecycle = 'pending_approval';
    else if (card.status === 'blocked') lifecycle = 'blocked';
    else if (card.status === 'deferred') lifecycle = 'deferred';
    else if (card.status === 'draft') lifecycle = 'draft';

    return {
      id: card.id,
      proposalId: proposal.id,
      title: card.title,
      summary: card.summary,
      source: card.source,
      status: card.status,
      lifecycle,
      approvalRequirement: card.approvalRequirement,
      executionMode: card.executionMode,
      historyMode: card.historyMode,
      dispatchStatus: 'transient',
      runtimeDisposition: 'transient',
      createdAt: proposal.createdAt,
      mutable: kind === 'routing_suggestion' || kind === 'planning_heuristic',
      origin: 'shell',
      kind:
        kind === 'conflict' || kind === 'document_analysis' || kind === 'cross_module_consult' || kind === 'routing_suggestion' || kind === 'routine_proposal' || kind === 'planning_heuristic'
          ? kind
          : 'runtime_action',
      targetModuleId: typeof proposal.metadata?.target === 'string' ? (proposal.metadata.target as ModuleId) : undefined,
      editReason: typeof proposal.metadata?.reason === 'string' ? proposal.metadata.reason : null,
      editableFields: kind === 'routing_suggestion' ? ['target', 'reason'] : [],
      controls:
        kind === 'routing_suggestion'
          ? {
              approve: true,
              defer: true,
              dismiss: true,
              reroute: true,
              edit: true,
            }
          : kind === 'planning_heuristic'
            ? {
                approve: true,
                defer: true,
                dismiss: true,
                reroute: false,
                edit: false,
              }
          : kind === 'routine_proposal'
            ? {
                approve: true,
                defer: false,
                dismiss: true,
                reroute: false,
                edit: false,
              }
          : {
              approve: false,
              defer: false,
              dismiss: false,
              reroute: false,
              edit: false,
            },
    };
  }

  private static buildShellProposalCard(
    proposal: MutationProposal,
    input: CreateAraShellThreadSnapshotInput,
    routingSuggestionState: 'draft' | 'deferred',
  ): ProposalCard {
    if (input.isConflictBlocking) {
      return this.buildProposalCard(proposal, {
        title: 'Resolve conflict before continuing',
        summary: 'Master Thread is paused until the active cross-module conflict is acknowledged.',
        approvalRequirement: { required: true, reason: 'conflict' },
        executionMode: 'manual',
        historyMode: 'standard',
        status: 'pending_approval',
      });
    }

    if (input.routingSuggestion?.target) {
      const moduleName = MODULE_MANIFEST[input.routingSuggestion.target]?.alias ?? input.routingSuggestion.target;
      return this.buildProposalCard(proposal, {
        title: `Route to ${moduleName}`,
        summary:
          input.routingSuggestion.reason ?? `${moduleName} is the current best-fit participant for this request.`,
        approvalRequirement: { required: false, reason: 'none' },
        executionMode: 'assisted',
        historyMode: 'standard',
        status: routingSuggestionState,
      });
    }

    if (input.routineProposal) {
      const moduleName = MODULE_MANIFEST[input.routineProposal.routine.moduleId]?.alias ?? input.routineProposal.routine.moduleId;
      const triggerLabel =
        input.routineProposal.routine.trigger.type === 'action'
          ? `Runs ${input.routineProposal.routine.trigger.actionType}.`
          : input.routineProposal.routine.trigger.type === 'spine_event'
            ? `Emits ${input.routineProposal.routine.trigger.spineEventType}.`
            : 'Creates a recurring routine entry.';
      return this.buildProposalCard(proposal, {
        title: `Confirm routine: ${input.routineProposal.routine.name}`,
        summary:
          input.routineProposal.routine.description ??
          `${moduleName} proposed a recurring routine. ${triggerLabel}`,
        approvalRequirement: { required: true, reason: 'explicit_gate' },
        executionMode: 'manual',
        historyMode: 'standard',
        status: 'pending_approval',
      });
    }

    if (input.planningProposal) {
      const moduleName = input.planningProposal.targetModuleId
        ? MODULE_MANIFEST[input.planningProposal.targetModuleId]?.alias ?? input.planningProposal.targetModuleId
        : 'Ara';
      const stepSummary = input.planningProposal.nodeCount && input.planningProposal.nodeCount > 1
        ? ` ${input.planningProposal.nodeCount} coordinated steps are ready.`
        : '';
      const supportSummary = (input.planningProposal.supportingModuleIds?.length ?? 0) > 0
        ? ` Supporting agents: ${input.planningProposal.supportingModuleIds
          ?.map((moduleId) => MODULE_MANIFEST[moduleId]?.alias ?? moduleId)
          .join(', ')}.`
        : '';
      return this.buildProposalCard(proposal, {
        title: input.planningProposal.title,
        summary: `${input.planningProposal.summary}${stepSummary} ${moduleName} can turn this into a draft plan.${supportSummary}`.trim(),
        approvalRequirement: { required: false, reason: 'none' },
        executionMode: 'assisted',
        historyMode: 'standard',
        status: input.planningProposal.state,
      });
    }

    if (input.docUploadBusy) {
      return this.buildProposalCard(proposal, {
        title: 'Document analysis in progress',
        summary: input.docStageLabel ?? 'Preparing document context for the Master Thread.',
        approvalRequirement: { required: false, reason: 'none' },
        executionMode: 'analysis_only',
        historyMode: 'standard',
        status: 'approved',
      });
    }

    const [firstPendingTarget] = input.pendingTargets ?? [];
    const moduleName = firstPendingTarget ? MODULE_MANIFEST[firstPendingTarget]?.alias ?? firstPendingTarget : 'module';
    return this.buildProposalCard(proposal, {
      title: `Waiting on ${moduleName}`,
      summary: 'Ara has delegated work and is waiting for the responding module to return.',
      approvalRequirement: { required: false, reason: 'none' },
      executionMode: 'assisted',
      historyMode: 'standard',
      status: 'approved',
    });
  }

  private static buildRuntimeProposalSurfaces(
    runtimeSummary?: OrchestrationTurnRuntimeSummary | null,
  ): MasterThreadProposalSurface[] {
    if (!runtimeSummary) return [];

    return runtimeSummary.actions.map((action, index) => {
      const lifecycle = this.deriveLifecycleFromRuntime(action);
      return {
        id: `runtime.${action.proposalId}.${index}`,
        proposalId: action.proposalId,
        title: action.label,
        summary: this.describeRuntimeAction(action, lifecycle),
        source: action.source,
        status: this.toProposalCardStatus(lifecycle),
        lifecycle,
        approvalRequirement: action.approvalRequirement,
        executionMode: action.executionMode,
        historyMode: action.historyMode,
        dispatchStatus: action.dispatchStatus,
        runtimeDisposition: action.runtime.disposition,
        createdAt: action.executedAt ?? '1970-01-01T00:00:00.000Z',
        mutable: false,
        origin: 'runtime',
        kind: 'runtime_action',
        editableFields: [],
        controls: {
          approve: false,
          defer: false,
          dismiss: false,
          reroute: false,
          edit: false,
        },
      };
    });
  }

  private static buildThreadProposals(input: {
    now: string;
    shellProposal: MutationProposal | null;
    runtimeProposals: MasterThreadProposalSurface[];
  }): MutationProposal[] {
    const runtime = input.runtimeProposals.map<MutationProposal>((proposal) => ({
      id: proposal.proposalId,
      source: proposal.source,
      intent: proposal.title,
      confidence: 0.5,
      requiresApproval: proposal.lifecycle === 'pending_approval',
      patientScope: 'USER',
      createdAt: proposal.createdAt.includes('T') ? proposal.createdAt : input.now,
      metadata: {
        summary: proposal.summary,
        lifecycle: proposal.lifecycle,
        executionMode: proposal.executionMode,
        historyMode: proposal.historyMode,
        dispatchStatus: proposal.dispatchStatus,
      },
    }));

    const proposals = [...runtime, ...(input.shellProposal ? [input.shellProposal] : [])];
    return proposals.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  private static deriveLifecycleFromRuntime(
    action: OrchestrationActionRuntimeEntry,
  ): MasterThreadProposalLifecycle {
    if (
      action.executionStatus === 'failed' ||
      action.executionStatus === 'failed_escalated' ||
      action.runtime.disposition === 'incident_review' ||
      action.status === 'failed' ||
      action.status === 'incident'
    ) {
      return 'blocked';
    }
    if (action.dispatchStatus === 'awaiting_approval') return 'pending_approval';
    if (action.dispatchStatus === 'blocked') return 'blocked';
    if (action.dispatchStatus === 'analysis_only' || action.dispatchStatus === 'ephemeral') return 'analysis_only';
    if (action.executionMode === 'ghost' || action.runtime.disposition === 'silent_execution') return 'ghost_executed';
    if (action.executionMode === 'autonomous') return 'auto_approved';
    return 'approved';
  }

  private static describeRuntimeAction(
    action: OrchestrationActionRuntimeEntry,
    lifecycle: MasterThreadProposalLifecycle,
  ): string {
    const executionLabel = this.labelize(action.executionMode);
    const historyLabel = action.historyMode === 'silent' ? 'silent audit' : 'visible history';

    switch (lifecycle) {
      case 'pending_approval':
        return `${action.summary} Approval is still required before this proposal can execute.`;
      case 'blocked':
        return action.executionStatus === 'failed' || action.executionStatus === 'failed_escalated'
          ? `${action.summary} Execution failed and is now held for orchestration incident review.`
          : `${action.summary} Execution is blocked under the current orchestration policy.`;
      case 'analysis_only':
        return `${action.summary} Captured as analysis-only runtime output and not executed.`;
      case 'ghost_executed':
        return `${action.summary} Executed in Ghost mode with ${historyLabel}.`;
      case 'auto_approved':
        return `${action.summary} Auto-approved and executed via ${executionLabel} runtime.`;
      default:
        return `${action.summary} Executed via ${executionLabel} runtime.`;
    }
  }

  private static deriveResolutionStatus(
    proposals: MasterThreadProposalSurface[],
    runtimeSummary?: OrchestrationTurnRuntimeSummary | null,
  ): ThreadResolutionState['status'] {
    if (proposals.some((proposal) => proposal.lifecycle === 'pending_approval')) return 'awaiting_approval';
    if (proposals.some((proposal) => proposal.lifecycle === 'blocked')) return 'blocked';
    if (proposals.some((proposal) => proposal.lifecycle === 'draft')) return 'open';
    if (
      proposals.some((proposal) => proposal.lifecycle === 'deferred' || proposal.lifecycle === 'analysis_only') ||
      (runtimeSummary?.counts.analysisOnly ?? 0) > 0 ||
      (runtimeSummary?.counts.ephemeral ?? 0) > 0
    ) {
      return 'deferred';
    }
    if (
      proposals.some(
        (proposal) =>
          proposal.lifecycle === 'approved' ||
          proposal.lifecycle === 'auto_approved' ||
          proposal.lifecycle === 'ghost_executed',
      ) ||
      ((runtimeSummary?.counts.visibleExecutions ?? 0) > 0 || (runtimeSummary?.counts.silentExecutions ?? 0) > 0)
    ) {
      return 'executed';
    }
    return 'open';
  }

  private static deriveLastUpdatedAt(
    fallback: string,
    proposals: MasterThreadProposalSurface[],
    runtimeSummary?: OrchestrationTurnRuntimeSummary | null,
  ): string {
    const timestamps = proposals
      .map((proposal) => proposal.createdAt)
      .filter((value) => value.includes('T'));
    const runtimeTimestamps = runtimeSummary?.actions
      .map((action) => action.executedAt)
      .filter((value): value is string => Boolean(value)) ?? [];
    return [...timestamps, ...runtimeTimestamps, fallback].sort().at(-1) ?? fallback;
  }

  private static deriveParticipantStatus(
    participant: ThreadParticipant,
    input: {
      proposals: MasterThreadProposalSurface[];
      pendingTargets: ModuleId[];
      routingSuggestionTarget: ModuleId | null;
      routingSuggestionState: 'draft' | 'deferred';
      resolutionStatus: ThreadResolutionState['status'];
      now: string;
    },
  ): Pick<ThreadParticipant, 'state' | 'presence' | 'lastActiveAt' | 'leftAt'> {
    if (participant.moduleId === 'ara') {
      return {
        state: input.resolutionStatus === 'executed' || input.resolutionStatus === 'deferred' ? 'resolved' : 'active',
        presence: 'online',
        lastActiveAt: input.now,
        leftAt: undefined,
      };
    }

    if (
      input.routingSuggestionTarget === participant.moduleId &&
      input.routingSuggestionState === 'deferred'
    ) {
      return {
        state: 'dismissed',
        presence: 'offline',
        lastActiveAt: participant.lastActiveAt,
        leftAt: participant.leftAt ?? input.now,
      };
    }

    if (
      input.routingSuggestionTarget === participant.moduleId &&
      input.routingSuggestionState === 'draft' &&
      !input.pendingTargets.includes(participant.moduleId as ModuleId)
    ) {
      return {
        state: 'invited',
        presence: 'idle',
        lastActiveAt: participant.lastActiveAt,
        leftAt: undefined,
      };
    }

    if (input.pendingTargets.includes(participant.moduleId as ModuleId)) {
      return {
        state: 'waiting',
        presence: 'idle',
        lastActiveAt: participant.lastActiveAt,
        leftAt: undefined,
      };
    }

    const proposalForParticipant = input.proposals.find((proposal) => proposal.source === participant.moduleId);
    if (proposalForParticipant) {
      if (proposalForParticipant.lifecycle === 'pending_approval' || proposalForParticipant.lifecycle === 'blocked') {
        return {
          state: 'active',
          presence: 'online',
          lastActiveAt: proposalForParticipant.createdAt,
          leftAt: undefined,
        };
      }

      return {
        state: 'resolved',
        presence: 'idle',
        lastActiveAt: proposalForParticipant.createdAt,
        leftAt: undefined,
      };
    }

    if (participant.state === 'dismissed' || participant.state === 'left') {
      return {
        state: participant.state,
        presence: 'offline',
        lastActiveAt: participant.lastActiveAt,
        leftAt: participant.leftAt,
      };
    }

    return {
      state: participant.state,
      presence: participant.presence,
      lastActiveAt: participant.lastActiveAt,
      leftAt: participant.leftAt,
    };
  }

  private static sortProposalSurfaces(proposals: MasterThreadProposalSurface[]): MasterThreadProposalSurface[] {
    return [...proposals].sort((left, right) => {
      const priorityDelta = PROPOSAL_PRIORITY[left.lifecycle] - PROPOSAL_PRIORITY[right.lifecycle];
      if (priorityDelta !== 0) return priorityDelta;
      return right.createdAt.localeCompare(left.createdAt);
    });
  }

  private static toProposalCard(proposal: MasterThreadProposalSurface): ProposalCard {
    return {
      id: proposal.id,
      proposalId: proposal.proposalId,
      title: proposal.title,
      summary: proposal.summary,
      source: proposal.source,
      status: proposal.status,
      approvalRequirement: proposal.approvalRequirement,
      executionMode: proposal.executionMode,
      historyMode: proposal.historyMode,
    };
  }

  private static toProposalCardStatus(lifecycle: MasterThreadProposalLifecycle): ProposalCard['status'] {
    switch (lifecycle) {
      case 'draft':
        return 'draft';
      case 'pending_approval':
        return 'pending_approval';
      case 'blocked':
      case 'analysis_only':
        return 'blocked';
      case 'deferred':
        return 'deferred';
      case 'ghost_executed':
        return 'executed';
      default:
        return 'approved';
    }
  }

  private static labelize(value: string): string {
    return value.replace(/_/g, ' ');
  }

  private static normalizeParticipant(participant: ThreadParticipant): ThreadParticipant {
    const identity = resolveConversationalActorIdentity({
      moduleId: participant.moduleId === 'ara' ? 'ara' : participant.moduleId,
      actorId: participant.actorId,
      actorLabel: participant.actorLabel,
      actorShortLabel: participant.actorShortLabel,
    });
    return {
      ...participant,
      presence: participant.presence ?? this.defaultPresenceForState(participant.state),
      inclusionReasons: this.normalizeInclusionReasons(participant.inclusionReasons),
      actorId: participant.actorId ?? identity.id,
      actorLabel: participant.actorLabel ?? identity.label,
      actorShortLabel: participant.actorShortLabel ?? identity.shortLabel,
    };
  }

  private static normalizeMessage(state: MasterThreadState, message: MasterThreadMessage): MasterThreadMessage {
    const existing = state.messages.find((entry) => entry.id === message.id);
    const parentMessage = message.replyToMessageId
      ? state.messages.find((entry) => entry.id === message.replyToMessageId)
      : undefined;
    const turnSequence = this.resolveMessageTurnSequence(state, message, existing, parentMessage);
    const turnId = this.resolveMessageTurnId(state.threadId, message, existing, parentMessage, turnSequence);
    const participantIds = this.normalizeParticipantIds(message.participantIds);
    const replyToTurnId = message.replyToTurnId ?? parentMessage?.turnId;
    const rootTurnId = message.rootTurnId ?? parentMessage?.rootTurnId ?? parentMessage?.turnId ?? turnId;
    const rootMessageId = message.rootMessageId ?? parentMessage?.rootMessageId ?? parentMessage?.id ?? message.id;
    const identity = resolveConversationalActorIdentity({
      source: message.author,
      actorId: message.actor?.actorId,
      actorLabel: message.actor?.actorLabel,
      actorShortLabel: message.actor?.actorShortLabel,
    });

    return {
      ...existing,
      ...message,
      threadId: state.threadId,
      kind: message.kind ?? existing?.kind ?? 'conversation',
      participantIds,
      actor: {
        actorId: message.actor?.actorId ?? existing?.actor?.actorId ?? identity.id,
        actorLabel: message.actor?.actorLabel ?? existing?.actor?.actorLabel ?? identity.label,
        actorShortLabel: message.actor?.actorShortLabel ?? existing?.actor?.actorShortLabel ?? identity.shortLabel,
      },
      turnId,
      turnSequence,
      replyToTurnId,
      rootTurnId,
      rootMessageId,
      dedupeKey: message.dedupeKey ?? existing?.dedupeKey ?? this.buildMessageDedupeKey(message, turnId, rootTurnId),
    };
  }

  private static resolveMessageTurnSequence(
    state: MasterThreadState,
    message: MasterThreadMessage,
    existing?: MasterThreadMessage,
    parentMessage?: MasterThreadMessage,
  ): number {
    if (typeof message.turnSequence === 'number' && Number.isFinite(message.turnSequence)) {
      return message.turnSequence;
    }
    if (typeof existing?.turnSequence === 'number' && Number.isFinite(existing.turnSequence)) {
      return existing.turnSequence;
    }
    if (message.turnId) {
      const existingTurn = state.turns.find((turn) => turn.id === message.turnId);
      if (existingTurn) return existingTurn.sequence;
    }
    if (parentMessage?.turnSequence !== undefined) {
      return parentMessage.turnSequence + 1;
    }

    return this.getNextTurnSequence(state);
  }

  private static resolveMessageTurnId(
    threadId: string,
    message: MasterThreadMessage,
    existing: MasterThreadMessage | undefined,
    parentMessage: MasterThreadMessage | undefined,
    turnSequence: number,
  ): string {
    if (message.turnId) return message.turnId;
    if (existing?.turnId) return existing.turnId;
    if (parentMessage && parentMessage.turnSequence === turnSequence && parentMessage.turnId) {
      return parentMessage.turnId;
    }
    return `${threadId}.turn.${String(turnSequence).padStart(4, '0')}`;
  }

  private static buildMessageDedupeKey(
    message: Pick<MasterThreadMessage, 'author' | 'kind' | 'body' | 'participantIds' | 'proposalId' | 'replyToMessageId'>,
    turnId: string,
    rootTurnId: string,
  ): string {
    return [
      message.author,
      message.kind ?? 'conversation',
      message.body.trim(),
      message.proposalId ?? '',
      message.replyToMessageId ?? '',
      turnId,
      rootTurnId,
      this.normalizeParticipantIds(message.participantIds).join(','),
    ].join('|');
  }

  private static normalizeParticipantIds(participantIds: Array<ModuleId | 'ara'>): Array<ModuleId | 'ara'> {
    return [...new Set(participantIds)].sort((left, right) => compareMasterThreadAuthors(left, right));
  }

  private static isDuplicateMessage(left: MasterThreadMessage, right: MasterThreadMessage): boolean {
    if (left.id === right.id) return true;
    if (left.dedupeKey && right.dedupeKey && left.dedupeKey === right.dedupeKey) return true;

    return (
      left.author === right.author &&
      (left.kind ?? 'conversation') === (right.kind ?? 'conversation') &&
      left.body.trim() === right.body.trim() &&
      left.proposalId === right.proposalId &&
      left.replyToMessageId === right.replyToMessageId &&
      left.turnId === right.turnId &&
      left.rootTurnId === right.rootTurnId
    );
  }

  private static sortMessages(messages: MasterThreadMessage[]): MasterThreadMessage[] {
    return [...messages].sort(compareMasterThreadMessages);
  }

  private static rebuildTurns(threadId: string, messages: MasterThreadMessage[]): MasterThreadTurn[] {
    const turns = new Map<string, MasterThreadTurn>();

    for (const message of this.sortMessages(messages)) {
      if (!message.turnId || message.turnSequence === undefined) continue;

      const existingTurn = turns.get(message.turnId);
      const participants = this.normalizeParticipantIds([
        ...((existingTurn?.participantIds ?? []) as Array<ModuleId | 'ara'>),
        ...message.participantIds,
        ...this.toTurnParticipantIds(message.author),
      ]);
      const messageIds = [...new Set([...(existingTurn?.messageIds ?? []), message.id])];
      const startedBy =
        existingTurn?.startedBy ??
        (message.author === 'user' || message.author === 'system' || message.author === 'ara'
          ? message.author
          : message.author);

      turns.set(message.turnId, {
        id: message.turnId,
        threadId,
        sequence: existingTurn?.sequence ?? message.turnSequence,
        startedBy,
        participantIds: participants,
        createdAt: existingTurn?.createdAt ?? message.createdAt,
        updatedAt:
          existingTurn && existingTurn.updatedAt.localeCompare(message.createdAt) > 0
            ? existingTurn.updatedAt
            : message.createdAt,
        messageIds,
        replyToTurnId: existingTurn?.replyToTurnId ?? message.replyToTurnId,
        rootTurnId: existingTurn?.rootTurnId ?? message.rootTurnId ?? message.turnId,
      });
    }

    return [...turns.values()]
      .map((turn) => ({
        ...turn,
        messageIds: this.sortMessages(messages.filter((message) => turn.messageIds.includes(message.id))).map((message) => message.id),
      }))
      .sort(compareMasterThreadTurns);
  }

  private static toTurnParticipantIds(author: MasterThreadAuthor): Array<ModuleId | 'ara'> {
    if (author === 'user' || author === 'system') return [];
    return [author];
  }

  private static getNextTurnSequence(state: MasterThreadState): number {
    const maxFromTurns = state.turns.reduce((max, turn) => Math.max(max, turn.sequence), 0);
    const maxFromMessages = state.messages.reduce((max, message) => Math.max(max, message.turnSequence ?? 0), 0);
    return Math.max(maxFromTurns, maxFromMessages) + 1;
  }

  private static upsertParticipant(
    state: MasterThreadState,
    participant: ThreadParticipant,
    updatedAt: string,
  ): MasterThreadState {
    const withoutExisting = state.participants.filter((entry) => entry.moduleId !== participant.moduleId);
    return {
      ...state,
      participants: this.sortParticipants([...withoutExisting, this.normalizeParticipant(participant)]),
      resolution: {
        ...state.resolution,
        lastUpdatedAt: updatedAt,
      },
    };
  }

  private static defaultPresenceForState(state: ThreadParticipant['state']): ThreadParticipantPresence {
    switch (state) {
      case 'dismissed':
      case 'left':
        return 'offline';
      case 'invited':
      case 'waiting':
      case 'resolved':
        return 'idle';
      default:
        return 'online';
    }
  }

  private static findExistingParticipant(
    state: Pick<MasterThreadState, 'participants'>,
    moduleId: ThreadParticipant['moduleId'],
  ): ThreadParticipant | undefined {
    return state.participants.find((participant) => participant.moduleId === moduleId);
  }

  private static collectRuntimeParticipantIds(
    runtimeSummary?: OrchestrationTurnRuntimeSummary | null,
  ): ModuleId[] {
    if (!runtimeSummary) return [];

    const participants = new Set<ModuleId>();
    for (const action of runtimeSummary.actions) {
      if (action.source !== 'ara') {
        participants.add(action.source);
      }
    }

    if (runtimeSummary.moduleId !== 'ara' && runtimeSummary.moduleId in MODULE_MANIFEST) {
      participants.add(runtimeSummary.moduleId as ModuleId);
    }

    return [...participants];
  }

  private static inferInclusionReasonsFromMessage(
    message: Pick<MasterThreadMessage, 'kind'>,
  ): ThreadParticipantInclusionReason[] {
    switch (message.kind) {
      case 'consultation_request':
      case 'consultation_result':
      case 'consultation_failure':
        return ['consulted'];
      case 'execution_request':
      case 'execution_result':
      case 'execution_failure':
        return ['delegated'];
      default:
        return [];
    }
  }

  private static mergeInclusionReasons(
    existing?: ThreadParticipantInclusionReason[],
    next?: ThreadParticipantInclusionReason[],
  ): ThreadParticipantInclusionReason[] {
    return this.normalizeInclusionReasons([...(existing ?? []), ...(next ?? [])]);
  }

  private static normalizeInclusionReasons(
    reasons?: ThreadParticipantInclusionReason[],
  ): ThreadParticipantInclusionReason[] {
    const order: Record<ThreadParticipantInclusionReason, number> = {
      mentioned: 0,
      consulted: 1,
      delegated: 2,
      runtime: 3,
    };

    return [...new Set((reasons ?? []).filter(Boolean))].sort((left, right) => order[left] - order[right]);
  }

  private static normalizeConversationBody(
    role: Extract<Message['role'], 'user' | 'assistant'>,
    content: MessageContent | string,
  ): string {
    const text = this.messageContentToText(content);
    if (!text.trim()) return '';
    if (role === 'user') return text.trim();

    const stripped = stripInternalTags(text, { retainSpacings: true }).publicText
      .replace(/<analysis>[\s\S]*?<\/analysis>/gi, ' ')
      .replace(/<analysis>[\s\S]*$/gi, ' ')
      .trim();
    return stripped || text.trim();
  }

  private static messageContentToText(content: MessageContent | string): string {
    if (typeof content === 'string') return content;

    return content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join(' ');
  }

  private static resolveConversationMessageTimestamp(
    timestamp: string | number | undefined,
    index: number,
    fallbackNow?: string,
  ): string {
    if (typeof timestamp === 'string') {
      const parsed = new Date(timestamp);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }

    const base = fallbackNow && !Number.isNaN(new Date(fallbackNow).getTime())
      ? new Date(fallbackNow)
      : new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
    return new Date(base.getTime() + index * 1000).toISOString();
  }

  private static buildSynthesizedThreadMessages(
    state: MasterThreadState,
    input: CreateAraShellThreadSnapshotInput,
  ): MasterThreadMessage[] {
    return [
      ...this.buildRuntimeSynthesisMessages(state, input.lastTurnRuntime),
      ...this.buildConflictSynthesisMessages(state, input),
    ];
  }

  private static buildRuntimeSynthesisMessages(
    state: MasterThreadState,
    runtimeSummary?: OrchestrationTurnRuntimeSummary | null,
  ): MasterThreadMessage[] {
    if (!runtimeSummary) return [];
    if (runtimeSummary.actions.length === 0 && !runtimeSummary.aliveContext) return [];

    const actionParticipants = this.collectRuntimeParticipantIds(runtimeSummary);
    const aliveParticipants = this.normalizeParticipantIds([
      ...(runtimeSummary.aliveContext?.moduleIds ?? []),
      'ara',
    ]);
    const rootParticipants = this.normalizeParticipantIds([
      ...actionParticipants,
      ...aliveParticipants,
      'ara',
    ]);

    const anchorCreatedAt = this.resolveSynthesisAnchorTimestamp(state, runtimeSummary);
    const synthesisKey = this.buildRuntimeSynthesisKey(runtimeSummary);
    const baseTurnSequence = this.getNextTurnSequence(state);
    const summaryMessageId = `${state.threadId}.message.runtime.${synthesisKey}.summary`;
    const summaryMessage = this.buildSynthesisMessage(state, {
      id: summaryMessageId,
      author: 'ara',
      createdAt: anchorCreatedAt,
      turnSequence: baseTurnSequence,
      participantIds: rootParticipants,
      dedupeKey: `${state.threadId}|runtime|${synthesisKey}|summary`,
      body: this.describeRuntimeSynthesis(runtimeSummary, rootParticipants),
    });

    const messages: MasterThreadMessage[] = [summaryMessage];
    const orderedActions = [...runtimeSummary.actions].sort((left, right) => {
      const executedAtDelta = (left.executedAt ?? '').localeCompare(right.executedAt ?? '');
      if (executedAtDelta !== 0) return executedAtDelta;
      const sourceDelta = compareMasterThreadAuthors(left.source, right.source);
      if (sourceDelta !== 0) return sourceDelta;
      return left.proposalId.localeCompare(right.proposalId);
    });

    orderedActions.forEach((action, index) => {
      const actionCreatedAt = this.bumpIsoTimestamp(anchorCreatedAt, index + 1);
      messages.push(this.buildSynthesisMessage(state, {
        id: `${state.threadId}.message.runtime.${synthesisKey}.action.${index + 1}`,
        author: action.source,
        createdAt: actionCreatedAt,
        turnSequence: baseTurnSequence + index + 1,
        participantIds: this.normalizeParticipantIds([
          ...(action.source === 'ara' ? [] : [action.source]),
          'ara',
        ]),
        proposalId: action.proposalId,
        replyToMessageId: summaryMessageId,
        dedupeKey: `${state.threadId}|runtime|${synthesisKey}|action|${action.proposalId}|${action.dispatchStatus}|${action.executedAt ?? index}`,
        body: this.describeRuntimeActionMessage(action),
      }));
    });

    if (runtimeSummary.aliveContext && runtimeSummary.aliveContext.total > 0) {
      messages.push(this.buildSynthesisMessage(state, {
        id: `${state.threadId}.message.runtime.${synthesisKey}.alive`,
        author: 'system',
        createdAt: this.bumpIsoTimestamp(anchorCreatedAt, orderedActions.length + 1),
        turnSequence: baseTurnSequence + orderedActions.length + 1,
        participantIds: aliveParticipants,
        replyToMessageId: summaryMessageId,
        dedupeKey: `${state.threadId}|runtime|${synthesisKey}|alive|${runtimeSummary.aliveContext.lastUpdatedAt ?? 'none'}`,
        body: this.describeAliveContextMessage(runtimeSummary),
      }));
    }

    return messages;
  }

  static projectExecutionArtifacts(
    threadId: string,
    artifacts: ThreadExecutionArtifact[],
  ): MasterThreadMessage[] {
    const messages: MasterThreadMessage[] = [];
    for (const artifact of artifacts) {
      const sourceAuthor = artifact.sourceModuleId === 'ara' ? 'ara' : artifact.sourceModuleId;
      const retryPrefix = artifact.retryAttempt ? `Retry ${artifact.retryAttempt} · ` : '';
      const parentResultMessageId = artifact.retryParentExecutionId
        ? `execution.${artifact.retryParentExecutionId.replace(/\.execution$/, '')}.result`
        : undefined;
      messages.push({
        id: `${artifact.id}.request`,
        threadId,
        author: sourceAuthor,
        kind: 'execution_request',
        body: `${retryPrefix}Execute ${artifact.actionType.replace(/_/g, ' ')}.`,
        createdAt: artifact.requestedAt,
        participantIds: artifact.sourceModuleId === 'ara' ? ['ara'] : [artifact.sourceModuleId, 'ara'],
        execution: artifact,
        replyToMessageId: parentResultMessageId,
        dedupeKey: `execution:${artifact.executionId}:request`,
      });
      messages.push({
        id: `${artifact.id}.result`,
        threadId,
        author: sourceAuthor,
        kind: artifact.status === 'executed' ? 'execution_result' : 'execution_failure',
        body: [
          artifact.errorMessage?.trim() || artifact.summary,
          artifact.retryable ? artifact.retrySummary ?? 'Retry available.' : null,
        ]
          .filter((part): part is string => Boolean(part))
          .join(' '),
        createdAt: artifact.resolvedAt,
        participantIds: artifact.sourceModuleId === 'ara' ? ['ara'] : [artifact.sourceModuleId, 'ara'],
        execution: artifact,
        proposalId: artifact.proposalId,
        replyToMessageId: `${artifact.id}.request`,
        dedupeKey: `execution:${artifact.executionId}:${artifact.status}`,
      });
    }
    return messages;
  }

  private static buildConflictSynthesisMessages(
    state: MasterThreadState,
    input: CreateAraShellThreadSnapshotInput,
  ): MasterThreadMessage[] {
    if (!input.isConflictBlocking) return [];

    const conflictMessageId = `${state.threadId}.message.conflict.active`;
    return [
      this.buildSynthesisMessage(state, {
        id: conflictMessageId,
        author: 'system',
        createdAt: input.now,
        turnSequence: this.getNextTurnSequence(state),
        participantIds: this.normalizeParticipantIds(state.participants.map((participant) => participant.moduleId)),
        dedupeKey: `${state.threadId}|conflict|active`,
        body: 'Conflict surfaced in the Master Thread. Ara is holding execution until the active cross-agent disagreement is resolved.',
      }),
    ];
  }

  private static buildSynthesisMessage(
    state: MasterThreadState,
    message: Omit<MasterThreadMessage, 'threadId'> & Partial<Pick<MasterThreadMessage, 'threadId'>>,
  ): MasterThreadMessage {
    const existing = state.messages.find((entry) => entry.id === message.id);
    return {
      ...message,
      threadId: state.threadId,
      createdAt: existing?.createdAt ?? message.createdAt,
      turnId: existing?.turnId ?? message.turnId,
      turnSequence: existing?.turnSequence ?? message.turnSequence,
      replyToTurnId: existing?.replyToTurnId ?? message.replyToTurnId,
      rootMessageId: existing?.rootMessageId ?? message.rootMessageId,
      rootTurnId: existing?.rootTurnId ?? message.rootTurnId,
      participantIds: this.normalizeParticipantIds(message.participantIds),
      dedupeKey: existing?.dedupeKey ?? message.dedupeKey,
    };
  }

  private static resolveSynthesisAnchorTimestamp(
    state: MasterThreadState,
    runtimeSummary: OrchestrationTurnRuntimeSummary,
  ): string {
    const runtimeTimestamps = runtimeSummary.actions
      .map((action) => action.executedAt)
      .filter((value): value is string => Boolean(value));
    const earliestRuntimeTimestamp = [...runtimeTimestamps, runtimeSummary.aliveContext?.lastUpdatedAt ?? '']
      .filter((value): value is string => value.includes('T'))
      .sort()
      .at(0);

    if (earliestRuntimeTimestamp) return earliestRuntimeTimestamp;

    const synthesisKey = this.buildRuntimeSynthesisKey(runtimeSummary);
    const existingSummaryMessage = state.messages.find(
      (message) => message.id === `${state.threadId}.message.runtime.${synthesisKey}.summary`,
    );

    return existingSummaryMessage?.createdAt ?? '1970-01-01T00:00:00.000Z';
  }

  private static buildRuntimeSynthesisKey(runtimeSummary: OrchestrationTurnRuntimeSummary): string {
    return this.hashDeterministicString([
      runtimeSummary.moduleId,
      String(runtimeSummary.autopilotLevel),
      runtimeSummary.historyMode,
      runtimeSummary.activeThreadId ?? '',
      runtimeSummary.actions
        .map((action) => [
          action.proposalId,
          action.source,
          action.dispatchStatus,
          action.executionMode,
          action.historyMode,
          action.executedAt ?? '',
          action.approvalRequirement.reason,
          action.runtime.disposition,
        ].join(':'))
        .join('|'),
      runtimeSummary.aliveContext
        ? [
            runtimeSummary.aliveContext.total,
            runtimeSummary.aliveContext.lastUpdatedAt ?? '',
            runtimeSummary.aliveContext.moduleIds.join(','),
            runtimeSummary.aliveContext.tags.join(','),
          ].join('|')
        : 'no-alive-context',
    ].join('||'));
  }

  private static hashDeterministicString(value: string): string {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  private static bumpIsoTimestamp(base: string, offsetMs: number): string {
    const timestamp = Date.parse(base);
    if (Number.isNaN(timestamp)) return base;
    return new Date(timestamp + offsetMs).toISOString();
  }

  private static describeRuntimeSynthesis(
    runtimeSummary: OrchestrationTurnRuntimeSummary,
    participantIds: Array<ModuleId | 'ara'>,
  ): string {
    const actionCount = runtimeSummary.actions.length;
    const participantSummary = participantIds
      .filter((participantId) => participantId !== 'ara')
      .map((participantId) => MODULE_MANIFEST[participantId]?.alias ?? participantId)
      .join(', ');
    const countFragments = [
      actionCount > 0 ? `${actionCount} runtime action${actionCount === 1 ? '' : 's'}` : null,
      runtimeSummary.counts.awaitingApproval > 0
        ? `${runtimeSummary.counts.awaitingApproval} pending approval`
        : null,
      runtimeSummary.counts.silentExecutions > 0
        ? `${runtimeSummary.counts.silentExecutions} ghost/silent`
        : null,
      runtimeSummary.counts.analysisOnly > 0
        ? `${runtimeSummary.counts.analysisOnly} analysis-only`
        : null,
      runtimeSummary.counts.blocked > 0 ? `${runtimeSummary.counts.blocked} blocked` : null,
      runtimeSummary.counts.failed > 0 ? `${runtimeSummary.counts.failed} failed` : null,
      runtimeSummary.counts.escalated > 0 ? `${runtimeSummary.counts.escalated} escalated` : null,
    ].filter((fragment): fragment is string => Boolean(fragment));

    const lead =
      actionCount > 0
        ? `Ara synthesized ${countFragments.join(', ')}${participantSummary ? ` across ${participantSummary}` : ''}.`
        : 'Ara updated the Master Thread context.';

    if (runtimeSummary.aliveContext?.total) {
      return `${lead} Alive context referenced ${runtimeSummary.aliveContext.total} item${runtimeSummary.aliveContext.total === 1 ? '' : 's'}.`;
    }

    return lead;
  }

  private static describeRuntimeActionMessage(action: OrchestrationActionRuntimeEntry): string {
    const rationale = action.summary.trim().endsWith('.') ? action.summary.trim() : `${action.summary.trim()}.`;

    if (action.executionStatus === 'failed' || action.executionStatus === 'failed_escalated') {
      const retryMessage =
        action.failure?.status === 'retry_scheduled' && action.failure.nextRetryAt
          ? ` Retry review is scheduled for ${action.failure.nextRetryAt}.`
          : '';
      const escalationMessage =
        action.failure?.status === 'escalated'
          ? ' This has been escalated for manual recovery.'
          : ' This is held in orchestration review.';
      return `I attempted ${action.label}. ${rationale} Execution failed.${retryMessage}${escalationMessage}`;
    }

    switch (action.dispatchStatus) {
      case 'awaiting_approval':
        return `I proposed ${action.label}. ${rationale} Waiting for approval because ${this.labelize(action.approvalRequirement.reason)}.`;
      case 'blocked':
        return `I reviewed ${action.label}. ${rationale} Execution is blocked because ${this.labelize(action.approvalRequirement.reason)}.`;
      case 'analysis_only':
      case 'ephemeral':
        return `I analyzed ${action.label}. ${rationale} This stayed analysis-only and was not executed.`;
      default:
        if (action.executionMode === 'ghost' || action.runtime.disposition === 'silent_execution') {
          return `I executed ${action.label}. ${rationale} This ran in Ghost mode with ${action.historyMode === 'silent' ? 'silent audit' : 'minimal'} history.`;
        }
        if (action.executionMode === 'autonomous') {
          return `I executed ${action.label}. ${rationale} This was auto-approved in autonomous runtime.`;
        }
        return `I executed ${action.label}. ${rationale} This completed in ${this.labelize(action.executionMode)} runtime.`;
    }
  }

  private static describeAliveContextMessage(runtimeSummary: OrchestrationTurnRuntimeSummary): string {
    const aliveContext = runtimeSummary.aliveContext;
    if (!aliveContext) return 'Alive context consulted for this thread.';

    const moduleSummary = aliveContext.moduleIds
      .map((moduleId) => {
        const references = aliveContext.byModule[moduleId] ?? [];
        const labels = references.slice(0, 2).map((reference) => reference.label).join(', ');
        const moduleLabel = MODULE_MANIFEST[moduleId]?.alias ?? moduleId;
        return labels ? `${moduleLabel}: ${labels}` : moduleLabel;
      })
      .join(' • ');

    return moduleSummary
      ? `Alive context consulted while synthesizing this turn — ${moduleSummary}.`
      : `Alive context consulted while synthesizing this turn (${aliveContext.total} item${aliveContext.total === 1 ? '' : 's'}).`;
  }

  private static getParticipantStateSortRank(state: ThreadParticipant['state']): number {
    switch (state) {
      case 'active':
        return 0;
      case 'waiting':
        return 1;
      case 'joined':
        return 2;
      case 'invited':
        return 3;
      case 'resolved':
        return 4;
      case 'dismissed':
        return 5;
      case 'left':
        return 6;
      default:
        return 7;
    }
  }
}
