import type { AgnesEngagementMode } from './engagement-modes';

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

export const SESSION_EXCHANGE_TARGETS: Record<AgnesEngagementMode, number> = {
  impromptu: 7,
  casual: 14,
  somatic: 17,
  deep: 24,
};

export function computeSessionProgress(
  exchangeCount: number,
  sessionStartedAt: number,
  mode: AgnesEngagementMode,
): SessionProgressState {
  const target = SESSION_EXCHANGE_TARGETS[mode];
  const progressFraction = Math.min(1, exchangeCount / target);
  const isInFinalThird = progressFraction >= 2 / 3;
  const isOverTarget = exchangeCount >= target;

  let suggestedPhase: AgnesSessionPhase;
  if (progressFraction < 0.25) suggestedPhase = 'OPENING';
  else if (progressFraction < 0.65) suggestedPhase = 'DEEPENING';
  else if (progressFraction < 0.85) suggestedPhase = 'INTEGRATION';
  else suggestedPhase = 'CLOSING';

  return {
    exchangeCount,
    elapsedMs: Date.now() - sessionStartedAt,
    targetExchanges: target,
    progressFraction,
    suggestedPhase,
    isInFinalThird,
    isOverTarget,
  };
}

export function buildSessionProgressBlock(
  progress: SessionProgressState,
  mode: AgnesEngagementMode,
): string | null {
  if (progress.exchangeCount === 0) return null;

  const { exchangeCount, targetExchanges, suggestedPhase, isInFinalThird, isOverTarget } = progress;
  const remaining = Math.max(0, targetExchanges - exchangeCount);

  const urgencyLine = isOverTarget
    ? `The session has run past its natural length. Move decisively toward CLOSING if not already there. Do not open new threads.`
    : isInFinalThird
    ? `The session is in its final third (~${remaining} exchanges remain before the natural close). Begin moving toward INTEGRATION or CLOSING — do not open new threads. Resource activation and synthesis are now the priority.`
    : null;

  return [
    `SESSION PROGRESS:`,
    `Mode: ${mode} | Exchanges: ${exchangeCount} of ~${targetExchanges} | Phase guidance: ${suggestedPhase}`,
    urgencyLine,
    `Clinical arc reminder: OPENING (ground, orient) → DEEPENING (follow thread, titrate) → INTEGRATION (meaning-making, summary) → CLOSING (resource activation, continuity planning, safe exit).`,
    `Your Phase field in <thought> should reflect where you actually are. Clinical judgment takes precedence — but be aware of where the session is heading.`,
  ].filter(Boolean).join('\n');
}
