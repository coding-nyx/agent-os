import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { encryptWithKey } from '@/lib/encryption';
import { Message } from '@/lib/types';

/**
 * AgnesRepository
 * Handles the persistence of the Belief Graph and the ephemeral "Impromptu" sessions.
 * Implements the 2-hour TTL Purgatory for Impromptu sessions.
 */

const PURGATORY_KEY_PREFIX = 'agnes_purgatory_';
const TTL_2_HOURS = 2 * 60 * 60 * 1000;

export class AgnesRepository {
  /**
   * Saves an impromptu session to "Vault Purgatory" (sessionStorage with TTL).
   */
  public static stageImpromptuSession(sessionId: string, messages: Message[]) {
    const data = {
      messages,
      expiresAt: Date.now() + TTL_2_HOURS
    };
    sessionStorage.setItem(`${PURGATORY_KEY_PREFIX}${sessionId}`, JSON.stringify(data));
  }

  /**
   * Recovers a session from purgatory if it hasn't expired.
   */
  public static recoverFromPurgatory(sessionId: string): Message[] | null {
    const raw = sessionStorage.getItem(`${PURGATORY_KEY_PREFIX}${sessionId}`);
    if (!raw) return null;

    try {
      const { messages, expiresAt } = JSON.parse(raw);
      if (Date.now() > expiresAt) {
        sessionStorage.removeItem(`${PURGATORY_KEY_PREFIX}${sessionId}`);
        return null;
      }
      return messages;
    } catch {
      return null;
    }
  }

  /**
   * Finalizes a session and saves it to the encrypted Vault.
   */
  public static async finalizeSessionToVault(
    userId: string, 
    sessionId: string, 
    messages: Message[], 
    encryptionKey: CryptoKey
  ) {
    const payload = JSON.stringify({
      sessionId,
      timestamp: Date.now(),
      messages
    });

    const encrypted = await encryptWithKey(payload, encryptionKey);
    
    await getNexusDataLayer().createDocument(`vault/${userId}/agnes_sessions`, {
      id: sessionId,
      ...encrypted,
      // Pass metadata as a separate argument or ensure it's part of the data object if supported
      actionCount: messages.length 
    } as any);

    // Clear purgatory after successful vault save
    sessionStorage.removeItem(`${PURGATORY_KEY_PREFIX}${sessionId}`);
  }
}
