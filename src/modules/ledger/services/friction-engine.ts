import { LedgerAggregationUtilsJs } from '@cortex-logic';
import { LedgerIntakeProfile, Transaction } from './ledger-intake-service';
import { GlobalSoul } from '@/lib/types';
import { Spine } from '@/lib/spine/spine-event-bus';

/**
 * Ledger FrictionEngine — pure calculations delegated to KMP's LedgerAggregationUtils.
 * Formula: F_transaction = |R_negative| × (amount / DBR)
 * Formula: Runway = (liquidity / avgDailyBurn) × confidenceInterval
 * Spine event emission stays in TS (browser side-effect).
 */

let _utils: InstanceType<typeof LedgerAggregationUtilsJs> | null = null;
function getUtils() {
  if (!_utils) _utils = new LedgerAggregationUtilsJs();
  return _utils;
}

export class FrictionEngine {
  /**
   * Calculates the Daily Burn Rate (DBR).
   * Average of the last 30 days of expenses.
   */
  public static calculateDailyBurnRate(transactions: Transaction[]): number {
    return getUtils().calculateDailyBurnRate(JSON.stringify(transactions), Date.now());
  }

  /**
   * Calculates per-transaction friction.
   * F_transaction = |R_negative| * (Amount / Daily_Burn_Rate)
   */
  public static calculateTransactionFriction(
    transaction: Transaction,
    dailyBurnRate: number
  ): number {
    return getUtils().calculateTransactionFriction(
      transaction.amount,
      transaction.resonance_score ?? 0,
      dailyBurnRate,
    );
  }

  /**
   * Calculates the Runway (Days of Survival).
   * D = (Total_Liquidity / Avg_Daily_Burn) * Confidence_Interval
   */
  public static calculateRunway(
    liquidity: number,
    avgDailyBurn: number,
    confidenceInterval: number = 0.9
  ): number {
    return getUtils().calculateRunway(liquidity, avgDailyBurn, confidenceInterval);
  }

  /**
   * Evaluates the profile and emits necessary Spine events.
   */
  public static evaluate(profile: LedgerIntakeProfile, globalSoul: GlobalSoul | null) {
    const transactions = profile.transactions || [];
    const dbr = this.calculateDailyBurnRate(transactions);

    const today = new Date().toISOString().split('T')[0];
    const todayTransactions = transactions.filter(t => t.date === today);

    const frictionDelta = todayTransactions.reduce((sum, t) =>
      sum + this.calculateTransactionFriction(t, dbr), 0
    );

    if (frictionDelta > 0) {
      Spine.emit({
        intent: 'LEDGER_FRICTION_UPDATE',
        source: 'LEDGER',
        payload: {
          intent: 'FRICTION_DELTA',
          mutations: { friction: frictionDelta }
        },
        logic_gates: { confidence: 1.0, requires_approval: false, patient_scope: 'USER' }
      } as any);
    }

    const friction = globalSoul?.crossFunctionalState?.resource?.financialFriction;
    if (typeof friction === 'number' && friction > 8) {
      Spine.emit({
        intent: 'AUDIT_REQUEST',
        source: 'LEDGER',
        payload: {
          intent: 'RUNWAY_AUDIT',
          raw_blob: { friction }
        },
        logic_gates: { confidence: 1.0, requires_approval: false, patient_scope: 'USER' }
      } as any);
    }

    const totalLiquidity = profile.monthlyIncome;
    const runway = this.calculateRunway(totalLiquidity, dbr);

    if (runway < 30) {
      console.warn(`[Ledger] Critical Runway: ${runway.toFixed(1)} days. Locking Autopilot to Level 1.`);
      Spine.emit({
        intent: 'AUTOPILOT_LOCKDOWN',
        source: 'LEDGER',
        payload: {
          intent: 'SET_AUTOPILOT_LEVEL',
          attributes: { level: 1, reason: 'CRITICAL_RUNWAY_LOW' }
        },
        logic_gates: { confidence: 1.0, requires_approval: false, patient_scope: 'USER' }
      } as any);
    }

    return { dbr, runway, frictionDelta };
  }
}
