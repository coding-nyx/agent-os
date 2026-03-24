import { NexusLogger } from '@/lib/nexus-logger';
import { OrchestrationExecutionService } from '@/lib/services/orchestration-execution-service';

const RETRY_WORKER_INTERVAL_MS = 30_000;

class OrchestrationRetryWorker {
  private timer: number | null = null;
  private uid: string | null = null;
  private inFlight = false;

  private async tick(): Promise<void> {
    if (!this.uid || this.inFlight) return;
    this.inFlight = true;
    try {
      const summary = await OrchestrationExecutionService.processDueRetries(this.uid, { limit: 5 });
      if (summary.attempted > 0) {
        NexusLogger.warn(
          'RetryWorker',
          `[RetryWorker] Processed ${summary.attempted} due retries (${summary.succeeded} succeeded, ${summary.failed} failed)`,
        );
      }
    } catch (error) {
      NexusLogger.warn(
        'RetryWorker',
        `[RetryWorker] Failed to process due retries: ${error instanceof Error ? error.message : String(error)}`,
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
  }
}

export const OrchestrationRetryWorkerService = new OrchestrationRetryWorker();
