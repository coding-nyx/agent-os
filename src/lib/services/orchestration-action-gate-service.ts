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
  now?: string;
}

export interface OrchestrationActionGateDecision {
  shouldDispatch: boolean;
  metadata: ActionOrchestrationMetadata;
}

const BLOCKED_DECISION: OrchestrationActionGateDecision = {
  shouldDispatch: false,
  metadata: {
    executionMode: 'autonomous',
    historyMode: 'standard',
    mutatesState: false,
    patientScope: 'USER',
    dispatchStatus: 'blocked',
    approvalRequirement: { required: true, reason: 'kmp_parse_error' },
    runtime: { disposition: 'standard', noticePrefix: 'KMP evaluation failed', summary: '' },
    proposal: { id: '', createdAt: new Date().toISOString() },
    proposalCard: { title: '', summary: '' },
    execution: { id: '', source: 'nexus', status: 'failed', executedAt: new Date().toISOString() },
    activeThreadId: null,
    failure: null,
  } as ActionOrchestrationMetadata,
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
