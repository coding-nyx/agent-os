// Bridge: delegates to KMP CreditAggregationJs.
// inferCreditFactors is not in KMP — it remains as a local TS implementation.

import { CreditAggregationJs } from '@cortex-logic';
import type { CreditScoreEntry, CreditFactor } from '../ledger-intake-service';

export interface CreditScoreTrend {
  direction: 'up' | 'down' | 'stable';
  absoluteChange: number;
  latestScore: number;
  previousScore: number | null;
}

const _creditAgg = new CreditAggregationJs();

export function computeCreditTrend(history: CreditScoreEntry[]): CreditScoreTrend {
  return JSON.parse(
    _creditAgg.computeCreditTrend(JSON.stringify(history)),
  ) as CreditScoreTrend;
}

export function getCreditRating(score: number): { label: string; color: string } {
  return JSON.parse(
    _creditAgg.getCreditRating(score),
  ) as { label: string; color: string };
}

export function getImprovementTips(score: number): string[] {
  return JSON.parse(
    _creditAgg.getImprovementTips(score),
  ) as string[];
}

// Not migrated to KMP — remains local.
export function inferCreditFactors(score: number): CreditFactor[] {
  return [
    {
      name: 'Payment History',
      impact: score >= 700 ? 'positive' : 'negative',
      description:
        score >= 700
          ? 'No recent missed payments detected.'
          : 'Late payments can significantly hurt your score.',
    },
    {
      name: 'Credit Utilization',
      impact: score >= 740 ? 'positive' : score >= 670 ? 'neutral' : 'negative',
      description:
        score >= 740
          ? 'Utilization appears low — good standing.'
          : 'Try to keep balances below 30% of your credit limit.',
    },
    {
      name: 'Credit Age',
      impact: score >= 700 ? 'positive' : 'neutral',
      description: 'Longer average credit history improves your score over time.',
    },
    {
      name: 'New Inquiries',
      impact: 'neutral',
      description: 'Hard inquiries from applications stay on your report for 2 years.',
    },
    {
      name: 'Credit Mix',
      impact: score >= 720 ? 'positive' : 'neutral',
      description: 'Having a mix of revolving and installment accounts is beneficial.',
    },
  ];
}
