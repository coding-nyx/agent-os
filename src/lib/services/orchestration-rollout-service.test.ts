import { beforeEach, describe, expect, it } from 'vitest';
import { OrchestrationRuntimeService } from './orchestration-runtime-service';
import { OrchestrationRolloutService } from './orchestration-rollout-service';

describe('OrchestrationRolloutService', () => {
  beforeEach(() => {
    OrchestrationRolloutService.resetForTests();
  });

  it('tracks parse outcomes, routing paths, and planning outcomes', () => {
    OrchestrationRolloutService.recordParsedCommand({
      rawInput: 'plan my day tomorrow',
      normalizedInput: 'plan my day tomorrow',
      parserVersion: 'phase1-v1',
      sourceModuleId: 'ara',
      generatedAt: '2026-03-24T00:00:00.000Z',
      timezone: 'UTC',
      confidence: 0.84,
      intents: [],
      temporalReferences: [],
      sharedRouteHints: [],
      requiresClarification: false,
      ambiguityReasons: [],
    });
    OrchestrationRolloutService.recordParsedCommand({
      rawInput: 'move it',
      normalizedInput: 'move it',
      parserVersion: 'phase1-v1',
      sourceModuleId: 'ara',
      generatedAt: '2026-03-24T00:00:00.000Z',
      timezone: 'UTC',
      confidence: 0.41,
      intents: [],
      temporalReferences: [],
      sharedRouteHints: [],
      requiresClarification: true,
      ambiguityReasons: ['missing time'],
    });
    OrchestrationRolloutService.recordRoutingDecision({ target: 'atlas', confidence: 0.9, reason: 'command:planning' });
    OrchestrationRolloutService.recordRoutingDecision({ target: 'scout', confidence: 0.78, reason: 'capability:scout-default' });
    OrchestrationRolloutService.recordRoutingDecision({ target: 'agnes', confidence: 0.72, reason: 'matched:anxiety(1)' });
    OrchestrationRolloutService.recordRoutingDecision({ target: 'ara', confidence: 0.45, reason: 'default_ara' });
    OrchestrationRolloutService.recordPlanningAttempt(true);
    OrchestrationRolloutService.recordPlanningAttempt(false);

    expect(OrchestrationRolloutService.getSnapshot()).toMatchObject({
      parseSuccesses: 1,
      parseClarifications: 1,
      parsedRouteHits: 1,
      capabilityRouteHits: 1,
      keywordRouteHits: 1,
      defaultRouteHits: 1,
      planningBuilds: 1,
      planningSkips: 1,
    });
  });

  it('tracks approval interruptions and execution failures per action', () => {
    OrchestrationRuntimeService.buildTurnSummary({
      moduleId: 'ara',
      autopilotLevel: 4,
      historyMode: 'standard',
      decisions: [
        {
          actionType: 'schedule_item',
          proposalCard: {
            id: 'card-1',
            proposalId: 'proposal-1',
            title: 'Schedule item',
            summary: 'Schedule item requested by atlas.',
            source: 'atlas',
            status: 'pending_approval',
            approvalRequirement: { required: true, reason: 'manual_level' },
            executionMode: 'manual',
            historyMode: 'standard',
          },
          dispatchStatus: 'awaiting_approval',
          executionMode: 'manual',
          runtime: OrchestrationRuntimeService.buildRuntimeSemantics({
            autopilotLevel: 4,
            historyMode: 'standard',
            dispatchStatus: 'awaiting_approval',
            highRisk: false,
          }),
        },
        {
          actionType: 'update_schedule',
          proposalCard: {
            id: 'card-2',
            proposalId: 'proposal-2',
            title: 'Update schedule',
            summary: 'Update schedule requested by atlas.',
            source: 'atlas',
            status: 'blocked',
            approvalRequirement: { required: false, reason: 'none' },
            executionMode: 'manual',
            historyMode: 'standard',
          },
          dispatchStatus: 'blocked',
          executionMode: 'manual',
          runtime: OrchestrationRuntimeService.buildRuntimeSemantics({
            autopilotLevel: 4,
            historyMode: 'standard',
            dispatchStatus: 'blocked',
            highRisk: false,
          }),
          execution: {
            id: 'exec-2',
            proposalId: 'proposal-2',
            source: 'atlas',
            autopilotLevel: 4,
            executionMode: 'manual',
            historyMode: 'standard',
            patientScope: 'USER',
            executedAt: '2026-03-24T00:01:00.000Z',
            status: 'failed',
          },
          failure: {
            id: 'failure-1',
            executionId: 'exec-2',
            proposalId: 'proposal-2',
            moduleId: 'atlas',
            actionType: 'update_schedule',
            threadId: 'thread-1',
            patientScope: 'USER',
            errorMessage: 'failed',
            errorName: 'Error',
            errorCode: 'UNKNOWN',
            retryCount: 0,
            maxRetries: 0,
            failedAt: '2026-03-24T00:01:00.000Z',
            nextRetryAt: null,
            escalatedAt: null,
            status: 'failed',
          },
        },
      ],
    });

    expect(OrchestrationRolloutService.getSnapshot()).toMatchObject({
      approvalInterruptions: 1,
      executionFailures: 1,
      executionFailureByAction: {
        update_schedule: 1,
      },
    });
  });
});
