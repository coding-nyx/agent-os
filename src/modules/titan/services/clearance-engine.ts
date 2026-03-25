import { NeuralStateVector } from '@/lib/types';

/**
 * Titan ClearanceEngine
 * Implements the Triple-Check Clearance Protocol before performance sessions.
 */

export interface ClearanceReport {
  score: number;
  cleared: boolean;
  vetoReason?: string;
  consequence?: string;
  warnings: string[];
}

export class ClearanceEngine {
  /**
   * Runs the Triple-Check Clearance protocol.
   * Algorithm: Clearance = (Vitality * 0.6) + (Resilience * 0.4)
   */
  public static evaluate(nsv: NeuralStateVector): ClearanceReport {
    const vitality =
      typeof nsv.biological?.recoveryScore === 'number'
        ? nsv.biological.recoveryScore / 10
        : typeof nsv.biological?.cnsFatigue === 'number'
          ? Math.max(0, Math.min(1, (10 - nsv.biological.cnsFatigue) / 10))
          : 0.5;
    const resilience =
      typeof nsv.emotional?.emotionalResilience === 'number'
        ? Math.max(0, Math.min(1, nsv.emotional.emotionalResilience / 10))
        : 0.5;
    
    // We assume HRV delta is represented in vitality or passed as a derived metric.
    // For this implementation, we'll check vitality directly.
    
    const score = (vitality * 0.6) + (resilience * 0.4);
    const warnings: string[] = [];
    let cleared = true;
    let vetoReason: string | undefined;
    let consequence: string | undefined;

    // 1. Soma Readiness Check
    if (vitality < 0.3) {
      cleared = false;
      vetoReason = 'CRITICAL_VITALITY_LOW';
      consequence = 'FORCE_RECOVERY_MODE';
    }

    // 2. Soma HRV Check (Simulated)
    // If vitality dropped significantly (proxy for HRV delta)
    if (vitality < 0.5 && vitality >= 0.3) {
      warnings.push('HRV delta > -20%: Propose 20% volume reduction.');
    }

    // 3. Agnes Resilience Check
    if (resilience < 0.2) {
      cleared = false;
      vetoReason = 'CRITICAL_RESILIENCE_LOW';
      consequence = 'PROPOSE_REST_OR_LOW_STIFFNESS';
    }

    // Final Algorithm Veto
    if (score < 0.4 && cleared) {
      cleared = false;
      vetoReason = 'CLEARANCE_ALGORITHM_FAIL';
      consequence = 'INITIATE_RECOVERY';
    }

    return {
      score,
      cleared,
      vetoReason,
      consequence,
      warnings
    };
  }
}
