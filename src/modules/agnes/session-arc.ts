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
export const SESSION_EXCHANGE_TARGETS: Record<AgnesEngagementMode, number> = {
  impromptu: 7,
  casual: 14,
  somatic: 17,
  deep: 24,
};

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
