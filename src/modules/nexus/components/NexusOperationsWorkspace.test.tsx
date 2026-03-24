import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { NexusDataLayer } from '@/lib/data-layer';
import { MasterThreadService } from '@/lib/services/master-thread-service';
import type { ThreadExecutionArtifact } from '@/lib/contracts/orchestration';
import { NexusOperationsWorkspace } from './NexusOperationsWorkspace';

vi.mock('@/core/components/OrchestrationStatusChip', () => ({
  OrchestrationStatusChip: () => <div data-testid="orchestration-status-chip" />,
}));

describe('NexusOperationsWorkspace', () => {
  it('replays retryable execution packets through the AI send path', () => {
    const createdAt = '2026-03-24T00:00:00.000Z';
    const retryPrompt = [
      'Retry the remaining action plan steps.',
      '',
      '[NEXUS_ACTION_PLAN]',
      '{"type":"nexus_action_plan","version":1,"rawInput":"update tomorrow to rest"}',
      '[/NEXUS_ACTION_PLAN]',
    ].join('\n');

    const executionArtifact: ThreadExecutionArtifact = {
      id: 'execution.exec-retry',
      threadId: 'thread-retry-ui',
      sourceModuleId: 'atlas',
      actionType: 'schedule_block',
      proposalId: 'proposal-retry',
      executionId: 'exec-retry',
      requestedAt: createdAt,
      resolvedAt: '2026-03-24T00:01:00.000Z',
      status: 'failed',
      summary: 'Scheduling failed.',
      patientScope: 'USER',
      errorMessage: 'Blocked by dependency.',
      retryable: true,
      retrySummary: 'Retry attempt 1 available.',
      retryPrompt,
      retryVisibleContent: 'Retry the failed steps.',
      retryAttempt: 1,
    };

    const snapshot = MasterThreadService.createNexusShellSnapshot({
      threadId: 'thread-retry-ui',
      now: createdAt,
      seedMessages: MasterThreadService.projectExecutionArtifacts('thread-retry-ui', [executionArtifact]),
    });

    const handleSendMessage = vi.fn().mockResolvedValue(undefined);
    const handleExecutionRetry = (artifact: ThreadExecutionArtifact) => {
      if (!artifact.retryPrompt) return;
      void handleSendMessage(artifact.retryPrompt, undefined, {
        visibleContent: artifact.retryVisibleContent ?? artifact.retrySummary ?? 'Retry failed steps.',
      });
    };

    render(
      <MemoryRouter>
        <NexusOperationsWorkspace
          ai={{
            messages: [],
            isProcessing: false,
            streamingText: '',
            error: null,
            quota: null,
            handleSendMessage,
            clearSession: vi.fn().mockResolvedValue(undefined),
          }}
          currentThreadId="thread-retry-ui"
          isGuest={false}
          userId="user-1"
          dataLayer={{} as NexusDataLayer}
          isNexusBusy={false}
          busyLabel="Idle"
          threadMonitorVisible
          setThreadMonitorVisible={vi.fn()}
          masterThreadSnapshot={snapshot}
          silentHistoryEntries={[]}
          routingSuggestion={null}
          planningSuggestion={null}
          routineProposalLabel={null}
          pendingTargets={[]}
          memorySearchState={null}
          aliveEntityState={{ context: null, isLoading: false }}
          refreshGlobalSoul={vi.fn()}
          handleInjectChat={vi.fn()}
          handleConsultModule={vi.fn()}
          handleMemoryResultClick={vi.fn()}
          handleDismissMemoryResults={vi.fn()}
          handleAliveEntitySelect={vi.fn()}
          handleThreadProposalLifecycleChange={vi.fn()}
          handleRouteConfirm={vi.fn()}
          handleRouteDismiss={vi.fn()}
          handleThreadProposalEdit={vi.fn()}
          handleExecutionRetry={handleExecutionRetry}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /retry failed steps .* attempt 1/i }));

    expect(handleSendMessage).toHaveBeenCalledWith(retryPrompt, undefined, {
      visibleContent: 'Retry the failed steps.',
    });
  });
});
