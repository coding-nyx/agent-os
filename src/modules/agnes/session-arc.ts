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

// ─── Bridge functions ─────────────────────────────────────────────────────────

export function computeSessionProgress(
  exchangeCount: number,
  sessionStartedAt: number,
  mode: AgnesEngagementMode,
): SessionProgressState {
  return JSON.parse(
    _service.computeSessionProgressJson(exchangeCount, sessionStartedAt, mode, Date.now()),
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
