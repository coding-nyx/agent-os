import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionHub } from '@/lib/actions/action-hub';
import type { NexusActionPlanExecutionPacket } from '@/lib/contracts/nexus-action-plan';
import { NexusActionDispatchExecutionService } from './nexus-action-dispatch-execution-service';

describe('NexusActionDispatchExecutionService', () => {
  beforeEach(() => {
    ActionHub.register('atlas', 'schedule_block', vi.fn().mockResolvedValue(undefined));
    ActionHub.register('atlas', 'flatten_schedule', vi.fn().mockResolvedValue(undefined));
  });

  it('executes resolved nodes and leaves follow-up nodes untouched', async () => {
    const packet: NexusActionPlanExecutionPacket = {
      type: 'nexus_action_plan',
      version: 1,
      planId: 'plan-1',
      sourceThreadId: 'nexus.dashboard',
      title: 'Coordinate planning',
      summary: 'Rest then cooking.',
      rawInput: 'update tomorrow to rest, schedule cooking at 1100 tomorrow',
      primaryTargetModuleId: 'atlas',
      supportingTargetModuleIds: [],
      requiresApproval: true,
      nodes: [],
      dispatchPlan: [
        {
          nodeId: 'node-followup',
          targetModuleId: 'atlas',
          sourceActionType: 'plan_day',
          resolvedActionType: null,
          payload: {},
          dependsOn: [],
          status: 'requires_followup',
          reason: 'Needs generated blocks.',
        },
        {
          nodeId: 'node-rest',
          targetModuleId: 'atlas',
          sourceActionType: 'recovery_day',
          resolvedActionType: 'flatten_schedule',
          payload: { flattenedUntil: '2026-03-25T23:59:59', activeLoad: 2 },
          dependsOn: [],
          status: 'resolved',
        },
        {
          nodeId: 'node-cooking',
          targetModuleId: 'atlas',
          sourceActionType: 'schedule_item',
          resolvedActionType: 'schedule_block',
          payload: { title: 'cooking', scheduledAt: '2026-03-25T11:00:00', duration: 60, category: 'other' },
          dependsOn: [],
          status: 'resolved',
        },
      ],
    };

    const results = await NexusActionDispatchExecutionService.executePacket(packet, {
      isGuest: false,
    });

    expect(results).toEqual([
      expect.objectContaining({ nodeId: 'node-followup', status: 'requires_followup' }),
      expect.objectContaining({ nodeId: 'node-rest', status: 'executed', resolvedActionType: 'flatten_schedule' }),
      expect.objectContaining({ nodeId: 'node-cooking', status: 'executed', resolvedActionType: 'schedule_block' }),
    ]);
  });

  it('blocks dependent nodes when a prerequisite fails', async () => {
    ActionHub.register('atlas', 'flatten_schedule_fail_once', vi.fn().mockResolvedValue(undefined));
    ActionHub.register('atlas', 'schedule_block_after_fail', vi.fn().mockResolvedValue(undefined));
    const executeSpy = vi.spyOn(ActionHub, 'execute')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const packet: NexusActionPlanExecutionPacket = {
      type: 'nexus_action_plan',
      version: 1,
      planId: 'plan-2',
      sourceThreadId: 'nexus.dashboard',
      title: 'Dependent dispatches',
      summary: 'Rest before cooking.',
      rawInput: 'update tomorrow to rest, then schedule cooking',
      primaryTargetModuleId: 'atlas',
      supportingTargetModuleIds: [],
      requiresApproval: true,
      nodes: [],
      dispatchPlan: [
        {
          nodeId: 'node-rest',
          targetModuleId: 'atlas',
          sourceActionType: 'recovery_day',
          resolvedActionType: 'flatten_schedule',
          payload: { flattenedUntil: '2026-03-25T23:59:59', activeLoad: 2 },
          dependsOn: [],
          status: 'resolved',
        },
        {
          nodeId: 'node-cooking',
          targetModuleId: 'atlas',
          sourceActionType: 'schedule_item',
          resolvedActionType: 'schedule_block',
          payload: { title: 'cooking', scheduledAt: '2026-03-25T11:00:00', duration: 60, category: 'other' },
          dependsOn: ['node-rest'],
          status: 'resolved',
        },
      ],
    };

    const results = await NexusActionDispatchExecutionService.executePacket(packet, {
      isGuest: false,
    });

    expect(results).toEqual([
      expect.objectContaining({ nodeId: 'node-rest', status: 'failed' }),
      expect.objectContaining({
        nodeId: 'node-cooking',
        status: 'blocked_by_dependency',
        reason: 'Blocked by node-rest.',
      }),
    ]);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    executeSpy.mockRestore();
  });

  it('summarizes deterministic execution outcomes for the assistant thread', () => {
    const packet: NexusActionPlanExecutionPacket = {
      type: 'nexus_action_plan',
      version: 1,
      planId: 'plan-3',
      sourceThreadId: 'nexus.dashboard',
      title: 'Resolved packet',
      summary: 'Rest then cooking.',
      rawInput: 'update tomorrow to rest, schedule cooking at 1100 tomorrow',
      primaryTargetModuleId: 'atlas',
      supportingTargetModuleIds: [],
      requiresApproval: true,
      nodes: [
        {
          id: 'node-rest',
          intentId: 'intent-rest',
          intentType: 'recovery_day',
          label: 'Shift the plan to recovery',
          summary: 'Update the schedule to a recovery/rest posture',
          targetModuleId: 'atlas',
          supportingModuleIds: ['agnes', 'soma'],
          actionType: 'recovery_day',
          mutatesState: true,
          canRunInParallel: false,
          dependsOn: [],
          payload: {},
        },
        {
          id: 'node-cooking',
          intentId: 'intent-cooking',
          intentType: 'schedule_item',
          label: 'Schedule cooking',
          summary: 'Add cooking to the plan',
          targetModuleId: 'atlas',
          supportingModuleIds: [],
          actionType: 'schedule_item',
          mutatesState: true,
          canRunInParallel: false,
          dependsOn: [],
          payload: {},
        },
      ],
      dispatchPlan: [
        {
          nodeId: 'node-rest',
          targetModuleId: 'atlas',
          sourceActionType: 'recovery_day',
          resolvedActionType: 'flatten_schedule',
          payload: {},
          dependsOn: [],
          status: 'resolved',
        },
        {
          nodeId: 'node-cooking',
          targetModuleId: 'atlas',
          sourceActionType: 'schedule_item',
          resolvedActionType: 'schedule_block',
          payload: {},
          dependsOn: [],
          status: 'resolved',
        },
      ],
    };

    expect(NexusActionDispatchExecutionService.canExecutePacketDeterministically(packet)).toBe(true);
    expect(NexusActionDispatchExecutionService.buildExecutionSummary(packet, [
      {
        nodeId: 'node-rest',
        status: 'executed',
        targetModuleId: 'atlas',
        sourceActionType: 'recovery_day',
        resolvedActionType: 'flatten_schedule',
        dependsOn: [],
      },
      {
        nodeId: 'node-cooking',
        status: 'executed',
        targetModuleId: 'atlas',
        sourceActionType: 'schedule_item',
        resolvedActionType: 'schedule_block',
        dependsOn: [],
      },
    ])).toBe('Executed 2 planned actions: Shift the plan to recovery, Schedule cooking.');
  });

  it('projects direct packet results into thread execution artifacts', () => {
    const packet: NexusActionPlanExecutionPacket = {
      type: 'nexus_action_plan',
      version: 1,
      planId: 'plan-4',
      sourceThreadId: 'nexus.dashboard',
      title: 'Resolved packet',
      summary: 'Rest then cooking.',
      rawInput: 'update tomorrow to rest, schedule cooking at 1100 tomorrow',
      primaryTargetModuleId: 'atlas',
      supportingTargetModuleIds: [],
      requiresApproval: true,
      nodes: [
        {
          id: 'node-rest',
          intentId: 'intent-rest',
          intentType: 'recovery_day',
          label: 'Shift the plan to recovery',
          summary: 'Update the schedule to a recovery/rest posture',
          targetModuleId: 'atlas',
          supportingModuleIds: ['agnes', 'soma'],
          actionType: 'recovery_day',
          mutatesState: true,
          canRunInParallel: false,
          dependsOn: [],
          payload: {},
        },
        {
          id: 'node-cooking',
          intentId: 'intent-cooking',
          intentType: 'schedule_item',
          label: 'Schedule cooking',
          summary: 'Add cooking to the plan',
          targetModuleId: 'atlas',
          supportingModuleIds: [],
          actionType: 'schedule_item',
          mutatesState: true,
          canRunInParallel: false,
          dependsOn: ['node-rest'],
          payload: {},
        },
      ],
      dispatchPlan: [
        {
          nodeId: 'node-rest',
          targetModuleId: 'atlas',
          sourceActionType: 'recovery_day',
          resolvedActionType: 'flatten_schedule',
          payload: {},
          dependsOn: [],
          status: 'resolved',
        },
        {
          nodeId: 'node-cooking',
          targetModuleId: 'atlas',
          sourceActionType: 'schedule_item',
          resolvedActionType: 'schedule_block',
          payload: {},
          dependsOn: ['node-rest'],
          status: 'resolved',
        },
      ],
    };

    const artifacts = NexusActionDispatchExecutionService.buildExecutionArtifacts(packet, [
      {
        nodeId: 'node-rest',
        status: 'executed',
        targetModuleId: 'atlas',
        sourceActionType: 'recovery_day',
        resolvedActionType: 'flatten_schedule',
        dependsOn: [],
      },
      {
        nodeId: 'node-cooking',
        status: 'blocked_by_dependency',
        targetModuleId: 'atlas',
        sourceActionType: 'schedule_item',
        resolvedActionType: 'schedule_block',
        dependsOn: ['node-rest'],
        reason: 'Blocked by node-rest.',
      },
    ], '2026-03-24T00:00:00.000Z');

    expect(artifacts).toEqual([
      expect.objectContaining({
        actionType: 'flatten_schedule',
        status: 'executed',
        summary: 'Shift the plan to recovery executed.',
      }),
      expect.objectContaining({
        actionType: 'schedule_block',
        status: 'blocked',
        errorMessage: 'Blocked by node-rest.',
        retryable: true,
        retrySummary: 'Retry attempt 1 available.',
        retryVisibleContent: 'Retry attempt 1 for 1 blocked or failed node from Resolved packet.',
        retryOfPlanId: undefined,
        retryAttempt: undefined,
        retryPrompt: expect.stringContaining('[NEXUS_ACTION_PLAN]'),
      }),
    ]);
  });

  it('propagates retry lineage onto successful retry execution artifacts', () => {
    const packet: NexusActionPlanExecutionPacket = {
      type: 'nexus_action_plan',
      version: 1,
      planId: 'plan-7.retry.1',
      retryOfPlanId: 'plan-7',
      retryAttempt: 1,
      sourceThreadId: 'nexus.dashboard',
      title: 'Resolved packet (retry 1)',
      summary: 'Retry attempt 1 for 1 blocked or failed node from Resolved packet.',
      rawInput: 'schedule cooking at 1100 tomorrow',
      primaryTargetModuleId: 'atlas',
      supportingTargetModuleIds: [],
      requiresApproval: true,
      nodes: [
        {
          id: 'node-cooking',
          intentId: 'intent-cooking',
          intentType: 'schedule_item',
          label: 'Schedule cooking',
          summary: 'Add cooking to the plan',
          targetModuleId: 'atlas',
          supportingModuleIds: [],
          actionType: 'schedule_item',
          mutatesState: true,
          canRunInParallel: false,
          dependsOn: [],
          payload: {},
        },
      ],
      dispatchPlan: [
        {
          nodeId: 'node-cooking',
          targetModuleId: 'atlas',
          sourceActionType: 'schedule_item',
          resolvedActionType: 'schedule_block',
          payload: {},
          dependsOn: [],
          status: 'resolved',
        },
      ],
    };

    const artifacts = NexusActionDispatchExecutionService.buildExecutionArtifacts(packet, [
      {
        nodeId: 'node-cooking',
        status: 'executed',
        targetModuleId: 'atlas',
        sourceActionType: 'schedule_item',
        resolvedActionType: 'schedule_block',
        dependsOn: [],
      },
    ], '2026-03-24T00:00:00.000Z');

    expect(artifacts).toEqual([
      expect.objectContaining({
        summary: 'Schedule cooking executed on retry attempt 1.',
        retryOfPlanId: 'plan-7',
        retryAttempt: 1,
        retryParentExecutionId: 'plan-7.node-cooking.execution',
        retryable: false,
      }),
    ]);
  });

  it('derives a retry packet for failed or blocked nodes only', () => {
    const packet: NexusActionPlanExecutionPacket = {
      type: 'nexus_action_plan',
      version: 1,
      planId: 'plan-5',
      sourceThreadId: 'nexus.dashboard',
      title: 'Resolved packet',
      summary: 'Rest then cooking.',
      rawInput: 'update tomorrow to rest, schedule cooking at 1100 tomorrow',
      primaryTargetModuleId: 'atlas',
      supportingTargetModuleIds: [],
      requiresApproval: true,
      nodes: [
        {
          id: 'node-rest',
          intentId: 'intent-rest',
          intentType: 'recovery_day',
          label: 'Shift the plan to recovery',
          summary: 'Update the schedule to a recovery/rest posture',
          targetModuleId: 'atlas',
          supportingModuleIds: [],
          actionType: 'recovery_day',
          mutatesState: true,
          canRunInParallel: false,
          dependsOn: [],
          payload: {},
        },
        {
          id: 'node-cooking',
          intentId: 'intent-cooking',
          intentType: 'schedule_item',
          label: 'Schedule cooking',
          summary: 'Add cooking to the plan',
          targetModuleId: 'atlas',
          supportingModuleIds: [],
          actionType: 'schedule_item',
          mutatesState: true,
          canRunInParallel: false,
          dependsOn: ['node-rest'],
          payload: {},
        },
      ],
      dispatchPlan: [
        {
          nodeId: 'node-rest',
          targetModuleId: 'atlas',
          sourceActionType: 'recovery_day',
          resolvedActionType: 'flatten_schedule',
          payload: {},
          dependsOn: [],
          status: 'resolved',
        },
        {
          nodeId: 'node-cooking',
          targetModuleId: 'atlas',
          sourceActionType: 'schedule_item',
          resolvedActionType: 'schedule_block',
          payload: {},
          dependsOn: ['node-rest'],
          status: 'resolved',
        },
      ],
    };

    const retryPacket = NexusActionDispatchExecutionService.buildRetryPacket(packet, [
      {
        nodeId: 'node-rest',
        status: 'failed',
        targetModuleId: 'atlas',
        sourceActionType: 'recovery_day',
        resolvedActionType: 'flatten_schedule',
        dependsOn: [],
      },
      {
        nodeId: 'node-cooking',
        status: 'blocked_by_dependency',
        targetModuleId: 'atlas',
        sourceActionType: 'schedule_item',
        resolvedActionType: 'schedule_block',
        dependsOn: ['node-rest'],
        reason: 'Blocked by node-rest.',
      },
    ]);

    expect(retryPacket?.planId).toBe('plan-5.retry.1');
    expect(retryPacket?.retryOfPlanId).toBe('plan-5');
    expect(retryPacket?.retryAttempt).toBe(1);
    expect(retryPacket?.dispatchPlan).toEqual([
      expect.objectContaining({ nodeId: 'node-rest', dependsOn: [] }),
      expect.objectContaining({ nodeId: 'node-cooking', dependsOn: ['node-rest'] }),
    ]);
  });

  it('increments retry lineage for nested retry packets', () => {
    const retryPacket = NexusActionDispatchExecutionService.buildRetryPacket({
      type: 'nexus_action_plan',
      version: 1,
      planId: 'plan-6.retry.1',
      retryOfPlanId: 'plan-6',
      retryAttempt: 1,
      sourceThreadId: 'nexus.dashboard',
      title: 'Resolved packet (retry 1)',
      summary: 'Retry attempt 1 for 1 blocked or failed node from Resolved packet.',
      rawInput: 'schedule cooking at 1100 tomorrow',
      primaryTargetModuleId: 'atlas',
      supportingTargetModuleIds: [],
      requiresApproval: true,
      nodes: [
        {
          id: 'node-cooking',
          intentId: 'intent-cooking',
          intentType: 'schedule_item',
          label: 'Schedule cooking',
          summary: 'Add cooking to the plan',
          targetModuleId: 'atlas',
          supportingModuleIds: [],
          actionType: 'schedule_item',
          mutatesState: true,
          canRunInParallel: false,
          dependsOn: [],
          payload: {},
        },
      ],
      dispatchPlan: [
        {
          nodeId: 'node-cooking',
          targetModuleId: 'atlas',
          sourceActionType: 'schedule_item',
          resolvedActionType: 'schedule_block',
          payload: {},
          dependsOn: [],
          status: 'resolved',
        },
      ],
    }, [
      {
        nodeId: 'node-cooking',
        status: 'failed',
        targetModuleId: 'atlas',
        sourceActionType: 'schedule_item',
        resolvedActionType: 'schedule_block',
        dependsOn: [],
      },
    ]);

    expect(retryPacket).toMatchObject({
      planId: 'plan-6.retry.2',
      retryOfPlanId: 'plan-6',
      retryAttempt: 2,
      title: 'Resolved packet (retry 2)',
    });
  });
});
