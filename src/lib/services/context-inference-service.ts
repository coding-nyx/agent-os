/**
 * Contextual Inference Engine — S10-008
 *
 * Verifies passive cross-module data hints detected by AI modules against
 * the current stored profile values, and builds the data needed to drive
 * the DataSyncToast confirmation UI.
 *
 * Design principles:
 *  - Pure business logic; no React dependencies.
 *  - All Firestore access goes through the NexusDataLayer abstraction.
 *  - Rate-limited per target module via sessionStorage to prevent UI spam.
 *  - Agnes-domain hints are always non-discrepant (emotional data is sacred).
 */

import { getNexusDataLayer } from '@/lib/data-layer/provider';
import type { DataHint, HintVerificationResult } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_HINT_COUNT_PREFIX = 'hint_count_';
const MAX_HINTS_PER_MODULE = 2;

/**
 * Maps `{targetModule}.{field}` to the ActionHub action type that should be
 * dispatched when the user confirms the inferred update.
 */
const HINT_ACTION_MAP: Record<string, string> = {
  'titan.weeklyWorkouts': 'update_training_schedule',
  'titan.workoutLogged': 'log_workout_session',
  'titan.sleepQuality': 'log_sleep',
  'titan.recoveryScore': 'compute_readiness',
  'ledger.monthlyIncome': 'update_income_source',
  'ledger.monthlyBudget': 'update_budget_snapshot',
  'ledger.financialFriction': 'update_financial_friction',
  'soma.sleepQuality': 'update_sleep_quality',
  'soma.energyLevel': 'update_sleep_quality',
  'soma.cnsFatigue': 'commit_biomarker',
  'atlas.upcomingEvent': 'capture_task',
  'atlas.activeLoad': 'update_routine',
  'atlas.weeklyGoal': 'create_goal',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verifies a DataHint against the user's stored profile for the target module.
 *
 * Complexity: O(d) where d is the depth of the field path — effectively O(1).
 *
 * @param hint    The hint emitted by a source AI module.
 * @param userId  The authenticated user's UID.
 * @returns       A HintVerificationResult; `isDiscrepant: false` suppresses the toast.
 */
export async function verifyHintAgainstProfile(
  hint: DataHint,
  userId: string,
): Promise<HintVerificationResult> {
  // Agnes owns emotional data — never surface popups for emotional fields.
  if (hint.targetModule === 'agnes') {
    return buildResult(hint, false, undefined, `Agnes: (private)`, '');
  }

  // Rate-limiting: skip if this target module has already prompted ≥ MAX times.
  const count = readHintCount(hint.targetModule);
  if (count >= MAX_HINTS_PER_MODULE) {
    return buildResult(hint, false, undefined, '', '');
  }

  // Resolve action type from lookup table.
  const mapKey = `${hint.targetModule}.${hint.field}`;
  const confirmActionType = HINT_ACTION_MAP[mapKey] ?? '';

  // Fetch the target module's profile from Firestore via the abstraction layer.
  const collection = `${hint.targetModule}_profiles`;
  const dataLayer = getNexusDataLayer();

  let profile: Record<string, unknown> | null = null;
  try {
    const doc = await dataLayer.getDocument<Record<string, unknown>>(collection, userId);
    profile = doc ?? null;
  } catch {
    // Network / permission error — treat as no stored value.
    profile = null;
  }

  // Navigate the dot-notation path (supports array index notation).
  const currentValue = profile != null ? resolveFieldPath(profile, hint.field) : undefined;

  const isDiscrepant = evaluateDiscrepancy(hint.inferredValue, currentValue);

  const displayLabel = buildDisplayLabel(hint.targetModule, currentValue);

  return buildResult(hint, isDiscrepant, currentValue, displayLabel, confirmActionType);
}

/**
 * Increments the per-module hint counter stored in sessionStorage.
 * Call after a hint is either confirmed or dismissed.
 */
export function incrementHintCount(targetModule: string): void {
  const key = `${SESSION_HINT_COUNT_PREFIX}${targetModule}`;
  const current = readHintCount(targetModule);
  sessionStorage.setItem(key, String(current + 1));
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function readHintCount(targetModule: string): number {
  const raw = sessionStorage.getItem(`${SESSION_HINT_COUNT_PREFIX}${targetModule}`);
  const parsed = parseInt(raw ?? '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Resolves a dot-notation path like `incomeSources[0].monthlyIncome` against
 * an arbitrary nested object.  Returns `undefined` when any segment is missing.
 *
 * Supports:
 *  - Simple keys: `weeklyWorkouts`
 *  - Nested keys: `training.weeklyWorkouts`
 *  - Array indices: `incomeSources[0].amount`
 */
function resolveFieldPath(obj: Record<string, unknown>, path: string): unknown {
  // Normalise array notation: "arr[0].foo" → "arr.0.foo"
  const normalised = path.replace(/\[(\d+)\]/g, '.$1');
  const segments = normalised.split('.');

  let cursor: unknown = obj;
  for (const segment of segments) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/**
 * Returns true when the inferred value meaningfully differs from the stored value.
 *
 * Rules:
 *  - null / undefined stored → always discrepant (new data opportunity)
 *  - Numbers: discrepant if |diff| > 15% of stored value OR |diff| > 1
 *  - Strings / enums: discrepant if not equal (case-insensitive)
 *  - All other types: discrepant if not strictly equal
 */
function evaluateDiscrepancy(inferred: unknown, stored: unknown): boolean {
  if (stored === null || stored === undefined) return true;

  if (typeof inferred === 'number' && typeof stored === 'number') {
    const diff = Math.abs(inferred - stored);
    const pctDiff = stored !== 0 ? diff / Math.abs(stored) : diff;
    return diff > 1 || pctDiff > 0.15;
  }

  if (typeof inferred === 'string' && typeof stored === 'string') {
    return inferred.toLowerCase() !== stored.toLowerCase();
  }

  return inferred !== stored;
}

/**
 * Builds a human-readable label describing the current stored value.
 * E.g. "Titan shows: 5 days/week" or "Ledger shows: $3,500/mo".
 */
function buildDisplayLabel(targetModule: string, currentValue: unknown): string {
  const moduleName = targetModule.charAt(0).toUpperCase() + targetModule.slice(1);
  if (currentValue === undefined || currentValue === null) {
    return `${moduleName}: (not set)`;
  }
  return `${moduleName} shows: ${String(currentValue)}`;
}

function buildResult(
  hint: DataHint,
  isDiscrepant: boolean,
  currentValue: unknown,
  displayLabel: string,
  confirmActionType: string,
): HintVerificationResult {
  return { hint, isDiscrepant, currentValue, displayLabel, confirmActionType };
}
