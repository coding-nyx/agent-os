import type { NexusDataLayer } from '@/lib/data-layer';
import type { ModuleId } from '@/lib/module-manifest';
import type { NotificationOccurrenceRecord } from '@/lib/notifications/types';
import { upsertAliveEntity } from '@/lib/services/alive-entity-service';
import { AutonomyFeatureFlags } from '@/lib/services/autonomy-feature-flags';

export type ReminderOutcomeStatus = 'completed' | 'skipped';

export interface ReminderOutcomeInboxRecord {
  id: string;
  type: string;
  title?: string;
  note?: string;
  data?: {
    scheduleId?: string;
    occurrenceId?: string;
    moduleId?: string;
    dueAt?: string;
    deepLink?: { route?: string; focusId?: string };
    reminderOutcome?: ReminderOutcomeStatus;
  };
}

function isModuleId(value: unknown): value is ModuleId {
  return typeof value === 'string' && value.length > 0;
}

function outcomeSummary(title: string, outcome: ReminderOutcomeStatus): string {
  return outcome === 'completed'
    ? `Reminder completed: ${title}`
    : `Reminder skipped: ${title}`;
}

export class ReminderOutcomeService {
  static isReminderNotification(record: ReminderOutcomeInboxRecord | null | undefined): boolean {
    return Boolean(
      record &&
      record.type === 'MODULE_REMINDER_DUE' &&
      typeof record.data?.occurrenceId === 'string' &&
      isModuleId(record.data?.moduleId),
    );
  }

  static async recordOutcome(
    dataLayer: NexusDataLayer,
    uid: string | undefined,
    record: ReminderOutcomeInboxRecord | null | undefined,
    outcome: ReminderOutcomeStatus,
  ): Promise<boolean> {
    if (!AutonomyFeatureFlags.isEnabled('reminderOutcomeFeedback')) return false;
    if (!uid || !record || record.type !== 'MODULE_REMINDER_DUE' || !record.data) return false;

    const { data } = record;
    if (!isModuleId(data.moduleId) || typeof data.occurrenceId !== 'string') return false;

    const moduleId = data.moduleId;
    const occurrenceId = data.occurrenceId;
    const scheduleId = data.scheduleId;
    const now = new Date().toISOString();
    const title = record.title?.trim() || 'Reminder';
    const note = record.note?.trim() || '';
    const occurrenceCollection = `users/${uid}/notification_occurrences`;
    const currentOccurrence = await dataLayer.getDocument<NotificationOccurrenceRecord & {
      reminderOutcome?: ReminderOutcomeStatus;
      outcomeRecordedAt?: string;
    }>(occurrenceCollection, occurrenceId);

    if (currentOccurrence?.reminderOutcome === outcome) {
      return false;
    }

    await dataLayer.setDocument(occurrenceCollection, occurrenceId, {
      ...(currentOccurrence ?? {}),
      occurrenceId,
      scheduleId: scheduleId ?? currentOccurrence?.scheduleId ?? '',
      moduleId,
      dueAt: data.dueAt ?? currentOccurrence?.dueAt ?? now,
      status: outcome,
      reminderOutcome: outcome,
      outcomeRecordedAt: now,
      updatedAt: now,
      createdAt: currentOccurrence?.createdAt ?? now,
    });

    await dataLayer.updateDocument(`users/${uid}/notification_inbox`, record.id, {
      data: {
        ...data,
        reminderOutcome: outcome,
      },
      updatedAt: now,
    });

    const summary = outcomeSummary(title, outcome);

    await dataLayer.setDocument(`semantic_memory/${uid}/facts`, `reminder-outcome:${occurrenceId}`, {
      moduleId,
      fact: summary,
      confidence: 0.78,
      updatedAt: now,
      metadata: {
        occurrenceId,
        scheduleId: scheduleId ?? null,
        outcome,
        originalNote: note || null,
      },
    });

    await upsertAliveEntity(dataLayer, {
      id: `alive.${moduleId}.reminder-outcome.${occurrenceId}`,
      type: 'LOG',
      label: summary,
      semantic_tags: ['reminder', outcome, moduleId],
      attributes: {
        occurrenceId,
        scheduleId: scheduleId ?? null,
        outcome,
        dueAt: data.dueAt ?? null,
        deepLink: data.deepLink ?? null,
      },
      soul_impact_preset: {},
      sourceModule: moduleId,
      sourceEntityId: occurrenceId,
      provenance: 'native',
      createdAt: now,
      updatedAt: now,
    }, { uid });

    return true;
  }
}
