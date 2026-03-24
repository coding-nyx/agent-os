import type {
  ActionOrchestrationMetadata,
  SilentHistoryEntry,
} from '@/lib/contracts/orchestration';
import type { NexusDataLayer, NexusRecord } from '@/lib/data-layer';
import { getNexusDataLayer } from '@/lib/data-layer/provider';

export const SILENT_HISTORY_SUBCOLLECTION = 'orchestration_silent_history';
export const DEFAULT_SILENT_HISTORY_RETENTION_LIMIT = 200;

function sortSilentHistoryEntries<T extends { id: string; timestamp: string }>(entries: T[]): T[] {
  return [...entries].sort((left, right) => {
    const timestampDelta = right.timestamp.localeCompare(left.timestamp);
    if (timestampDelta !== 0) return timestampDelta;
    return right.id.localeCompare(left.id);
  });
}

export class OrchestrationHistoryService {
  static generateAutonomyExplanation(
    metadata: Pick<
      ActionOrchestrationMetadata,
      'autopilotLevel' | 'executionMode' | 'approvalRequirement' | 'dispatchStatus' | 'runtime'
    >,
  ): string {
    const executionLabel =
      metadata.executionMode === 'ghost'
        ? 'Ghost Mode'
        : metadata.executionMode === 'autonomous'
          ? 'Autonomous Mode'
          : metadata.executionMode === 'assisted'
            ? 'Assisted Mode'
            : metadata.executionMode === 'analysis_only'
              ? 'Analysis-only Mode'
              : 'Manual Mode';
    const dispositionLabel = metadata.runtime.historyDestination === 'silent_audit'
      ? 'routed to the silent audit log'
      : metadata.runtime.historyDestination === 'standard'
        ? 'written to standard history'
        : 'kept out of durable history';
    const notificationLabel = metadata.runtime.shouldNotifyUser
      ? 'A user-facing notification remained enabled.'
      : 'No user-facing notification was sent.';
    const approvalLabel = metadata.approvalRequirement.required
      ? `Approval remained required because ${metadata.approvalRequirement.reason.replace(/_/g, ' ')}.`
      : 'No additional approval gate was required.';

    return `Executed with ${executionLabel} at Autopilot L${metadata.autopilotLevel}; outcome ${dispositionLabel}. Dispatch status was ${metadata.dispatchStatus.replace(/_/g, ' ')}. ${approvalLabel} ${notificationLabel}`;
  }

  static getSilentHistoryCollectionPath(uid: string): string {
    return `users/${uid}/${SILENT_HISTORY_SUBCOLLECTION}`;
  }

  static shouldRouteToSilentHistory(
    metadata: Pick<ActionOrchestrationMetadata, 'historyMode' | 'execution' | 'runtime'>,
  ): boolean {
    return (
      metadata.historyMode === 'silent' &&
      metadata.execution.status === 'executed' &&
      metadata.runtime.historyDestination === 'silent_audit'
    );
  }

  static getAssistantMessageChannel(
    metadata: Pick<ActionOrchestrationMetadata, 'historyMode' | 'execution' | 'runtime'>,
  ): 'visible' | 'silent_history' {
    return this.shouldRouteToSilentHistory(metadata) ? 'silent_history' : 'visible';
  }

