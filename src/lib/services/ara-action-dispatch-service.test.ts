import { describe, expect, it } from 'vitest';
import { parseCommand } from './__test-helpers__/parse-command';
const CommandIntelligenceService = { parse: parseCommand };
import { AraActionPlannerService } from './ara-action-planner-service';
import { AraActionDispatchService } from './ara-action-dispatch-service';

describe('AraActionDispatchService', () => {
  it('resolves deterministic dispatches for schedulable and recovery nodes while leaving plan-day as follow-up', () => {
    const parsedCommand = CommandIntelligenceService.parse(
      'plan my day tomorrow, update tomorrow to rest, schedule cooking at 1100 tomorrow',
      {
        sourceModuleId: 'ara',
        now: new Date('2026-03-24T08:00:00.000Z'),
        timezone: 'UTC',
      },
    );

    const plan = AraActionPlannerService.buildActionPlan({
      threadId: 'ara.dashboard',
      parsedCommand,
      conversationDepth: 0,
    });

    expect(plan).not.toBeNull();
    const dispatches = AraActionDispatchService.resolvePlan(plan!);

    expect(dispatches[0]).toMatchObject({
      sourceActionType: 'propose_draft',
      status: 'requires_followup',
      resolvedActionType: null,
    });
    expect(dispatches[1]).toMatchObject({
      sourceActionType: 'flatten_schedule',
      status: 'resolved',
      resolvedActionType: 'flatten_schedule',
      payload: expect.objectContaining({
        flattenedUntil: expect.stringContaining('2026-03-25'),
        reason: 'rest',
        sourceSegment: 'update tomorrow to rest',
      }),
    });
    expect(dispatches[2]).toMatchObject({
      sourceActionType: 'schedule_block',
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
        sourceModuleId: 'ara',
        now: new Date('2026-03-24T08:00:00.000Z'),
        timezone: 'UTC',
      },
    );

    const suggestion = AraActionPlannerService.buildPlanningSuggestion({
      threadId: 'ara.dashboard',
      parsedCommand,
      conversationDepth: 0,
    });

    const packet = AraActionPlannerService.extractExecutionPacket(suggestion?.prompt ?? '');
    expect(packet?.dispatchPlan).toEqual([
      expect.objectContaining({
        sourceActionType: 'flatten_schedule',
        resolvedActionType: 'flatten_schedule',
        status: 'resolved',
      }),
      expect.objectContaining({
        sourceActionType: 'schedule_block',
        resolvedActionType: 'schedule_block',
        status: 'resolved',
      }),
    ]);
  });
});
