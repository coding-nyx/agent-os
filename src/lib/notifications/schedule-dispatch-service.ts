import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebase } from '@/lib/firebase';
import { ReminderLifecycleError } from './errors';

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function queueScheduleReminder(scheduleId: string, maxAttempts = 3): Promise<void> {
  const { app } = getFirebase();
  if (!app) return;

  const functions = getFunctions(app);
  const scheduleReminder = httpsCallable<{ scheduleId: string }, unknown>(
    functions,
    'scheduleReminder',
  );

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await scheduleReminder({ scheduleId });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(Math.min(500 * 2 ** (attempt - 1), 4000));
      }
    }
  }

  throw new ReminderLifecycleError(
    'schedule_failed',
    `scheduleReminder Cloud Function failed after ${maxAttempts} attempts for schedule ${scheduleId}`,
    lastError,
  );
}
