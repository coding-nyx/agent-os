/**
 * Interaction gate — thin bridge over cortex-logic's InteractionGateJs.
 *
 * The decision logic lives in KMP commonMain (InteractionGate.kt) so both
 * Agnes and nexus-android apply identical autopilot enforcement rules.
 * Public API is unchanged from the caller's perspective.
 */

import type {
  AutopilotLevel,
  InteractionCandidate,
  InteractionDecision,
  InteractionKind,
} from '@/lib/contracts/orchestration';
import { InteractionGateJs } from '@cortex-logic';

const gate = new InteractionGateJs();

export interface OrchestrationInteractionGateInput {
  autopilotLevel: AutopilotLevel;
  candidate: InteractionCandidate;
}

export class OrchestrationInteractionGateService {
  static getDefaultConfidence(kind: InteractionKind): number {
    const defaults: Record<InteractionKind, number> = {
      routing: 0.62,
      planning: 0.72,
      routine: 0.72,
    };
    return defaults[kind];
  }

  static evaluate(input: OrchestrationInteractionGateInput): InteractionDecision {
    const { candidate, autopilotLevel } = input;
    const result = gate.evaluate(
      autopilotLevel,
      candidate.kind,
      candidate.sourceModuleId,
      candidate.confidence ?? -1,
      candidate.requiresApproval ?? false,
      candidate.highRisk ?? false,
      candidate.hasConflict ?? false,
      candidate.canAutoDispatch ?? true,
    );
    return {
      kind: result.kind as InteractionKind,
      mode: result.mode as InteractionDecision['mode'],
      reason: result.reason as InteractionDecision['reason'],
      confidence: result.confidence,
      historyMode: result.historyMode as InteractionDecision['historyMode'],
      shouldPersistDraft: result.shouldPersistDraft,
      shouldNotifyUser: result.shouldNotifyUser,
      shouldRenderHudSignal: result.shouldRenderHudSignal,
    };
  }
}
