// Bridge: delegates to KMP TaxAggregationJs.

import { TaxAggregationJs } from '@cortex-logic';
import type { LedgerIntakeProfile, TaxCategory, TaxYearSummary } from '../ledger-intake-service';

export interface TaxCategoryBreakdown {
  category: TaxCategory;
  total: number;
  transactionCount: number;
}

const _taxAgg = new TaxAggregationJs();

export function computeTaxBreakdown(
  profile: LedgerIntakeProfile,
  taxYear: number,
): TaxCategoryBreakdown[] {
  return JSON.parse(
    _taxAgg.computeTaxBreakdown(JSON.stringify(profile), taxYear),
  ) as TaxCategoryBreakdown[];
}

export function buildTaxYearSummary(
  profile: LedgerIntakeProfile,
  taxYear: number,
): TaxYearSummary {
  return JSON.parse(
    _taxAgg.buildTaxYearSummary(JSON.stringify(profile), taxYear, Date.now()),
  ) as TaxYearSummary;
}
