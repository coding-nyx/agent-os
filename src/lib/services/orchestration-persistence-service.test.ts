import { describe, expect, it } from 'vitest';
import { InMemoryDataLayer } from '@/lib/data-layer/in-memory-data-layer';
import type { BatchOperation } from '@/lib/data-layer';
import type { ActionOrchestrationMetadata } from '@/lib/contracts/orchestration';
import {
  ORCHESTRATION_EXECUTION_SUBCOLLECTION,
  ORCHESTRATION_EXECUTION_FAILURE_SUBCOLLECTION,
  ORCHESTRATION_PROPOSAL_SUBCOLLECTION,
  ORCHESTRATION_THREAD_SUBCOLLECTION,
  OrchestrationPersistenceService,
} from './orchestration-persistence-service';

function makeMetadata(overrides: Partial<ActionOrchestrationMetadata> = {}): ActionOrchestrationMetadata {
  const proposalId = overrides.proposal?.id ?? 'proposal-1';
  const executedAt = overrides.execution?.executedAt ?? overrides.proposal?.createdAt ?? '2024-01-01T00:00:00.000Z';

  return {
    actionType: 'record_transaction',
    activeThreadId: 'thread-1',
    autopilotLevel: 4,
    proposal: {
      id: proposalId,
      source: 'ledger',
      intent: 'Record transaction',
      confidence: 0.91,
      patientScope: 'USER',
      createdAt: executedAt,
      metadata: { mutatesState: true },
      ...overrides.proposal,
    },
    proposalCard: {
      id: `card.${proposalId}`,
      proposalId,
      title: 'Record transaction',
      summary: 'Record transaction requested by ledger.',
      source: 'ledger',
      status: 'approved',
      approvalRequirement: { required: false, reason: 'none' },
      executionMode: 'autonomous',
      historyMode: 'standard',
      ...overrides.proposalCard,
    },
    approvalRequirement: { required: false, reason: 'none' },
    executionMode: 'autonomous',
    historyMode: 'standard',
    patientScope: 'USER',
    execution: {
      id: `exec.${proposalId}`,
      proposalId,
      source: 'ledger',
      autopilotLevel: 4,
      executionMode: 'autonomous',
      historyMode: 'standard',
      patientScope: 'USER',
      executedAt,
      status: 'executed',
      ...overrides.execution,
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
      ...overrides.runtime,
    },
    ...overrides,
  };
}

