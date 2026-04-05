// Bridge: delegates to KMP ForecastAggregationJs.
// summarizeForecastByMonth uses toLocaleDateString (browser API) —
// the label formatting is patched in TS after KMP returns the raw buckets.

import { ForecastAggregationJs } from '@cortex-logic';
import type { RecurringRule, CashFlowForecast } from '../ledger-intake-service';

export interface ForecastMonthSummary {
  label: string; // e.g. "Apr 2026"
  totalIncome: number;
  totalExpenses: number;
  net: number;
}

const _forecastAgg = new ForecastAggregationJs();

export function computeCashFlowForecast(
  recurringRules: RecurringRule[],
  startingBalance: number,
  horizon: 30 | 60 | 90,
): CashFlowForecast {
  return JSON.parse(
    _forecastAgg.computeCashFlowForecast(
      JSON.stringify(recurringRules),
      startingBalance,
      horizon,
      Date.now(),
    ),
  ) as CashFlowForecast;
}

/** Summarize forecast into monthly buckets for table display. */
export function summarizeForecastByMonth(forecast: CashFlowForecast): ForecastMonthSummary[] {
  // KMP returns buckets keyed by "YYYY-MM"; apply browser locale label in TS.
  const raw = JSON.parse(
    _forecastAgg.summarizeForecastByMonth(JSON.stringify(forecast)),
  ) as Array<{ label: string; totalIncome: number; totalExpenses: number; net: number }>;

  return raw.map((bucket) => ({
    ...bucket,
    label: new Date(`${bucket.label}-01`).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    }),
  }));
}
