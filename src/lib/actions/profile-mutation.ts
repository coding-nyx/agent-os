import type { SpineEventType } from '@/lib/types';
import type { ActionContext } from './action-hub';

type MutationCreds = { userId: string; encryptionKey: CryptoKey };

type WithProfileMutationOptions<T> = {
  /**
   * Message shown when userId or encryptionKey is absent (vault locked).
   * Defaults to 'Unable to complete action: vault is locked.'
   */
  lockedMessage?: string;
  /**
   * Message shown when the profile could not be loaded (not found / decrypt error).
   * Defaults to 'Unable to complete action: profile not found.'
   */
  notFoundMessage?: string;
  /**
   * Optional Spine event to emit after a successful save.
   */
  spineEvent?: {
    type: SpineEventType;
    data: Record<string, unknown>;
    options?: { domain?: string; priority?: 'info' | 'alert' | 'critical'; target?: string };
  };
  /**
   * Optional success message pushed to the chat after a successful save.
   */
  successMessage?: string;
};

/**
 * Generic profile mutation helper.
 *
 * Eliminates the ~35-line load → vault-guard → mutate → save → event → message
 * boilerplate that was repeated across every ActionHub handler.
 *
 * Usage:
 * ```ts
 * await withProfileMutation(
 *   context,
 *   (creds) => loadAtlasProfile(creds),
 *   (profile, creds) => saveAtlasProfile(profile, creds),
 *   (profile) => { profile.tasks.push(newTask); return profile; },
 *   { spineEvent: { type: 'TASK_CREATED', data: { taskId } }, successMessage: 'Task created.' }
 * );
 * ```
 *
 * Returns `true` if the mutation was persisted, `false` if it was short-circuited
 * (vault locked, profile not found, or mutate returned null/undefined).
 */
export async function withProfileMutation<T extends object>(
  context: Pick<
    ActionContext,
    'userId' | 'encryptionKey' | 'pushAssistantMessage' | 'markProfileDirty' | 'emitSpineEvent'
  >,
  load: (creds: MutationCreds) => Promise<T | null>,
  save: (profile: T, creds: MutationCreds) => Promise<void>,
  mutate: (profile: T) => T | null,
  options: WithProfileMutationOptions<T> = {},
): Promise<boolean> {
  const { userId, encryptionKey, pushAssistantMessage, markProfileDirty, emitSpineEvent } = context;

  if (!userId || !encryptionKey) {
    if (pushAssistantMessage && options.lockedMessage !== null) {
      pushAssistantMessage(options.lockedMessage ?? 'Unable to complete action: vault is locked.');
    }
    return false;
  }

  const creds: MutationCreds = { userId, encryptionKey };

  const profile = await load(creds);
  if (!profile) {
    if (pushAssistantMessage && options.notFoundMessage !== null) {
      pushAssistantMessage(options.notFoundMessage ?? 'Unable to complete action: profile not found.');
    }
    return false;
  }

  const mutated = mutate(profile);
  if (mutated === null || mutated === undefined) return false;

  await save(mutated, creds);

  markProfileDirty?.();

  if (options.spineEvent) {
    const { type, data, options: spineOptions } = options.spineEvent;
    emitSpineEvent(type, data, spineOptions);
  }

  if (options.successMessage && pushAssistantMessage) {
    pushAssistantMessage(options.successMessage);
  }

  return true;
}
