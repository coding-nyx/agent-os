import type {
  OrchestrationTurnRuntimeSummary,
  SilentHistoryEntry,
} from '@/lib/contracts/orchestration';
import type { PersistedExecutionFailureRecord } from '@/lib/services/orchestration-persistence-service';
import { OrchestrationCommandCenterServiceJs } from '@cortex-logic';
import { safeParseKmp } from '@/cortex-bridge/kmp-parse';

const _service = new OrchestrationCommandCenterServiceJs();

export type CommandCenterQueueKind = 'approval' | 'incident' | 'debt' | 'audit';
export type CommandCenterTone = 'amber' | 'rose' | 'cyan' | 'violet';

export interface CommandCenterQueueItem {
  id: string;
  kind: CommandCenterQueueKind;
  tone: CommandCenterTone;
  title: string;
  summary: string;
  source: string;
  timestamp: string | null;
  emphasis?: string | null;
}

export interface CommandCenterQueueSnapshot {
  count: number;
  items: CommandCenterQueueItem[];
}

export interface CommandCenterSnapshot {
  attentionCount: number;
  approvals: CommandCenterQueueSnapshot;
  incidents: CommandCenterQueueSnapshot;
  debt: CommandCenterQueueSnapshot;
  audit: CommandCenterQueueSnapshot;
}

export class OrchestrationCommandCenterService {
  static buildSnapshot(input: {
    runtimeSummary?: OrchestrationTurnRuntimeSummary | null;
    silentHistoryEntries?: SilentHistoryEntry[];
    failures?: PersistedExecutionFailureRecord[];
    queueLimit?: number;
  }): CommandCenterSnapshot {
    const actionsJson = JSON.stringify(input.runtimeSummary?.actions ?? []);
    const failuresJson = JSON.stringify(input.failures ?? []);
    const silentHistoryJson = JSON.stringify(input.silentHistoryEntries ?? []);
    const queueLimit = input.queueLimit ?? 8;

    const EMPTY_SNAPSHOT: CommandCenterSnapshot = {
      attentionCount: 0,
      approvals: { count: 0, items: [] },
      incidents: { count: 0, items: [] },
      debt: { count: 0, items: [] },
      audit: { count: 0, items: [] },
    };
    return safeParseKmp(
      _service.buildSnapshot(actionsJson, failuresJson, silentHistoryJson, queueLimit),
      EMPTY_SNAPSHOT,
      'CommandCenter.buildSnapshot',
    );
  }
}
