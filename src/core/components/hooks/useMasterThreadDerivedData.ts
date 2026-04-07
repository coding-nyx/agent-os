import { useMemo } from 'react';
import type { SilentHistoryEntry } from '@/lib/contracts/orchestration';
import type { MasterThreadState } from '@/lib/services/master-thread-service';
import type { MasterThreadMessage, OrchestrationTurnRuntimeSummary } from '@/lib/contracts/orchestration';
import { compareMasterThreadMessages, compareMasterThreadTurns } from '@/lib/contracts/orchestration';

export interface MasterThreadDerivedData {
  threadParticipants: MasterThreadState['participants'];
  threadMessages: MasterThreadMessage[];
  threadTurns: MasterThreadState['turns'];
  threadMessageMap: Map<string, MasterThreadMessage>;
  recentThreadMessages: MasterThreadMessage[];
  recentTurns: MasterThreadState['turns'];
  recentSilentHistoryEntries: SilentHistoryEntry[];
  ghostActions: NonNullable<OrchestrationTurnRuntimeSummary['actions']>;
  activeParticipantCount: number;
  waitingParticipantCount: number;
  inactiveParticipantCount: number;
}

export function useMasterThreadDerivedData(
  thread: MasterThreadState,
  runtimeSummary: OrchestrationTurnRuntimeSummary | null | undefined,
  silentHistoryEntries: SilentHistoryEntry[],
): MasterThreadDerivedData {
  const threadParticipants = thread.participants ?? [];
  const threadMessages = thread.messages ?? [];
  const threadTurns = thread.turns ?? [];

  const threadMessageMap = useMemo(
    () => new Map(threadMessages.map((message) => [message.id, message])),
    [threadMessages],
  );

  const recentThreadMessages = useMemo(
    () => [...threadMessages].sort(compareMasterThreadMessages).slice(-4),
    [threadMessages],
  );

  const ghostActions = useMemo(
    () =>
      runtimeSummary?.actions.filter(
        (action) => action.executionMode === 'ghost' || action.runtime.disposition === 'silent_execution',
      ) ?? [],
    [runtimeSummary],
  );

  const recentTurns = useMemo(
    () => [...threadTurns].sort(compareMasterThreadTurns).slice(-4),
    [threadTurns],
  );

  const recentSilentHistoryEntries = useMemo(
    () => [...silentHistoryEntries].sort((left, right) => right.timestamp.localeCompare(left.timestamp)).slice(0, 3),
    [silentHistoryEntries],
  );

  const activeParticipantCount = useMemo(
    () => threadParticipants.filter((participant) => participant.state === 'active' || participant.state === 'joined').length,
    [threadParticipants],
  );

  const waitingParticipantCount = useMemo(
    () => threadParticipants.filter((participant) => participant.state === 'invited' || participant.state === 'waiting').length,
    [threadParticipants],
  );

  const inactiveParticipantCount = useMemo(
    () => threadParticipants.filter((participant) => participant.state === 'dismissed' || participant.state === 'left').length,
    [threadParticipants],
  );

  return {
    threadParticipants,
    threadMessages,
    threadTurns,
    threadMessageMap,
    recentThreadMessages,
    recentTurns,
    recentSilentHistoryEntries,
    ghostActions,
    activeParticipantCount,
    waitingParticipantCount,
    inactiveParticipantCount,
  };
}
