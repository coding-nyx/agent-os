import type { AutopilotLevel, InteractionDecision, InteractionKind } from '@/lib/contracts/orchestration';
import { OrchestrationInteractionGateService } from './orchestration-interaction-gate-service';

interface InteractionAutomationInput {
  autopilotLevel: AutopilotLevel;
  kind: InteractionKind;
  confidence?: number | null;
  requiresApproval?: boolean;
  highRisk?: boolean;
  hasConflict?: boolean;
  canAutoDispatch?: boolean;
}

export class OrchestrationInteractionAutomationService {
  static evaluate(input: InteractionAutomationInput): InteractionDecision {
    return OrchestrationInteractionGateService.evaluate({
      autopilotLevel: input.autopilotLevel,
      candidate: {
        kind: input.kind,
        sourceModuleId: 'nexus',
        confidence: input.confidence,
        requiresApproval: input.requiresApproval,
        highRisk: input.highRisk,
        hasConflict: input.hasConflict,
        canAutoDispatch: input.canAutoDispatch,
      },
    });
  }

  static shouldAutoConfirm(input: InteractionAutomationInput): boolean {
    const decision = this.evaluate(input);
    return decision.mode === 'silent_execute' || decision.mode === 'silent_delegate';
  }
}
