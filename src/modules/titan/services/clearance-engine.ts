import { TitanClearanceEngineJs } from '@cortex-logic';
import type { NeuralStateVector } from '@/lib/types';

/**
 * Titan ClearanceEngine — delegates the Triple-Check Clearance Protocol to KMP.
 */

export interface ClearanceReport {
  score: number;
  cleared: boolean;
  vetoReason?: string;
  consequence?: string;
  warnings: string[];
}

const _engine = new TitanClearanceEngineJs();

export class ClearanceEngine {
  /**
   * Runs the Triple-Check Clearance protocol.
   * Algorithm: Clearance = (Vitality * 0.6) + (Resilience * 0.4)
   */
  public static evaluate(nsv: NeuralStateVector): ClearanceReport {
    return JSON.parse(_engine.evaluate(JSON.stringify(nsv))) as ClearanceReport;
  }
}
