import { describe, expect, it } from 'vitest';
import { OrchestrationRuntimeService } from './orchestration-runtime-service';

describe('OrchestrationRuntimeService', () => {
  it('maps manual lock and high-risk gates to different user-facing dispositions', () => {
    expect(
      OrchestrationRuntimeService.buildRuntimeSemantics({
        autopilotLevel: 0,
        historyMode: 'standard',
        dispatchStatus: 'awaiting_approval',
        highRisk: false,
      }),
    ).toMatchObject({
      autonomy: 'manual_lock',
      disposition: 'manual_review',
      historyDestination: 'standard',
      shouldNotifyUser: true,
    });

    expect(
      OrchestrationRuntimeService.buildRuntimeSemantics({
        autopilotLevel: 4,
        historyMode: 'standard',
        dispatchStatus: 'awaiting_approval',
        highRisk: true,
      }),
    ).toMatchObject({
      autonomy: 'supervised_autonomy',
      disposition: 'high_risk_review',
      historyDestination: 'standard',
    });
  });

  it('suppresses assistant confirmations for ghost-only silent execution turns', () => {
    const runtime = OrchestrationRuntimeService.buildRuntimeSemantics({
      autopilotLevel: 5,
      historyMode: 'silent',
      dispatchStatus: 'approved',
      highRisk: false,
    });

    const summary = OrchestrationRuntimeService.buildTurnSummary({
      moduleId: 'ara',
      autopilotLevel: 5,
      historyMode: 'silent',
      decisions: [
        {
          actionType: 'record_transaction',
          proposalCard: {
            id: 'card-1',
            proposalId: 'proposal-1',
            title: 'Record transaction',
            summary: 'Record transaction requested by ara.',
            source: 'ara',
            status: 'approved',
            approvalRequirement: { required: false, reason: 'none' },
            executionMode: 'ghost',
            historyMode: 'silent',
          },
          dispatchStatus: 'approved',
          executionMode: 'ghost',
          runtime,
        },
      ],
    });

    expect(summary.counts.silentExecutions).toBe(1);
    expect(summary.shouldSuppressAssistantMessage).toBe(true);
    expect(runtime.historyDestination).toBe('silent_audit');
    expect(runtime.willPersistHistory).toBe(false);
    expect(summary.counts.failed).toBe(0);
    expect(summary.counts.escalated).toBe(0);
  });

  it('keeps assistant confirmations when silent turns also contain blocked or review actions', () => {
    const summary = OrchestrationRuntimeService.buildTurnSummary({
      moduleId: 'ara',
      autopilotLevel: 5,
      historyMode: 'silent',
      decisions: [
        {
          actionType: 'record_transaction',
          proposalCard: {
            id: 'card-1',
            proposalId: 'proposal-1',
            title: 'Record transaction',
            summary: 'Record transaction requested by ara.',
            source: 'ara',
            status: 'approved',
            approvalRequirement: { required: false, reason: 'none' },
            executionMode: 'ghost',
            historyMode: 'silent',
          },
          dispatchStatus: 'approved',
          executionMode: 'ghost',
          runtime: OrchestrationRuntimeService.buildRuntimeSemantics({
            autopilotLevel: 5,
            historyMode: 'silent',
            dispatchStatus: 'approved',
            highRisk: false,
          }),
        },
        {
          actionType: 'record_budget',
          proposalCard: {
            id: 'card-2',
            proposalId: 'proposal-2',
            title: 'Record budget',
            summary: 'Record budget requested by ara.',
            source: 'ara',
            status: 'pending_approval',
            approvalRequirement: { required: true, reason: 'high_risk' },
            executionMode: 'manual',
            historyMode: 'standard',
          },
          dispatchStatus: 'awaiting_approval',
          executionMode: 'manual',
          runtime: OrchestrationRuntimeService.buildRuntimeSemantics({
            autopilotLevel: 4,
            historyMode: 'standard',
            dispatchStatus: 'awaiting_approval',
            highRisk: true,
          }),
        },
      ],
    });

    expect(summary.counts.silentExecutions).toBe(1);
    expect(summary.counts.awaitingApproval).toBe(1);
    expect(summary.shouldSuppressAssistantMessage).toBe(false);
    expect(summary.counts.failed).toBe(0);
  });

  it('surfaces failed and escalated execution counts in runtime summaries', () => {
    const summary = OrchestrationRuntimeService.buildTurnSummary({
      moduleId: 'ledger',
      autopilotLevel: 4,
      historyMode: 'standard',
      decisions: [
        {
          actionType: 'record_transaction',
          proposalCard: {
            id: 'card-1',
            proposalId: 'proposal-1',
            title: 'Record transaction',
            summary: 'Record transaction requested by ledger.',
            source: 'ledger',
            status: 'failed',
            approvalRequirement: { required: false, reason: 'none' },
            executionMode: 'autonomous',
            historyMode: 'standard',
          },
          dispatchStatus: 'approved',
          executionMode: 'autonomous',
          execution: {
            id: 'exec-1',
            proposalId: 'proposal-1',
            source: 'ledger',
            autopilotLevel: 4,
            executionMode: 'autonomous',
            historyMode: 'standard',
            patientScope: 'USER',
            executedAt: '2026-03-24T04:00:00.000Z',
            status: 'failed_escalated',
          },
          failure: {
            id: 'exec-1.failure.3',
            executionId: 'exec-1',
            proposalId: 'proposal-1',
            moduleId: 'ledger',
            actionType: 'record_transaction',
            threadId: 'thread-1',
            patientScope: 'USER',
            errorMessage: 'Permission denied',
            errorName: 'Error',
            errorCode: 'PERMISSION',
            retryCount: 2,
            maxRetries: 3,
            failedAt: '2026-03-24T04:00:00.000Z',
            nextRetryAt: null,
            escalatedAt: '2026-03-24T04:00:00.000Z',
            status: 'escalated',
          },
          runtime: {
            autopilotLevel: 4,
            autonomy: 'supervised_autonomy',
            disposition: 'incident_review',
            historyDestination: 'standard',
            willPersistHistory: true,
            shouldNotifyUser: true,
          },
        },
      ],
    });

    expect(summary.counts.visibleExecutions).toBe(0);
    expect(summary.counts.failed).toBe(1);
    expect(summary.counts.escalated).toBe(1);
    expect(summary.shouldSuppressAssistantMessage).toBe(false);
    expect(summary.actions[0].failure?.status).toBe('escalated');
  });

  it('surfaces alive entity context alongside runtime summaries', () => {
    const summary = OrchestrationRuntimeService.buildTurnSummary({
      moduleId: 'ara',
      autopilotLevel: 3,
      historyMode: 'standard',
      aliveEntities: [
        {
          id: 'alive.goal.goal-1',
          type: 'ACTION',
          label: 'Ship runtime phase',
          semantic_tags: ['atlas', 'goal', 'active'],
          attributes: {},
          soul_impact_preset: { bandwidth: 0.6 },
          sourceModule: 'atlas',
          provenance: 'adapter',
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T01:00:00.000Z',
        },
        {
          id: 'alive.ledger.goal.goal-2',
          type: 'ACTION',
          label: 'Stabilize runway',
          semantic_tags: ['ledger', 'financial-goal', 'high'],
          attributes: {},
          soul_impact_preset: { output: 0.4 },
          sourceModule: 'ledger',
          provenance: 'adapter',
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T02:00:00.000Z',
        },
      ],
      decisions: [],
    });

    expect(summary.aliveContext).toMatchObject({
      total: 2,
      moduleIds: ['ledger', 'atlas'],
      lastUpdatedAt: '2026-03-24T02:00:00.000Z',
    });
    expect(summary.aliveContext?.byModule.ledger?.[0].label).toBe('Stabilize runway');
  });

  it('counts incident review actions as approval-visible runtime work', () => {
    const summary = OrchestrationRuntimeService.buildTurnSummary({
      moduleId: 'ara',
      autopilotLevel: 4,
      historyMode: 'standard',
      decisions: [
        {
          actionType: 'record_transaction',
          proposalCard: {
            id: 'card-incident',
            proposalId: 'proposal-incident',
            title: 'Record transaction',
            summary: 'Transaction execution failed.',
            source: 'ara',
            status: 'incident',
            approvalRequirement: { required: false, reason: 'none' },
            executionMode: 'autonomous',
            historyMode: 'standard',
          },
          dispatchStatus: 'approved',
          executionMode: 'autonomous',
          execution: {
            id: 'exec-incident',
            proposalId: 'proposal-incident',
            source: 'ara',
            autopilotLevel: 4,
            executionMode: 'autonomous',
            historyMode: 'standard',
            patientScope: 'USER',
            executedAt: '2024-01-01T00:00:00.000Z',
            status: 'failed_escalated',
          },
          runtime: {
            autopilotLevel: 4,
            autonomy: 'supervised_autonomy',
            disposition: 'incident_review',
            historyDestination: 'standard',
            willPersistHistory: true,
            shouldNotifyUser: true,
          },
        },
      ],
    });

    expect(summary.counts.awaitingApproval).toBe(0);
    expect(summary.counts.failed).toBe(1);
    expect(summary.counts.escalated).toBe(1);
    expect(summary.actions[0].executionStatus).toBe('failed_escalated');
    expect(OrchestrationRuntimeService.getNoticePrefix(summary.actions[0].runtime)).toBe(
      'Execution failed and requires incident review',
    );
  });
});
