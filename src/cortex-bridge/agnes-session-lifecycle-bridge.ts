import { AgnesSessionLifecycleServiceJs, CancellableTask } from './cortex-logic-runtime';
import { Spine } from '@/lib/spine/spine-event-bus';

export type AgnesSessionMode = 'CASUAL' | 'DEEP' | 'IMPROMPTU' | 'SOMATIC';

let _instance: any = null;

function getLifecycleService() {
  if (!_instance && AgnesSessionLifecycleServiceJs) {
    _instance = new AgnesSessionLifecycleServiceJs((eventJson: string) => {
      try {
        const payload = JSON.parse(eventJson);
        Spine.emit(payload);
      } catch (e) {
        console.error('[AgnesLifecycleBridge] Failed to emit Spine event:', e);
      }
    });
  }
  return _instance;
}

/**
 * Transition to a new session mode (CASUAL, DEEP, IMPROMPTU, SOMATIC).
 * Delegates to the KMP AgnesSessionLifecycleService.
 */
export async function transitionTo(mode: AgnesSessionMode, sessionId: string): Promise<void> {
  const service = getLifecycleService();
  if (!service) return;

  return new Promise((resolve, reject) => {
    service.transitionTo(
      mode,
      sessionId,
      () => resolve(),
      (err: string) => reject(new Error(err))
    );
  });
}

/**
 * Called when an IMPROMPTU session is closed. 
 * Registers the 2-hour Vault Purgatory in the KMP engine.
 */
export async function closeImpromptu(sessionId: string): Promise<void> {
  const service = getLifecycleService();
  if (!service) return;

  return new Promise((resolve, reject) => {
    service.closeImpromptu(
      sessionId,
      () => resolve(),
      (err: string) => reject(new Error(err))
    );
  });
}

/**
 * Check if a session is currently in the 2-hour Vault Purgatory.
 */
export function isInPurgatory(sessionId: string): boolean {
  const service = getLifecycleService();
  return service?.isInPurgatory(sessionId) ?? false;
}

/**
 * Purge all expired purgatory sessions.
 * Returns a list of session IDs that were purged.
 */
export async function purgeExpiredSessions(): Promise<string[]> {
  const service = getLifecycleService();
  if (!service) return [];

  return new Promise((resolve, reject) => {
    service.purgeExpiredSessions(
      (purged: string[]) => resolve(purged),
      (err: string) => reject(new Error(err))
    );
  });
}

/**
 * Evaluate sentiment gravity and potentially trigger a session invitation.
 */
export async function evaluateSentimentGravity(gravity: number, sessionId: string): Promise<void> {
  const service = getLifecycleService();
  if (!service) return;

  return new Promise((resolve, reject) => {
    service.evaluateSentimentGravity(
      gravity,
      sessionId,
      () => resolve(),
      (err: string) => reject(new Error(err))
    );
  });
}

/**
 * Returns the current session mode from the KMP engine.
 */
export function getCurrentMode(): AgnesSessionMode {
  const service = getLifecycleService();
  return (service?.currentMode() ?? 'CASUAL') as AgnesSessionMode;
}
