// Bridge: delegates to KMP PortfolioAggregationJs.

import { PortfolioAggregationJs } from '@cortex-logic';
import type { Investment, PortfolioSnapshot, InvestmentType } from '../ledger-intake-service';

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
  totalDividends: number;
  allocationByType: Record<InvestmentType, number>;
  holdingCount: number;
}

const _portfolioAgg = new PortfolioAggregationJs();

export function computePortfolioSummary(investments: Investment[]): PortfolioSummary {
  return JSON.parse(
    _portfolioAgg.computePortfolioSummary(JSON.stringify(investments)),
  ) as PortfolioSummary;
}

export function buildPortfolioSnapshot(investments: Investment[], note?: string): PortfolioSnapshot {
  return JSON.parse(
    _portfolioAgg.buildPortfolioSnapshot(
      JSON.stringify(investments),
      Date.now(),
      note ?? null,
    ),
  ) as PortfolioSnapshot;
}

/** Returns top N holdings by current value. */
export function getTopHoldings(investments: Investment[], n = 5): Investment[] {
  return JSON.parse(
    _portfolioAgg.getTopHoldings(JSON.stringify(investments), n),
  ) as Investment[];
}

/** Recalculates derived fields on an Investment when price changes. */
export function recomputeInvestment(inv: Investment): Investment {
  return JSON.parse(
    _portfolioAgg.recomputeInvestment(JSON.stringify(inv), Date.now()),
  ) as Investment;
}
