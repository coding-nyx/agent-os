import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrchestrationRuntimeService } from '@/lib/services/orchestration-runtime-service';
import { MasterThreadStatusCard } from './MasterThreadStatusCard';
import { MasterThreadService } from '@/lib/services/master-thread-service';
import { AutonomyFeatureFlags } from '@/lib/services/autonomy-feature-flags';

const createdAt = '2026-03-24T00:00:00.000Z';

describe('MasterThreadStatusCard', () => {
  afterEach(() => {
    AutonomyFeatureFlags.resetTestOverrides();
  });

  it('renders runtime summary chips and lifecycle proposal details', () => {
    const runtimeSummary = OrchestrationRuntimeService.buildTurnSummary({
      moduleId: 'nexus',
      autopilotLevel: 5,
      historyMode: 'silent',
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
          actionType: 'record_budget',
          proposalCard: {
            id: 'card-2',
            proposalId: 'proposal-2',
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
            id: 'exec-2',
            proposalId: 'proposal-2',
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

    const snapshot = MasterThreadService.createNexusShellSnapshot({
      threadId: 'thread-1',
      now: createdAt,
      pendingTargets: ['atlas'],
      lastTurnRuntime: runtimeSummary,
    });

    render(
      <MasterThreadStatusCard
        thread={snapshot.thread}
        proposalCard={snapshot.proposalCard}
        proposalEntries={snapshot.proposals}
        runtimeSummary={snapshot.runtimeSummary}
      />,
    );

    expect(screen.getByTestId('master-thread-runtime-summary')).toHaveTextContent('L5');
    expect(screen.getByTestId('master-thread-runtime-summary')).toHaveTextContent('1 pending approval');
    expect(screen.getByTestId('master-thread-runtime-summary')).toHaveTextContent('1 ghost/silent');
    expect(screen.getByTestId('master-thread-proposal')).toHaveTextContent('Record budget');
    expect(screen.getByTestId('master-thread-proposal')).toHaveTextContent('Pending approval');
    expect(screen.getByTestId('master-thread-proposal')).toHaveTextContent('Approval: high risk');
  });

  it('renders participant provenance badges for mentioned, consulted, and delegated agents', () => {
    const consultationMessages = MasterThreadService.projectConsultationArtifacts('thread-provenance-ui', [{
      id: 'consult-ui-1',
      threadId: 'thread-provenance-ui',
      sourceModuleId: 'nexus',
      targetModuleId: 'soma',
      question: 'Should tomorrow be recovery focused?',
      mode: 'state_only',
      requestedAt: createdAt,
      resolvedAt: '2026-03-24T00:03:00.000Z',
      status: 'completed',
      summary: 'Soma consulted',
      responseText: 'Yes.',
    }]);

    const snapshot = MasterThreadService.createNexusShellSnapshot({
      threadId: 'thread-provenance-ui',
      now: createdAt,
      mentionedParticipants: ['agnes'],
      seedMessages: consultationMessages,
      routingSuggestion: {
        target: 'atlas',
        reason: 'Planning intent detected',
      },
    });

    render(
      <MasterThreadStatusCard
        thread={snapshot.thread}
        proposalCard={snapshot.proposalCard}
        proposalEntries={snapshot.proposals}
      />,
    );

    expect(screen.getByTestId('master-thread-participant-agnes-reason-mentioned')).toHaveTextContent('Mentioned');
    expect(screen.getByTestId('master-thread-participant-soma-reason-consulted')).toHaveTextContent('Consulted');
    expect(screen.getByTestId('master-thread-participant-atlas-reason-delegated')).toHaveTextContent('Delegated');
  });

  it('shows retryable execution failures in the thread timeline', () => {
    const executionMessages = MasterThreadService.projectExecutionArtifacts('thread-retry-ui', [{
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
      retryPrompt: '[NEXUS_ACTION_PLAN]\n{}\n[/NEXUS_ACTION_PLAN]',
      retryAttempt: 1,
    }]);

    const snapshot = MasterThreadService.createNexusShellSnapshot({
      threadId: 'thread-retry-ui',
      now: createdAt,
      seedMessages: executionMessages,
    });

    render(<MasterThreadStatusCard thread={snapshot.thread} />);

    expect(screen.getAllByText(/Retry 1/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Retry attempt 1 available\./i)).toBeInTheDocument();
  });

  it('shows retry lineage for successful retry executions in the thread timeline', () => {
    const executionMessages = MasterThreadService.projectExecutionArtifacts('thread-retry-success', [{
      id: 'execution.exec-retry-success',
      threadId: 'thread-retry-success',
      sourceModuleId: 'atlas',
      actionType: 'schedule_block',
      proposalId: 'proposal-retry-success',
      executionId: 'exec-retry-success',
      requestedAt: createdAt,
      resolvedAt: '2026-03-24T00:01:00.000Z',
      status: 'executed',
      summary: 'Schedule cooking executed on retry attempt 1.',
      patientScope: 'USER',
      retryOfPlanId: 'plan-7',
      retryAttempt: 1,
      retryParentExecutionId: 'plan-7.node-cooking.execution',
    }]);

    const snapshot = MasterThreadService.createNexusShellSnapshot({
      threadId: 'thread-retry-success',
      now: createdAt,
      seedMessages: executionMessages,
    });

    render(<MasterThreadStatusCard thread={snapshot.thread} />);

    expect(screen.getAllByText(/Retry 1/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Schedule cooking executed on retry attempt 1\./i)).toBeInTheDocument();
    expect(screen.getAllByText(/Reply to Atlas/i).length).toBeGreaterThan(0);
  });

  it('fires the retry callback for retryable execution failures', () => {
    const executionMessages = MasterThreadService.projectExecutionArtifacts('thread-retry-ui', [{
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
      retryPrompt: '[NEXUS_ACTION_PLAN]\n{}\n[/NEXUS_ACTION_PLAN]',
      retryVisibleContent: 'Retry failed steps.',
      retryAttempt: 1,
    }]);

    const snapshot = MasterThreadService.createNexusShellSnapshot({
      threadId: 'thread-retry-ui',
      now: createdAt,
      seedMessages: executionMessages,
    });
    const onRetryExecution = vi.fn();

    render(<MasterThreadStatusCard thread={snapshot.thread} onRetryExecution={onRetryExecution} />);

    fireEvent.click(screen.getByRole('button', { name: /retry failed steps .* attempt 1/i }));
    expect(onRetryExecution).toHaveBeenCalledWith(expect.objectContaining({
      executionId: 'exec-retry',
      retryPrompt: '[NEXUS_ACTION_PLAN]\n{}\n[/NEXUS_ACTION_PLAN]',
      retryAttempt: 1,
    }));
  });

  it('allows inline defer and restore for shell-owned routing drafts', () => {
    const snapshot = MasterThreadService.createNexusShellSnapshot({
      threadId: 'thread-route',
      now: createdAt,
      routingSuggestion: {
        target: 'atlas',
        reason: 'Planning intent detected',
      },
      routingSuggestionState: 'draft',
    });

    const onProposalLifecycleChange = vi.fn();

    const { rerender } = render(
      <MasterThreadStatusCard
        thread={snapshot.thread}
        proposalCard={snapshot.proposalCard}
        proposalEntries={snapshot.proposals}
        onProposalLifecycleChange={onProposalLifecycleChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^defer$/i }));
    expect(onProposalLifecycleChange).toHaveBeenCalledWith('thread-route.proposal.route.atlas', 'deferred');

    const deferredSnapshot = MasterThreadService.createNexusShellSnapshot({
      threadId: 'thread-route',
      now: createdAt,
      routingSuggestion: {
        target: 'atlas',
        reason: 'Planning intent detected',
      },
      routingSuggestionState: 'deferred',
    });

    rerender(
      <MasterThreadStatusCard
        thread={deferredSnapshot.thread}
        proposalCard={deferredSnapshot.proposalCard}
        proposalEntries={deferredSnapshot.proposals}
        onProposalLifecycleChange={onProposalLifecycleChange}
      />,
    );

    expect(screen.getByTestId('master-thread-proposal')).toHaveTextContent('Deferred');
    fireEvent.click(screen.getByRole('button', { name: /^restore$/i }));
    expect(onProposalLifecycleChange).toHaveBeenCalledWith('thread-route.proposal.route.atlas', 'draft');
  });

  it('surfaces thread-native approve, dismiss, reroute, and inline edit controls for routing suggestions', () => {
    const snapshot = MasterThreadService.createNexusShellSnapshot({
      threadId: 'thread-route-controls',
      now: createdAt,
      routingSuggestion: {
        target: 'atlas',
        reason: 'Planning intent detected',
      },
      routingSuggestionState: 'draft',
    });

    const onApprove = vi.fn();
    const onDismiss = vi.fn();
    const onEdit = vi.fn();

    render(
      <MasterThreadStatusCard
        thread={snapshot.thread}
        proposalCard={snapshot.proposalCard}
        proposalEntries={snapshot.proposals}
        proposalActions={{
          onApprove,
          onDismiss,
          onEdit,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    expect(onApprove).toHaveBeenCalledWith(expect.objectContaining({
      proposalId: 'thread-route-controls.proposal.route.atlas',
      targetModuleId: 'atlas',
    }));

    fireEvent.click(screen.getByRole('button', { name: /^reroute$/i }));
    expect(screen.getByTestId('master-thread-inline-edit')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/target module/i), { target: { value: 'agnes' } });
    fireEvent.change(screen.getByLabelText(/routing reason/i), { target: { value: 'Needs emotional context' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ proposalId: 'thread-route-controls.proposal.route.atlas' }),
      {
        targetModuleId: 'agnes',
        reason: 'Needs emotional context',
      },
    );

    fireEvent.click(screen.getByRole('button', { name: /^dismiss$/i }));
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({
      proposalId: 'thread-route-controls.proposal.route.atlas',
    }));
  });

  it('shows an empty proposal state when the thread has no proposal', () => {
    const thread = MasterThreadService.createThread('thread-1', createdAt, [
      { moduleId: 'nexus', role: 'primary', joinedAt: createdAt, state: 'active', presence: 'online' },
    ]);

    render(<MasterThreadStatusCard thread={thread} compact />);

    expect(screen.getByTestId('master-thread-no-proposal')).toHaveTextContent(/No active proposal/i);
  });

  it('renders actor-specific thread identities when actor metadata is present', () => {
    const thread = MasterThreadService.createThread('thread-identity', createdAt, [
      {
        moduleId: 'atlas',
        role: 'secondary',
        joinedAt: createdAt,
        state: 'joined',
        presence: 'online',
        actorId: 'atlas-planner',
        actorLabel: 'Atlas Planner',
        actorShortLabel: 'AP',
      },
    ]);

    const hydrated = MasterThreadService.appendMessages(thread, [
      {
        id: 'msg-actor',
        threadId: 'thread-identity',
        author: 'atlas',
        body: 'Planning pass complete.',
        createdAt,
        participantIds: ['atlas'],
        actor: {
          actorId: 'atlas-planner',
          actorLabel: 'Atlas Planner',
          actorShortLabel: 'AP',
        },
      },
    ]);

    render(<MasterThreadStatusCard thread={hydrated} compact />);

    expect(screen.getAllByText('Atlas Planner').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/atlas planner icon/i).length).toBeGreaterThan(0);
  });

  it('falls back to module identities when chat actor identity is disabled', () => {
    AutonomyFeatureFlags.setTestOverrides({ chatActorIdentity: false });

    const thread = MasterThreadService.createThread('thread-identity-fallback', createdAt, [
      {
        moduleId: 'atlas',
        role: 'secondary',
        joinedAt: createdAt,
        state: 'joined',
        presence: 'online',
        actorId: 'atlas-planner',
        actorLabel: 'Atlas Planner',
        actorShortLabel: 'AP',
      },
    ]);

    const hydrated = MasterThreadService.appendMessages(thread, [
      {
        id: 'msg-actor-fallback',
        threadId: 'thread-identity-fallback',
        author: 'atlas',
        body: 'Planning pass complete.',
        createdAt,
        participantIds: ['atlas'],
        actor: {
          actorId: 'atlas-planner',
          actorLabel: 'Atlas Planner',
          actorShortLabel: 'AP',
        },
      },
    ]);

    render(<MasterThreadStatusCard thread={hydrated} compact />);

    expect(screen.queryByText('Atlas Planner')).not.toBeInTheDocument();
    expect(screen.getAllByText('Atlas').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/atlas icon/i).length).toBeGreaterThan(0);
  });

  it('renders participant lifecycle and presence badges', () => {
    const thread = MasterThreadService.createThread('thread-2', createdAt, [
      {
        moduleId: 'nexus',
        role: 'primary',
        joinedAt: createdAt,
        state: 'active',
        presence: 'online',
      },
      {
        moduleId: 'atlas',
        role: 'secondary',
        joinedAt: createdAt,
        state: 'invited',
        presence: 'idle',
        invitedAt: createdAt,
      },
      {
        moduleId: 'ledger',
        role: 'secondary',
        joinedAt: createdAt,
        state: 'left',
        presence: 'offline',
        leftAt: createdAt,
      },
    ]);

    render(<MasterThreadStatusCard thread={thread} compact />);

    expect(screen.getByTestId('master-thread-participant-nexus')).toHaveTextContent('Nyx');
    expect(screen.getByTestId('master-thread-participant-atlas')).toHaveTextContent('Atlas');
    expect(screen.getByTestId('master-thread-participants')).toHaveTextContent('Invited');
    expect(screen.getByTestId('master-thread-participants')).toHaveTextContent('Idle');
    expect(screen.getByTestId('master-thread-participants')).toHaveTextContent('Left');
    expect(screen.getByTestId('master-thread-participants')).toHaveTextContent('Offline');
  });

  it('renders synthesized cross-agent thread activity replies', () => {
    const runtimeSummary = OrchestrationRuntimeService.buildTurnSummary({
      moduleId: 'nexus',
      autopilotLevel: 4,
      historyMode: 'standard',
      activeThreadId: 'thread-activity',
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

    const snapshot = MasterThreadService.createNexusShellSnapshot({
      threadId: 'thread-activity',
      now: createdAt,
      lastTurnRuntime: runtimeSummary,
    });

    render(
      <MasterThreadStatusCard
        thread={snapshot.thread}
        proposalCard={snapshot.proposalCard}
        proposalEntries={snapshot.proposals}
        runtimeSummary={snapshot.runtimeSummary}
      />,
    );

    expect(screen.getByTestId('master-thread-activity')).toHaveTextContent('Thread activity');
    expect(screen.getByTestId('master-thread-activity')).toHaveTextContent('Nexus synthesized 2 runtime actions');
    expect(screen.getByTestId('master-thread-activity')).toHaveTextContent('Atlas');
    expect(screen.getByTestId('master-thread-activity')).toHaveTextContent('Reply to Nyx');
    expect(screen.getByTestId('master-thread-activity')).toHaveTextContent('Ledger');
    expect(screen.getByTestId('master-thread-activity')).toHaveTextContent('Waiting for approval because high risk');
  });

  it('renders review surfaces for silent history, ghost traces, and playback timeline', () => {
    const runtimeSummary = OrchestrationRuntimeService.buildTurnSummary({
      moduleId: 'nexus',
      autopilotLevel: 5,
      historyMode: 'silent',
      activeThreadId: 'thread-review',
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
      ],
    });

    const snapshot = MasterThreadService.createNexusShellSnapshot({
      threadId: 'thread-review',
      now: createdAt,
      lastTurnRuntime: runtimeSummary,
    });

    render(
      <MasterThreadStatusCard
        thread={snapshot.thread}
        runtimeSummary={runtimeSummary}
        silentHistoryEntries={[
          {
            id: 'silent.exec-1',
            executionId: 'exec-1',
            proposalId: 'proposal-1',
            summary: 'Record transaction executed in Ghost mode.',
            source: 'ledger',
            timestamp: '2026-03-24T00:01:00.000Z',
            patientScope: 'USER',
            metadata: {
              activeThreadId: 'thread-review',
              hiddenMessages: ['Transaction recorded for coffee.'],
            },
          },
        ]}
      />,
    );

    expect(screen.getByTestId('master-thread-review-surfaces')).toHaveTextContent('Silent History');
    expect(screen.getByTestId('master-thread-review-surfaces')).toHaveTextContent('Transaction recorded for coffee.');
    expect(screen.getByTestId('master-thread-review-surfaces')).toHaveTextContent('Ghost trace');
    expect(screen.getByTestId('master-thread-review-surfaces')).toHaveTextContent('Playback timeline');
  });

  it('opens a silent audit detail modal from the review surface', () => {
    const entry = {
      id: 'silent.exec-audit',
      executionId: 'exec-audit',
      proposalId: 'proposal-audit',
      summary: 'Ledger ghost execution completed without interrupting the thread.',
      source: 'ledger' as const,
      timestamp: '2026-03-24T00:03:00.000Z',
      patientScope: 'USER' as const,
      metadata: {
        moduleId: 'ledger',
        actionType: 'record_transaction',
        activeThreadId: 'thread-audit',
        autopilotLevel: 5,
        executionMode: 'ghost',
        historyMode: 'silent',
        dispatchStatus: 'approved',
        highRisk: false,
        runtimeAutonomy: 'ghost',
        runtimeDisposition: 'silent_execution',
        historyDestination: 'silent_audit',
        willPersistHistory: false,
        shouldNotifyUser: false,
        autonomyExplanation:
          'Executed with Ghost Mode at Autopilot L5; outcome routed to the silent audit log. Dispatch status was approved. No additional approval gate was required. No user-facing notification was sent.',
        hiddenMessages: ['Transaction recorded for coffee.', 'Budget friction updated quietly.'],
      },
    };

    render(<MasterThreadStatusCard compact silentHistoryEntries={[entry]} thread={MasterThreadService.createThread('thread-audit', createdAt, [
      { moduleId: 'nexus', role: 'primary', joinedAt: createdAt, state: 'active', presence: 'online' },
    ])} />);

    fireEvent.click(screen.getByRole('button', { name: /ledger/i }));

    expect(screen.getByTestId('silent-audit-detail-modal')).toHaveTextContent('Silent audit detail');
    expect(screen.getByTestId('silent-audit-detail-modal')).toHaveTextContent('Transaction recorded for coffee.');
    expect(screen.getByTestId('silent-audit-detail-modal')).toHaveTextContent('Budget friction updated quietly.');
    expect(screen.getByTestId('silent-audit-detail-modal')).toHaveTextContent('record_transaction');
    expect(screen.getByTestId('silent-audit-detail-modal')).toHaveTextContent('Autonomy receipt');
    expect(screen.getByTestId('silent-audit-detail-modal')).toHaveTextContent('Ghost mode');
    expect(screen.getByTestId('silent-audit-detail-modal')).toHaveTextContent('Silent execution');
    expect(screen.getByTestId('silent-audit-detail-modal')).toHaveTextContent('No user-facing notification');
  });
});
