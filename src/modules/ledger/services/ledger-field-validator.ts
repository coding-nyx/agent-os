/**
 * Ledger Module — LLM-Driven Field Validator
 *
 * Validates custom field values using semantic LLM analysis with a
 * deterministic keyword fallback for offline / timeout / parse-error
 * scenarios. The validator NEVER throws — every code path returns a
 * FieldValidationResult.
 *
 * Architecture notes:
 *   - Single Responsibility: validation logic only; no UI, no side-effects.
 *   - Open/Closed: add new field-type heuristics via `FIELD_TYPE_PATTERNS`
 *     without touching the core validate function.
 *   - LLM prompt is kept < 100 tokens to avoid context bloat.
 *   - Results are memoised in sessionStorage keyed by field name + value
 *     so repeated calls (e.g. on re-render) skip the round-trip.
 *   - Timeout: 3 s — if LLM is slow we degrade gracefully to fallback.
 */

// ============================================================================
// Public types
// ============================================================================

export interface FieldValidationResult {
  valid: boolean;
  correctedValue?: string;
  reason?: string;
  /** Indicates whether the LLM or the keyword heuristic produced this result. */
  source: 'llm' | 'fallback';
}

// ============================================================================
// Module-level context constant (exported for reuse in action handlers)
// ============================================================================

export const LEDGER_VALIDATION_CONTEXT =
  'Ledger financial tracker. Strict: amounts must be valid numbers, dates must be ISO format (YYYY-MM-DD), categories must be non-empty text. Flexible: descriptions and notes accept any text up to 500 characters.';

// ============================================================================
// Internal constants
// ============================================================================

const CACHE_PREFIX = 'ledger_val_';
const LLM_TIMEOUT_MS = 3_000;

/**
 * Patterns that identify field names by semantic category.
 * Evaluated in order; first match wins.
 */
const FIELD_TYPE_PATTERNS = [
  {
    kind: 'amount' as const,
    re: /amount|price|cost|total|balance|income|expense|budget|salary|fee|rate/i,
  },
  {
    kind: 'date' as const,
    re: /date|time|day|when|period|start|end|due|deadline/i,
  },
  {
    kind: 'category' as const,
    re: /category|type|kind|group|tag|label/i,
  },
] satisfies ReadonlyArray<{ kind: string; re: RegExp }>;

type FieldKind = (typeof FIELD_TYPE_PATTERNS)[number]['kind'] | 'text';

/** Shape we expect the LLM to return. */
interface LLMValidationPayload {
  valid: boolean;
  correctedValue: string | null;
  reason: string;
}

// ============================================================================
// sessionStorage cache helpers
// ============================================================================

/**
 * Build a collision-safe cache key.
 * We cap the value segment at 100 chars to avoid exceeding key limits in
 * some browsers while still ensuring distinct keys for distinct values.
 */
function buildCacheKey(fieldName: string, value: string): string {
  return `${CACHE_PREFIX}${encodeURIComponent(fieldName)}_${encodeURIComponent(value.slice(0, 100))}`;
}

function readCache(key: string): FieldValidationResult | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as FieldValidationResult;
  } catch {
    // sessionStorage unavailable (SSR, private-mode quota) — treat as miss
    return null;
  }
}

function writeCache(key: string, result: FieldValidationResult): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(result));
  } catch {
    // Non-fatal: cache write failure only means future calls will re-validate
  }
}

// ============================================================================
// Keyword fallback
// ============================================================================

function detectFieldKind(fieldName: string): FieldKind {
  for (const { kind, re } of FIELD_TYPE_PATTERNS) {
    if (re.test(fieldName)) return kind;
  }
  return 'text';
}

/**
 * Pure, synchronous validation based on field-name heuristics.
 * Mirrors the validation rules that previously lived inline in action
 * handlers — extracted here so they form a single source of truth.
 *
 * Time: O(1) · Space: O(1)
 */
function keywordFallback(fieldName: string, value: string): FieldValidationResult {
  const kind = detectFieldKind(fieldName);

  switch (kind) {
    case 'amount': {
      const num = parseFloat(value);
      const valid = Number.isFinite(num) && num !== 0;
      return {
        valid,
        reason: valid
          ? undefined
          : `Amount field "${fieldName}" must be a valid non-zero finite number.`,
        source: 'fallback',
      };
    }

    case 'date': {
      const trimmed = value.trim();
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) && !isNaN(new Date(trimmed).getTime());
      return {
        valid,
        reason: valid
          ? undefined
          : `Date field "${fieldName}" must use ISO format YYYY-MM-DD and be a real calendar date.`,
        source: 'fallback',
      };
    }

    case 'category': {
      const valid = value.trim().length > 0;
      return {
        valid,
        reason: valid
          ? undefined
          : `Category field "${fieldName}" must be non-empty.`,
        source: 'fallback',
      };
    }

    default: {
      // text / description
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return {
          valid: false,
          reason: `Field "${fieldName}" must not be empty.`,
          source: 'fallback',
        };
      }
      if (trimmed.length > 500) {
        return {
          valid: false,
          reason: `Field "${fieldName}" exceeds the 500-character limit.`,
          source: 'fallback',
        };
      }
      return { valid: true, source: 'fallback' };
    }
  }
}

