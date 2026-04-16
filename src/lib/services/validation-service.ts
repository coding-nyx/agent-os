/**
 * validation-service.ts — AI Validation Enhancements (S10-005)
 *
 * Top-level validation orchestrator for the Ara/Agnes platform.
 *
 * Responsibilities (Single Responsibility per layer):
 *   1. getValidatorPersona   — maps moduleId → LLM system-prompt prefix
 *   2. validateProfilePatch  — validates an entire profile patch in ONE LLM
 *                              call, enriched with per-module persona and the
 *                              last 3 user-correction examples (few-shot)
 *   3. Re-exports feedback helpers so UI components need only one import
 *
 * Architecture notes:
 *   - Does NOT import Firebase directly; all persistence goes through
 *     getAraDataLayer() which is already abstracted in field-validation-service.
 *   - Does NOT import from src/bridge/. LLM transport is injected via the
 *     optional `sendMessage` parameter (filled from useAI() at the call-site).
 *   - Open/Closed: add new module personas to MODULE_VALIDATOR_PERSONAS without
 *     touching any other function.
 *   - Dependency Inversion: sendMessage is an adapter boundary; this service
 *     owns the prompt protocol, not the transport.
 *
 * Complexity:
 *   getValidatorPersona  — O(1) map lookup
 *   validateProfilePatch — O(F) where F = number of fields (single LLM round-trip)
 *   feedback enrichment  — O(N) where N ≤ 3 (capped by getRecentFeedback limit)
 */

import {
  validateBatch,
  recordValidationFeedback as _recordFeedback,
  getRecentFeedback as _getRecentFeedback,
  buildFeedbackContext,
  type FieldValidationInput,
  type FieldValidationResult,
} from './field-validation-service';

// ============================================================================
// Public types
// ============================================================================

/**
 * Per-field AI validation result.
 *
 * Intentionally distinct from src/lib/validation/types.ts ValidationResult
 * (which is schema-error–oriented). This surface is AI-oriented:
 * valid/suggestion rather than errors[].
 */
export interface AIValidationResult {
  /** Field name matching the key in the original patch. */
  field: string;
  /** Whether the LLM (or fallback) deemed the value acceptable. */
  valid: boolean;
  /** LLM-suggested corrected value, if the field was invalid or improvable. */
  suggestion?: string;
  /** Human-readable reason for invalidity or the correction rationale. */
  reason?: string;
}

// Re-export so call-sites can import everything from one place.
export type {
  ValidationFeedback,
  FieldValidationResult,
  BatchValidationResult,
} from './field-validation-service';

// ============================================================================
// 1. Module-specific validator personas (S10-005 §3)
// ============================================================================

/**
 * Per-module LLM system-prompt prefixes.
 *
 * Design:
 *   - Ledger: strict financial domain — enforce numeric/currency formatting.
 *   - Agnes: compassionate wellness domain — tolerate subjective language.
 *   - Default: generic helpfulness.
 *
 * Extension point: add entries here; getValidatorPersona() needs no changes.
 */
const MODULE_VALIDATOR_PERSONAS: Readonly<Record<string, string>> = {
  ledger:
    'You are a strict financial data validator. Numeric fields must be valid numbers. ' +
    'Currency must include proper formatting.',

  agnes:
    'You are a compassionate wellness validator. Freeform emotional language is acceptable. ' +
    'Be tolerant of subjective descriptions.',

  titan:
    'You are a fitness data validator. Weights in kg or lbs (flag unit ambiguity), ' +
    'reps as integers, RPE as 1-10, dates as YYYY-MM-DD.',

  soma:
    'You are a medical data validator. Values must be plausible physiological ranges ' +
    '(HR 30-220, weight 20-300 kg, glucose 50-500). Flag outliers with reason.',

  atlas:
    'You are a planning data validator. Tolerant of natural language task/goal descriptions; ' +
    'strict on dates and numeric priority values (1-5).',
} as const;

const DEFAULT_VALIDATOR_PERSONA =
  'You are a helpful data validator ensuring consistency and accuracy.';

/**
 * Returns the LLM system-prompt prefix appropriate for `moduleId`.
 *
 * Used as the opening segment of every batch validation prompt so the LLM
 * applies module-appropriate domain knowledge and tolerance levels.
 *
 * @param moduleId - Ara module identifier (e.g. 'ledger', 'agnes', 'titan')
 * @returns System-prompt prefix string (never throws, never returns empty)
 */
