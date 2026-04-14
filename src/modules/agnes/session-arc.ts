import { SessionArcJs } from '@cortex-logic';
import type { AgnesEngagementMode } from './engagement-modes';

const _service = new SessionArcJs();

// ─── Public types ─────────────────────────────────────────────────────────────

export type AgnesSessionPhase = 'OPENING' | 'DEEPENING' | 'INTEGRATION' | 'CLOSING';

export interface SessionProgressState {
  exchangeCount: number;
  elapsedMs: number;
  targetExchanges: number;
  progressFraction: number;
  suggestedPhase: AgnesSessionPhase;
  isInFinalThird: boolean;
  isOverTarget: boolean;
}

// Kept as a static constant so callers that reference it directly continue to
// compile without a network/KMP call. The KMP implementation must agree with
// these values — they are part of the public API contract.
//
// Validated at module-load time (DEV only) against the live KMP service to catch
// drift early. If KMP returns different values the console will warn with a diff.
export const SESSION_EXCHANGE_TARGETS: Record<AgnesEngagementMode, number> = {
  impromptu: 7,
  casual: 14,
  somatic: 17,
  deep: 24,
};

if (import.meta.env.DEV) {
  try {
    const modes = Object.keys(SESSION_EXCHANGE_TARGETS) as AgnesEngagementMode[];
    for (const mode of modes) {
      const kmpValue = _service.getSessionExchangeTarget(mode) as number;
      if (kmpValue !== SESSION_EXCHANGE_TARGETS[mode]) {
        console.warn(
          `[SessionArc] SESSION_EXCHANGE_TARGETS drift detected for "${mode}": ` +
          `TS has ${SESSION_EXCHANGE_TARGETS[mode]}, KMP returns ${kmpValue}. Update the TS constant.`
        );
      }
    }
  } catch (e) {
    // SessionArcJs unavailable (e.g. unit tests with mocked cortex-logic) — skip validation.
  }
}

// ─── Bridge functions ─────────────────────────────────────────────────────────

export function computeSessionProgress(
  exchangeCount: number,
  sessionStartedAt: number,
  mode: AgnesEngagementMode,
): SessionProgressState {
  return JSON.parse(
    _service.computeSessionProgressJson(exchangeCount, sessionStartedAt, mode),
  ) as SessionProgressState;
}

export function buildSessionProgressBlock(
  progress: SessionProgressState,
  mode: AgnesEngagementMode,
): string | null {
  const result = _service.buildSessionProgressBlock(JSON.stringify(progress), mode);
  return result === '' || result === 'null' ? null : result;
}

export function getSessionExchangeTarget(mode: AgnesEngagementMode): number {
  return _service.getSessionExchangeTarget(mode) as number;
}
