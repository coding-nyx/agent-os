import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { ModuleId } from '@/lib/module-manifest';
import type {
  NotificationChannelPrefs,
  NotificationDeepLink,
  NotificationPriority,
  NotificationScheduleConfig,
  PersistedReminderProposal,
  Recurrence,
  ReminderProposal,
} from './types';
import { NOTIFICATION_COLLECTIONS } from './types';
import { ReminderLifecycleError } from './errors';
import { queueScheduleReminder } from './schedule-dispatch-service';

export interface ReminderProposalDraft {
  moduleId: ModuleId;
  title: string;
  note?: string;
  recurrence: Recurrence;
  timezone: string;
  channelPrefs: NotificationChannelPrefs;
  priority: NotificationPriority;
  deepLink?: NotificationDeepLink;
  source?: NotificationScheduleConfig['source'];
  tags?: string[];
}

function proposalPath(userId: string): string {
  return `users/${userId}/${NOTIFICATION_COLLECTIONS.proposals}`;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `proposal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

class ReminderLifecycleServiceImpl {
  async propose(userId: string, draft: ReminderProposalDraft): Promise<ReminderProposal> {
    const dataLayer = getNexusDataLayer();
    const now = new Date().toISOString();
    const id = generateId();

    const proposal: ReminderProposal = {
      id,
      moduleId: draft.moduleId,
      title: draft.title,
      note: draft.note,
      recurrence: draft.recurrence,
      timezone: draft.timezone,
      channelPrefs: draft.channelPrefs,
      priority: draft.priority,
      deepLink: draft.deepLink,
      source: draft.source,
      tags: draft.tags,
      createdBy: 'agent',
    };

    const persisted: PersistedReminderProposal = {
      ...proposal,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    await dataLayer.setDocument<PersistedReminderProposal>(proposalPath(userId), id, persisted);

    Spine.emit({
      type: 'REMINDER_PROPOSED',
      source: 'reminder-lifecycle-service',
      domain: 'system',
      data: { proposal },
      cascadeDepth: 0,
      priority: 'info',
    });

    return proposal;
  }

  async confirm(userId: string, proposalId: string): Promise<{ scheduleId: string }> {
    const dataLayer = getNexusDataLayer();

    const record = await dataLayer.getDocument<PersistedReminderProposal>(
      proposalPath(userId),
      proposalId,
    );
    if (!record) {
      throw new ReminderLifecycleError('proposal_not_found', `Proposal ${proposalId} not found`);
    }

    const proposal = record as unknown as PersistedReminderProposal;

    // Persist the schedule
    const now = new Date().toISOString();
    const scheduleId = `reminder-${generateId()}`;
    const schedulePayload: NotificationScheduleConfig = {
      enabled: true,
      moduleId: proposal.moduleId,
      channelPrefs: proposal.channelPrefs,
      timezone: proposal.timezone,
      recurrence: proposal.recurrence,
      messageTemplate: {
        title: proposal.title,
        body: proposal.note ?? '',
      },
      deepLink: proposal.deepLink ?? { route: `/${proposal.moduleId}` },
      priority: proposal.priority,
      source: proposal.source,
      tags: proposal.tags,
      createdBy: proposal.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    await dataLayer.setDocument<NotificationScheduleConfig>(
      `users/${userId}/${NOTIFICATION_COLLECTIONS.schedules}`,
      scheduleId,
      schedulePayload,
    );

    // Call Cloud Function with retry — throw on final failure
    await queueScheduleReminder(scheduleId);

    // Mark proposal as confirmed
    await dataLayer.updateDocument<PersistedReminderProposal>(proposalPath(userId), proposalId, {
      status: 'confirmed',
      scheduleId,
      updatedAt: new Date().toISOString(),
    });

    Spine.emit({
      type: 'REMINDER_CONFIRMED',
      source: 'reminder-lifecycle-service',
      domain: 'system',
      data: { scheduleId, proposalId, moduleId: proposal.moduleId },
      cascadeDepth: 0,
      priority: 'info',
    });

    return { scheduleId };
  }

  async dismiss(userId: string, proposalId: string): Promise<void> {
    const dataLayer = getNexusDataLayer();
    await dataLayer.updateDocument<PersistedReminderProposal>(proposalPath(userId), proposalId, {
      status: 'dismissed',
      updatedAt: new Date().toISOString(),
    });

    Spine.emit({
      type: 'REMINDER_DISMISSED',
      source: 'reminder-lifecycle-service',
      domain: 'system',
      data: { proposalId },
      cascadeDepth: 0,
      priority: 'info',
    });
  }

  async cancel(userId: string, scheduleId: string): Promise<void> {
    const dataLayer = getNexusDataLayer();
    await dataLayer.updateDocument<NotificationScheduleConfig>(
      `users/${userId}/${NOTIFICATION_COLLECTIONS.schedules}`,
      scheduleId,
      { enabled: false, updatedAt: new Date().toISOString() } as Partial<NotificationScheduleConfig>,
    );

    Spine.emit({
      type: 'REMINDER_CANCELLED',
      source: 'reminder-lifecycle-service',
      domain: 'system',
      data: { scheduleId },
      cascadeDepth: 0,
      priority: 'info',
    });
  }

  async listProposals(userId: string): Promise<PersistedReminderProposal[]> {
    const dataLayer = getNexusDataLayer();
    const records = await dataLayer.query<PersistedReminderProposal>({
      collection: proposalPath(userId),
      where: [{ field: 'status', op: '==', value: 'pending' }],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
    return records as unknown as PersistedReminderProposal[];
  }
}

export const ReminderLifecycleService = new ReminderLifecycleServiceImpl();
