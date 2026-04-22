/**
 * AI error classifier.
 *
 * Buckets errors raised by the module AI streaming pipeline so that the
 * notification layer can distinguish **transient** failures (network blips,
 * upstream 5xx, mid-stream parse errors, aborted requests) from **actionable**
 * failures that the user genuinely needs to be told about (invalid API key,
 * quota exhausted, provider blocked the request). Only actionable and fatal
 * errors should reach the user's inbox as AI_LINK_FAILURE events; transient
 * failures are shown inline in the UI only.
 */
import { isOpenRouterAuthError } from '@/lib/services/openrouter-key';

export type AiErrorKind = 'transient' | 'user_actionable' | 'fatal';

export interface ClassifiedAiError {
  kind: AiErrorKind;
  retryable: boolean;
  /** Short message suitable for inline UI display. */
  userMessage: string;
  /** Raw error message for logging. */
  rawMessage: string;
}

/** Matches HTTP status codes typically embedded in thrown error messages. */
function extractStatus(message: string): number | null {
  const match = message.match(/\b(\d{3})\b/);
  if (!match) return null;
  const code = Number(match[1]);
  return Number.isFinite(code) ? code : null;
}

const TRANSIENT_PATTERNS: RegExp[] = [
  /network\s*(error|request\s+failed)/i,
  /failed\s+to\s+fetch/i,
  /fetch\s+failed/i,
  /load\s+failed/i,
  /econn(reset|refused|aborted)/i,
  /etimedout|timeout|timed\s*out/i,
  /socket\s+hang\s+up/i,
  /stream\s+(closed|ended)\s+unexpectedly/i,
  /unexpected\s+end\s+of\s+(json|input|stream)/i,
  /json\s+parse/i,
  /rate.?limit(ed)?/i,
  /temporarily\s+unavailable/i,
  /service\s+unavailable/i,
  /bad\s+gateway/i,
  /gateway\s+timeout/i,
];

const USER_ACTIONABLE_PATTERNS: RegExp[] = [
  /quota/i,
  /insufficient\s+(credit|balance|quota)/i,
  /payment\s+required/i,
  /forbidden/i,
  /provider\s+(blocked|refused)/i,
  /content\s+(policy|filter|moderation)/i,
];

/**
 * Classify an error from the streaming AI pipeline.
 *
 * Auth errors (OpenRouter key invalid/missing) are user-actionable — the user
 * needs to update their key. HTTP 5xx and 408/429 are transient. Aborts are
 * not passed to this classifier by the caller (they short-circuit earlier),
 * but are treated as transient for safety.
 */
export function classifyAiError(error: unknown): ClassifiedAiError {
  const rawMessage = error instanceof Error ? error.message : String(error ?? '');
  const name = error instanceof Error ? error.name : '';

  if (name === 'AbortError') {
    return {
      kind: 'transient',
      retryable: true,
      userMessage: 'The AI request was interrupted.',
      rawMessage,
    };
  }

  if (isOpenRouterAuthError(rawMessage)) {
    return {
      kind: 'user_actionable',
      retryable: false,
      userMessage: 'Your AI provider API key is missing or invalid. Update it in Settings to continue.',
      rawMessage,
    };
  }

  for (const pattern of USER_ACTIONABLE_PATTERNS) {
    if (pattern.test(rawMessage)) {
      return {
        kind: 'user_actionable',
        retryable: false,
        userMessage: 'The AI provider declined the request. Check your account status or try a different prompt.',
        rawMessage,
      };
    }
  }

  const status = extractStatus(rawMessage);
  if (status !== null) {
    if (status === 401 || status === 403) {
      return {
        kind: 'user_actionable',
        retryable: false,
        userMessage: 'The AI provider rejected your credentials. Update your API key in Settings.',
        rawMessage,
      };
    }
    if (status === 402) {
      return {
        kind: 'user_actionable',
        retryable: false,
        userMessage: 'Payment required by the AI provider. Check your account balance.',
        rawMessage,
      };
    }
    if (status === 408 || status === 429 || (status >= 500 && status <= 599)) {
      return {
        kind: 'transient',
        retryable: true,
        userMessage: 'The AI link hit a temporary error. Retrying…',
        rawMessage,
      };
    }
  }

  for (const pattern of TRANSIENT_PATTERNS) {
    if (pattern.test(rawMessage)) {
      return {
        kind: 'transient',
        retryable: true,
        userMessage: 'The AI link hit a temporary error. Retrying…',
        rawMessage,
      };
    }
  }

  // Unknown but real error — treat as fatal so the user is informed once,
  // instead of silently swallowed.
  return {
    kind: 'fatal',
    retryable: false,
    userMessage: 'The AI link failed. Please try again.',
    rawMessage,
  };
}

/**
 * Tracks consecutive transient failures per scope (e.g. moduleId) and
 * escalates to a single fatal emission when the threshold is crossed. This
 * keeps the user informed when the link is persistently broken without
 * spamming the inbox for every passing network blip.
 */
const DEFAULT_TRANSIENT_ESCALATION_THRESHOLD = 3;

export class ConsecutiveFailureTracker {
  private readonly counters = new Map<string, number>();

  constructor(private readonly threshold = DEFAULT_TRANSIENT_ESCALATION_THRESHOLD) {}

  /**
   * Call on every transient error for a given scope.
   * Returns `true` when the count has crossed the threshold and the caller
   * should emit a single user-visible "link persistently broken" signal.
   * Automatically resets after escalating so the next escalation requires
   * another run of consecutive failures.
   */
  recordTransient(scope: string): boolean {
    const next = (this.counters.get(scope) ?? 0) + 1;
    if (next >= this.threshold) {
      this.counters.set(scope, 0);
      return true;
    }
    this.counters.set(scope, next);
    return false;
  }

  /** Call whenever the same scope produces a success. */
  reset(scope: string): void {
    this.counters.delete(scope);
  }

  /** Current transient-failure count for a scope (for tests/diagnostics). */
  count(scope: string): number {
    return this.counters.get(scope) ?? 0;
  }
}
