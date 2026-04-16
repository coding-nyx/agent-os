import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionHub, type ActionContext } from './action-hub';
import { registerCoreActions } from './core-handlers';
import { RoutineRegistryService } from '@/lib/routines/routine-registry-service';
import { Spine } from '@/lib/spine/spine-event-bus';
import { AutonomyFeatureFlags } from '@/lib/services/autonomy-feature-flags';
import { OrchestrationActionGateService } from '@/lib/services/orchestration-action-gate-service';

function makeContext(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    userId: 'user-1',
    isGuest: false,
    moduleId: 'ara',
    payload: {},
    emitSpineEvent: vi.fn(),
    updateGlobalSoul: vi.fn().mockResolvedValue(undefined),
    delegateToModule: vi.fn(),
    ...overrides,
  };
}

describe('core-handlers Phase 4 routine actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    AutonomyFeatureFlags.resetTestOverrides();
    registerCoreActions();
  });

  it('proposes a routine and emits a routine lifecycle event', async () => {
    const emitSpy = vi.spyOn(Spine, 'emit');
    const pushAssistantMessage = vi.fn();

    const executed = await ActionHub.execute('ara', 'propose_routine', makeContext({
      payload: {
        moduleId: 'atlas',
        name: 'Morning planning',
        category: 'planning',
        actionType: 'daily_plan',
        recurrence: {
          kind: 'weekly_by_days',
          intervalWeeks: 1,
          daysOfWeek: [1, 2, 3, 4, 5],
          timeOfDay: '09:00',
          startAt: '2026-03-24T09:00:00.000Z',
          timezone: 'UTC',
        },
      },
      pushAssistantMessage,
    }));

    expect(executed).toBe(true);
    expect(pushAssistantMessage).toHaveBeenCalledWith('Routine proposed for Morning planning.');
    expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ROUTINE_PROPOSED',
      data: expect.objectContaining({
        proposal: expect.objectContaining({
          routine: expect.objectContaining({
            name: 'Morning planning',
            moduleId: 'atlas',
            trigger: { type: 'action', actionType: 'daily_plan' },
          }),
        }),
      }),
    }));
  });

  it('confirms a routine by persisting it to the registry', async () => {
    const emitSpy = vi.spyOn(Spine, 'emit');
    const saveRoutine = vi.spyOn(RoutineRegistryService, 'saveRoutine').mockResolvedValue({
      id: 'routine-1',
      name: 'Evening reset',
      moduleId: 'atlas',
      recurrence: { kind: 'once', dueAt: '2026-03-24T20:00:00.000Z', timezone: 'UTC' },
      timezone: 'UTC',
      trigger: { type: 'notification' },
      enabled: true,
      createdBy: 'agent',
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:00:00.000Z',
    });

    const executed = await ActionHub.execute('ara', 'confirm_routine', makeContext({
      payload: {
        moduleId: 'atlas',
        name: 'Evening reset',
        recurrence: { kind: 'once', dueAt: '2026-03-24T20:00:00.000Z', timezone: 'UTC' },
      },
    }));

    expect(executed).toBe(true);
    expect(saveRoutine).toHaveBeenCalledWith('user-1', expect.objectContaining({
      name: 'Evening reset',
      moduleId: 'atlas',
      trigger: { type: 'notification' },
    }));
    expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ROUTINE_CONFIRMED',
      data: expect.objectContaining({
        moduleId: 'atlas',
      }),
    }));
  });

  it('deduplicates repeated routine proposals with the same normalized payload', async () => {
    const emitSpy = vi.spyOn(Spine, 'emit');
    const payload = {
      moduleId: 'atlas',
      name: 'Morning planning duplicate check',
      category: 'planning',
      actionType: 'daily_plan',
      recurrence: {
        kind: 'weekly_by_days',
        intervalWeeks: 1,
        daysOfWeek: [1, 2, 3, 4, 5],
        timeOfDay: '09:00',
        startAt: '2026-03-24T09:00:00.000Z',
        timezone: 'UTC',
      },
    };

    await ActionHub.execute('ara', 'propose_routine', makeContext({ payload }));
    await ActionHub.execute('ara', 'propose_routine', makeContext({ payload }));

    expect(emitSpy.mock.calls.filter(([event]) => event.type === 'ROUTINE_PROPOSED')).toHaveLength(1);
  });

  it('honors the routine proposal feature flag kill switch', async () => {
    AutonomyFeatureFlags.setTestOverrides({ routineProposals: false });
    const emitSpy = vi.spyOn(Spine, 'emit');
    const pushAssistantMessage = vi.fn();

    await ActionHub.execute('ara', 'propose_routine', makeContext({
      payload: {
        moduleId: 'atlas',
        name: 'Morning planning',
        recurrence: { kind: 'once', dueAt: '2026-03-24T09:00:00.000Z', timezone: 'UTC' },
      },
      pushAssistantMessage,
    }));

    expect(pushAssistantMessage).toHaveBeenCalledWith('Routine proposals are currently disabled.');
    expect(emitSpy.mock.calls.filter(([event]) => event.type === 'ROUTINE_PROPOSED')).toHaveLength(0);
  });

  it('saves routines directly at ghost level without emitting a proposal draft', async () => {
    const emitSpy = vi.spyOn(Spine, 'emit');
    const saveRoutine = vi.spyOn(RoutineRegistryService, 'saveRoutine').mockResolvedValue({
      id: 'routine-ghost',
      name: 'Ghost planning',
      moduleId: 'atlas',
      recurrence: { kind: 'once', dueAt: '2026-03-24T09:00:00.000Z', timezone: 'UTC' },
      timezone: 'UTC',
      trigger: { type: 'notification' },
      enabled: true,
      createdBy: 'agent',
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:00:00.000Z',
    });
    const pushAssistantMessage = vi.fn();
    const orchestration = OrchestrationActionGateService.evaluate({
      moduleId: 'ara',
      actionType: 'propose_routine',
      payload: {
        moduleId: 'atlas',
        name: 'Ghost planning',
        recurrence: { kind: 'once', dueAt: '2026-03-24T09:00:00.000Z', timezone: 'UTC' },
      },
      autopilotLevel: 5,
      historyMode: 'silent',
      isGuest: false,
      activeThreadId: 'ara.dashboard',
    }).metadata;

    const executed = await ActionHub.execute('ara', 'propose_routine', makeContext({
      payload: {
        moduleId: 'atlas',
        name: 'Ghost planning',
        recurrence: { kind: 'once', dueAt: '2026-03-24T09:00:00.000Z', timezone: 'UTC' },
      },
      orchestration,
      pushAssistantMessage,
    }));

    expect(executed).toBe(true);
    expect(saveRoutine).toHaveBeenCalledWith('user-1', expect.objectContaining({
      name: 'Ghost planning',
      moduleId: 'atlas',
    }));
    expect(pushAssistantMessage).toHaveBeenCalledWith('Routine saved for Ghost planning.');
    expect(emitSpy.mock.calls.filter(([event]) => event.type === 'ROUTINE_PROPOSED')).toHaveLength(0);
    expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ROUTINE_CONFIRMED',
      data: expect.objectContaining({
        proposalId: expect.any(String),
        moduleId: 'atlas',
      }),
    }));
  });
});
