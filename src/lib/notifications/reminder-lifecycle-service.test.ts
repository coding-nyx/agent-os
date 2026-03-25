import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryDataProvider } from '@/lib/data-layer/index';
import { ReminderLifecycleError } from './errors';
import type { PersistedReminderProposal } from './types';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockScheduleReminder = vi.fn();

vi.mock('@/lib/firebase', () => ({
  getFirebase: () => ({ app: {} }),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: () => mockScheduleReminder,
}));

vi.mock('@/lib/spine/spine-event-bus', () => ({
  Spine: { emit: vi.fn() },
}));

let dataLayer: InMemoryDataProvider;

vi.mock('@/lib/data-layer/provider', () => ({
  getNexusDataLayer: () => dataLayer,
}));

// Import after mocks are set up
const { ReminderLifecycleService } = await import('./reminder-lifecycle-service');
const { Spine } = await import('@/lib/spine/spine-event-bus');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DRAFT = {
  moduleId: 'atlas' as const,
  title: 'Morning workout',
  recurrence: { kind: 'once' as const, dueAt: '2026-06-01T07:00:00.000Z', timezone: 'UTC' },
  timezone: 'UTC',
  channelPrefs: { os: true, inApp: true },
  priority: 'info' as const,
};

const USER_ID = 'user-test-123';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReminderLifecycleService', () => {
  beforeEach(() => {
    dataLayer = new InMemoryDataProvider();
    vi.clearAllMocks();
    mockScheduleReminder.mockResolvedValue({});
  });

  describe('propose()', () => {
    it('persists proposal to Firestore with status=pending', async () => {
      const proposal = await ReminderLifecycleService.propose(USER_ID, DRAFT);

      expect(proposal.id).toBeTruthy();
      expect(proposal.title).toBe('Morning workout');

      const records = await dataLayer.listDocuments<PersistedReminderProposal>(
        `users/${USER_ID}/notification_proposals`,
      );
      expect(records).toHaveLength(1);
      expect((records[0] as unknown as PersistedReminderProposal).status).toBe('pending');
    });

    it('emits REMINDER_PROPOSED Spine event', async () => {
      await ReminderLifecycleService.propose(USER_ID, DRAFT);
      expect(Spine.emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'REMINDER_PROPOSED' }),
      );
    });
  });

  describe('confirm()', () => {
    it('creates a schedule, calls Cloud Function, marks proposal confirmed', async () => {
      const proposal = await ReminderLifecycleService.propose(USER_ID, DRAFT);

      const { scheduleId } = await ReminderLifecycleService.confirm(USER_ID, proposal.id);

      expect(scheduleId).toMatch(/^reminder-/);
      expect(mockScheduleReminder).toHaveBeenCalledOnce();

      const schedules = await dataLayer.listDocuments(`users/${USER_ID}/notification_schedules`);
      expect(schedules).toHaveLength(1);

      const proposals = await dataLayer.listDocuments<PersistedReminderProposal>(
        `users/${USER_ID}/notification_proposals`,
      );
      const persisted = proposals[0] as unknown as PersistedReminderProposal;
      expect(persisted.status).toBe('confirmed');
      expect(persisted.scheduleId).toBe(scheduleId);
    });

    it('emits REMINDER_CONFIRMED Spine event', async () => {
      const proposal = await ReminderLifecycleService.propose(USER_ID, DRAFT);
      await ReminderLifecycleService.confirm(USER_ID, proposal.id);
      expect(Spine.emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'REMINDER_CONFIRMED' }),
      );
    });

    it('throws ReminderLifecycleError if proposal not found', async () => {
      await expect(
        ReminderLifecycleService.confirm(USER_ID, 'non-existent-proposal'),
      ).rejects.toThrow(ReminderLifecycleError);

      await expect(
        ReminderLifecycleService.confirm(USER_ID, 'non-existent-proposal'),
      ).rejects.toMatchObject({ code: 'proposal_not_found' });
    });

    it('throws ReminderLifecycleError after Cloud Function retries exhausted', async () => {
      mockScheduleReminder.mockRejectedValue(new Error('Network error'));

      const proposal = await ReminderLifecycleService.propose(USER_ID, DRAFT);

      await expect(
        ReminderLifecycleService.confirm(USER_ID, proposal.id),
      ).rejects.toThrow(ReminderLifecycleError);

      await expect(
        ReminderLifecycleService.confirm(USER_ID, proposal.id),
      ).rejects.toMatchObject({ code: 'schedule_failed' });
    }, 15000);
  });

  describe('dismiss()', () => {
    it('marks proposal as dismissed in Firestore', async () => {
      const proposal = await ReminderLifecycleService.propose(USER_ID, DRAFT);
      await ReminderLifecycleService.dismiss(USER_ID, proposal.id);

      const proposals = await dataLayer.listDocuments<PersistedReminderProposal>(
        `users/${USER_ID}/notification_proposals`,
      );
      const persisted = proposals[0] as unknown as PersistedReminderProposal;
      expect(persisted.status).toBe('dismissed');
    });

    it('emits REMINDER_DISMISSED Spine event', async () => {
      const proposal = await ReminderLifecycleService.propose(USER_ID, DRAFT);
      await ReminderLifecycleService.dismiss(USER_ID, proposal.id);
      expect(Spine.emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'REMINDER_DISMISSED' }),
      );
    });
  });

  describe('listProposals()', () => {
    it('returns only pending proposals', async () => {
      const p1 = await ReminderLifecycleService.propose(USER_ID, DRAFT);
      await ReminderLifecycleService.propose(USER_ID, { ...DRAFT, title: 'Evening run' });
      await ReminderLifecycleService.dismiss(USER_ID, p1.id);

      const pending = await ReminderLifecycleService.listProposals(USER_ID);
      expect(pending).toHaveLength(1);
      expect(pending[0].title).toBe('Evening run');
    });
  });
});
