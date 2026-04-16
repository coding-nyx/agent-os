/**
 * Field Validation Service — Platform-level shared validation
 *
 * Provides batch LLM-driven field validation that ALL Ara modules can use.
 * Builds a single LLM prompt for the entire batch (vs. N individual calls),
 * stores results in sessionStorage, and persists user-correction feedback via
 * the AraDataLayer so future validations can contextualise their prompts.
 *
 * Architecture notes:
 *   - Single Responsibility: validation + feedback persistence only; no UI.
 *   - Open/Closed: new module personas added via MODULE_VALIDATION_PERSONAS
 *     without touching the core functions.
 *   - Dependency Inversion: sendMessage is an injected adapter — callers own
 *     the LLM transport; this service owns the protocol.
 *   - recordValidationFeedback is strictly fire-and-forget: it catches all
 *     errors internally and never propagates them.
 *
 * Complexity:
 *   validateBatch  — O(F) where F = number of fields (single LLM round-trip)
 *   buildFeedbackContext — O(N) where N = feedback array length
 */

import { getAraDataLayer } from '@/lib/data-layer/provider';
import type { AraQuery } from '@/lib/data-layer';

// ============================================================================
// Public types
// ============================================================================

export interface FieldValidationInput {
  fieldName: string;
  value: unknown;
  /** Module-specific hint injected per-field into the LLM prompt. */
  context?: string;
}

export interface FieldValidationResult {
  fieldName: string;
  valid: boolean;
  correctedValue?: unknown;
  reason?: string;
  /** Indicates how this result was produced. */
  source: 'llm' | 'fallback' | 'cache';
}

export interface BatchValidationResult {
  results: FieldValidationResult[];
  /** Number of fields for which the LLM (or fallback) suggested a correction. */
  correctedCount: number;
  /** Number of fields deemed invalid. */
  invalidCount: number;
}

export interface ValidationFeedback {
  id: string;
  moduleId: string;
  fieldName: string;
  originalValue: unknown;
  /** Value the LLM suggested. */
  correctedValue: unknown;
  /** Value the user actually chose (may differ from correctedValue). */
  userCorrectedTo: unknown;
  timestamp: number;
}

// ============================================================================
// Module-specific LLM personas (exported for external use / testing)
// ============================================================================

export const MODULE_VALIDATION_PERSONAS: Record<string, string> = {
  ledger:
    'Financial data validator: strict on numeric formats (no currency symbols, no commas in numbers), dates as YYYY-MM-DD, percentages as 0-100 integers.',
  agnes:
    'Emotional context validator: highly tolerant of freeform language, emotional descriptors, and subjective expressions. Only flag clearly invalid types (e.g. number where string expected).',
  titan:
    'Fitness data validator: weights in kg or lbs (flag unit ambiguity), reps as integers, RPE as 1-10, dates as YYYY-MM-DD.',
  soma: 'Medical data validator: values must be plausible physiological ranges (HR 30-220, weight 20-300kg, glucose 50-500). Flag outliers with reason.',
  atlas:
    'Planning data validator: tolerant of natural language task/goal descriptions, strict on dates and numeric priority values (1-5).',
};

// ============================================================================
// Internal constants
// ============================================================================

const BATCH_CACHE_PREFIX = 'ara_batch_val_';
const BATCH_LLM_TIMEOUT_MS = 5_000;

// ============================================================================
// sessionStorage cache helpers
// ============================================================================

function buildBatchCacheKey(moduleId: string, fields: FieldValidationInput[]): string {
  // First 40 chars of serialised fields as a cheap, collision-resistant hash
  const hash = JSON.stringify(fields).slice(0, 40);
  return `${BATCH_CACHE_PREFIX}${moduleId}_${hash}`;
}

function readBatchCache(key: string): BatchValidationResult | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as BatchValidationResult;
  } catch {
    // sessionStorage unavailable (SSR, private-mode quota) — treat as miss
    return null;
  }
}

function writeBatchCache(key: string, result: BatchValidationResult): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(result));
  } catch {
    // Non-fatal: cache write failure only means future calls will re-validate
  }
}

// ============================================================================
// Keyword fallback (synchronous, O(1) per field)
// ============================================================================

/**
 * Deterministic, offline-safe validation using field-name heuristics.
 * Mirrors the single-field logic in ledger-field-validator but is
 * generalised for all module field types.
 */
