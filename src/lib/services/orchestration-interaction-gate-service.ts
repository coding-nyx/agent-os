import type {
  AutopilotLevel,
  InteractionCandidate,
  InteractionDecision,
  InteractionKind,
} from '@/lib/contracts/orchestration';

const DEFAULT_CONFIDENCE_BY_KIND: Record<InteractionKind, number> = {
  routing: 0.62,
  planning: 0.72,
  routine: 0.72,
};

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function resolveMode(kind: InteractionKind): InteractionDecision['mode'] {
  return kind === 'routing' ? 'silent_delegate' : 'silent_execute';
}

function buildDecision(
  candidate: InteractionCandidate,
  confidence: number,
  mode: InteractionDecision['mode'],
  reason: InteractionDecision['reason'],
  historyMode: InteractionDecision['historyMode'],
): InteractionDecision {
  const isVisible = mode === 'visible_proposal';
  return {
    kind: candidate.kind,
    mode,
    reason,
    confidence,
    historyMode,
    shouldPersistDraft: isVisible,
    shouldNotifyUser: isVisible || historyMode === 'standard',
    shouldRenderHudSignal: isVisible,
  };
}

export interface OrchestrationInteractionGateInput {
  autopilotLevel: AutopilotLevel;
  candidate: InteractionCandidate;
}

export class OrchestrationInteractionGateService {
  static getDefaultConfidence(kind: InteractionKind): number {
    return DEFAULT_CONFIDENCE_BY_KIND[kind];
  }

  static evaluate(input: OrchestrationInteractionGateInput): InteractionDecision {
    const confidence = clampConfidence(
      input.candidate.confidence ?? DEFAULT_CONFIDENCE_BY_KIND[input.candidate.kind],
    );

    if (input.candidate.requiresApproval) {
      return buildDecision(input.candidate, confidence, 'visible_proposal', 'explicit_gate', 'standard');
    }

    if (input.candidate.hasConflict) {
      return buildDecision(input.candidate, confidence, 'visible_proposal', 'conflict', 'standard');
    }

    if (input.candidate.highRisk) {
      return buildDecision(input.candidate, confidence, 'visible_proposal', 'high_risk', 'standard');
    }

    if (input.autopilotLevel <= 2) {
      return buildDecision(input.candidate, confidence, 'visible_proposal', 'manual_level', 'standard');
    }

    if (input.candidate.canAutoDispatch === false) {
      return buildDecision(input.candidate, confidence, 'visible_proposal', 'silent_unavailable', 'standard');
    }

    if (input.autopilotLevel === 3 && confidence < 0.85) {
      return buildDecision(input.candidate, confidence, 'visible_proposal', 'low_confidence', 'standard');
    }

    if (input.autopilotLevel === 4 && confidence < 0.7) {
      return buildDecision(input.candidate, confidence, 'visible_proposal', 'low_confidence', 'standard');
    }

    const historyMode = input.autopilotLevel >= 5 ? 'silent' : 'standard';
    const mode = resolveMode(input.candidate.kind);
    const reason =
      input.autopilotLevel >= 5
        ? 'ghost_mode'
        : input.candidate.kind === 'routing'
          ? 'auto_routing'
          : 'auto_execution';

    return buildDecision(input.candidate, confidence, mode, reason, historyMode);
  }
}
