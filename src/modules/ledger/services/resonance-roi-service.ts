import { CrossVerificationServiceJs } from '@cortex-logic';
import type { LedgerIntakeProfile } from './ledger-intake-service';

const _svc = new CrossVerificationServiceJs();

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
  const result = JSON.parse(_svc.computeResonanceROI(JSON.stringify(profile)));
  return {
    resonanceROI: result.resonanceROI,
    financialFriction: result.financialFriction,
  };
}