function keywordFallbackSingle(field: FieldValidationInput): FieldValidationResult {
  const { fieldName, value } = field;
  const strValue = value !== null && value !== undefined ? String(value) : '';

  if (
    /amount|price|cost|total|balance|income|expense|budget|salary|fee|rate/i.test(fieldName)
  ) {
    const num = parseFloat(strValue);
    const valid = Number.isFinite(num);
    return {
      fieldName,
      valid,
      reason: valid ? undefined : `Amount field "${fieldName}" must be a valid finite number.`,
      source: 'fallback',
    };
  }

  if (/date|time|day|when|period|start|end|due|deadline/i.test(fieldName)) {
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(strValue.trim());
    return {
      fieldName,
      valid,
      reason: valid ? undefined : `Date field "${fieldName}" must use ISO format YYYY-MM-DD.`,
      source: 'fallback',
    };
  }

  if (/category|type|kind|group|tag|label/i.test(fieldName)) {
    const valid = strValue.trim().length > 0;
    return {
      fieldName,
      valid,
      reason: valid ? undefined : `Category field "${fieldName}" must be non-empty.`,
      source: 'fallback',
    };
  }

  // Generic text field
  const trimmed = strValue.trim();
  if (trimmed.length === 0) {
    return {
      fieldName,
      valid: false,
      reason: `Field "${fieldName}" must not be empty.`,
      source: 'fallback',
    };
  }
  if (trimmed.length > 500) {
    return {
      fieldName,
      valid: false,
      reason: `Field "${fieldName}" exceeds the 500-character limit.`,
      source: 'fallback',
    };
  }
  return { fieldName, valid: true, source: 'fallback' };
}

// ============================================================================
// LLM call helpers
// ============================================================================

/** Shape each element of the LLM's JSON array response should conform to. */
interface LLMBatchItem {
  fieldName: string;
  valid: boolean;
  correctedValue?: unknown;
  reason?: string;
}

/**
 * Race the LLM call against the batch timeout.
 * Rejects with an Error on timeout so the caller can fall through to
 * the keyword fallback.
 */
