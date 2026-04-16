import { describe, expect, it } from 'vitest';
import type { MutationProposal } from '@/lib/contracts/orchestration';
import { OrchestrationRuntimeService } from './orchestration-runtime-service';
import { MasterThreadService } from './master-thread-service';
import type { RoutineProposal } from '@/lib/routines/routine-types';
import type { ThreadPlanningSuggestionDraft } from '@/lib/stores/orchestration-store';

const createdAt = '2026-03-24T00:00:00.000Z';

const proposal: MutationProposal = {
  id: 'proposal-1',
  source: 'atlas',
  intent: 'Lower load',
  vectorMutations: { bandwidth: -0.2 },
  confidence: 0.88,
  patientScope: 'USER',
  createdAt,
};

const routineProposal: RoutineProposal = {
  id: 'routine-proposal-1',
  createdBy: 'agent',
  source: {
    moduleId: 'atlas',
    context: 'Recurring planning support',
  },
  routine: {
    id: 'routine-1',
    name: 'Morning planning',
    description: 'Review priorities and launch the first work block.',
    moduleId: 'atlas',
    recurrence: {
      kind: 'weekly_by_days',
      intervalWeeks: 1,
      daysOfWeek: [1, 2, 3, 4, 5],
      timeOfDay: '09:00',
      startAt: '2026-03-24T09:00:00.000Z',
      timezone: 'UTC',
    },
    timezone: 'UTC',
    category: 'planning',
    trigger: {
      type: 'action',
      actionType: 'daily_plan',
    },
    enabled: true,
    createdBy: 'agent',
    createdAt,
    updatedAt: createdAt,
  },
};

const planningProposal: ThreadPlanningSuggestionDraft = {
  id: 'ara.dashboard.planning.planning_collapse',
  title: 'Draft a workload triage plan',
  summary: 'Deadlines are mounting while completion rate is critically low.',
  prompt: 'Build a realistic triage plan for today.',
  state: 'draft',
  targetModuleId: 'atlas',
  nodeCount: 3,
  supportingModuleIds: ['soma', 'agnes'],
  sourceSignalIds: ['PLANNING_COLLAPSE', 'alive:atlas'],
};

