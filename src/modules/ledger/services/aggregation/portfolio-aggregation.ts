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

export function computePortfolioSummary(investments: Investment[]): PortfolioSummary {
  let totalValue = 0;
  let totalCost = 0;
  let totalDividends = 0;
  const allocationByType: Partial<Record<InvestmentType, number>> = {};

  for (const inv of investments) {
    totalValue += inv.currentValue;
    totalCost += inv.totalCost;
    totalDividends += inv.dividendsReceived ?? 0;
    allocationByType[inv.type] = (allocationByType[inv.type] ?? 0) + inv.currentValue;
  }

  const unrealizedGain = totalValue - totalCost;
  const unrealizedGainPct = totalCost > 0 ? (unrealizedGain / totalCost) * 100 : 0;

  return {
    totalValue,
    totalCost,
    unrealizedGain,
    unrealizedGainPct,
    totalDividends,
    allocationByType: allocationByType as Record<InvestmentType, number>,
    holdingCount: investments.length,
  };
}

export function buildPortfolioSnapshot(investments: Investment[], note?: string): PortfolioSnapshot {
  const summary = computePortfolioSummary(investments);
  const allocationRecord: Record<string, number> = {};
  for (const [type, val] of Object.entries(summary.allocationByType)) {
    allocationRecord[type] = val;
  }
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    totalValue: summary.totalValue,
    totalCost: summary.totalCost,
    unrealizedGain: summary.unrealizedGain,
    dividendsReceived: summary.totalDividends,
    allocationByType: allocationRecord,
    note,
  };
}

/** Returns top N holdings by current value. */
export function getTopHoldings(investments: Investment[], n = 5): Investment[] {
  return [...investments].sort((a, b) => b.currentValue - a.currentValue).slice(0, n);
}

/** Recalculates derived fields on an Investment when price changes. */
export function recomputeInvestment(inv: Investment): Investment {
  const currentValue = inv.quantity * inv.currentPrice;
  const totalCost = inv.quantity * inv.costBasis;
  return {
    ...inv,
    currentValue,
    totalCost,
    unrealizedGain: currentValue - totalCost,
    lastUpdatedAt: new Date().toISOString(),
  };
}