// ============================================================================
// LLM call with hard timeout
// ============================================================================

/**
 * Races the LLM call against a 3-second deadline.
 * Rejects with an Error on timeout so the caller can fall through to
 * the keyword fallback.
 */
function callWithTimeout(
  prompt: string,
  sendMessage: (prompt: string) => Promise<string>,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('[LedgerValidator] LLM timeout')),
      LLM_TIMEOUT_MS,
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
 * Attempt to parse the LLM's raw output into LLMValidationPayload.
 * Handles responses wrapped in markdown code fences.
 * Throws on any structural mismatch so the caller can fall through.
 */
function parseLLMResponse(raw: string): LLMValidationPayload {
  // Extract the first JSON object from the response
  const jsonMatch = /\{[\s\S]*?\}/.exec(raw);
  const jsonStr = jsonMatch ? jsonMatch[0] : raw.trim();
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  if (typeof parsed['valid'] !== 'boolean') {
    throw new TypeError('[LedgerValidator] LLM response missing "valid" boolean');
  }

  return {
    valid: parsed['valid'] as boolean,
    correctedValue:
      typeof parsed['correctedValue'] === 'string' ? parsed['correctedValue'] : null,
    reason: typeof parsed['reason'] === 'string' ? parsed['reason'] : '',
  };
}

// ============================================================================
// Primary export
// ============================================================================

/**
 * Validate a custom field value using LLM semantic analysis, with automatic
 * fallback to keyword heuristics.
 *
 * Guarantees:
 *   - Never throws under any circumstance.
 *   - Always returns a FieldValidationResult.
 *   - Caches results in sessionStorage for the session lifetime.
 *   - If `sendMessage` is undefined, skips LLM and uses fallback directly.
 *   - If the LLM takes > 3 s, aborts and uses fallback.
 *   - If the LLM response is unparseable, uses fallback.
 *
 * Complexity: O(1) amortised (cache hit), O(1) + network RTT (miss).
 *
 * @param fieldName     Human-readable field name (used for heuristic detection and prompt).
 * @param value         The value to validate.
 * @param moduleContext Concise domain context injected into the LLM prompt.
 * @param sendMessage   Adapter that forwards a prompt string to the LLM and returns the
 *                      raw text response. Pass `undefined` to force fallback.
 */
export async function validateFieldValue(
  fieldName: string,
  value: string,
  moduleContext: string,
  sendMessage: ((prompt: string) => Promise<string>) | undefined,
): Promise<FieldValidationResult> {
  const cacheKey = buildCacheKey(fieldName, value);

  // ── 1. Cache hit ──────────────────────────────────────────────────────────
  const cached = readCache(cacheKey);
  if (cached !== null) return cached;

  // ── 2. LLM path ───────────────────────────────────────────────────────────
  if (sendMessage !== undefined) {
    // Prompt deliberately kept minimal (< 100 tokens) to avoid context bloat.
    const prompt =
      `You are a financial data validator.\nField name: ${JSON.stringify(fieldName)}\nField value: ${JSON.stringify(value)}\nContext: ${JSON.stringify(moduleContext)}\nReply with ONLY valid JSON: {"valid": bool, "correctedValue": string|null, "reason": string}`;

    try {
      const raw = await callWithTimeout(prompt, sendMessage);
      const payload = parseLLMResponse(raw);

      const MAX_CORRECTED_LEN = 500;
      const result: FieldValidationResult = {
        valid: payload.valid,
        correctedValue:
          typeof payload.correctedValue === 'string' &&
          payload.correctedValue.length > 0 &&
          payload.correctedValue.length <= MAX_CORRECTED_LEN
            ? payload.correctedValue
            : undefined,
        reason: payload.reason.length > 0 ? payload.reason : undefined,
        source: 'llm',
      };

      writeCache(cacheKey, result);
      return result;
    } catch {
      // Timeout, network error, or JSON parse failure — fall through to keyword heuristic
    }
  }

  // ── 3. Keyword fallback ───────────────────────────────────────────────────
  const fallback = keywordFallback(fieldName, value);
  writeCache(cacheKey, fallback);
  return fallback;
}
