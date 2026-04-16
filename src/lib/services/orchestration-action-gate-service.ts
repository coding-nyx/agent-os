import type {
  ActionOrchestrationMetadata,
  HistoryMode,
} from '@/lib/contracts/orchestration';
import { OrchestrationActionGateServiceJs } from '@cortex-logic';
import { safeParseKmp } from '@/cortex-bridge/kmp-parse';

const _service = new OrchestrationActionGateServiceJs();

type PersistencePolicy = 'auto' | 'scout-research' | 'atlas-planning' | 'ledger-financial' | 'manual' | 'ephemeral';

export interface OrchestrationActionGateInput {
  moduleId: string;
  actionType: string;
  payload: Record<string, unknown>;
  autopilotLevel: 0 | 1 | 2 | 3 | 4 | 5;
  historyMode: HistoryMode;
  isGuest: boolean;
  activeThreadId?: string | null;
  persistencePolicy?: PersistencePolicy;
  /**
   * True when the calling module is inside an active user-facing session (e.g. a live Agnes
   * therapy session). KMP honors this by bypassing the autopilot-level approval gate for the
   * module's own non-high-risk mutations. Explicit per-action gates and high-risk inferences
   * still apply. Defaults to false.
   */
  moduleSessionActive?: boolean;
  now?: string;
}

export interface OrchestrationActionGateDecision {
  shouldDispatch: boolean;
  metadata: ActionOrchestrationMetadata;
}

const BLOCKED_DECISION: OrchestrationActionGateDecision = {
  shouldDispatch: false,
  metadata: {
    actionType: '',
    autopilotLevel: 0 as const,
    highRisk: true,
    executionMode: 'autonomous',
    historyMode: 'standard',
    mutatesState: false,
    patientScope: 'USER',
    dispatchStatus: 'blocked',
    approvalRequirement: { required: true, reason: 'kmp_parse_error' },
    runtime: { disposition: 'standard', noticePrefix: 'KMP evaluation failed', summary: '' },
    proposal: { id: '', createdAt: new Date().toISOString() },
    proposalCard: { title: '', summary: '' },
    execution: { id: '', source: 'ara', status: 'failed', executedAt: new Date().toISOString() },
    activeThreadId: null,
    failure: null,
  } as unknown as ActionOrchestrationMetadata,
};

export class OrchestrationActionGateService {
  static evaluate(input: OrchestrationActionGateInput): OrchestrationActionGateDecision {
    return safeParseKmp(
      _service.evaluate(JSON.stringify(input), input.actionType),
      BLOCKED_DECISION,
      'ActionGate.evaluate',
    );
  }
}
