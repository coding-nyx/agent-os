import { describe, expect, it } from 'vitest';
import { CommandIntelligenceService } from './command-intelligence-service';
import { NexusActionPlannerService } from './nexus-action-planner-service';
import { NexusActionDispatchService } from './nexus-action-dispatch-service';

describe('NexusActionDispatchService', () => {
  it('resolves deterministic dispatches for schedulable and recovery nodes while leaving plan-day as follow-up', () => {
    const parsedCommand = CommandIntelligenceService.parse(
      'plan my day tomorrow, update tomorrow to rest, schedule cooking at 1100 tomorrow',
      {
        sourceModuleId: 'nexus',
        now: new Date('2026-03-24T08:00:00.000Z'),
        timezone: 'UTC',
      },
    );

    const plan = NexusActionPlannerService.buildActionPlan({
      threadId: 'nexus.dashboard',
      parsedCommand,
      conversationDepth: 0,
    });

    expect(plan).not.toBeNull();
    const dispatches = NexusActionDispatchService.resolvePlan(plan!);

    expect(dispatches[0]).toMatchObject({
      sourceActionType: 'plan_day',
      status: 'requires_followup',
      resolvedActionType: null,
    });
    expect(dispatches[1]).toMatchObject({
      sourceActionType: 'recovery_day',
      status: 'resolved',
      resolvedActionType: 'flatten_schedule',
      payload: expect.objectContaining({
        activeLoad: 2,
        flattenedUntil: '2026-03-25T23:59:59',
        sourceSegment: 'update tomorrow to rest',
      }),
    });
    expect(dispatches[2]).toMatchObject({
      sourceActionType: 'schedule_item',
      status: 'resolved',
      resolvedActionType: 'schedule_block',
      payload: expect.objectContaining({
        title: 'cooking',
      }),
    });
  });

  it('embeds dispatch-plan hints into the structured execution packet', () => {
    const parsedCommand = CommandIntelligenceService.parse(
      'update tomorrow to rest, schedule cooking at 1100 tomorrow',
      {
        sourceModuleId: 'nexus',
        now: new Date('2026-03-24T08:00:00.000Z'),
        timezone: 'UTC',
      },
    );

    const suggestion = NexusActionPlannerService.buildPlanningSuggestion({
      threadId: 'nexus.dashboard',
      parsedCommand,
      conversationDepth: 0,
    });

    const packet = NexusActionPlannerService.extractExecutionPacket(suggestion?.prompt ?? '');
    expect(packet?.dispatchPlan).toEqual([
      expect.objectContaining({
        sourceActionType: 'recovery_day',
        resolvedActionType: 'flatten_schedule',
        status: 'resolved',
      }),
      expect.objectContaining({
        sourceActionType: 'schedule_item',
        resolvedActionType: 'schedule_block',
        status: 'resolved',
      }),
    ]);
  });
});