export function getValidatorPersona(moduleId: string): string {
  return MODULE_VALIDATOR_PERSONAS[moduleId] ?? DEFAULT_VALIDATOR_PERSONA;
}

// ============================================================================
// 2. Batch profile-patch validation (S10-005 §1 + §2 + §3 wired together)
// ============================================================================

/**
 * Validate an entire profile patch in a **single** LLM call.
 *
 * Pipeline:
 *   1. Convert patch entries to FieldValidationInput[].
 *   2. Fetch last 3 user-corrections for this module (few-shot examples).
 *   3. Build an enriched sendMessage adapter that prepends persona + feedback
 *      context to every raw prompt forwarded to the LLM.
 *   4. Delegate to validateBatch() — single round-trip, keyword fallback on
 *      timeout / parse error / unavailable LLM.
 *   5. Map FieldValidationResult[] → AIValidationResult[].
 *
 * Guarantees:
 *   - Never throws. Returns [] for empty patch.
 *   - If sendMessage is omitted, keyword-heuristic fallback is used.
 *   - If userId is empty, feedback enrichment is skipped (no Firestore read).
 *
 * @param moduleId    - Ara module identifier
 * @param patch       - Map of field names → proposed values
 * @param userId      - Authenticated user ID (used for feedback retrieval)
 * @param sendMessage - Optional LLM transport adapter (from useAI().sendMessage).
 *                      Omit to force keyword-heuristic fallback.
 * @returns           Per-field AI validation results in patch-key order
 *
 * Time:  O(F) — F = number of fields, single LLM call
 * Space: O(F) — result array proportional to patch size
 */
export async function validateProfilePatch(
  moduleId: string,
  patch: Record<string, unknown>,
  userId: string,
  sendMessage?: (prompt: string) => Promise<string>,
): Promise<AIValidationResult[]> {
  // ── 1. Build FieldValidationInput array from patch ─────────────────────
  const fields: FieldValidationInput[] = Object.entries(patch).map(
    ([fieldName, value]): FieldValidationInput => ({ fieldName, value }),
  );

  if (fields.length === 0) return [];

  // ── 2. Fetch few-shot correction examples (last 3 for this module) ─────
  const recentFeedback =
    userId.trim().length > 0 ? await _getRecentFeedback(moduleId, userId, 3) : [];
  const feedbackCtx = buildFeedbackContext(recentFeedback);

  // ── 3. Build enriched sendMessage: persona prefix + few-shot examples ──
  let enrichedSendMessage: ((prompt: string) => Promise<string>) | undefined;

  if (sendMessage !== undefined) {
    const persona = getValidatorPersona(moduleId);

    enrichedSendMessage = (rawPrompt: string): Promise<string> => {
      // Layer: [persona] [feedback examples] [raw validation prompt]
      const segments: string[] = [persona];
      if (feedbackCtx.length > 0) segments.push(feedbackCtx);
      segments.push(rawPrompt);
      return sendMessage(segments.join('\n\n'));
    };
  }

  // ── 4. Delegate: single batch LLM call with keyword-fallback guarantee ─
  const batchResult = await validateBatch(fields, moduleId, enrichedSendMessage);

  // ── 5. Map to the public AIValidationResult shape ──────────────────────
  return batchResult.results.map(
    (r: FieldValidationResult): AIValidationResult => ({
      field: r.fieldName,
      valid: r.valid,
      suggestion:
        r.correctedValue !== undefined && r.correctedValue !== null
          ? String(r.correctedValue)
          : undefined,
      reason: r.reason,
    }),
  );
}

// ============================================================================
// 3. Feedback loop helpers re-exported for UI consumers (S10-005 §2)
// ============================================================================

/**
 * Persist a user-correction event to `validation_feedback/{userId}/{feedbackId}`.
 *
 * Call this when the user accepts a value that differs from the AI suggestion.
 * Fire-and-forget — never throws; logs errors internally.
 *
 * @example
 * ```typescript
 * await recordValidationFeedback(
 *   {
 *     id: crypto.randomUUID(),
 *     moduleId: 'ledger',
 *     fieldName: 'monthlyIncome',
 *     originalValue: '$5,000',
 *     correctedValue: '5000',        // what AI suggested
 *     userCorrectedTo: '4800',       // what user actually accepted
 *     timestamp: Date.now(),
 *   },
 *   currentUserId,
 * );
 * ```
 */
export { recordValidationFeedback } from './field-validation-service';

/**
 * Retrieve the N most recent user-correction events for a given module.
 * Returns [] on any error — treat as optional context enrichment.
 */
export { getRecentFeedback } from './field-validation-service';