function callBatchWithTimeout(
  prompt: string,
  sendMessage: (prompt: string) => Promise<string>,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('[FieldValidationService] LLM batch timeout')),
      BATCH_LLM_TIMEOUT_MS,
    );

    sendMessage(prompt)
      .then((text) => {
        clearTimeout(timer);
        resolve(text);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Parse the LLM's raw text into an array of FieldValidationResult.
 * Handles responses wrapped in markdown code fences.
 * Throws on structural mismatch so the caller can fall back.
 */
function parseBatchLLMResponse(
  raw: string,
  fields: FieldValidationInput[],
): FieldValidationResult[] {
  const arrayMatch = /\[[\s\S]*\]/.exec(raw);
  const jsonStr = arrayMatch ? arrayMatch[0] : raw.trim();
  const parsed = JSON.parse(jsonStr) as unknown;

  if (!Array.isArray(parsed)) {
    throw new TypeError('[FieldValidationService] LLM response is not a JSON array');
  }

  // Index parsed items by fieldName for O(1) lookup
  const resultMap = new Map<string, LLMBatchItem>();
  for (const item of parsed) {
    if (typeof item === 'object' && item !== null) {
      const record = item as Record<string, unknown>;
      if (typeof record['fieldName'] === 'string' && typeof record['valid'] === 'boolean') {
        resultMap.set(record['fieldName'], {
          fieldName: record['fieldName'],
          valid: record['valid'],
          correctedValue: record['correctedValue'],
          reason: typeof record['reason'] === 'string' ? record['reason'] : undefined,
        });
      }
    }
  }

  // Map back to input order; treat missing fields as valid (LLM omission = no issue found)
  return fields.map((field): FieldValidationResult => {
    const item = resultMap.get(field.fieldName);
    if (!item) {
      return { fieldName: field.fieldName, valid: true, source: 'llm' };
    }
    return {
      fieldName: field.fieldName,
      valid: item.valid,
      correctedValue:
        item.correctedValue !== undefined && item.correctedValue !== null
          ? item.correctedValue
          : undefined,
      reason: item.reason,
      source: 'llm',
    };
  });
}

// ============================================================================
// Primary exports
// ============================================================================

/**
 * Validate ALL fields in a single LLM call using module-specific persona context.
 *
 * Guarantees:
 *   - Never throws.
 *   - Returns a `BatchValidationResult` regardless of LLM availability.
 *   - Caches results in sessionStorage for the session lifetime.
 *   - If `sendMessage` is undefined, uses keyword fallback directly.
 *   - If the LLM takes > 5 s or returns unparseable output, uses keyword fallback.
 *   - Cache-hit results are tagged `source: 'cache'`.
 *
 * @param fields      Fields to validate.
 * @param moduleId    Used to select persona and build the cache key.
 * @param sendMessage LLM transport adapter. Pass `undefined` to force fallback.
 */
export async function validateBatch(
  fields: FieldValidationInput[],
  moduleId: string,
  sendMessage?: (prompt: string) => Promise<string>,
): Promise<BatchValidationResult> {
  if (fields.length === 0) {
    return { results: [], correctedCount: 0, invalidCount: 0 };
  }

  // ── 1. Cache hit ────────────────────────────────────────────────────────
  const cacheKey = buildBatchCacheKey(moduleId, fields);
  const cached = readBatchCache(cacheKey);
  if (cached !== null) {
    return {
      ...cached,
      results: cached.results.map((r) => ({ ...r, source: 'cache' as const })),
    };
  }

  // ── 2. LLM path ─────────────────────────────────────────────────────────
  let results: FieldValidationResult[];

  if (sendMessage !== undefined) {
    const persona = MODULE_VALIDATION_PERSONAS[moduleId];
    const fieldList = fields
      .map(
        (f) =>
          `- ${f.fieldName}: ${JSON.stringify(f.value)}${f.context ? ` (${f.context})` : ''}`,
      )
      .join('\n');

    const prompt = [
      persona ? `${persona}\n\n` : '',
      'Validate the following fields. Return ONLY a JSON array of objects, each with shape ',
      '{fieldName: string, valid: boolean, correctedValue?: unknown, reason?: string}:\n',
      fieldList,
    ].join('');

    try {
      const raw = await callBatchWithTimeout(prompt, sendMessage);
      results = parseBatchLLMResponse(raw, fields);
    } catch {
      // Timeout, network error, or JSON parse failure — degrade gracefully
      results = fields.map(keywordFallbackSingle);
    }
  } else {
    // ── 3. Keyword fallback (no LLM adapter provided) ─────────────────────
    results = fields.map(keywordFallbackSingle);
  }

  const correctedCount = results.filter((r) => r.correctedValue !== undefined).length;
  const invalidCount = results.filter((r) => !r.valid).length;
  const batchResult: BatchValidationResult = { results, correctedCount, invalidCount };

  writeBatchCache(cacheKey, batchResult);
  return batchResult;
}

/**
 * Persist a user-correction event to `validation_feedback/{userId}/entries/{feedback.id}`.
 *
 * Fire-and-forget: never throws, logs errors to console only.
 */
export async function recordValidationFeedback(
  feedback: ValidationFeedback,
  userId: string,
): Promise<void> {
  try {
    const dataLayer = getAraDataLayer();
    await dataLayer.setDocument<ValidationFeedback>(
      `validation_feedback/${userId}/entries`,
      feedback.id,
      feedback,
    );
  } catch (err: unknown) {
    console.error('[FieldValidationService] Failed to record validation feedback:', err);
  }
}

/**
 * Fetch the N most recent user-correction events for a given module.
 *
 * Returns an empty array on any error — callers may always treat the result
 * as optional context enrichment.
 */
export async function getRecentFeedback(
  moduleId: string,
  userId: string,
  limit = 5,
): Promise<ValidationFeedback[]> {
  try {
    const dataLayer = getAraDataLayer();
    const q: AraQuery = {
      collection: `validation_feedback/${userId}/entries`,
      where: [{ field: 'moduleId', op: '==', value: moduleId }],
      orderBy: [{ field: 'timestamp', direction: 'desc' }],
      limit,
    };
    const records = await dataLayer.query<ValidationFeedback>(q);
    // AraRecord<ValidationFeedback> = ValidationFeedback & { id: string }
    // ValidationFeedback already carries id, so the array is assignable directly.
    return records;
  } catch (err: unknown) {
    console.error('[FieldValidationService] Failed to retrieve recent feedback:', err);
    return [];
  }
}

/**
 * Format an array of past corrections into a compact context string suitable
 * for injection into the next validation prompt.
 *
 * Pure function — no side effects, no I/O.
 *
 * @example
 * buildFeedbackContext(feedback)
 * // → "User previously corrected: 'monthlyIncome' from '$5000' to '5000'\nUser previously corrected: ..."
 */
export function buildFeedbackContext(feedback: ValidationFeedback[]): string {
  if (feedback.length === 0) return '';
  return (
    feedback
      .map(
        (f) =>
          `User previously corrected: '${f.fieldName}' from '${String(f.originalValue)}' to '${String(f.userCorrectedTo)}'`,
      )
      .join('\n') + '\n'
  );
}