describe('MasterThreadService', () => {
  it('creates thread state and keeps primary participants first', () => {
    const thread = MasterThreadService.createThread(createdAt, createdAt, [
      { moduleId: 'atlas', role: 'secondary', joinedAt: '2026-03-24T00:02:00.000Z', state: 'active', presence: 'online' },
      { moduleId: 'ara', role: 'primary', joinedAt: createdAt, state: 'active', presence: 'online' },
    ]);

    expect(thread.threadId).toBe(createdAt);
    expect(thread.participants[0].moduleId).toBe('ara');
  });

  it('deduplicates participants on join', () => {
    const base = MasterThreadService.createThread('thread-1', createdAt, [
      { moduleId: 'ara', role: 'primary', joinedAt: createdAt, state: 'active', presence: 'online' },
    ]);

    const next = MasterThreadService.joinParticipant(base, {
      moduleId: 'ara',
      role: 'primary',
      joinedAt: '2026-03-24T00:10:00.000Z',
      state: 'waiting',
      presence: 'idle',
    });

    expect(next.participants).toHaveLength(1);
    expect(next.participants[0].state).toBe('waiting');
  });

  it('assigns deterministic turn sequencing and reply threading for appended messages', () => {
    const base = MasterThreadService.createThread('thread-1', createdAt, [
      { moduleId: 'ara', role: 'primary', joinedAt: createdAt, state: 'active', presence: 'online' },
      { moduleId: 'atlas', role: 'secondary', joinedAt: createdAt, state: 'joined', presence: 'online' },
      { moduleId: 'ledger', role: 'secondary', joinedAt: createdAt, state: 'joined', presence: 'online' },
    ]);

    const threaded = MasterThreadService.appendMessages(base, [
      {
        id: 'msg-3',
        threadId: 'thread-1',
        author: 'ledger',
        body: 'I can verify the budget impact.',
        createdAt: '2026-03-24T00:02:00.000Z',
        participantIds: ['ledger', 'ara'],
        replyToMessageId: 'msg-2',
      },
      {
        id: 'msg-1',
        threadId: 'thread-1',
        author: 'user',
        body: 'Can atlas and ledger coordinate on this?',
        createdAt: '2026-03-24T00:00:00.000Z',
        participantIds: [],
      },
      {
        id: 'msg-2',
        threadId: 'thread-1',
        author: 'atlas',
        body: 'Yes — I will draft the plan.',
        createdAt: '2026-03-24T00:01:00.000Z',
        participantIds: ['atlas', 'ara'],
        replyToMessageId: 'msg-1',
      },
    ]);

    expect(threaded.messages.map((message) => message.id)).toEqual(['msg-1', 'msg-2', 'msg-3']);
    expect(threaded.messages.map((message) => message.turnSequence)).toEqual([1, 2, 3]);
    expect(threaded.messages[1]).toMatchObject({
      replyToMessageId: 'msg-1',
      replyToTurnId: 'thread-1.turn.0001',
      rootMessageId: 'msg-1',
      rootTurnId: 'thread-1.turn.0001',
    });
    expect(threaded.messages[2]).toMatchObject({
      replyToMessageId: 'msg-2',
      replyToTurnId: 'thread-1.turn.0002',
      rootMessageId: 'msg-1',
      rootTurnId: 'thread-1.turn.0001',
    });
    expect(threaded.turns.map((turn) => ({
      id: turn.id,
      sequence: turn.sequence,
      replyToTurnId: turn.replyToTurnId,
      messageIds: turn.messageIds,
    }))).toEqual([
      {
        id: 'thread-1.turn.0001',
        sequence: 1,
        replyToTurnId: undefined,
        messageIds: ['msg-1'],
      },
      {
        id: 'thread-1.turn.0002',
        sequence: 2,
        replyToTurnId: 'thread-1.turn.0001',
        messageIds: ['msg-2'],
      },
      {
        id: 'thread-1.turn.0003',
        sequence: 3,
        replyToTurnId: 'thread-1.turn.0002',
        messageIds: ['msg-3'],
      },
    ]);
  });

  it('prevents duplicate turn/message insertion by id, dedupe key, and fingerprint', () => {
    const base = MasterThreadService.createThread('thread-dup', createdAt);

    const withRoot = MasterThreadService.appendMessage(base, {
      id: 'msg-root',
      threadId: 'thread-dup',
      author: 'user',
      body: 'Need a status update.',
      createdAt: createdAt,
      participantIds: [],
    });
    const duplicateById = MasterThreadService.appendMessage(withRoot, {
      id: 'msg-root',
      threadId: 'thread-dup',
      author: 'user',
      body: 'Need a status update.',
      createdAt: createdAt,
      participantIds: [],
    });
    const duplicateByDedupeKey = MasterThreadService.appendMessage(withRoot, {
      id: 'msg-root-copy',
      threadId: 'thread-dup',
      author: 'user',
      body: 'Need a status update.',
      createdAt: '2026-03-24T00:00:01.000Z',
      participantIds: [],
      turnId: 'thread-dup.turn.custom',
      turnSequence: 5,
      dedupeKey: withRoot.messages[0].dedupeKey,
    });
    const duplicateByFingerprint = MasterThreadService.appendMessage(withRoot, {
      id: 'msg-root-fingerprint',
      threadId: 'thread-dup',
      author: 'user',
      body: 'Need a status update.',
      createdAt: '2026-03-24T00:00:02.000Z',
      participantIds: [],
      turnId: withRoot.messages[0].turnId,
      turnSequence: withRoot.messages[0].turnSequence,
      rootMessageId: withRoot.messages[0].rootMessageId,
      rootTurnId: withRoot.messages[0].rootTurnId,
    });

    expect(duplicateById.messages).toHaveLength(1);
    expect(duplicateByDedupeKey.messages).toHaveLength(1);
    expect(duplicateByFingerprint.messages).toHaveLength(1);
    expect(duplicateByFingerprint.turns).toHaveLength(1);
  });

  it('upserts proposals and moves resolution into awaiting approval when needed', () => {
    const base = MasterThreadService.createThread('thread-1', createdAt);
    const next = MasterThreadService.upsertProposal(base, {
      ...proposal,
      requiresApproval: true,
    });

    expect(next.proposals).toHaveLength(1);
    expect(next.resolution.status).toBe('awaiting_approval');
  });

  it('builds proposal cards from proposal + policy data', () => {
    const card = MasterThreadService.buildProposalCard(proposal, {
      title: 'Atlas wants to reduce bandwidth load',
      summary: 'Compress active tasks and reduce open loops.',
      approvalRequirement: { required: false, reason: 'none' },
      executionMode: 'autonomous',
      historyMode: 'standard',
    });

    expect(card.id).toBe('card.proposal-1');
    expect(card.status).toBe('approved');
  });

  it('resolves threads and marks participants resolved', () => {
    const base = MasterThreadService.createThread('thread-1', createdAt, [
      { moduleId: 'ara', role: 'primary', joinedAt: createdAt, state: 'active', presence: 'online' },
      { moduleId: 'atlas', role: 'secondary', joinedAt: createdAt, state: 'active', presence: 'online' },
    ]);

    const resolved = MasterThreadService.resolveThread(base, {
      status: 'executed',
      winningProposalId: proposal.id,
      updatedAt: '2026-03-24T00:05:00.000Z',
    });

    expect(resolved.resolution.status).toBe('executed');
    expect(resolved.participants.every((participant) => participant.state === 'resolved')).toBe(true);
  });

  it('builds a deferred shell snapshot for dismissed routing suggestions', () => {
    const snapshot = MasterThreadService.createAraShellSnapshot({
      threadId: 'ara.dashboard',
      now: createdAt,
      routingSuggestion: {
        target: 'atlas',
        reason: 'Planning intent detected',
      },
      routingSuggestionState: 'deferred',
    });

    expect(snapshot.thread.resolution.status).toBe('deferred');
    expect(snapshot.proposals[0]).toMatchObject({
      lifecycle: 'deferred',
      mutable: true,
      origin: 'shell',
      kind: 'routing_suggestion',
      targetModuleId: 'atlas',
      editableFields: ['target', 'reason'],
      controls: {
        approve: true,
        defer: true,
        dismiss: true,
        reroute: true,
        edit: true,
      },
    });
    expect(snapshot.thread.participants.find((participant) => participant.moduleId === 'atlas')?.state).toBe('dismissed');
  });

  it('surfaces routine proposals in the shell snapshot with approval controls', () => {
    const snapshot = MasterThreadService.createAraShellSnapshot({
      threadId: 'ara.dashboard',
      now: createdAt,
      routineProposal,
    });

    expect(snapshot.proposals[0]).toMatchObject({
      proposalId: 'routine-proposal-1',
      title: 'Confirm routine: Morning planning',
      lifecycle: 'pending_approval',
      kind: 'routine_proposal',
      mutable: false,
      targetModuleId: 'atlas',
      controls: {
        approve: true,
        defer: false,
        dismiss: true,
        reroute: false,
        edit: false,
      },
    });
    expect(snapshot.thread.participants.find((participant) => participant.moduleId === 'atlas')?.state).toBe('active');
    expect(snapshot.thread.resolution.status).toBe('awaiting_approval');
  });

  it('surfaces anticipatory planning proposals as shell-owned draft cards', () => {
    const snapshot = MasterThreadService.createAraShellSnapshot({
      threadId: 'ara.dashboard',
      now: createdAt,
      planningProposal,
    });

    expect(snapshot.proposals[0]).toMatchObject({
      proposalId: 'ara.dashboard.planning.planning_collapse',
      title: 'Draft a workload triage plan',
      lifecycle: 'draft',
      kind: 'planning_heuristic',
      mutable: true,
      targetModuleId: 'atlas',
      controls: {
        approve: true,
        defer: true,
        dismiss: true,
        reroute: false,
        edit: false,
      },
    });
    expect(snapshot.thread.participants.find((participant) => participant.moduleId === 'atlas')).toMatchObject({
      state: 'invited',
      presence: 'idle',
    });
  });

  it('projects live Ara chat messages into the shell snapshot deterministically', () => {
    const snapshot = MasterThreadService.createAraShellSnapshot({
      threadId: 'ara.dashboard',
      now: createdAt,
      liveChatMessages: [
        {
          id: 'chat-1',
          role: 'user',
          content: 'Plan my day tomorrow.',
          timestamp: '2026-03-24T00:00:01.000Z',
        },
        {
          id: 'chat-2',
          role: 'assistant',
          content: '<analysis>hidden</analysis>Atlas can build that plan.',
          timestamp: '2026-03-24T00:00:02.000Z',
          actor: {
            actorId: 'ara-intake',
            actorLabel: 'Ara Intake',
            actorShortLabel: 'NI',
          },
        },
      ],
      liveStreamingAssistantText: 'Scheduling cooking at 11:00 next.',
    });

    expect(snapshot.thread.messages.map((message) => ({
      author: message.author,
      body: message.body,
      actorLabel: message.actor?.actorLabel,
    }))).toEqual([
      {
        author: 'user',
        body: 'Plan my day tomorrow.',
        actorLabel: 'You',
      },
      {
        author: 'ara',
        body: 'Atlas can build that plan.',
        actorLabel: 'Ara Intake',
      },
      {
        author: 'ara',
        body: 'Scheduling cooking at 11:00 next.',
        actorLabel: 'Ara',
      },
    ]);
    expect(snapshot.thread.turns).toHaveLength(3);
  });

  it('projects consultation artifacts into attributed thread messages', () => {
    const messages = MasterThreadService.projectConsultationArtifacts('ara.dashboard', [
      {
        id: 'consult.atlas.1',
        threadId: 'ara.dashboard',
        sourceModuleId: 'ara',
        targetModuleId: 'atlas',
        question: 'What is the planning bottleneck?',
        mode: 'state_only',
        requestedAt: '2026-03-24T00:00:01.000Z',
        resolvedAt: '2026-03-24T00:00:03.000Z',
        status: 'completed',
        summary: 'Atlas returned specialist consultation results.',
        responseText: 'Focus is compromised by overload.',
      },
    ]);

    expect(messages.map((message) => ({
      id: message.id,
      author: message.author,
      kind: message.kind,
      body: message.body,
    }))).toEqual([
      {
        id: 'consult.atlas.1.request',
        author: 'ara',
        kind: 'consultation_request',
        body: 'What is the planning bottleneck?',
      },
      {
        id: 'consult.atlas.1.result',
        author: 'atlas',
        kind: 'consultation_result',
        body: 'Focus is compromised by overload.',
      },
    ]);

    const snapshot = MasterThreadService.createAraShellSnapshot({
      threadId: 'ara.dashboard',
      now: createdAt,
      seedMessages: messages,
    });

    expect(snapshot.thread.participants.map((participant) => participant.moduleId)).toEqual(['ara', 'atlas']);
  });

  it('projects execution artifacts into canonical request/result thread messages', () => {
    const messages = MasterThreadService.projectExecutionArtifacts('ara.dashboard', [
      {
        id: 'execution.exec-1',
        threadId: 'ara.dashboard',
        sourceModuleId: 'atlas',
        actionType: 'propose_reminder',
        proposalId: 'proposal-1',
        executionId: 'exec-1',
        requestedAt: '2026-03-24T00:00:02.000Z',
        resolvedAt: '2026-03-24T00:00:04.000Z',
        status: 'executed',
        summary: 'Reminder proposal completed.',
        patientScope: 'USER',
      },
      {
        id: 'execution.exec-2',
        threadId: 'ara.dashboard',
        sourceModuleId: 'atlas',
        actionType: 'schedule_block',
        proposalId: 'proposal-2',
        executionId: 'exec-2',
        requestedAt: '2026-03-24T00:00:05.000Z',
        resolvedAt: '2026-03-24T00:00:06.000Z',
        status: 'failed',
        summary: 'Scheduling failed.',
        patientScope: 'USER',
        errorMessage: 'Blocked by dependency.',
        retryable: true,
        retrySummary: 'Retry attempt 1 available.',
        retryAttempt: 1,
      },
      {
        id: 'execution.exec-3',
        threadId: 'ara.dashboard',
        sourceModuleId: 'atlas',
        actionType: 'schedule_block',
        proposalId: 'proposal-3',
        executionId: 'exec-3',
        requestedAt: '2026-03-24T00:00:07.000Z',
        resolvedAt: '2026-03-24T00:00:08.000Z',
        status: 'executed',
        summary: 'Schedule cooking executed on retry attempt 1.',
        patientScope: 'USER',
        retryOfPlanId: 'plan-7',
        retryAttempt: 1,
        retryParentExecutionId: 'plan-7.node-cooking.execution',
      },
    ]);

    expect(messages.map((message) => ({
      id: message.id,
      author: message.author,
      kind: message.kind,
      body: message.body,
      replyToMessageId: message.replyToMessageId,
    }))).toEqual([
      {
        id: 'execution.exec-1.request',
        author: 'atlas',
        kind: 'execution_request',
        body: 'Execute propose reminder.',
        replyToMessageId: undefined,
      },
      {
        id: 'execution.exec-1.result',
        author: 'atlas',
        kind: 'execution_result',
        body: 'Reminder proposal completed.',
        replyToMessageId: 'execution.exec-1.request',
      },
      {
        id: 'execution.exec-2.request',
        author: 'atlas',
        kind: 'execution_request',
        body: 'Retry 1 · Execute schedule block.',
        replyToMessageId: undefined,
      },
      {
        id: 'execution.exec-2.result',
        author: 'atlas',
        kind: 'execution_failure',
        body: 'Blocked by dependency. Retry attempt 1 available.',
        replyToMessageId: 'execution.exec-2.request',
      },
      {
        id: 'execution.exec-3.request',
        author: 'atlas',
        kind: 'execution_request',
        body: 'Retry 1 · Execute schedule block.',
        replyToMessageId: 'execution.plan-7.node-cooking.result',
      },
      {
        id: 'execution.exec-3.result',
        author: 'atlas',
        kind: 'execution_result',
        body: 'Schedule cooking executed on retry attempt 1.',
        replyToMessageId: 'execution.exec-3.request',
      },
    ]);
  });

  it('supports participant invite, join, and leave lifecycle semantics', () => {
    const base = MasterThreadService.createThread('thread-1', createdAt, [
      { moduleId: 'ara', role: 'primary', joinedAt: createdAt, state: 'active', presence: 'online' },
    ]);

    const invited = MasterThreadService.inviteParticipant(base, {
      moduleId: 'atlas',
      role: 'secondary',
      invitedAt: '2026-03-24T00:01:00.000Z',
    });
    expect(invited.participants.find((participant) => participant.moduleId === 'atlas')).toMatchObject({
      state: 'invited',
      presence: 'idle',
      invitedAt: '2026-03-24T00:01:00.000Z',
    });

    const joined = MasterThreadService.joinParticipant(invited, {
      moduleId: 'atlas',
      role: 'secondary',
      joinedAt: '2026-03-24T00:02:00.000Z',
      state: 'active',
      presence: 'online',
    });
    expect(joined.participants.find((participant) => participant.moduleId === 'atlas')).toMatchObject({
      state: 'active',
      presence: 'online',
      invitedAt: '2026-03-24T00:01:00.000Z',
    });

    const left = MasterThreadService.leaveParticipant(joined, {
      moduleId: 'atlas',
      role: 'secondary',
      leftAt: '2026-03-24T00:03:00.000Z',
    });
    expect(left.participants.find((participant) => participant.moduleId === 'atlas')).toMatchObject({
      state: 'left',
      presence: 'offline',
      leftAt: '2026-03-24T00:03:00.000Z',
    });
  });

  it('surfaces runtime proposal lifecycle states for approval, auto-approved, and ghost execution', () => {
    const runtimeSummary = OrchestrationRuntimeService.buildTurnSummary({
      moduleId: 'ara',
      autopilotLevel: 5,
      historyMode: 'silent',
      activeThreadId: 'thread-1',
      decisions: [
        {
          actionType: 'record_transaction',
          proposalCard: {
            id: 'card-1',
            proposalId: 'proposal-1',
            title: 'Record transaction',
            summary: 'Record transaction requested by ledger.',
            source: 'ledger',
            status: 'approved',
            approvalRequirement: { required: false, reason: 'none' },
            executionMode: 'ghost',
            historyMode: 'silent',
          },
          dispatchStatus: 'approved',
          executionMode: 'ghost',
          historyMode: 'silent',
          runtime: OrchestrationRuntimeService.buildRuntimeSemantics({
            autopilotLevel: 5,
            historyMode: 'silent',
            dispatchStatus: 'approved',
            highRisk: false,
          }),
          execution: {
            id: 'exec-1',
            proposalId: 'proposal-1',
            source: 'ledger',
            autopilotLevel: 5,
            executionMode: 'ghost',
            historyMode: 'silent',
            patientScope: 'USER',
            executedAt: '2026-03-24T00:01:00.000Z',
            status: 'executed',
          },
        },
        {
          actionType: 'update_focus_score',
          proposalCard: {
            id: 'card-2',
            proposalId: 'proposal-2',
            title: 'Update focus score',
            summary: 'Update focus score requested by atlas.',
            source: 'atlas',
            status: 'approved',
            approvalRequirement: { required: false, reason: 'none' },
            executionMode: 'autonomous',
            historyMode: 'standard',
          },
          dispatchStatus: 'approved',
          executionMode: 'autonomous',
          historyMode: 'standard',
          runtime: OrchestrationRuntimeService.buildRuntimeSemantics({
            autopilotLevel: 4,
            historyMode: 'standard',
            dispatchStatus: 'approved',
            highRisk: false,
          }),
          execution: {
            id: 'exec-2',
            proposalId: 'proposal-2',
            source: 'atlas',
            autopilotLevel: 4,
            executionMode: 'autonomous',
            historyMode: 'standard',
            patientScope: 'USER',
            executedAt: '2026-03-24T00:02:00.000Z',
            status: 'executed',
          },
        },
        {
          actionType: 'record_budget',
          proposalCard: {
            id: 'card-3',
            proposalId: 'proposal-3',
            title: 'Record budget',
            summary: 'Record budget requested by ledger.',
            source: 'ledger',
            status: 'pending_approval',
            approvalRequirement: { required: true, reason: 'high_risk' },
            executionMode: 'manual',
            historyMode: 'standard',
          },
          dispatchStatus: 'awaiting_approval',
          executionMode: 'manual',
          historyMode: 'standard',
          runtime: OrchestrationRuntimeService.buildRuntimeSemantics({
            autopilotLevel: 4,
            historyMode: 'standard',
            dispatchStatus: 'awaiting_approval',
            highRisk: true,
          }),
          execution: {
            id: 'exec-3',
            proposalId: 'proposal-3',
            source: 'ledger',
            autopilotLevel: 4,
            executionMode: 'manual',
            historyMode: 'standard',
            patientScope: 'USER',
            executedAt: '2026-03-24T00:03:00.000Z',
            status: 'deferred',
          },
        },
      ],
    });

    const snapshot = MasterThreadService.createAraShellSnapshot({
      threadId: 'thread-1',
      now: createdAt,
      lastTurnRuntime: runtimeSummary,
    });

    expect(snapshot.thread.resolution.status).toBe('awaiting_approval');
    expect(snapshot.runtimeSummary?.counts.awaitingApproval).toBe(1);
    expect(snapshot.runtimeSummary?.counts.silentExecutions).toBe(1);
    expect(snapshot.proposals.map((proposalItem) => proposalItem.lifecycle)).toEqual([
      'pending_approval',
      'auto_approved',
      'ghost_executed',
    ]);
    expect(snapshot.proposalCard?.title).toBe('Record budget');
  });

  it('synthesizes deterministic cross-agent thread messages and turns from runtime summaries', () => {
    const runtimeSummary = OrchestrationRuntimeService.buildTurnSummary({
      moduleId: 'ara',
      autopilotLevel: 4,
      historyMode: 'standard',
      activeThreadId: 'thread-synthesis',
      aliveEntities: [
        {
          id: 'alive.goal.goal-1',
          type: 'ACTION',
          label: 'Ship phase 3',
          semantic_tags: ['atlas', 'goal'],
          attributes: {},
          soul_impact_preset: { output: 0.6 },
          sourceModule: 'atlas',
          provenance: 'adapter',
          createdAt,
          updatedAt: '2026-03-24T00:03:00.000Z',
        },
      ],
      decisions: [
        {
          actionType: 'draft_plan',
          proposalCard: {
            id: 'card-plan',
            proposalId: 'proposal-plan',
            title: 'Draft plan',
            summary: 'Atlas coordinated the plan outline for the next execution step.',
            source: 'atlas',
            status: 'approved',
            approvalRequirement: { required: false, reason: 'none' },
            executionMode: 'autonomous',
            historyMode: 'standard',
          },
          dispatchStatus: 'approved',
          executionMode: 'autonomous',
          historyMode: 'standard',
          runtime: OrchestrationRuntimeService.buildRuntimeSemantics({
            autopilotLevel: 4,
            historyMode: 'standard',
            dispatchStatus: 'approved',
            highRisk: false,
          }),
          execution: {
            id: 'exec-plan',
            proposalId: 'proposal-plan',
            source: 'atlas',
            autopilotLevel: 4,
            executionMode: 'autonomous',
            historyMode: 'standard',
            patientScope: 'USER',
            executedAt: '2026-03-24T00:01:00.000Z',
            status: 'executed',
          },
        },
        {
          actionType: 'record_budget',
          proposalCard: {
            id: 'card-budget',
            proposalId: 'proposal-budget',
            title: 'Record budget',
            summary: 'Ledger reviewed the budget delta and flagged the approval gate.',
            source: 'ledger',
            status: 'pending_approval',
            approvalRequirement: { required: true, reason: 'high_risk' },
            executionMode: 'manual',
            historyMode: 'standard',
          },
          dispatchStatus: 'awaiting_approval',
          executionMode: 'manual',
          historyMode: 'standard',
          runtime: OrchestrationRuntimeService.buildRuntimeSemantics({
            autopilotLevel: 4,
            historyMode: 'standard',
            dispatchStatus: 'awaiting_approval',
            highRisk: true,
          }),
          execution: {
            id: 'exec-budget',
            proposalId: 'proposal-budget',
            source: 'ledger',
            autopilotLevel: 4,
            executionMode: 'manual',
            historyMode: 'standard',
            patientScope: 'USER',
            executedAt: '2026-03-24T00:02:00.000Z',
            status: 'deferred',
          },
        },
      ],
    });

    const snapshot = MasterThreadService.createAraShellSnapshot({
      threadId: 'thread-synthesis',
      now: createdAt,
      lastTurnRuntime: runtimeSummary,
    });

    expect(snapshot.thread.messages).toHaveLength(4);
    expect(snapshot.thread.messages[0]).toMatchObject({
      author: 'ara',
      body: expect.stringContaining('Ara synthesized 2 runtime actions'),
      participantIds: ['ara', 'atlas', 'ledger'],
      turnSequence: 1,
    });
    expect(snapshot.thread.messages[1]).toMatchObject({
      author: 'atlas',
      replyToMessageId: snapshot.thread.messages[0].id,
      rootMessageId: snapshot.thread.messages[0].id,
      proposalId: 'proposal-plan',
      body: expect.stringContaining('I executed Draft plan.'),
    });
    expect(snapshot.thread.messages[2]).toMatchObject({
      author: 'ledger',
      replyToMessageId: snapshot.thread.messages[0].id,
      proposalId: 'proposal-budget',
      body: expect.stringContaining('Waiting for approval because high risk'),
    });
    expect(snapshot.thread.messages[3]).toMatchObject({
      author: 'system',
      replyToMessageId: snapshot.thread.messages[0].id,
      body: expect.stringContaining('Alive context consulted while synthesizing this turn'),
    });
    expect(snapshot.thread.turns.map((turn) => turn.messageIds)).toEqual([
      [snapshot.thread.messages[0].id],
      [snapshot.thread.messages[1].id],
      [snapshot.thread.messages[2].id],
      [snapshot.thread.messages[3].id],
    ]);

    const hydrated = MasterThreadService.createAraShellSnapshot({
      threadId: 'thread-synthesis',
      now: '2026-03-24T00:10:00.000Z',
      seedParticipants: snapshot.thread.participants,
      seedMessages: snapshot.thread.messages,
      seedTurns: snapshot.thread.turns,
      lastTurnRuntime: runtimeSummary,
    });

    expect(hydrated.thread.messages).toEqual(snapshot.thread.messages);
    expect(hydrated.thread.turns).toEqual(snapshot.thread.turns);
  });

  it('hydrates persisted participants and keeps invited lifecycle visible in shell snapshots', () => {
    const snapshot = MasterThreadService.createAraShellSnapshot({
      threadId: 'thread-hydrated',
      now: createdAt,
      seedParticipants: [
        {
          moduleId: 'ara',
          role: 'primary',
          joinedAt: '2026-03-23T23:58:00.000Z',
          state: 'active',
          presence: 'online',
          lastActiveAt: '2026-03-23T23:58:00.000Z',
        },
        {
          moduleId: 'atlas',
          role: 'secondary',
          joinedAt: '2026-03-23T23:59:00.000Z',
          state: 'joined',
          presence: 'online',
          invitedAt: '2026-03-23T23:58:30.000Z',
        },
      ],
      routingSuggestion: {
        target: 'ledger',
        reason: 'Budget review needed',
      },
    });

    expect(snapshot.thread.participants.find((participant) => participant.moduleId === 'atlas')).toMatchObject({
      state: 'joined',
      presence: 'online',
      invitedAt: '2026-03-23T23:58:30.000Z',
    });
    expect(snapshot.thread.participants.find((participant) => participant.moduleId === 'ledger')).toMatchObject({
      state: 'invited',
      presence: 'idle',
    });
  });

  it('includes explicitly mentioned agents in shell snapshots without requiring delegation', () => {
    const snapshot = MasterThreadService.createAraShellSnapshot({
      threadId: 'thread-mentioned',
      now: createdAt,
      mentionedParticipants: ['agnes'],
    });

    expect(snapshot.thread.participants.find((participant) => participant.moduleId === 'agnes')).toMatchObject({
      state: 'invited',
      presence: 'idle',
      inclusionReasons: ['mentioned'],
    });
    expect(snapshot.thread.participants.find((participant) => participant.moduleId === 'ara')).toMatchObject({
      state: 'active',
      presence: 'online',
    });
  });

  it('tracks consulted and delegated participant provenance separately', () => {
    const consultationMessages = MasterThreadService.projectConsultationArtifacts('thread-provenance', [{
      id: 'consult-1',
      threadId: 'thread-provenance',
      sourceModuleId: 'ara',
      targetModuleId: 'soma',
      question: 'Should tomorrow be a rest day?',
      mode: 'state_only',
      requestedAt: createdAt,
      resolvedAt: '2026-03-24T00:03:00.000Z',
      status: 'completed',
      summary: 'Soma recommended recovery.',
      responseText: 'Take a lighter day.',
    }]);

    const snapshot = MasterThreadService.createAraShellSnapshot({
      threadId: 'thread-provenance',
      now: createdAt,
      mentionedParticipants: ['agnes'],
      seedMessages: consultationMessages,
      routingSuggestion: {
        target: 'atlas',
        reason: 'Planning intent detected',
      },
    });

    expect(snapshot.thread.participants.find((participant) => participant.moduleId === 'agnes')?.inclusionReasons).toEqual(['mentioned']);
    expect(snapshot.thread.participants.find((participant) => participant.moduleId === 'soma')?.inclusionReasons).toContain('consulted');
    expect(snapshot.thread.participants.find((participant) => participant.moduleId === 'atlas')?.inclusionReasons).toContain('delegated');
  });

  it('marks analysis-only runtime work as deferred at the thread level', () => {
    const runtimeSummary = OrchestrationRuntimeService.buildTurnSummary({
      moduleId: 'ledger',
      autopilotLevel: 5,
      historyMode: 'silent',
      decisions: [
        {
          actionType: 'record_transaction',
          proposalCard: {
            id: 'card-analysis',
            proposalId: 'proposal-analysis',
            title: 'Record transaction',
            summary: 'Record transaction requested by ledger.',
            source: 'ledger',
            status: 'blocked',
            approvalRequirement: { required: false, reason: 'guest_scope' },
            executionMode: 'analysis_only',
            historyMode: 'standard',
          },
          dispatchStatus: 'analysis_only',
          executionMode: 'analysis_only',
          historyMode: 'standard',
          runtime: OrchestrationRuntimeService.buildRuntimeSemantics({
            autopilotLevel: 5,
            historyMode: 'silent',
            dispatchStatus: 'analysis_only',
            highRisk: false,
          }),
        },
      ],
    });

    const snapshot = MasterThreadService.createAraShellSnapshot({
      threadId: 'thread-analysis',
      now: createdAt,
      lastTurnRuntime: runtimeSummary,
    });

    expect(snapshot.thread.resolution.status).toBe('deferred');
    expect(snapshot.proposals[0]).toMatchObject({
      lifecycle: 'analysis_only',
      status: 'blocked',
      origin: 'runtime',
      kind: 'runtime_action',
    });
  });

  it('threads alive context through shell snapshots when runtime summaries include it', () => {
    const runtimeSummary = OrchestrationRuntimeService.buildTurnSummary({
      moduleId: 'atlas',
      autopilotLevel: 3,
      historyMode: 'standard',
      aliveEntities: [
        {
          id: 'alive.goal.goal-1',
          type: 'ACTION',
          label: 'Ship phase 1',
          semantic_tags: ['atlas', 'goal', 'active'],
          attributes: {},
          soul_impact_preset: { bandwidth: 0.7 },
          sourceModule: 'atlas',
          provenance: 'adapter',
          createdAt,
          updatedAt: '2026-03-24T00:05:00.000Z',
        },
      ],
      decisions: [],
    });

    const snapshot = MasterThreadService.createAraShellSnapshot({
      threadId: 'thread-alive',
      now: createdAt,
      lastTurnRuntime: runtimeSummary,
    });

    expect(snapshot.aliveContext).toMatchObject({
      total: 1,
      moduleIds: ['atlas'],
    });
    expect(snapshot.runtimeSummary?.aliveContext?.byModule.atlas?.[0].label).toBe('Ship phase 1');
  });
});
