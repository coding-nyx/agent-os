import { AraLogger } from '@/lib/ara-logger';
import { OrchestrationExecutionService } from '@/lib/services/orchestration-execution-service';

const RETRY_WORKER_INTERVAL_MS = 30_000;
// Backoff durations (ms) applied after 1st, 2nd, 3rd+ consecutive failures.
const FAILURE_BACKOFF_MS = [60_000, 120_000, 300_000] as const;

class OrchestrationRetryWorker {
  private timer: number | null = null;
  private uid: string | null = null;
  private inFlight = false;
  private consecutiveFailures = 0;
  private backoffUntil = 0;

  private async tick(): Promise<void> {
    if (!this.uid || this.inFlight) return;
    if (Date.now() < this.backoffUntil) return;
    this.inFlight = true;
    try {
      const summary = await OrchestrationExecutionService.processDueRetries(this.uid, { limit: 5 });
      this.consecutiveFailures = 0;
      if (summary.attempted > 0) {
        AraLogger.warn(
          'RetryWorker',
          `[RetryWorker] Processed ${summary.attempted} due retries (${summary.succeeded} succeeded, ${summary.failed} failed)`,
        );
      }
    } catch (error) {
      this.consecutiveFailures++;
      const backoffMs = FAILURE_BACKOFF_MS[Math.min(this.consecutiveFailures - 1, FAILURE_BACKOFF_MS.length - 1)];
      this.backoffUntil = Date.now() + backoffMs;
      AraLogger.warn(
        'RetryWorker',
        `[RetryWorker] Failed to process due retries (failure ${this.consecutiveFailures}, backing off ${backoffMs / 1_000}s): ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.inFlight = false;
    }
  }

  start(uid: string): void {
    if (!uid) return;
    if (this.uid === uid && this.timer !== null) return;
    this.stop();
    this.uid = uid;
    void this.tick();
    this.timer = window.setInterval(() => {
      void this.tick();
    }, RETRY_WORKER_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
    }
    this.timer = null;
    this.uid = null;
    this.inFlight = false;
    this.consecutiveFailures = 0;
    this.backoffUntil = 0;
  }
}

export const OrchestrationRetryWorkerService = new OrchestrationRetryWorker();
