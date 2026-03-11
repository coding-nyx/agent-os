import { SpineEvent, SpineEventType } from '@/lib/types';
import { LedgerSpineEventType } from '@/modules/ledger/actions/ledger-field-actions';

export interface CascadeRule {
  id: string;
  trigger: SpineEventType;
  condition: (event: SpineEvent) => boolean;
  transform: (event: SpineEvent) => any;
}

export const LEDGER_CASCADE_RULES: CascadeRule[] = [
  {
    id: 'ledger-transaction-to-budget',
    trigger: 'TRANSACTION_CREATED' as SpineEventType,
    condition: (event) => event.type === 'TRANSACTION_CREATED' && event.domain === 'R',
    transform: (event) => ({
      type: 'BUDGET_UPDATED' as LedgerSpineEventType,
      domain: 'R' as const,
      source: event.source,
      data: {
        transactionAmount: event.data.amount,
        transactionType: event.data.type,
        netCashflow: event.data.netCashflow
      }
    })
  },
  {
    id: 'ledger-goal-progress-to-health',
    trigger: 'GOAL_PROGRESS' as SpineEventType,
    condition: (event) => event.type === 'GOAL_PROGRESS' && event.domain === 'R',
    transform: (event) => ({
      type: 'FINANCIAL_HEALTH_CHECK' as LedgerSpineEventType,
      domain: 'R' as const,
      source: event.source,
      data: {
        goalProgress: event.data.percentComplete,
        goalName: event.data.goalName,
        healthScore: (event.data.percentComplete as number) / 10
      }
    })
  },
  {
    id: 'ledger-risk-to-alert',
    trigger: 'RISK_DETECTED' as SpineEventType,
    condition: (event) => event.type === 'RISK_DETECTED' && event.domain === 'R',
    transform: (event) => ({
      type: 'FINANCIAL_FRICTION_CHANGED' as LedgerSpineEventType,
      domain: 'R' as const,
      source: event.source,
      data: {
        newScore: 8.5,
        analysis: `Risk detected: ${event.data.riskType}`,
        tier: 'elevated' as const
      }
    })
  }
];

export function registerLedgerCascadeRules(): void {
  const spine = (window as any).Spine;
  if (spine && spine.registerCascadeRules) {
    spine.registerCascadeRules(LEDGER_CASCADE_RULES);
    console.log('[Ledger] Cascade rules registered');
  }
}

/** Alias — core cascade rules used by App-level registration. */
export const CORE_CASCADE_RULES = LEDGER_CASCADE_RULES;
