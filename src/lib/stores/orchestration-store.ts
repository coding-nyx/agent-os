import { create } from 'zustand';
import type {
  AutopilotLevel,
  HistoryMode,
  OrchestrationTurnRuntimeSummary,
  MasterThreadMessage,
  MasterThreadTurn,
  ThreadParticipant,
} from '@/lib/contracts/orchestration';
import { isAutopilotLevel } from '@/lib/contracts/orchestration';
import type { ModuleId } from '@/lib/module-manifest';
import type { OrchestrationPreferences } from '@/lib/types';

export const DEFAULT_AUTOPILOT_LEVEL: AutopilotLevel = 2;
export const DEFAULT_HISTORY_MODE: HistoryMode = 'standard';

export interface ThreadRoutingSuggestionDraft {
  target: ModuleId;
  reason?: string;
  confidence?: number;
  state: 'draft' | 'deferred';
}

export interface ThreadPlanningSuggestionDraft {
  id: string;
  title: string;
  summary: string;
  prompt: string;
  confidence?: number;
  state: 'draft' | 'deferred';
  targetModuleId?: ModuleId;
  nodeCount?: number;
  supportingModuleIds?: ModuleId[];
  sourceSignalIds: string[];
}

export interface ThreadSnapshotDraft {
  participants: ThreadParticipant[];
  messages: MasterThreadMessage[];
  turns: MasterThreadTurn[];
}

export interface OrchestrationShellState {
  autopilotLevel: AutopilotLevel;
  moduleAutopilotOverrides: Partial<Record<ModuleId, AutopilotLevel>>;
  historyMode: HistoryMode;
  activeThreadId: string | null;
  lastTurnRuntime: OrchestrationTurnRuntimeSummary | null;
  threadParticipantsByThreadId: Record<string, ThreadParticipant[]>;
  threadMessagesByThreadId: Record<string, MasterThreadMessage[]>;
  threadTurnsByThreadId: Record<string, MasterThreadTurn[]>;
  threadRoutingSuggestionByThreadId: Record<string, ThreadRoutingSuggestionDraft | null>;
  threadPlanningSuggestionByThreadId: Record<string, ThreadPlanningSuggestionDraft | null>;
  /** Action types that failed during the current AI response turn. */
  failedActionsThisTurn: string[];
  /** How many actions failed in the previous turn (set when clearTurnFailures is called). */
  lastTurnFailureCount: number;
  /** NSV snapshot taken before a multi-step plan begins; null when no plan is in flight. */
  nsvSnapshot: Record<string, unknown> | null;
  setAutopilotLevel: (level: AutopilotLevel) => void;
  setModuleAutopilotOverride: (moduleId: ModuleId, level: AutopilotLevel | null) => void;
  setHistoryMode: (mode: HistoryMode) => void;
  setActiveThreadId: (threadId: string | null) => void;
  setLastTurnRuntime: (summary: OrchestrationTurnRuntimeSummary | null) => void;
  setThreadParticipants: (threadId: string, participants: ThreadParticipant[]) => void;
  setThreadMessages: (threadId: string, messages: MasterThreadMessage[]) => void;
  setThreadTurns: (threadId: string, turns: MasterThreadTurn[]) => void;
  applyThreadSnapshot: (threadId: string, snapshot: ThreadSnapshotDraft) => void;
  setThreadRoutingSuggestion: (threadId: string, suggestion: ThreadRoutingSuggestionDraft | null) => void;
  patchThreadRoutingSuggestion: (
    threadId: string,
    patch: Partial<Pick<ThreadRoutingSuggestionDraft, 'target' | 'reason' | 'confidence' | 'state'>>,
  ) => void;
  clearThreadRoutingSuggestion: (threadId: string) => void;
  setThreadPlanningSuggestion: (threadId: string, suggestion: ThreadPlanningSuggestionDraft | null) => void;
  patchThreadPlanningSuggestion: (
    threadId: string,
    patch: Partial<Pick<ThreadPlanningSuggestionDraft, 'title' | 'summary' | 'prompt' | 'confidence' | 'state' | 'targetModuleId' | 'nodeCount' | 'supportingModuleIds' | 'sourceSignalIds'>>,
  ) => void;
  clearThreadPlanningSuggestion: (threadId: string) => void;
  /** Appends an action type to the in-progress turn's failure list. */
  recordActionFailure: (actionType: string) => void;
  /** Flushes the current turn's failure list and copies its length to lastTurnFailureCount. */
  clearTurnFailures: () => void;
  /** Saves a shallow snapshot of the NSV before a multi-step plan begins. */
  captureNSVSnapshot: (nsv: Record<string, unknown>) => void;
  /** Clears the snapshot after a plan completes successfully or is abandoned. */
  clearNSVSnapshot: () => void;
  hydrateFromPreferences: (preferences?: OrchestrationPreferences | null) => void;
  resetShell: () => void;
}

