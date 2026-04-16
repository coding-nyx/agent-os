import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionOrchestrationMetadata } from '@/lib/contracts/orchestration';
import { InMemoryDataLayer } from '@/lib/data-layer/in-memory-data-layer';
import { OrchestrationHistoryService } from './orchestration-history-service';

const dataLayerSpies = vi.hoisted(() => ({
  batchWrite: vi.fn(),
  listDocuments: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/lib/data-layer/provider', () => ({
  getAraDataLayer: vi.fn(() => dataLayerSpies),
}));

function makeMetadata(
  overrides: Partial<ActionOrchestrationMetadata> = {},
): ActionOrchestrationMetadata {
  return {
    actionType: 'record_transaction',
    activeThreadId: 'thread-1',
    autopilotLevel: 5,
    proposal: {
      id: 'proposal-1',
      source: 'ledger',
      intent: 'Record transaction',
      confidence: 0.91,
      patientScope: 'USER',
      createdAt: '2024-01-01T00:00:00.000Z',
      metadata: { mutatesState: true },
    },
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
    approvalRequirement: { required: false, reason: 'none' },
    executionMode: 'ghost',
    historyMode: 'silent',
    patientScope: 'USER',
    execution: {
      id: 'exec-1',
      proposalId: 'proposal-1',
      source: 'ledger',
      autopilotLevel: 5,
      executionMode: 'ghost',
      historyMode: 'silent',
      patientScope: 'USER',
      executedAt: '2024-01-01T00:00:00.000Z',
      status: 'executed',
    },
    mutatesState: true,
    highRisk: false,
    dispatchStatus: 'approved',
    runtime: {
      autopilotLevel: 5,
      autonomy: 'ghost',
      disposition: 'silent_execution',
      historyDestination: 'silent_audit',
      willPersistHistory: false,
      shouldNotifyUser: false,
    },
    ...overrides,
  };
}

