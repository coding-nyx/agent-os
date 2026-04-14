import { CrossVerificationServiceJs } from '@cortex-logic';
import type { LedgerIntakeProfile } from './ledger-intake-service';

const _svc = new CrossVerificationServiceJs();

/**
 * Normalize a LedgerIntakeProfile for KMP serialization.
 *
 * The TypeScript profile uses `label` on BudgetLineItem (fixedExpenses /
 * variableExpenses), but the Kotlin LedgerExpense data class requires
 * `name: String` (no default). Map label → name so the KMP serializer
 * finds the required field and doesn't throw MissingFieldException.
 */
function normalizeProfileForKMP(profile: LedgerIntakeProfile): string {
  const mapExpenses = (arr: LedgerIntakeProfile['fixedExpenses']) =>
    arr.map((e) => ({ ...e, name: (e as unknown as Record<string, string>)['name'] ?? e.label }));
  return JSON.stringify({
    ...profile,
    fixedExpenses: mapExpenses(profile.fixedExpenses ?? []),
    variableExpenses: mapExpenses(profile.variableExpenses ?? []),
  });
}

/**
 * Compute financial friction (0–1) for the given profile.
 * Delegates to the KMP CrossVerificationServiceJs.computeFinancialFriction.
 */
export function computeFinancialFriction(profile: LedgerIntakeProfile): number {
  return _svc.computeFinancialFriction(JSON.stringify(profile));
}

/**
 * Compute Resonance ROI and financial friction for the given profile.
 * Delegates to the KMP CrossVerificationServiceJs.computeResonanceROI.
 */
export function computeResonanceROI(profile: LedgerIntakeProfile): { resonanceROI: number; financialFriction: number } {
  const result = JSON.parse(_svc.computeResonanceROI(normalizeProfileForKMP(profile)));
  return {
    resonanceROI: result.resonanceROI,
    financialFriction: result.financialFriction,
  };
}
