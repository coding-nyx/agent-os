import { Spine } from '@/lib/spine/spine-event-bus';

/**
 * GravityEngine Logic
 * Monitors chat sentiment and core-wound keywords to trigger session invitations.
 * Formula: G = w1 * |S| + w2 * K
 */

const W1 = 0.6; // Weight for sentiment polarity
const W2 = 0.4; // Weight for keyword density

const CORE_WOUND_KEYWORDS = [
  'failure', 'abandonment', 'rejection', 'shame', 'guilt', 'trauma',
  'worthless', 'unlovable', 'hopeless', 'helpless', 'betrayal', 'fear'
];

export class GravityEngine {
  /**
   * Calculates the Gravity Score (G) for a given text.
   * @param text The user's input string.
   * @param sentiment Polarity between -1.0 and 1.0.
   * @returns Gravity score between 0.0 and 1.0.
   */
  public static calculateGravity(text: string, sentiment: number): number {
    const absSentiment = Math.abs(sentiment);
    
    const words = text.toLowerCase().split(/\s+/);
    const keywordMatches = words.filter(word => 
      CORE_WOUND_KEYWORDS.some(k => word.includes(k))
    ).length;
    
    const keywordDensity = Math.min(1.0, keywordMatches / 3); // Maxed at 3 keywords for density

    const gravity = (W1 * absSentiment) + (W2 * keywordDensity);
    
    return Math.min(1.0, gravity);
  }

  /**
   * Evaluates if a Gravity Spike should trigger a session invitation.
   */
  public static evaluate(text: string, sentiment: number, moduleId: string) {
    const gravity = this.calculateGravity(text, sentiment);
    
    if (gravity > 0.8) {
      console.info(`[GravityEngine] Gravity Spike Detected: ${gravity.toFixed(2)}. Issuing Session Invitation.`);
      
      Spine.emit({
        intent: 'SESSION_INVITATION',
        source: 'AGNES',
        payload: {
          intent: 'SESSION_INVITATION',
          raw_blob: { text, gravity },
        },
        logic_gates: {
          confidence: 1.0,
          requires_approval: false,
          patient_scope: 'USER'
        }
      } as any);
    }
  }
}
