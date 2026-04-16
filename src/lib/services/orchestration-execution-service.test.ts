import { describe, expect, it, vi } from 'vitest';
import { InMemoryDataLayer } from '@/lib/data-layer/in-memory-data-layer';
import { setAraDataLayer } from '@/lib/data-layer/provider';
import type { ActionOrchestrationMetadata } from '@/lib/contracts/orchestration';
import { ActionHub } from '@/lib/actions/action-hub';
import { OrchestrationExecutionService } from './orchestration-execution-service';

function makeMetadata(): ActionOrchestrationMetadata {
  return {
    actionType: 'record_transaction',
    activeThreadId: 'thread-1',
    autopilotLevel: 4,
    proposal: {
      id: 'proposal-1',
      source: 'ledger',
      intent: 'Record transaction',
      confidence: 0.9,
      patientScope: 'USER',
      createdAt: '2024-01-01T00:00:00.000Z',
      metadata: {},
    },
    proposalCard: {
      id: 'card-1',
      proposalId: 'proposal-1',
      title: 'Record transaction',
      summary: 'Record transaction requested by ledger.',
      source: 'ledger',
      status: 'approved',
      approvalRequirement: { required: false, reason: 'none' },
      executionMode: 'autonomous',
      historyMode: 'standard',
    },
    approvalRequirement: { required: false, reason: 'none' },
    executionMode: 'autonomous',
    historyMode: 'standard',
    patientScope: 'USER',
    execution: {
      id: 'exec-1',
      proposalId: 'proposal-1',
      source: 'ledger',
      autopilotLevel: 4,
      executionMode: 'autonomous',
      historyMode: 'standard',
      patientScope: 'USER',
      executedAt: '2024-01-01T00:00:00.000Z',
      status: 'executed',
    },
    mutatesState: true,
    highRisk: false,
    dispatchStatus: 'approved',
    runtime: {
      autopilotLevel: 4,
      autonomy: 'supervised_autonomy',
      disposition: 'visible_execution',
      historyDestination: 'standard',
      willPersistHistory: true,
      shouldNotifyUser: true,
    },
  };
}