export function deriveHistoryMode(level: AutopilotLevel, override?: HistoryMode): HistoryMode {
  if (override) return override;
  return level >= 5 ? 'silent' : 'standard';
}

export function areThreadParticipantsEqual(left: ThreadParticipant[], right: ThreadParticipant[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((participant, index) => {
    const other = right[index];
    if (!other) return false;
      return (
        participant.moduleId === other.moduleId &&
        participant.role === other.role &&
        participant.joinedAt === other.joinedAt &&
        participant.state === other.state &&
        participant.presence === other.presence &&
        (participant.inclusionReasons?.length ?? 0) === (other.inclusionReasons?.length ?? 0) &&
        (participant.inclusionReasons ?? []).every((reason, reasonIndex) => reason === other.inclusionReasons?.[reasonIndex]) &&
        participant.actorId === other.actorId &&
        participant.actorLabel === other.actorLabel &&
        participant.actorShortLabel === other.actorShortLabel &&
        participant.invitedAt === other.invitedAt &&
      participant.lastActiveAt === other.lastActiveAt &&
      participant.leftAt === other.leftAt
    );
  });
}

export function areThreadMessagesEqual(left: MasterThreadMessage[], right: MasterThreadMessage[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((message, index) => {
    const other = right[index];
    if (!other) return false;
    return (
      message.id === other.id &&
      message.threadId === other.threadId &&
      message.author === other.author &&
      (message.kind ?? 'conversation') === (other.kind ?? 'conversation') &&
      message.body === other.body &&
      message.createdAt === other.createdAt &&
      message.actor?.actorId === other.actor?.actorId &&
      message.actor?.actorLabel === other.actor?.actorLabel &&
      message.actor?.actorShortLabel === other.actor?.actorShortLabel &&
      message.consultation?.id === other.consultation?.id &&
      message.consultation?.status === other.consultation?.status &&
      message.consultation?.summary === other.consultation?.summary &&
      message.consultation?.responseText === other.consultation?.responseText &&
      message.consultation?.errorMessage === other.consultation?.errorMessage &&
      message.execution?.id === other.execution?.id &&
      message.execution?.status === other.execution?.status &&
      message.execution?.summary === other.execution?.summary &&
      message.execution?.errorMessage === other.execution?.errorMessage &&
      message.proposalId === other.proposalId &&
      message.turnId === other.turnId &&
      message.turnSequence === other.turnSequence &&
      message.replyToMessageId === other.replyToMessageId &&
      message.replyToTurnId === other.replyToTurnId &&
      message.rootMessageId === other.rootMessageId &&
      message.rootTurnId === other.rootTurnId &&
      message.dedupeKey === other.dedupeKey &&
      message.participantIds.length === other.participantIds.length &&
      message.participantIds.every((participantId, participantIndex) => participantId === other.participantIds[participantIndex])
    );
  });
}

export function areThreadTurnsEqual(left: MasterThreadTurn[], right: MasterThreadTurn[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((turn, index) => {
    const other = right[index];
    if (!other) return false;
    return (
      turn.id === other.id &&
      turn.threadId === other.threadId &&
      turn.sequence === other.sequence &&
      turn.startedBy === other.startedBy &&
      turn.createdAt === other.createdAt &&
      turn.updatedAt === other.updatedAt &&
      turn.replyToTurnId === other.replyToTurnId &&
      turn.rootTurnId === other.rootTurnId &&
      turn.participantIds.length === other.participantIds.length &&
      turn.participantIds.every((participantId, participantIndex) => participantId === other.participantIds[participantIndex]) &&
      turn.messageIds.length === other.messageIds.length &&
      turn.messageIds.every((messageId, messageIndex) => messageId === other.messageIds[messageIndex])
    );
  });
}

function areRoutingSuggestionsEqual(
  left: ThreadRoutingSuggestionDraft | null | undefined,
  right: ThreadRoutingSuggestionDraft | null | undefined,
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.target === right.target && left.reason === right.reason && left.confidence === right.confidence && left.state === right.state;
}

function arePlanningSuggestionsEqual(
  left: ThreadPlanningSuggestionDraft | null | undefined,
  right: ThreadPlanningSuggestionDraft | null | undefined,
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return (
    left.id === right.id &&
      left.title === right.title &&
      left.summary === right.summary &&
      left.prompt === right.prompt &&
      left.confidence === right.confidence &&
      left.state === right.state &&
      left.targetModuleId === right.targetModuleId &&
      left.nodeCount === right.nodeCount &&
      (left.supportingModuleIds?.length ?? 0) === (right.supportingModuleIds?.length ?? 0) &&
      (left.supportingModuleIds ?? []).every((moduleId, index) => moduleId === right.supportingModuleIds?.[index]) &&
    left.sourceSignalIds.length === right.sourceSignalIds.length &&
    left.sourceSignalIds.every((signalId, index) => signalId === right.sourceSignalIds[index])
  );
}

export const useOrchestrationStore = create<OrchestrationShellState>((set) => ({
  autopilotLevel: DEFAULT_AUTOPILOT_LEVEL,
  moduleAutopilotOverrides: {},
  historyMode: DEFAULT_HISTORY_MODE,
  activeThreadId: null,
  lastTurnRuntime: null,
  threadParticipantsByThreadId: {},
  threadMessagesByThreadId: {},
  threadTurnsByThreadId: {},
  threadRoutingSuggestionByThreadId: {},
  threadPlanningSuggestionByThreadId: {},
  failedActionsThisTurn: [],
  lastTurnFailureCount: 0,
  nsvSnapshot: null,
  setAutopilotLevel: (level) =>
    set(() => ({
      autopilotLevel: level,
      historyMode: deriveHistoryMode(level),
    })),
  setModuleAutopilotOverride: (moduleId, level) =>
    set((state) => {
      const overrides = { ...state.moduleAutopilotOverrides };
      if (level === null) {
        delete overrides[moduleId];
      } else {
        overrides[moduleId] = level;
      }
      return { moduleAutopilotOverrides: overrides };
    }),
  setHistoryMode: (mode) => set(() => ({ historyMode: mode })),
  setActiveThreadId: (threadId) => set(() => ({ activeThreadId: threadId })),
  setLastTurnRuntime: (summary) => set(() => ({ lastTurnRuntime: summary })),
  setThreadParticipants: (threadId, participants) =>
    set((state) => {
      const existing = state.threadParticipantsByThreadId[threadId] ?? [];
      if (areThreadParticipantsEqual(existing, participants)) return state;
      return {
        threadParticipantsByThreadId: {
          ...state.threadParticipantsByThreadId,
          [threadId]: participants,
        },
      };
    }),
  setThreadMessages: (threadId, messages) =>
    set((state) => {
      const existing = state.threadMessagesByThreadId[threadId] ?? [];
      if (areThreadMessagesEqual(existing, messages)) return state;
      return {
        threadMessagesByThreadId: {
          ...state.threadMessagesByThreadId,
          [threadId]: messages,
        },
      };
    }),
  setThreadTurns: (threadId, turns) =>
    set((state) => {
      const existing = state.threadTurnsByThreadId[threadId] ?? [];
      if (areThreadTurnsEqual(existing, turns)) return state;
      return {
        threadTurnsByThreadId: {
          ...state.threadTurnsByThreadId,
          [threadId]: turns,
        },
      };
    }),
  applyThreadSnapshot: (threadId, snapshot) =>
    set((state) => {
      const existingParticipants = state.threadParticipantsByThreadId[threadId] ?? [];
      const existingMessages = state.threadMessagesByThreadId[threadId] ?? [];
      const existingTurns = state.threadTurnsByThreadId[threadId] ?? [];
      const participantsChanged = !areThreadParticipantsEqual(existingParticipants, snapshot.participants);
      const messagesChanged = !areThreadMessagesEqual(existingMessages, snapshot.messages);
      const turnsChanged = !areThreadTurnsEqual(existingTurns, snapshot.turns);

      if (!participantsChanged && !messagesChanged && !turnsChanged) {
        return state;
      }

      return {
        threadParticipantsByThreadId: participantsChanged
          ? {
              ...state.threadParticipantsByThreadId,
              [threadId]: snapshot.participants,
            }
          : state.threadParticipantsByThreadId,
        threadMessagesByThreadId: messagesChanged
          ? {
              ...state.threadMessagesByThreadId,
              [threadId]: snapshot.messages,
            }
          : state.threadMessagesByThreadId,
        threadTurnsByThreadId: turnsChanged
          ? {
              ...state.threadTurnsByThreadId,
              [threadId]: snapshot.turns,
            }
          : state.threadTurnsByThreadId,
      };
    }),
  setThreadRoutingSuggestion: (threadId, suggestion) =>
    set((state) => {
      const existing = state.threadRoutingSuggestionByThreadId[threadId] ?? null;
      if (areRoutingSuggestionsEqual(existing, suggestion)) return state;
      return {
        threadRoutingSuggestionByThreadId: {
          ...state.threadRoutingSuggestionByThreadId,
          [threadId]: suggestion,
        },
      };
    }),
  patchThreadRoutingSuggestion: (threadId, patch) =>
    set((state) => {
      const existing = state.threadRoutingSuggestionByThreadId[threadId];
      if (!existing) return state;
      const next: ThreadRoutingSuggestionDraft = {
        ...existing,
        ...patch,
        target: patch.target ?? existing.target,
        state: patch.state ?? existing.state,
      };
      if (areRoutingSuggestionsEqual(existing, next)) return state;
      return {
        threadRoutingSuggestionByThreadId: {
          ...state.threadRoutingSuggestionByThreadId,
          [threadId]: next,
        },
      };
    }),
  clearThreadRoutingSuggestion: (threadId) =>
    set((state) => {
      if (!(threadId in state.threadRoutingSuggestionByThreadId) || state.threadRoutingSuggestionByThreadId[threadId] === null) {
        return state;
      }
      return {
        threadRoutingSuggestionByThreadId: {
          ...state.threadRoutingSuggestionByThreadId,
          [threadId]: null,
        },
      };
    }),
  setThreadPlanningSuggestion: (threadId, suggestion) =>
    set((state) => {
      const existing = state.threadPlanningSuggestionByThreadId[threadId] ?? null;
      if (arePlanningSuggestionsEqual(existing, suggestion)) return state;
      return {
        threadPlanningSuggestionByThreadId: {
          ...state.threadPlanningSuggestionByThreadId,
          [threadId]: suggestion,
        },
      };
    }),
  patchThreadPlanningSuggestion: (threadId, patch) =>
    set((state) => {
      const existing = state.threadPlanningSuggestionByThreadId[threadId];
      if (!existing) return state;
      const next: ThreadPlanningSuggestionDraft = {
        ...existing,
        ...patch,
        state: patch.state ?? existing.state,
        targetModuleId: patch.targetModuleId ?? existing.targetModuleId,
        nodeCount: patch.nodeCount ?? existing.nodeCount,
        supportingModuleIds: patch.supportingModuleIds ?? existing.supportingModuleIds,
        sourceSignalIds: patch.sourceSignalIds ?? existing.sourceSignalIds,
      };
      if (arePlanningSuggestionsEqual(existing, next)) return state;
      return {
        threadPlanningSuggestionByThreadId: {
          ...state.threadPlanningSuggestionByThreadId,
          [threadId]: next,
        },
      };
    }),
  clearThreadPlanningSuggestion: (threadId) =>
    set((state) => {
      if (!(threadId in state.threadPlanningSuggestionByThreadId) || state.threadPlanningSuggestionByThreadId[threadId] === null) {
        return state;
      }
      return {
        threadPlanningSuggestionByThreadId: {
          ...state.threadPlanningSuggestionByThreadId,
          [threadId]: null,
        },
      };
    }),
  recordActionFailure: (actionType) =>
    set((state) => ({
      failedActionsThisTurn: [...state.failedActionsThisTurn, actionType],
    })),
  clearTurnFailures: () =>
    set((state) => ({
      lastTurnFailureCount: state.failedActionsThisTurn.length,
      failedActionsThisTurn: [],
    })),
  captureNSVSnapshot: (nsv) =>
    set(() => ({
      nsvSnapshot: nsv,
    })),
  clearNSVSnapshot: () =>
    set(() => ({
      nsvSnapshot: null,
    })),
  hydrateFromPreferences: (preferences) => {
    const rawLevel = preferences?.autopilotLevel ?? DEFAULT_AUTOPILOT_LEVEL;
    const autopilotLevel = isAutopilotLevel(rawLevel) ? rawLevel : DEFAULT_AUTOPILOT_LEVEL;
    set(() => ({
      autopilotLevel,
      historyMode: deriveHistoryMode(autopilotLevel, preferences?.historyMode),
    }));
  },
  resetShell: () =>
    set(() => ({
      autopilotLevel: DEFAULT_AUTOPILOT_LEVEL,
      historyMode: DEFAULT_HISTORY_MODE,
      activeThreadId: null,
      lastTurnRuntime: null,
      threadParticipantsByThreadId: {},
      threadMessagesByThreadId: {},
      threadTurnsByThreadId: {},
      threadRoutingSuggestionByThreadId: {},
      threadPlanningSuggestionByThreadId: {},
      failedActionsThisTurn: [],
      lastTurnFailureCount: 0,
      nsvSnapshot: null,
    })),
}));
