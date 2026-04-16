import type { AraDataLayer, BatchOperation } from '@/lib/data-layer';
import type { ModuleId } from '@/lib/module-manifest';
import type { NotificationOccurrenceRecord } from '@/lib/notifications/types';
import { upsertAliveEntity } from '@/lib/services/alive-entity-service';
import { AutonomyFeatureFlags } from '@/lib/services/autonomy-feature-flags';
import { Spine } from '@/lib/spine/spine-event-bus';

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
    dataLayer: AraDataLayer,
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

    Spine.emit({
      type: 'MODULE_REMINDER_COMPLETED',
      source: moduleId,
      domain: 'system',
      data: {
        moduleId,
        occurrenceId,
        scheduleId: scheduleId ?? null,
        outcome,
        dueAt: data.dueAt ?? null
      },
      cascadeDepth: 0,
      priority: outcome === 'completed' ? 'info' : 'alert'
    });

    return true;
  }

  /**
   * Batch-process reminder outcomes for multiple records.
   * Collapses N*4 individual Firestore writes into ~2 batched calls.
   * Use this instead of calling `recordOutcome` in a loop.
   *
   * @param skipInboxUpdate - When true, skips writing reminderOutcome back
   *   to the inbox docs (useful when the caller already batch-updated them).
   */
  static async recordOutcomeBatch(
    dataLayer: AraDataLayer,
    uid: string | undefined,
    records: Array<ReminderOutcomeInboxRecord | null | undefined>,
    outcome: ReminderOutcomeStatus,
    options?: { skipInboxUpdate?: boolean },
  ): Promise<number> {
    if (!AutonomyFeatureFlags.isEnabled('reminderOutcomeFeedback') || !uid) return 0;

    const validRecords = records.filter(
      (r): r is ReminderOutcomeInboxRecord =>
        r != null &&
        r.type === 'MODULE_REMINDER_DUE' &&
        isModuleId(r.data?.moduleId) &&
        typeof r.data?.occurrenceId === 'string',
    );
    if (validRecords.length === 0) return 0;

    const now = new Date().toISOString();
    const occurrenceCollection = `users/${uid}/notification_occurrences`;

    // Batch-read existing occurrences for idempotency check
    const existingOccurrences = await Promise.all(
      validRecords.map((r) =>
        dataLayer.getDocument<NotificationOccurrenceRecord & {
          reminderOutcome?: ReminderOutcomeStatus;
          outcomeRecordedAt?: string;
        }>(occurrenceCollection, r.data!.occurrenceId!),
      ),
    );

    const batchOps: BatchOperation[] = [];
    const aliveEntityPromises: Promise<unknown>[] = [];
    let processedCount = 0;

    for (let i = 0; i < validRecords.length; i++) {
      const record = validRecords[i];
      const currentOccurrence = existingOccurrences[i];
      const data = record.data!;
      const moduleId = data.moduleId as ModuleId;
      const occurrenceId = data.occurrenceId!;
      const scheduleId = data.scheduleId;
      const title = record.title?.trim() || 'Reminder';
      const note = record.note?.trim() || '';

      // Skip if already recorded with same outcome
      if (currentOccurrence?.reminderOutcome === outcome) continue;

      processedCount++;

      // Occurrence upsert
      batchOps.push({
        type: 'set',
        collection: occurrenceCollection,
        id: occurrenceId,
        data: {
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
        },
      });

      // Inbox outcome update (unless caller already handled it)
      if (!options?.skipInboxUpdate) {
        batchOps.push({
          type: 'update',
          collection: `users/${uid}/notification_inbox`,
          id: record.id,
          data: {
            data: { ...data, reminderOutcome: outcome },
            updatedAt: now,
          },
        });
      }

      // Semantic memory fact
      const summary = outcomeSummary(title, outcome);
      batchOps.push({
        type: 'set',
        collection: `semantic_memory/${uid}/facts`,
        id: `reminder-outcome:${occurrenceId}`,
        data: {
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
        },
      });

      // Alive entity upsert (uses batchWrite internally, run in parallel)
      aliveEntityPromises.push(
        upsertAliveEntity(dataLayer, {
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
        }, { uid }),
      );

      // Spine event (in-memory, no I/O)
      Spine.emit({
        type: 'MODULE_REMINDER_COMPLETED',
        source: moduleId,
        domain: 'system',
        data: {
          moduleId,
          occurrenceId,
          scheduleId: scheduleId ?? null,
          outcome,
          dueAt: data.dueAt ?? null,
        },
        cascadeDepth: 0,
        priority: outcome === 'completed' ? 'info' : 'alert',
      });
    }

    // Execute batch write + alive entity upserts in parallel
    await Promise.allSettled([
      batchOps.length > 0 ? dataLayer.batchWrite(batchOps) : Promise.resolve(),
      ...aliveEntityPromises,
    ]);

    return processedCount;
  }
}
