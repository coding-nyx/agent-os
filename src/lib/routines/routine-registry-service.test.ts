import { describe, expect, it } from 'vitest';
import { InMemoryDataLayer } from '@/lib/data-layer/in-memory-data-layer';
import { RoutineRegistryService } from './routine-registry-service';
import type { RoutineDefinition } from './routine-types';

function makeRoutine(overrides: Partial<RoutineDefinition> = {}): RoutineDefinition {
  return {
    id: 'routine-1',
    name: 'Morning planning',
    description: 'Review priorities and define first actions.',
    moduleId: 'atlas',
    recurrence: {
      kind: 'weekly_by_days',
      intervalWeeks: 1,
      daysOfWeek: [1, 2, 3, 4, 5],
      timeOfDay: '09:00',
      startAt: '2026-03-24T09:00:00.000Z',
      timezone: 'UTC',
    },
    timezone: 'UTC',
    category: 'planning',
    tags: ['morning', 'focus'],
    trigger: {
      type: 'action',
      actionType: 'daily_plan',
    },
    enabled: true,
    createdBy: 'agent',
    createdAt: '2026-03-24T00:00:00.000Z',
    updatedAt: '2026-03-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('RoutineRegistryService', () => {
  it('saves and retrieves routines from the user registry', async () => {
    const dataLayer = new InMemoryDataLayer();
    const routine = makeRoutine();

    await RoutineRegistryService.saveRoutine('user-1', routine, { dataLayer });

    expect(await RoutineRegistryService.getRoutine('user-1', 'routine-1', { dataLayer })).toEqual({
      ...routine,
      id: 'routine-1',
    });
  });

  it('lists routines sorted by most recent update and filters by module/category', async () => {
    const dataLayer = new InMemoryDataLayer();

    await RoutineRegistryService.saveRoutine('user-1', makeRoutine({
      id: 'routine-older',
      updatedAt: '2026-03-23T00:00:00.000Z',
    }), { dataLayer });
    await RoutineRegistryService.saveRoutine('user-1', makeRoutine({
      id: 'routine-ledger',
      moduleId: 'ledger',
      category: 'finance',
      updatedAt: '2026-03-24T01:00:00.000Z',
    }), { dataLayer });

    expect((await RoutineRegistryService.listRoutines('user-1', { dataLayer })).map((routine) => routine.id)).toEqual([
      'routine-ledger',
      'routine-older',
    ]);
    expect((await RoutineRegistryService.listRoutinesByModule('user-1', 'ledger', { dataLayer })).map((routine) => routine.id)).toEqual([
      'routine-ledger',
    ]);
    expect((await RoutineRegistryService.listRoutinesByCategory('user-1', 'finance', { dataLayer })).map((routine) => routine.id)).toEqual([
      'routine-ledger',
    ]);
  });

  it('deletes routines from the registry', async () => {
    const dataLayer = new InMemoryDataLayer();
    await RoutineRegistryService.saveRoutine('user-1', makeRoutine(), { dataLayer });

    await RoutineRegistryService.deleteRoutine('user-1', 'routine-1', { dataLayer });

    expect(await RoutineRegistryService.getRoutine('user-1', 'routine-1', { dataLayer })).toBeNull();
  });
});
