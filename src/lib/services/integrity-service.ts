
export interface IntegrityState {
  score: number; // 0 to 100
  label: string; // e.g. "Stable", "Degrading", "Critical"
  isGuest: boolean;
}

const GUEST_MAX_TOKENS = 4000; // Total estimated context weight for trial
const TOKEN_STORE_KEY = 'agnes_integrity_tokens';

export class IntegrityService {
  /**
   * Calculates current integrity based on token usage.
   * For guests, it depletes. For users, it stays at 100 (Stable).
   */
  static getIntegrity(isGuest: boolean): IntegrityState {
    if (!isGuest) {
      return { score: 100, label: 'Optimal', isGuest: false };
    }

    const used = parseInt(sessionStorage.getItem(TOKEN_STORE_KEY) || '0', 10);
    const score = Math.max(0, 100 - (used / GUEST_MAX_TOKENS) * 100);
    
    let label = 'Stable';
    if (score < 30) label = 'Critical';
    else if (score < 70) label = 'Degrading';

    return { score, label, isGuest: true };
  }

  static recordUsage(isGuest: boolean, messageContent: string) {
    if (!isGuest) return;

    // Simple estimation: 1 word approx 1.3 tokens
    const estimate = messageContent.split(/\s+/).length * 1.3;
    const current = parseInt(sessionStorage.getItem(TOKEN_STORE_KEY) || '0', 10);
    sessionStorage.setItem(TOKEN_STORE_KEY, (current + estimate).toString());
  }

  static reset() {
    sessionStorage.removeItem(TOKEN_STORE_KEY);
  }
}
