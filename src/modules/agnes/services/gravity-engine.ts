import { AgnesGravityEngineJs } from '@cortex-logic';
import { Spine } from '@/lib/spine/spine-event-bus';

/**
 * GravityEngine — delegates G-score computation to KMP's GravityCalculator.
 * Formula (in KMP): G = w1·|S| + w2·K  (w1=0.6, w2=0.4)
 * Spine event emission stays in TS (browser side-effect).
 */

const SESSION_INVITATION_THRESHOLD = 0.8;

let _engine: InstanceType<typeof AgnesGravityEngineJs> | null = null;
function getEngine() {
  if (!_engine) _engine = new AgnesGravityEngineJs();
  return _engine;
}

export class GravityEngine {
  /**
   * Calculates the Gravity Score (G) for a given text.
   * @param text The user's input string.
   * @param sentiment Polarity between -1.0 and 1.0.
   * @returns Gravity score between 0.0 and 1.0.
   */
  public static calculateGravity(text: string, sentiment: number): number {
    return getEngine().calculateGravity(text, sentiment);
  }

  /**
   * Evaluates if a Gravity Spike should trigger a session invitation.
   */
  public static evaluate(text: string, sentiment: number, moduleId: string) {
    const gravity = this.calculateGravity(text, sentiment);

    if (gravity > SESSION_INVITATION_THRESHOLD) {
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