describe('OrchestrationHistoryService', () => {
  beforeEach(() => {
    dataLayerSpies.batchWrite.mockReset();
    dataLayerSpies.listDocuments.mockReset();
    dataLayerSpies.listDocuments.mockResolvedValue([]);
  });

  it('routes ghost assistant messages to silent history instead of visible chat', () => {
    const metadata = makeMetadata();

    expect(OrchestrationHistoryService.getAssistantMessageChannel(metadata)).toBe('silent_history');
  });

  it('drops guest-scoped silent history entries from audit persistence', async () => {
    const metadata = makeMetadata({
      patientScope: 'GUEST',
      proposal: {
        ...makeMetadata().proposal,
        patientScope: 'GUEST',
      },
      execution: {
        ...makeMetadata().execution,
        patientScope: 'GUEST',
      },
    });

    const entry = OrchestrationHistoryService.buildSilentHistoryEntry({
      moduleId: 'ledger',
      metadata,
      suppressedMessages: ['Guest preview only.'],
    });

    expect(entry).toBeNull();

    await OrchestrationHistoryService.persistSilentHistory('user-1', [
      {
        id: 'silent-guest',
        executionId: 'exec-guest',
        proposalId: 'proposal-guest',
        summary: 'Guest preview only.',
        source: 'ledger',
        timestamp: '2024-01-01T00:00:00.000Z',
        patientScope: 'GUEST',
      },
    ]);

    expect(dataLayerSpies.batchWrite).not.toHaveBeenCalled();
  });

  it('keeps non-silent executions on the visible chat channel', () => {
    const metadata = makeMetadata({
      historyMode: 'standard',
      executionMode: 'autonomous',
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
      runtime: {
        autopilotLevel: 4,
        autonomy: 'supervised_autonomy',
        disposition: 'visible_execution',
        historyDestination: 'standard',
        willPersistHistory: true,
        shouldNotifyUser: true,
      },
    });

    expect(OrchestrationHistoryService.getAssistantMessageChannel(metadata)).toBe('visible');
  });


  it('lists silent history with migration-safe empty defaults and prunes old entries', async () => {
    const dataLayer = new InMemoryDataLayer();

    expect(await OrchestrationHistoryService.listSilentHistory('user-1', { dataLayer })).toEqual([]);

    await OrchestrationHistoryService.persistSilentHistory(
      'user-1',
      [
        {
          id: 'silent-1',
          executionId: 'exec-1',
          proposalId: 'proposal-1',
          summary: 'Old entry',
          source: 'ledger',
          timestamp: '2024-01-01T00:00:00.000Z',
          patientScope: 'USER',
        },
        {
          id: 'silent-2',
          executionId: 'exec-2',
          proposalId: 'proposal-2',
          summary: 'New entry',
          source: 'ledger',
          timestamp: '2024-01-02T00:00:00.000Z',
          patientScope: 'USER',
        },
      ],
      { dataLayer, retentionLimit: 1 },
    );

    const entries = await OrchestrationHistoryService.listSilentHistory('user-1', { dataLayer });
    expect(entries.map((entry) => entry.id)).toEqual(['silent-2']);
  });

  it('filters silent history by active thread id', async () => {
    const dataLayer = new InMemoryDataLayer();

    await OrchestrationHistoryService.persistSilentHistory(
      'user-1',
      [
        {
          id: 'silent-thread-1',
          executionId: 'exec-1',
          proposalId: 'proposal-1',
          summary: 'Ghost execution for thread 1',
          source: 'ledger',
          timestamp: '2024-01-02T00:00:00.000Z',
          patientScope: 'USER',
          metadata: {
            activeThreadId: 'thread-1',
          },
        },
        {
          id: 'silent-thread-2',
          executionId: 'exec-2',
          proposalId: 'proposal-2',
          summary: 'Ghost execution for thread 2',
          source: 'atlas',
          timestamp: '2024-01-03T00:00:00.000Z',
          patientScope: 'USER',
          metadata: {
            activeThreadId: 'thread-2',
          },
        },
      ],
      { dataLayer, retentionLimit: 10 },
    );

    const entries = await OrchestrationHistoryService.listSilentHistoryForThread('user-1', 'thread-1', {
      dataLayer,
      limit: 5,
    });

    expect(entries.map((entry) => entry.id)).toEqual(['silent-thread-1']);
  });

  it('persists silent history entries to a dedicated collection path', async () => {
    const metadata = makeMetadata();
    const entry = OrchestrationHistoryService.buildSilentHistoryEntry({
      moduleId: 'ledger',
      metadata,
      suppressedMessages: ['Transaction recorded for coffee.'],
    });

    expect(entry).not.toBeNull();

    await OrchestrationHistoryService.persistSilentHistory('user-1', [entry!]);

    expect(dataLayerSpies.batchWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'set',
        collection: 'users/user-1/orchestration_silent_history',
        id: 'silent.exec-1',
        data: expect.objectContaining({
          summary: 'Transaction recorded for coffee.',
          executionId: 'exec-1',
          metadata: expect.objectContaining({
            moduleId: 'ledger',
            autonomyExplanation: expect.stringContaining('Executed with Ghost Mode at Autopilot L5'),
            hiddenMessages: ['Transaction recorded for coffee.'],
          }),
        }),
      }),
    ]);
  });

  it('builds a user-facing autonomy explanation for silent executions', () => {
    const metadata = makeMetadata();

    expect(OrchestrationHistoryService.generateAutonomyExplanation(metadata)).toContain(
      'Executed with Ghost Mode at Autopilot L5',
    );
    expect(OrchestrationHistoryService.generateAutonomyExplanation(metadata)).toContain(
      'routed to the silent audit log',
    );
    expect(OrchestrationHistoryService.generateAutonomyExplanation(metadata)).toContain(
      'No user-facing notification was sent.',
    );
  });
});