  static buildSilentHistoryEntry(input: {
    moduleId: string;
    metadata: ActionOrchestrationMetadata;
    suppressedMessages?: string[];
  }): SilentHistoryEntry | null {
    const { metadata } = input;
    if (metadata.patientScope === 'GUEST' || !this.shouldRouteToSilentHistory(metadata)) {
      return null;
    }

    const suppressedMessages = (input.suppressedMessages ?? [])
      .map((message) => message.trim())
      .filter(Boolean);

    return {
      id: `silent.${metadata.execution.id}`,
      executionId: metadata.execution.id,
      proposalId: metadata.proposal.id,
      summary: suppressedMessages[0] ?? `${metadata.proposalCard.title} executed in Ghost mode.`,
      source: metadata.execution.source,
      timestamp: metadata.execution.executedAt,
      patientScope: metadata.patientScope,
      metadata: {
        moduleId: input.moduleId,
        actionType: metadata.actionType,
        activeThreadId: metadata.activeThreadId,
        autopilotLevel: metadata.autopilotLevel,
        executionMode: metadata.executionMode,
        historyMode: metadata.historyMode,
        dispatchStatus: metadata.dispatchStatus,
        highRisk: metadata.highRisk,
        runtimeAutonomy: metadata.runtime.autonomy,
        runtimeDisposition: metadata.runtime.disposition,
        historyDestination: metadata.runtime.historyDestination,
        willPersistHistory: metadata.runtime.willPersistHistory,
        shouldNotifyUser: metadata.runtime.shouldNotifyUser,
        autonomyExplanation: this.generateAutonomyExplanation(metadata),
        hiddenMessages: suppressedMessages,
      },
    };
  }

  static async persistSilentHistory(
    uid: string,
    entries: SilentHistoryEntry[],
    options?: {
      retentionLimit?: number;
      dataLayer?: NexusDataLayer;
    },
  ): Promise<void> {
    const filteredEntries = entries.filter((entry) => entry.patientScope !== 'GUEST');
    if (!uid || filteredEntries.length === 0) return;

    const dataLayer = options?.dataLayer ?? getNexusDataLayer();
    await dataLayer.batchWrite(
      filteredEntries.map((entry) => ({
        type: 'set' as const,
        collection: this.getSilentHistoryCollectionPath(uid),
        id: entry.id,
        data: entry,
      })),
    );

    await this.pruneSilentHistory(uid, {
      retentionLimit: options?.retentionLimit,
      dataLayer,
    });
  }

  static async listSilentHistory(
    uid: string,
    options?: {
      limit?: number;
      dataLayer?: NexusDataLayer;
    },
  ): Promise<Array<NexusRecord<SilentHistoryEntry>>> {
    if (!uid) return [];

    const dataLayer = options?.dataLayer ?? getNexusDataLayer();
    const docs = await dataLayer.listDocuments<SilentHistoryEntry>(this.getSilentHistoryCollectionPath(uid));
    const sorted = sortSilentHistoryEntries(docs);
    return typeof options?.limit === 'number' ? sorted.slice(0, options.limit) : sorted;
  }

  static async listSilentHistoryForThread(
    uid: string,
    threadId: string,
    options?: {
      limit?: number;
      dataLayer?: NexusDataLayer;
    },
  ): Promise<Array<NexusRecord<SilentHistoryEntry>>> {
    if (!uid || !threadId) return [];

    const docs = await this.listSilentHistory(uid, {
      limit: options?.limit ? Math.max(options.limit * 3, options.limit) : undefined,
      dataLayer: options?.dataLayer,
    });

    const threadScoped = docs.filter((doc) => {
      const activeThreadId = doc.metadata?.activeThreadId;
      return typeof activeThreadId === 'string' && activeThreadId === threadId;
    });

    return typeof options?.limit === 'number' ? threadScoped.slice(0, options.limit) : threadScoped;
  }

  static async pruneSilentHistory(
    uid: string,
    options?: {
      retentionLimit?: number;
      dataLayer?: NexusDataLayer;
    },
  ): Promise<void> {
    if (!uid) return;

    const dataLayer = options?.dataLayer ?? getNexusDataLayer();
    const retentionLimit = options?.retentionLimit ?? DEFAULT_SILENT_HISTORY_RETENTION_LIMIT;
    if (retentionLimit <= 0) return;

    const docs = await this.listSilentHistory(uid, { dataLayer });
    if (docs.length <= retentionLimit) return;

    const staleDocs = docs.slice(retentionLimit);
    await dataLayer.batchWrite(
      staleDocs.map((doc) => ({
        type: 'delete' as const,
        collection: this.getSilentHistoryCollectionPath(uid),
        id: doc.id,
      })),
    );
  }
}