describe('OrchestrationExecutionService', () => {
  it('records transient failures with retry metadata and mutates orchestration state', async () => {
    const dataLayer = new InMemoryDataLayer();
    const metadata = makeMetadata();

    const failure = await OrchestrationExecutionService.recordFailure('user-1', {
      moduleId: 'ledger',
      actionType: 'record_transaction',
      metadata,
      error: new Error('Network timeout'),
      dataLayer,
    });

    expect(failure).toMatchObject({
      executionId: 'exec-1',
      errorCode: 'TRANSIENT',
      retryCount: 0,
      status: 'retry_scheduled',
    });
    expect(failure?.nextRetryAt).not.toBeNull();
    expect(metadata.execution.status).toBe('failed');
    expect(metadata.proposalCard.status).toBe('failed');
    expect(metadata.runtime.disposition).toBe('incident_review');
  });

  it('escalates non-transient failures immediately', async () => {
    const dataLayer = new InMemoryDataLayer();
    const metadata = makeMetadata();

    const failure = await OrchestrationExecutionService.recordFailure('user-1', {
      moduleId: 'ledger',
      actionType: 'record_transaction',
      metadata,
      error: new Error('Permission denied'),
      dataLayer,
    });

    expect(failure).toMatchObject({
      errorCode: 'PERMISSION',
      status: 'escalated',
    });
    expect(failure?.escalatedAt).not.toBeNull();
    expect(metadata.execution.status).toBe('failed_escalated');
    expect(metadata.proposalCard.status).toBe('incident');
  });

  it('escalates after max transient retries are exhausted', async () => {
    const dataLayer = new InMemoryDataLayer();
    const metadata = makeMetadata();

    await OrchestrationExecutionService.recordFailure('user-1', {
      moduleId: 'ledger',
      actionType: 'record_transaction',
      metadata,
      error: new Error('Network timeout'),
      dataLayer,
    });
    await OrchestrationExecutionService.recordFailure('user-1', {
      moduleId: 'ledger',
      actionType: 'record_transaction',
      metadata,
      error: new Error('Network timeout'),
      dataLayer,
    });
    await OrchestrationExecutionService.recordFailure('user-1', {
      moduleId: 'ledger',
      actionType: 'record_transaction',
      metadata,
      error: new Error('Network timeout'),
      dataLayer,
    });
    const failure = await OrchestrationExecutionService.recordFailure('user-1', {
      moduleId: 'ledger',
      actionType: 'record_transaction',
      metadata,
      error: new Error('Network timeout'),
      dataLayer,
    });

    expect(failure).toMatchObject({
      errorCode: 'TRANSIENT',
      retryCount: 3,
      status: 'escalated',
    });
    expect(failure?.escalatedAt).not.toBeNull();
    expect(metadata.execution.status).toBe('failed_escalated');
  });

  it('records missing-handler failures as escalated orchestration incidents', async () => {
    const dataLayer = new InMemoryDataLayer();
    const metadata = makeMetadata();

    const failure = await OrchestrationExecutionService.recordMissingHandlerFailure('user-1', {
      moduleId: 'ledger',
      actionType: 'missing_action',
      metadata,
      dataLayer,
    });

    expect(failure).toMatchObject({
      actionType: 'missing_action',
      errorCode: 'MISSING_HANDLER',
      status: 'escalated',
    });
    expect(metadata.failure?.errorCode).toBe('MISSING_HANDLER');
    expect(metadata.execution.status).toBe('failed_escalated');
  });

  it('replays due retries and resolves the original failure on success', async () => {
    const dataLayer = new InMemoryDataLayer();
    setAraDataLayer(dataLayer);
    const metadata = makeMetadata();
    const handler = vi.fn();
    ActionHub.register('ledger', 'record_transaction_retry_success', handler);

    const snapshot = OrchestrationExecutionService.createResumableSnapshot(
      'record_transaction_retry_success',
      {
        userId: 'user-1',
        isGuest: false,
        moduleId: 'ledger',
        payload: { amount: 25 },
        persistencePolicy: 'ledger-financial',
      },
      metadata,
    );

    const failure = await OrchestrationExecutionService.recordFailure('user-1', {
      moduleId: 'ledger',
      actionType: 'record_transaction_retry_success',
      metadata,
      error: new Error('Network timeout'),
      resumableSnapshot: snapshot,
      dataLayer,
    });

    const result = await OrchestrationExecutionService.processDueRetries('user-1', {
      now: '9999-01-01T00:00:00.000Z',
      dataLayer,
    });

    expect(result).toEqual({ attempted: 1, succeeded: 1, failed: 0 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].payload).toMatchObject({
      amount: 25,
      __retryAttempt: true,
    });

    const failures = await OrchestrationExecutionService.listFailures('user-1', { executionId: 'exec-1' }, dataLayer);
    expect(failures[0]?.id).toBe(failure?.id);
    expect(failures[0]?.status).toBe('resolved');
    expect(failures[0]?.resolvedAt).toBeTruthy();
  });

  it('creates a follow-up failure when a due retry fails again', async () => {
    const dataLayer = new InMemoryDataLayer();
    setAraDataLayer(dataLayer);
    const metadata = makeMetadata();
    ActionHub.register('ledger', 'record_transaction_retry_fail', async () => {
      throw new Error('Network timeout');
    });

    const snapshot = OrchestrationExecutionService.createResumableSnapshot(
      'record_transaction_retry_fail',
      {
        userId: 'user-1',
        isGuest: false,
        moduleId: 'ledger',
        payload: { amount: 40 },
      },
      metadata,
    );

    await OrchestrationExecutionService.recordFailure('user-1', {
      moduleId: 'ledger',
      actionType: 'record_transaction_retry_fail',
      metadata,
      error: new Error('Network timeout'),
      resumableSnapshot: snapshot,
      dataLayer,
    });

    const result = await OrchestrationExecutionService.processDueRetries('user-1', {
      now: '9999-01-01T00:00:00.000Z',
      dataLayer,
    });

    expect(result).toEqual({ attempted: 1, succeeded: 0, failed: 1 });

    const failures = await OrchestrationExecutionService.listFailures('user-1', { executionId: 'exec-1' }, dataLayer);
    expect(failures).toHaveLength(2);
    expect(failures.some((failure) => failure.status === 'resolved')).toBe(true);
    expect(failures.some((failure) => failure.status === 'retry_scheduled' && failure.retryCount === 1)).toBe(true);
  });
});
