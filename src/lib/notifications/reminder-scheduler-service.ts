/**
 * Client-side reminder scheduler stub.
 *
 * The server-driven path (Cloud Tasks → deliverReminder → NotificationEngine) is
 * the single delivery mechanism. After each delivery, deliverReminder re-enqueues
 * the next occurrence automatically — no client-side scheduling is needed.
 *
 * This class is kept as a no-op stub to satisfy existing call sites in App.tsx
 * without requiring a broader refactor in this pass.
 */

class ReminderSchedulerService {
  private started = false;

  start(_uid: string): void {
    if (this.started) return;
    this.started = true;
  }

  stop(): void {
    this.started = false;
  }

  /** @deprecated No-op. Server handles all scheduling. */
  subscribeDebug(listener: (active: boolean) => void): () => void {
    listener(false);
    return () => {};
  }
}

export const ReminderScheduler = new ReminderSchedulerService();
