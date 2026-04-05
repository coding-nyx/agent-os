import { RecoveryTemplatesJs } from '@cortex-logic';
import type { TitanRecoveryBodyRegion, TitanRecoveryType } from '@/lib/types';

const _service = new RecoveryTemplatesJs();

// ─── Public types ─────────────────────────────────────────────────────────────

export interface RecoveryTemplate {
  id: string;
  type: TitanRecoveryType;
  label: string;
  description: string;
  suggestedDurationDays: number;
  steps: string[];
}

// Kept as a static constant — callers may reference this directly without
// invoking a function, so it cannot be bridged through an instance call.
export const RECOVERY_TEMPLATE_LABELS: Record<TitanRecoveryType, string> = {
  rest: 'Complete Rest',
  active: 'Active Recovery',
  rehab: 'Rehab Protocol',
  deload: 'Reduced Load',
};

// ─── Bridge functions ─────────────────────────────────────────────────────────

export function getRecoveryTemplate(
  type: TitanRecoveryType,
  bodyRegion?: TitanRecoveryBodyRegion,
): RecoveryTemplate {
  return JSON.parse(
    _service.getRecoveryTemplate(type, bodyRegion ?? null),
  ) as RecoveryTemplate;
}

export function getRecoveryLabel(type: TitanRecoveryType): string {
  return _service.getRecoveryLabel(type) as string;
}
