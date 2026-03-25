import { LedgerIntakeProfile, Transaction } from './ledger-intake-service';
import { GlobalSoul } from '@/lib/types';
import { Spine } from '@/lib/spine/spine-event-bus';

/**
 * Ledger FrictionEngine
 * Implements the Financial Resonance & Friction Math from the Master Spec.
 */

export class FrictionEngine {
  /**
   * Calculates the Daily Burn Rate (DBR).
   * Average of the last 30 days of expenses.
   */
  public static calculateDailyBurnRate(transactions: Transaction[]): number {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const expenses = transactions.filter(t => 
      t.type === 'expense' && 
      new Date(t.date) >= thirtyDaysAgo
    );
    
    const totalExpense = expenses.reduce((sum, t) => sum + t.amount, 0);
    return Math.max(1, totalExpense / 30); // Prevent division by zero
  }

  /**
   * Calculates per-transaction friction.
   * F_transaction = |R_negative| * (Amount / Daily_Burn_Rate)
   */
  public static calculateTransactionFriction(
    transaction: Transaction, 
    dailyBurnRate: number
  ): number {
    const r = transaction.resonance_score ?? 0;
    if (r >= 0) return 0; // Positive resonance reduces friction or is neutral
    
    const rNegative = Math.abs(r);
    return rNegative * (transaction.amount / dailyBurnRate);
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
    if (avgDailyBurn <= 0) return 999; // Infinity survival
    return (liquidity / avgDailyBurn) * confidenceInterval;
  }

  /**
   * Evaluates the profile and emits necessary Spine events.
   */
  public static evaluate(profile: LedgerIntakeProfile, globalSoul: GlobalSoul | null) {
    const transactions = profile.transactions || [];
    const dbr = this.calculateDailyBurnRate(transactions);
    
    // 1. Calculate Friction Delta
    // We only calculate for very recent transactions (e.g., today) to emit as a delta
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

    // 2. Audit Request if friction > 0.8
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

    // 3. Runway Math & Autopilot Lockdown
    const totalLiquidity = profile.monthlyIncome; // Simplified for now, should include account balances
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
