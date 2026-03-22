/**
 * NSV Update Queue — Retry mechanism for Neural State Vector updates
 *
 * The GlobalProjectionService has a single immediate retry, but network outages
 * last seconds-to-minutes. This queue provides exponential backoff (2s→4s→8s)
 * to handle transient failures without blocking UI responsiveness.
 *
 * Safety-critical flows (self_clearance_check) should NOT use this queue — they
 * must await completion to ensure decisions are based on committed state.
 *
 * @module nsv-update-queue
 */

import { GlobalProjectionService } from './global-projection-service';
import type { NeuralStateVectorPatch } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface QueuedUpdate {
  userId: string;
  patch: NeuralStateVectorPatch;
  attempts: number;
  createdAt: number;
  source?: string; // For debugging — identifies the caller
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [2000, 4000, 8000]; // Exponential backoff delays
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes — discard stale updates

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const updateQueue: QueuedUpdate[] = [];
let isProcessing = false;
let processTimeout: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Queue an NSV update with exponential backoff retry.
 *
 * Use this for NON-safety-critical updates where eventual consistency is
 * acceptable (body weight, sleep quality, workout completion).
 *
 * Do NOT use for safety-critical decisions like training clearance — those
 * must await the GlobalProjectionService.updateCrossFunctionalState directly.
 *
 * @param userId - User ID
 * @param patch - NSV patch to apply
 * @param source - Optional caller identifier for debugging
 */
export function queueNSVUpdate(
  userId: string,
  patch: NeuralStateVectorPatch,
  source?: string
): void {
  if (!userId) {
    console.warn('[NSVQueue] Skipping update — no userId provided');
    return;
  }

  // Check for empty patch
  const hasFields = Object.values(patch).some(
    (domain) =>
      domain !== undefined &&
      typeof domain === 'object' &&
      domain !== null &&
      Object.keys(domain).length > 0
  );
  if (!hasFields) {
    console.warn('[NSVQueue] Skipping update — empty patch');
    return;
  }

  updateQueue.push({
    userId,
    patch,
    attempts: 0,
    createdAt: Date.now(),
    source,
  });

  // Start processing if not already running
  scheduleProcessing();
}

/**
 * Get the current queue length (for monitoring/debugging).
 */
export function getQueueLength(): number {
  return updateQueue.length;
}

/**
 * Check if the queue is currently processing.
 */
export function isQueueProcessing(): boolean {
  return isProcessing;
}

/**
 * Force process all pending updates immediately.
 * Useful for testing or ensuring updates are flushed before navigation.
 */
export async function flushQueue(): Promise<void> {
  if (processTimeout) {
    clearTimeout(processTimeout);
    processTimeout = null;
  }
  await processQueue();
}

// ---------------------------------------------------------------------------
// Internal Processing
// ---------------------------------------------------------------------------

function scheduleProcessing(): void {
  // Don't schedule if already processing or already scheduled
  if (isProcessing || processTimeout) return;

  // Start processing on next tick to batch rapid-fire calls
  processTimeout = setTimeout(() => {
    processTimeout = null;
    processQueue();
  }, 50);
}

async function processQueue(): Promise<void> {
  if (isProcessing || updateQueue.length === 0) return;
  isProcessing = true;

  while (updateQueue.length > 0) {
    const update = updateQueue[0];

    // Discard stale updates (> 5 minutes old)
    if (Date.now() - update.createdAt > STALE_THRESHOLD_MS) {
      console.warn(
        `[NSVQueue] Discarding stale update from ${update.source ?? 'unknown'} — ${((Date.now() - update.createdAt) / 1000).toFixed(0)}s old`
      );
      updateQueue.shift();
      continue;
    }

    try {
      await GlobalProjectionService.updateCrossFunctionalState(update.userId, update.patch);
      updateQueue.shift(); // Success — remove from queue
    } catch (error) {
      update.attempts++;

      if (update.attempts >= MAX_ATTEMPTS) {
        console.error(
          `[NSVQueue] Failed after ${MAX_ATTEMPTS} attempts from ${update.source ?? 'unknown'}:`,
          update.patch,
          error
        );
        updateQueue.shift(); // Give up — remove from queue
        // TODO: Optionally persist to dead-letter storage for manual recovery
      } else {
        // Wait with exponential backoff before retry
        const delay = BACKOFF_MS[update.attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
        console.warn(
          `[NSVQueue] Attempt ${update.attempts}/${MAX_ATTEMPTS} failed from ${update.source ?? 'unknown'}, retrying in ${delay}ms`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  isProcessing = false;
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------
export const _testHelpers = {
  clearQueue: () => {
    updateQueue.length = 0;
    isProcessing = false;
    if (processTimeout) {
      clearTimeout(processTimeout);
      processTimeout = null;
    }
  },
  getQueue: () => [...updateQueue],
};
