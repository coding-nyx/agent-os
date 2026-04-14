import type {
  ActionOrchestrationMetadata,
  SilentHistoryEntry,
} from '@/lib/contracts/orchestration';
import type { NexusDataLayer, NexusRecord } from '@/lib/data-layer';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { OrchestrationHistoryUtilsJs } from '@cortex-logic';
import { safeParseKmp } from '@/cortex-bridge/kmp-parse';

const _utils = new OrchestrationHistoryUtilsJs();

export const SILENT_HISTORY_SUBCOLLECTION = 'orchestration_silent_history';
export const DEFAULT_SILENT_HISTORY_RETENTION_LIMIT = 200;

// ---------------------------------------------------------------------------
// Local helper — sort order is I/O-adjacent, stays in TS
// ---------------------------------------------------------------------------

function sortSilentHistoryEntries<T extends { id: string; timestamp: string }>(entries: T[]): T[] {
  return [...entries].sort((left, right) => {
    const timestampDelta = right.timestamp.localeCompare(left.timestamp);
    if (timestampDelta !== 0) return timestampDelta;
    return right.id.localeCompare(left.id);
  });
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class OrchestrationHistoryService {
  // -- Pure computation: delegated to KMP -----------------------------------

  static generateAutonomyExplanation(
    metadata: Pick<
      ActionOrchestrationMetadata,
      'autopilotLevel' | 'executionMode' | 'approvalRequirement' | 'dispatchStatus' | 'runtime'
    >,
  ): string {
    return _utils.generateAutonomyExplanation(JSON.stringify(metadata));
  }

  static shouldRouteToSilentHistory(
    metadata: Pick<ActionOrchestrationMetadata, 'historyMode' | 'execution' | 'runtime'>,
  ): boolean {
    return _utils.shouldRouteToSilentHistory(
      metadata.historyMode,
      metadata.execution.status,
      metadata.runtime.historyDestination,
    );
  }

  static getAssistantMessageChannel(
    metadata: Pick<ActionOrchestrationMetadata, 'historyMode' | 'execution' | 'runtime'>,
  ): 'visible' | 'silent_history' {
    return _utils.getAssistantMessageChannel(
      metadata.historyMode,
      metadata.execution.status,
      metadata.runtime.historyDestination,
    ) as 'visible' | 'silent_history';
  }

  static buildSilentHistoryEntry(input: {
    moduleId: string;
    metadata: ActionOrchestrationMetadata;
    suppressedMessages?: string[];
  }): SilentHistoryEntry | null {
    const result = _utils.buildSilentHistoryEntry(
      input.moduleId,
      JSON.stringify(input.metadata),
      JSON.stringify(input.suppressedMessages ?? []),
    );
    return result ? safeParseKmp<SilentHistoryEntry | null>(result, null, 'HistoryUtils.buildSilentHistoryEntry') : null;
  }

  // -- Path helper (pure, kept in TS for colocation with I/O methods) -------

  static getSilentHistoryCollectionPath(uid: string): string {
    return `users/${uid}/${SILENT_HISTORY_SUBCOLLECTION}`;
  }

  // -- Async I/O: unchanged -------------------------------------------------

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
    const docs = await dataLayer.listDocuments<SilentHistoryEntry>(this.getSilentHistoryCollectionPath(uid), { limit: 400 });
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