function collectUndefinedPaths(value: unknown, path = 'root'): string[] {
  if (value === undefined) return [path];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectUndefinedPaths(entry, `${path}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => collectUndefinedPaths(entry, `${path}.${key}`));
  }
  return [];
}

class FirestoreValidatingDataLayer extends InMemoryDataLayer {
  override async batchWrite(operations: BatchOperation[]): Promise<void> {
    const undefinedPaths = operations.flatMap((operation, index) =>
      collectUndefinedPaths(operation.data, `operations[${index}].data`),
    );
    if (undefinedPaths.length > 0) {
      throw new Error(`Firestore-unsafe undefined value(s): ${undefinedPaths.join(', ')}`);
    }
    await super.batchWrite(operations);
  }
}

describe('OrchestrationPersistenceService', () => {
  it('persists proposal, execution, and thread artifacts to user-scoped collections', async () => {
    const dataLayer = new InMemoryDataLayer();
    const metadata = makeMetadata();

    await OrchestrationPersistenceService.persistRuntimeArtifacts(
      'user-1',
      {
        moduleId: 'ledger',
        decisions: [metadata],
        runtimeSummary: {
          moduleId: 'ledger',
          autopilotLevel: 4,
          historyMode: 'standard',
          activeThreadId: 'thread-1',
          actions: [],
          aliveContext: null,
          counts: {
            total: 1,
            visibleExecutions: 1,
            silentExecutions: 0,
            awaitingApproval: 0,
            analysisOnly: 0,
            blocked: 0,
            ephemeral: 0,
            failed: 0,
            escalated: 0,
          },
          shouldSuppressAssistantMessage: false,
        },
      },
      dataLayer,
    );

    const proposals = await dataLayer.listDocuments(`users/user-1/${ORCHESTRATION_PROPOSAL_SUBCOLLECTION}`);
    const executions = await dataLayer.listDocuments(`users/user-1/${ORCHESTRATION_EXECUTION_SUBCOLLECTION}`);
    const threads = await dataLayer.listDocuments(`users/user-1/${ORCHESTRATION_THREAD_SUBCOLLECTION}`);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toEqual(expect.objectContaining({
      id: 'proposal-1',
      moduleId: 'ledger',
      executionId: 'exec.proposal-1',
    }));

    expect(executions).toHaveLength(1);
    expect(executions[0]).toEqual(expect.objectContaining({
      id: 'exec.proposal-1',
      moduleId: 'ledger',
      actionType: 'record_transaction',
    }));

    expect(threads).toHaveLength(1);
    expect(threads[0]).toEqual(expect.objectContaining({
      id: 'thread-1',
      moduleId: 'ledger',
      threadId: 'thread-1',
    }));
  });

  it('applies retention pruning to proposal and execution collections', async () => {
    const dataLayer = new InMemoryDataLayer();

    await OrchestrationPersistenceService.persistRuntimeArtifacts(
      'user-1',
      {
        moduleId: 'ledger',
        decisions: [
          makeMetadata({
            proposal: { id: 'proposal-1', createdAt: '2024-01-01T00:00:00.000Z' },
            execution: { id: 'exec-1', proposalId: 'proposal-1', executedAt: '2024-01-01T00:00:00.000Z' },
          }),
          makeMetadata({
            proposal: { id: 'proposal-2', createdAt: '2024-01-02T00:00:00.000Z' },
            execution: { id: 'exec-2', proposalId: 'proposal-2', executedAt: '2024-01-02T00:00:00.000Z' },
          }),
          makeMetadata({
            proposal: { id: 'proposal-3', createdAt: '2024-01-03T00:00:00.000Z' },
            execution: { id: 'exec-3', proposalId: 'proposal-3', executedAt: '2024-01-03T00:00:00.000Z' },
          }),
        ],
        retention: {
          proposals: 2,
          executions: 2,
          threads: 1,
        },
      },
      dataLayer,
    );

    const proposals = await OrchestrationPersistenceService.listProposalRecords('user-1', undefined, dataLayer);
    const executions = await OrchestrationPersistenceService.listExecutionRecords('user-1', undefined, dataLayer);

    expect(proposals.map((record) => record.id)).toEqual(['proposal-3', 'proposal-2']);
    expect(executions.map((record) => record.id)).toEqual(['exec-3', 'exec-2']);
  });

  it('returns a migration-safe fallback thread state when no persisted document exists', async () => {
    const dataLayer = new InMemoryDataLayer();

    const threadState = await OrchestrationPersistenceService.getThreadState(
      'user-1',
      {
        moduleId: 'nexus',
        threadId: 'missing-thread',
        now: '2024-01-01T00:00:00.000Z',
      },
      dataLayer,
    );

    expect(threadState.id).toBe('missing-thread');
    expect(threadState.snapshot.thread.threadId).toBe('missing-thread');
    expect(threadState.snapshot.proposals).toEqual([]);
    expect(threadState.snapshot.runtimeSummary).toBeNull();
  });

  it('sanitizes undefined nested fields before persisting runtime artifacts', async () => {
    const dataLayer = new FirestoreValidatingDataLayer();
    const metadata = makeMetadata();

    metadata.proposal.metadata = {
      mutatesState: true,
      nested: {
        keep: 'value',
        removeMe: undefined,
      },
      steps: ['queued', undefined, 'done'],
    } as any;

    (metadata.execution as any).audit = {
      keep: true,
      details: {
        note: 'persist me',
        optional: undefined,
      },
    };

    await OrchestrationPersistenceService.persistRuntimeArtifacts(
      'user-1',
      {
        moduleId: 'ledger',
        decisions: [metadata],
        runtimeSummary: {
          moduleId: 'ledger',
          autopilotLevel: 4,
          historyMode: 'standard',
          activeThreadId: 'thread-1',
          actions: [],
          aliveContext: {
            total: 1,
            moduleIds: ['ledger'],
            byModule: {
              ledger: [
                {
                  id: 'entity-1',
                  label: 'Primary ledger entity',
                  type: 'other' as any,
                  sourceModule: 'ledger',
                  provenance: 'native',
                  semantic_tags: ['finance'],
                  updatedAt: '2024-01-01T00:00:00.000Z',
                  sourceEntityId: undefined,
                },
              ],
            },
            tags: ['finance'],
            lastUpdatedAt: '2024-01-01T00:00:00.000Z',
          } as any,
          counts: {
            total: 1,
            visibleExecutions: 1,
            silentExecutions: 0,
            awaitingApproval: 0,
            analysisOnly: 0,
            blocked: 0,
            ephemeral: 0,
            failed: 0,
            escalated: 0,
          },
          shouldSuppressAssistantMessage: false,
        },
      },
      dataLayer,
    );

    const [proposal] = await dataLayer.listDocuments<any>(`users/user-1/${ORCHESTRATION_PROPOSAL_SUBCOLLECTION}`);
    const [execution] = await dataLayer.listDocuments<any>(`users/user-1/${ORCHESTRATION_EXECUTION_SUBCOLLECTION}`);
    const [thread] = await dataLayer.listDocuments<any>(`users/user-1/${ORCHESTRATION_THREAD_SUBCOLLECTION}`);

    expect(proposal.proposal.metadata).toEqual({
      mutatesState: true,
      nested: { keep: 'value' },
      steps: ['queued', null, 'done'],
    });
    expect(execution.execution.audit).toEqual({
      keep: true,
      details: {
        note: 'persist me',
      },
    });
    expect(thread.snapshot.runtimeSummary.aliveContext.byModule.ledger[0]).toEqual({
      id: 'entity-1',
      label: 'Primary ledger entity',
      type: 'other',
      sourceModule: 'ledger',
      provenance: 'native',
      semantic_tags: ['finance'],
      updatedAt: '2024-01-01T00:00:00.000Z',
    });
  });

  it('omits undefined thread resolution fields from persisted snapshots', async () => {
    const dataLayer = new FirestoreValidatingDataLayer();

    await OrchestrationPersistenceService.persistRuntimeArtifacts(
      'user-1',
      {
        moduleId: 'nexus',
        runtimeSummary: {
          moduleId: 'nexus',
          autopilotLevel: 4,
          historyMode: 'standard',
          activeThreadId: 'nexus.shell',
          actions: [],
          aliveContext: null,
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
        },
      },
      dataLayer,
    );

    const [thread] = await dataLayer.listDocuments<any>(`users/user-1/${ORCHESTRATION_THREAD_SUBCOLLECTION}`);

    expect(thread.snapshot.thread.resolution.status).toBe('open');
    expect(thread.snapshot.thread.resolution.winningProposalId).toBeUndefined();
    expect('winningProposalId' in thread.snapshot.thread.resolution).toBe(false);
  });

  it('refuses to persist guest-scoped decisions into user orchestration collections', async () => {
    const dataLayer = new InMemoryDataLayer();
    const guestDecision = makeMetadata({
      patientScope: 'GUEST',
      proposal: {
        id: 'proposal-guest',
        patientScope: 'GUEST',
      } as any,
      execution: {
        id: 'exec-guest',
        proposalId: 'proposal-guest',
        patientScope: 'GUEST',
      } as any,
    });

    await OrchestrationPersistenceService.persistRuntimeArtifacts(
      'user-1',
      {
        moduleId: 'ledger',
        decisions: [guestDecision],
        runtimeSummary: {
          moduleId: 'ledger',
          autopilotLevel: 4,
          historyMode: 'standard',
          activeThreadId: 'thread-guest',
          actions: [
            {
              actionType: 'record_transaction',
              proposalId: 'proposal-guest',
              label: 'Record transaction',
              summary: 'Guest preview only.',
              source: 'ledger',
              status: 'blocked',
              approvalRequirement: { required: false, reason: 'guest_scope' },
              dispatchStatus: 'analysis_only',
              executionMode: 'analysis_only',
              historyMode: 'standard',
              executionStatus: 'analysis_only',
              patientScope: 'GUEST',
              executedAt: null,
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
          aliveContext: null,
          counts: {
            total: 1,
            visibleExecutions: 0,
            silentExecutions: 0,
            awaitingApproval: 0,
            analysisOnly: 1,
            blocked: 0,
            ephemeral: 0,
            failed: 0,
            escalated: 0,
          },
          shouldSuppressAssistantMessage: false,
        },
      },
      dataLayer,
    );

    const proposals = await dataLayer.listDocuments(`users/user-1/${ORCHESTRATION_PROPOSAL_SUBCOLLECTION}`);
    const executions = await dataLayer.listDocuments(`users/user-1/${ORCHESTRATION_EXECUTION_SUBCOLLECTION}`);
    const [thread] = await dataLayer.listDocuments<any>(`users/user-1/${ORCHESTRATION_THREAD_SUBCOLLECTION}`);

    expect(proposals).toEqual([]);
    expect(executions).toEqual([]);
    expect(thread.snapshot.runtimeSummary.actions).toEqual([]);
    expect(thread.snapshot.runtimeSummary.counts.total).toBe(0);
  });

  it('persists and lists execution failures in a dedicated collection', async () => {
    const dataLayer = new FirestoreValidatingDataLayer();

    await OrchestrationPersistenceService.persistExecutionFailure(
      'user-1',
      {
        id: 'exec-1.failure.1',
        executionId: 'exec-1',
        proposalId: 'proposal-1',
        moduleId: 'ledger',
        actionType: 'record_transaction',
        threadId: 'thread-1',
        patientScope: 'USER',
        errorMessage: 'Network timeout',
        errorName: 'Error',
        errorCode: 'TRANSIENT',
        retryCount: 0,
        maxRetries: 3,
        failedAt: '2024-01-01T00:00:10.000Z',
        nextRetryAt: '2024-01-01T00:00:11.000Z',
        escalatedAt: null,
        status: 'retry_scheduled',
        metadata: {
          keep: 'value',
          removeMe: undefined,
        } as any,
      },
      dataLayer,
    );

    const failures = await dataLayer.listDocuments<any>(`users/user-1/${ORCHESTRATION_EXECUTION_FAILURE_SUBCOLLECTION}`);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toEqual(expect.objectContaining({
      id: 'exec-1.failure.1',
      executionId: 'exec-1',
      status: 'retry_scheduled',
      metadata: { keep: 'value' },
    }));

    const listed = await OrchestrationPersistenceService.listExecutionFailures('user-1', { executionId: 'exec-1' }, dataLayer);
    expect(listed.map((record) => record.id)).toEqual(['exec-1.failure.1']);
  });
});
