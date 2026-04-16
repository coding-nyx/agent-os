import { beforeEach, describe, expect, it } from 'vitest';
import { deriveHistoryMode, useOrchestrationStore } from './orchestration-store';

describe('orchestration-store', () => {
  beforeEach(() => {
    useOrchestrationStore.getState().resetShell();
  });

  it('tracks per-turn runtime summaries for downstream UX', () => {
    const summary = {
      moduleId: 'atlas',
      autopilotLevel: 5 as const,
      historyMode: 'silent' as const,
      activeThreadId: 'thread-1',
      actions: [],
      counts: {
        total: 0,
        visibleExecutions: 0,
        silentExecutions: 0,
        awaitingApproval: 0,
        analysisOnly: 0,
        blocked: 0,
        ephemeral: 0,
        failed: 0,
        escalated: 0,
      },
      shouldSuppressAssistantMessage: true,
    };

    useOrchestrationStore.getState().setLastTurnRuntime(summary);
    expect(useOrchestrationStore.getState().lastTurnRuntime).toEqual(summary);
  });

  it('derives silent history for ghost level', () => {
    expect(deriveHistoryMode(5)).toBe('silent');
    expect(deriveHistoryMode(4)).toBe('standard');
  });

  it('updates autopilot and history mode together', () => {
    useOrchestrationStore.getState().setAutopilotLevel(5);
    expect(useOrchestrationStore.getState().autopilotLevel).toBe(5);
    expect(useOrchestrationStore.getState().historyMode).toBe('silent');

    useOrchestrationStore.getState().setAutopilotLevel(2);
    expect(useOrchestrationStore.getState().historyMode).toBe('standard');
  });

  it('clears runtime summaries when the shell resets', () => {
    useOrchestrationStore.getState().setLastTurnRuntime({
      moduleId: 'ara',
      autopilotLevel: 3,
      historyMode: 'standard',
      activeThreadId: null,
      actions: [],
      counts: {
        total: 0,
        visibleExecutions: 0,
        silentExecutions: 0,
        awaitingApproval: 0,
        analysisOnly: 0,
        blocked: 0,
        ephemeral: 0,
        failed: 0,
        escalated: 0,
      },
      shouldSuppressAssistantMessage: false,
    });

    useOrchestrationStore.getState().resetShell();
    expect(useOrchestrationStore.getState().lastTurnRuntime).toBeNull();
  });

  it('stores participant rosters by thread id for master thread hydration', () => {
    useOrchestrationStore.getState().setThreadParticipants('thread-1', [
      {
        moduleId: 'ara',
        role: 'primary',
        joinedAt: '2026-03-24T00:00:00.000Z',
        state: 'active',
        presence: 'online',
      },
      {
        moduleId: 'atlas',
        role: 'secondary',
        joinedAt: '2026-03-24T00:01:00.000Z',
        state: 'invited',
        presence: 'idle',
        invitedAt: '2026-03-24T00:01:00.000Z',
      },
    ]);

    expect(useOrchestrationStore.getState().threadParticipantsByThreadId['thread-1']).toEqual([
      {
        moduleId: 'ara',
        role: 'primary',
        joinedAt: '2026-03-24T00:00:00.000Z',
        state: 'active',
        presence: 'online',
      },
      {
        moduleId: 'atlas',
        role: 'secondary',
        joinedAt: '2026-03-24T00:01:00.000Z',
        state: 'invited',
        presence: 'idle',
        invitedAt: '2026-03-24T00:01:00.000Z',
      },
    ]);
  });

  it('stores thread messages and turns by thread id for orchestration hydration', () => {
    useOrchestrationStore.getState().setThreadMessages('thread-1', [
      {
        id: 'msg-1',
        threadId: 'thread-1',
        author: 'user',
        body: 'Need a plan.',
        createdAt: '2026-03-24T00:00:00.000Z',
        participantIds: [],
        turnId: 'thread-1.turn.0001',
        turnSequence: 1,
        rootMessageId: 'msg-1',
        rootTurnId: 'thread-1.turn.0001',
      },
    ]);
    useOrchestrationStore.getState().setThreadTurns('thread-1', [
      {
        id: 'thread-1.turn.0001',
        threadId: 'thread-1',
        sequence: 1,
        startedBy: 'user',
        participantIds: [],
        createdAt: '2026-03-24T00:00:00.000Z',
        updatedAt: '2026-03-24T00:00:00.000Z',
        messageIds: ['msg-1'],
        rootTurnId: 'thread-1.turn.0001',
      },
    ]);

    expect(useOrchestrationStore.getState().threadMessagesByThreadId['thread-1'][0]).toMatchObject({
      id: 'msg-1',
      turnSequence: 1,
    });
    expect(useOrchestrationStore.getState().threadTurnsByThreadId['thread-1'][0]).toMatchObject({
      id: 'thread-1.turn.0001',
      sequence: 1,
    });
  });

  it('applies thread snapshots in one batched store update', () => {
    useOrchestrationStore.getState().applyThreadSnapshot('thread-1', {
      participants: [
        {
          moduleId: 'ara',
          role: 'primary',
          joinedAt: '2026-03-24T00:00:00.000Z',
          state: 'active',
          presence: 'online',
        },
      ],
      messages: [
        {
          id: 'msg-1',
          threadId: 'thread-1',
          author: 'user',
          body: 'Need a plan.',
          createdAt: '2026-03-24T00:00:00.000Z',
          participantIds: [],
          turnId: 'thread-1.turn.0001',
          turnSequence: 1,
          rootMessageId: 'msg-1',
          rootTurnId: 'thread-1.turn.0001',
        },
      ],
      turns: [
        {
          id: 'thread-1.turn.0001',
          threadId: 'thread-1',
          sequence: 1,
          startedBy: 'user',
          participantIds: [],
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T00:00:00.000Z',
          messageIds: ['msg-1'],
          rootTurnId: 'thread-1.turn.0001',
        },
      ],
    });

    expect(useOrchestrationStore.getState().threadParticipantsByThreadId['thread-1']).toHaveLength(1);
    expect(useOrchestrationStore.getState().threadMessagesByThreadId['thread-1']).toHaveLength(1);
    expect(useOrchestrationStore.getState().threadTurnsByThreadId['thread-1']).toHaveLength(1);
  });

  it('keeps snapshot maps stable when a duplicate thread snapshot is applied', () => {
    const snapshot = {
      participants: [
        {
          moduleId: 'ara',
          role: 'primary',
          joinedAt: '2026-03-24T00:00:00.000Z',
          state: 'active',
          presence: 'online',
        },
      ],
      messages: [
        {
          id: 'msg-1',
          threadId: 'thread-1',
          author: 'user',
          body: 'Need a plan.',
          createdAt: '2026-03-24T00:00:00.000Z',
          participantIds: [],
          turnId: 'thread-1.turn.0001',
          turnSequence: 1,
          rootMessageId: 'msg-1',
          rootTurnId: 'thread-1.turn.0001',
        },
      ],
      turns: [
        {
          id: 'thread-1.turn.0001',
          threadId: 'thread-1',
          sequence: 1,
          startedBy: 'user',
          participantIds: [],
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T00:00:00.000Z',
          messageIds: ['msg-1'],
          rootTurnId: 'thread-1.turn.0001',
        },
      ],
    } as const;

    useOrchestrationStore.getState().applyThreadSnapshot('thread-1', snapshot);
    const participantsMap = useOrchestrationStore.getState().threadParticipantsByThreadId;
    const messagesMap = useOrchestrationStore.getState().threadMessagesByThreadId;
    const turnsMap = useOrchestrationStore.getState().threadTurnsByThreadId;

    useOrchestrationStore.getState().applyThreadSnapshot('thread-1', snapshot);

    expect(useOrchestrationStore.getState().threadParticipantsByThreadId).toBe(participantsMap);
    expect(useOrchestrationStore.getState().threadMessagesByThreadId).toBe(messagesMap);
    expect(useOrchestrationStore.getState().threadTurnsByThreadId).toBe(turnsMap);
  });

  it('tracks thread-native routing suggestions and inline edits by thread id', () => {
    useOrchestrationStore.getState().setThreadRoutingSuggestion('thread-1', {
      target: 'atlas',
      reason: 'Planning intent detected',
      state: 'draft',
    });

    useOrchestrationStore.getState().patchThreadRoutingSuggestion('thread-1', {
      target: 'agnes',
      reason: 'Emotional support looks like the better fit',
      state: 'deferred',
    });

    expect(useOrchestrationStore.getState().threadRoutingSuggestionByThreadId['thread-1']).toEqual({
      target: 'agnes',
      reason: 'Emotional support looks like the better fit',
      state: 'deferred',
    });

    useOrchestrationStore.getState().clearThreadRoutingSuggestion('thread-1');
    expect(useOrchestrationStore.getState().threadRoutingSuggestionByThreadId['thread-1']).toBeNull();
  });

  it('tracks anticipatory planning drafts by thread id', () => {
    useOrchestrationStore.getState().setThreadPlanningSuggestion('thread-1', {
      id: 'thread-1.planning.planning_collapse',
      title: 'Draft a workload triage plan',
      summary: 'Deadlines are mounting while completion rate is critically low.',
      prompt: 'Build a realistic triage plan for today.',
      state: 'draft',
      targetModuleId: 'atlas',
      nodeCount: 3,
      supportingModuleIds: ['soma', 'agnes'],
      sourceSignalIds: ['PLANNING_COLLAPSE', 'alive:atlas'],
    });

    useOrchestrationStore.getState().patchThreadPlanningSuggestion('thread-1', {
      state: 'deferred',
    });

    expect(useOrchestrationStore.getState().threadPlanningSuggestionByThreadId['thread-1']).toEqual({
      id: 'thread-1.planning.planning_collapse',
      title: 'Draft a workload triage plan',
      summary: 'Deadlines are mounting while completion rate is critically low.',
      prompt: 'Build a realistic triage plan for today.',
      state: 'deferred',
      targetModuleId: 'atlas',
      nodeCount: 3,
      supportingModuleIds: ['soma', 'agnes'],
      sourceSignalIds: ['PLANNING_COLLAPSE', 'alive:atlas'],
    });

    useOrchestrationStore.getState().clearThreadPlanningSuggestion('thread-1');
    expect(useOrchestrationStore.getState().threadPlanningSuggestionByThreadId['thread-1']).toBeNull();
  });
});
