import { describe, expect, it } from 'vitest';
import type { OrchestrationTurnRuntimeSummary, SilentHistoryEntry } from '@/lib/contracts/orchestration';
import type { PersistedExecutionFailureRecord } from '@/lib/services/orchestration-persistence-service';
import { OrchestrationCommandCenterService } from './orchestration-command-center-service';

function makeRuntimeSummary(): OrchestrationTurnRuntimeSummary {
  return {
    moduleId: 'nexus',
    autopilotLevel: 4,
    historyMode: 'standard',
    activeThreadId: 'thread-1',
    aliveContext: null,
    shouldSuppressAssistantMessage: false,
    counts: {
      total: 2,
      visibleExecutions: 0,
      silentExecutions: 0,
      awaitingApproval: 1,
      analysisOnly: 0,
      blocked: 1,
      ephemeral: 0,
      failed: 0,
      escalated: 0,
    },
    actions: [
      {
        actionType: 'confirm_runway',
        proposalId: 'proposal-approval',
        label: 'Confirm runway',
        summary: 'Ledger is asking for explicit approval.',
        source: 'ledger',
        status: 'pending_approval',
        approvalRequirement: { required: true, reason: 'manual_level' },
        dispatchStatus: 'awaiting_approval',
        executionMode: 'assisted',
        historyMode: 'standard',
        executionStatus: 'deferred',
        patientScope: 'USER',
        executedAt: '2026-03-24T14:00:00.000Z',
        failure: null,
        runtime: {
          autopilotLevel: 4,
          autonomy: 'supervised_autonomy',
          disposition: 'proposal_review',
          historyDestination: 'standard',
          willPersistHistory: true,
          shouldNotifyUser: true,
        },
      },
      {
        actionType: 'commit_training',
        proposalId: 'proposal-blocked',
        label: 'Commit training',
        summary: 'Titan is blocked until readiness recovers.',
        source: 'titan',
        status: 'blocked',
        approvalRequirement: { required: false, reason: 'none' },
        dispatchStatus: 'blocked',
        executionMode: 'assisted',
        historyMode: 'standard',
        executionStatus: 'blocked',
        patientScope: 'USER',
        executedAt: '2026-03-24T14:05:00.000Z',
        failure: null,
        runtime: {
          autopilotLevel: 4,
          autonomy: 'supervised_autonomy',
          disposition: 'analysis_only',
          historyDestination: 'standard',
          willPersistHistory: true,
          shouldNotifyUser: true,
        },
      },
    ],
  };
}

function makeFailures(): PersistedExecutionFailureRecord[] {
  return [
    {
      id: 'failure-1',
      executionId: 'exec-1',
      proposalId: 'proposal-1',
      moduleId: 'atlas',
      actionType: 'sync_brief',
      threadId: 'thread-1',
      patientScope: 'USER',
      errorMessage: 'Network timeout',
      errorName: 'Error',
      errorCode: 'TRANSIENT',
      retryCount: 0,
      maxRetries: 3,
      failedAt: '2026-03-24T14:10:00.000Z',
      nextRetryAt: '2026-03-24T14:11:00.000Z',
      escalatedAt: null,
      resolvedAt: null,
      status: 'retry_scheduled',
      storedAt: '2026-03-24T14:10:00.000Z',
      metadata: {},
    },
    {
      id: 'failure-2',
      executionId: 'exec-2',
      proposalId: 'proposal-2',
      moduleId: 'soma',
      actionType: 'write_clearance',
      threadId: 'thread-1',
      patientScope: 'USER',
      errorMessage: 'Permission denied',
      errorName: 'Error',
      errorCode: 'PERMISSION',
      retryCount: 0,
      maxRetries: 3,
      failedAt: '2026-03-24T14:12:00.000Z',
      nextRetryAt: null,
      escalatedAt: '2026-03-24T14:12:00.000Z',
      resolvedAt: null,
      status: 'escalated',
      storedAt: '2026-03-24T14:12:00.000Z',
      metadata: {},
    },
  ];
}

function makeSilentHistory(): SilentHistoryEntry[] {
  return [
    {
      id: 'silent-1',
      executionId: 'exec-ghost',
      proposalId: 'proposal-ghost',
      summary: 'Night reset completed',
      source: 'nexus',
      timestamp: '2026-03-24T14:15:00.000Z',
      patientScope: 'USER',
      metadata: {
        hiddenMessages: ['Atlas closed the review loop silently.'],
      },
    },
  ];
}

describe('OrchestrationCommandCenterService', () => {
  it('builds approval, incident, debt, and audit queues from orchestration state', () => {
    const snapshot = OrchestrationCommandCenterService.buildSnapshot({
      runtimeSummary: makeRuntimeSummary(),
      failures: makeFailures(),
      silentHistoryEntries: makeSilentHistory(),
    });

    expect(snapshot.attentionCount).toBe(4);
    expect(snapshot.approvals.count).toBe(1);
    expect(snapshot.approvals.items[0]?.title).toBe('Confirm runway');
    expect(snapshot.incidents.count).toBe(1);
    expect(snapshot.incidents.items[0]?.source).toBe('soma');
    expect(snapshot.debt.count).toBe(2);
    expect(snapshot.audit.count).toBe(1);
    expect(snapshot.audit.items[0]?.summary).toContain('Atlas closed the review loop silently.');
  });
});
