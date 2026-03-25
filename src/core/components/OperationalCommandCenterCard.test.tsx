import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InMemoryDataLayer } from '@/lib/data-layer/in-memory-data-layer';
import type { OrchestrationTurnRuntimeSummary, SilentHistoryEntry } from '@/lib/contracts/orchestration';

const mockListFailures = vi.fn();

vi.mock('@/lib/services/orchestration-execution-service', () => ({
  OrchestrationExecutionService: {
    listFailures: (...args: unknown[]) => mockListFailures(...args),
  },
}));

import { OperationalCommandCenterCard } from './OperationalCommandCenterCard';

function makeRuntimeSummary(): OrchestrationTurnRuntimeSummary {
  return {
    moduleId: 'nexus',
    autopilotLevel: 4,
    historyMode: 'silent',
    activeThreadId: 'thread-1',
    aliveContext: null,
    shouldSuppressAssistantMessage: false,
    counts: {
      total: 1,
      visibleExecutions: 0,
      silentExecutions: 0,
      awaitingApproval: 1,
      analysisOnly: 0,
      blocked: 0,
      ephemeral: 0,
      failed: 0,
      escalated: 0,
    },
    actions: [
      {
        actionType: 'approve_budget',
        proposalId: 'proposal-approval',
        label: 'Approve budget',
        summary: 'Ledger needs an operator check before writing.',
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
    ],
  };
}

const silentHistoryEntries: SilentHistoryEntry[] = [
  {
    id: 'silent-1',
    executionId: 'exec-ghost',
    proposalId: 'proposal-ghost',
    summary: 'Ghost reconciliation completed',
    source: 'nexus',
    timestamp: '2026-03-24T14:15:00.000Z',
    patientScope: 'USER',
    metadata: {},
  },
];

describe('OperationalCommandCenterCard', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders command center queues from runtime and persisted failure data', async () => {
    const user = userEvent.setup();
    mockListFailures.mockResolvedValue([
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
    ]);

    render(
      <OperationalCommandCenterCard
        runtimeSummary={makeRuntimeSummary()}
        silentHistoryEntries={silentHistoryEntries}
        userId="user-1"
        isGuest={false}
        dataLayer={new InMemoryDataLayer()}
      />,
    );

    expect(screen.getByLabelText('Operational command center')).toBeInTheDocument();
    expect(screen.getByText(/User scope/i)).toBeInTheDocument();
    expect(screen.getByText(/Silent audit/i)).toBeInTheDocument();
    expect(screen.queryByText('Approve budget')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /expand command center queues/i }));

    expect(await screen.findByText('Approve budget')).toBeInTheDocument();
    expect(await screen.findByText('sync brief')).toBeInTheDocument();
    expect(screen.getAllByText('Ghost reconciliation completed')).toHaveLength(2);
    expect(screen.getByText(/L4 Supervised autonomy/i)).toBeInTheDocument();
  });
});
