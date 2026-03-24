import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryDataLayer } from '@/lib/data-layer/in-memory-data-layer';
import { ReminderOutcomeService } from './reminder-outcome-service';
import { AutonomyFeatureFlags } from '@/lib/services/autonomy-feature-flags';

describe('ReminderOutcomeService', () => {
  afterEach(() => {
    AutonomyFeatureFlags.resetTestOverrides();
  });

  it('records completed outcomes back into occurrences, memory, semantic facts, and alive data', async () => {
    const dataLayer = new InMemoryDataLayer({
      'users/user-1/notification_occurrences': [
        {
          occurrenceId: 'occ-1',
          scheduleId: 'schedule-1',
          moduleId: 'atlas',
          dueAt: '2026-03-24T09:00:00.000Z',
          status: 'delivered',
          createdAt: '2026-03-24T09:00:00.000Z',
          updatedAt: '2026-03-24T09:00:00.000Z',
        },
      ],
      'users/user-1/notification_inbox': [
        {
          id: 'occ-1',
          type: 'MODULE_REMINDER_DUE',
          source: 'atlas',
          priority: 'info',
          title: 'Morning planning',
          note: 'Review the first work block.',
          data: {
            scheduleId: 'schedule-1',
            occurrenceId: 'occ-1',
            moduleId: 'atlas',
            dueAt: '2026-03-24T09:00:00.000Z',
            deepLink: { route: '/atlas' },
          },
          read: false,
          createdAt: '2026-03-24T09:00:00.000Z',
          updatedAt: '2026-03-24T09:00:00.000Z',
        },
      ],
    });

    const changed = await ReminderOutcomeService.recordOutcome(dataLayer, 'user-1', {
      id: 'occ-1',
      type: 'MODULE_REMINDER_DUE',
      title: 'Morning planning',
      note: 'Review the first work block.',
      data: {
        scheduleId: 'schedule-1',
        occurrenceId: 'occ-1',
        moduleId: 'atlas',
        dueAt: '2026-03-24T09:00:00.000Z',
        deepLink: { route: '/atlas' },
      },
    }, 'completed');

    expect(changed).toBe(true);

    const occurrence = await dataLayer.getDocument<any>('users/user-1/notification_occurrences', 'occ-1');
    expect(occurrence).toMatchObject({
      status: 'completed',
      reminderOutcome: 'completed',
    });

    const fact = await dataLayer.getDocument<any>('semantic_memory/user-1/facts', 'reminder-outcome:occ-1');
    expect(fact).toMatchObject({
      moduleId: 'atlas',
      fact: 'Reminder completed: Morning planning',
    });

    const aliveEntity = await dataLayer.getDocument<any>('users/user-1/alive_entities', 'alive.atlas.reminder-outcome.occ-1');
    expect(aliveEntity).toMatchObject({
      type: 'LOG',
      label: 'Reminder completed: Morning planning',
      sourceModule: 'atlas',
    });
  });

  it('honors the reminder outcome feature flag', async () => {
    AutonomyFeatureFlags.setTestOverrides({ reminderOutcomeFeedback: false });
    const dataLayer = new InMemoryDataLayer();

    const changed = await ReminderOutcomeService.recordOutcome(dataLayer, 'user-1', {
      id: 'occ-1',
      type: 'MODULE_REMINDER_DUE',
      title: 'Morning planning',
      data: {
        occurrenceId: 'occ-1',
        moduleId: 'atlas',
      },
    }, 'completed');

    expect(changed).toBe(false);
  });
});
