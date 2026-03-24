import type {
  OrchestrationActionRuntimeEntry,
  OrchestrationTurnRuntimeSummary,
  SilentHistoryEntry,
} from '@/lib/contracts/orchestration';
import type { PersistedExecutionFailureRecord } from '@/lib/services/orchestration-persistence-service';

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

function formatFailureEmphasis(failure: PersistedExecutionFailureRecord): string {
  if (failure.status === 'retry_scheduled') {
    return `Retry ${failure.retryCount + 1}/${failure.maxRetries}`;
  }
  if (failure.status === 'escalated') {
    return failure.errorCode === 'PERMISSION' ? 'Permission incident' : 'Escalated';
  }
  return failure.errorCode.replace(/_/g, ' ');
}

function runtimeApprovalItems(actions: OrchestrationActionRuntimeEntry[]): CommandCenterQueueItem[] {
  return actions
    .filter((action) => action.dispatchStatus === 'awaiting_approval')
    .map((action) => ({
      id: `approval.${action.proposalId}`,
      kind: 'approval' as const,
      tone: 'amber' as const,
      title: action.label,
      summary: action.summary,
      source: action.source,
      timestamp: action.executedAt,
      emphasis: action.runtime.disposition === 'high_risk_review' ? 'High risk' : 'Awaiting approval',
    }));
}

function runtimeBlockedDebtItems(actions: OrchestrationActionRuntimeEntry[]): CommandCenterQueueItem[] {
  return actions
    .filter((action) =>
      action.dispatchStatus === 'blocked' &&
      action.executionStatus !== 'failed' &&
      action.executionStatus !== 'failed_escalated',
    )
    .map((action) => ({
      id: `debt.blocked.${action.proposalId}`,
      kind: 'debt' as const,
      tone: 'violet' as const,
      title: action.label,
      summary: action.summary,
      source: action.source,
      timestamp: action.executedAt,
      emphasis: 'Blocked by policy',
    }));
}

function failureItems(
  failures: PersistedExecutionFailureRecord[],
  status: 'escalated' | 'failed' | 'retry_scheduled',
): CommandCenterQueueItem[] {
  return failures
    .filter((failure) => failure.status === status)
    .map((failure) => ({
      id: `${status}.${failure.id}`,
      kind: status === 'retry_scheduled' ? 'debt' : 'incident',
      tone: status === 'retry_scheduled' ? 'violet' : 'rose',
      title: failure.actionType.replace(/_/g, ' '),
      summary: failure.errorMessage,
      source: failure.moduleId,
      timestamp: failure.nextRetryAt ?? failure.escalatedAt ?? failure.failedAt,
      emphasis: formatFailureEmphasis(failure),
    }));
}

function auditItems(entries: SilentHistoryEntry[]): CommandCenterQueueItem[] {
  return [...entries]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .map((entry) => ({
      id: `audit.${entry.id}`,
      kind: 'audit' as const,
      tone: 'cyan' as const,
      title: entry.summary,
      summary: Array.isArray(entry.metadata?.hiddenMessages)
        ? String(entry.metadata?.hiddenMessages?.[0] ?? entry.summary)
        : entry.summary,
      source: entry.source,
      timestamp: entry.timestamp,
      emphasis: 'Silent audit',
    }));
}

function sortItems(items: CommandCenterQueueItem[]): CommandCenterQueueItem[] {
  return [...items].sort((left, right) => {
    const leftTimestamp = left.timestamp ?? '';
    const rightTimestamp = right.timestamp ?? '';
    const timestampDelta = rightTimestamp.localeCompare(leftTimestamp);
    if (timestampDelta !== 0) return timestampDelta;
    return left.title.localeCompare(right.title);
  });
}

function takeQueue(items: CommandCenterQueueItem[], limit: number): CommandCenterQueueSnapshot {
  const ordered = sortItems(items);
  return {
    count: ordered.length,
    items: ordered.slice(0, limit),
  };
}

export class OrchestrationCommandCenterService {
  static buildSnapshot(input: {
    runtimeSummary?: OrchestrationTurnRuntimeSummary | null;
    silentHistoryEntries?: SilentHistoryEntry[];
    failures?: PersistedExecutionFailureRecord[];
    queueLimit?: number;
  }): CommandCenterSnapshot {
    const queueLimit = input.queueLimit ?? 3;
    const actions = input.runtimeSummary?.actions ?? [];
    const failures = (input.failures ?? []).filter((failure) => failure.status !== 'resolved');

    const approvals = takeQueue(runtimeApprovalItems(actions), queueLimit);
    const incidents = takeQueue(
      [
        ...failureItems(failures, 'escalated'),
        ...failureItems(failures, 'failed'),
      ],
      queueLimit,
    );
    const debt = takeQueue(
      [
        ...failureItems(failures, 'retry_scheduled'),
        ...runtimeBlockedDebtItems(actions),
      ],
      queueLimit,
    );
    const audit = takeQueue(auditItems(input.silentHistoryEntries ?? []), queueLimit);

    return {
      attentionCount: approvals.count + incidents.count + debt.count,
      approvals,
      incidents,
      debt,
      audit,
    };
  }
}
