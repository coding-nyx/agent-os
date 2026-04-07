import type {
  ActionOrchestrationMetadata,
  ExecutionFailure,
  ExecutionRecord,
  MutationProposal,
  OrchestrationTurnRuntimeSummary,
  ProposalCard,
} from '@/lib/contracts/orchestration';
import type { BatchOperation, NexusDataLayer, NexusRecord } from '@/lib/data-layer';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { MasterThreadService, type MasterThreadShellSnapshot } from './master-thread-service';
import { OrchestrationPersistenceUtilsJs } from '@cortex-logic';
import { safeParseKmp } from '@/cortex-bridge/kmp-parse';
import { NexusLogger } from '@/lib/nexus-logger';

const _utils = new OrchestrationPersistenceUtilsJs();

// ---------------------------------------------------------------------------
// Collection-path constants
// ---------------------------------------------------------------------------

export const ORCHESTRATION_PROPOSAL_SUBCOLLECTION = 'orchestration_proposals';
export const ORCHESTRATION_EXECUTION_SUBCOLLECTION = 'orchestration_execution_records';
export const ORCHESTRATION_EXECUTION_FAILURE_SUBCOLLECTION = 'orchestration_execution_failures';
export const ORCHESTRATION_THREAD_SUBCOLLECTION = 'orchestration_threads';

export const DEFAULT_ORCHESTRATION_RETENTION_LIMITS = {
  proposals: 150,
  executions: 150,
  failures: 150,
  threads: 25,
} as const;

// ---------------------------------------------------------------------------
// Record shape types
// ---------------------------------------------------------------------------

export interface PersistedProposalRecord {
  id: string;
  moduleId: string;
  actionType: string;
  threadId: string | null;
  executionId: string;
  dispatchStatus: ActionOrchestrationMetadata['dispatchStatus'];
  executionMode: ActionOrchestrationMetadata['executionMode'];
  historyMode: ActionOrchestrationMetadata['historyMode'];
  approvalRequirement: ActionOrchestrationMetadata['approvalRequirement'];
  patientScope: ActionOrchestrationMetadata['patientScope'];
  mutatesState: boolean;
  highRisk: boolean;
  proposal: MutationProposal;
  proposalCard: ProposalCard;
  runtime: ActionOrchestrationMetadata['runtime'];
  createdAt: string;
  storedAt: string;
}

export interface PersistedExecutionRecord {
  id: string;
  moduleId: string;
  actionType: string;
  threadId: string | null;
  dispatchStatus: ActionOrchestrationMetadata['dispatchStatus'];
  approvalRequirement: ActionOrchestrationMetadata['approvalRequirement'];
  proposalCard: ProposalCard;
  execution: ExecutionRecord;
  executedAt: string;
  storedAt: string;
}

export interface PersistedExecutionFailureRecord extends ExecutionFailure {
  storedAt: string;
}

export interface PersistedThreadState {
  id: string;
  moduleId: string;
  threadId: string;
  updatedAt: string;
  snapshot: MasterThreadShellSnapshot;
}

// ---------------------------------------------------------------------------
// Local sort helper (used in async I/O methods — stays in TS)
// ---------------------------------------------------------------------------

function sortByTimestampDesc<T extends { id: string }>(
  records: T[],
  getTimestamp: (record: T) => string,
): T[] {
  return [...records].sort((left, right) => {
    const timestampDelta = getTimestamp(right).localeCompare(getTimestamp(left));
    if (timestampDelta !== 0) return timestampDelta;
    return right.id.localeCompare(left.id);
  });
}

async function pruneCollectionByTimestamp<T extends { id: string }>(input: {
  dataLayer: NexusDataLayer;
  collection: string;
  limit: number;
  getTimestamp: (record: T) => string;
}): Promise<void> {
  if (input.limit <= 0) return;
  const docs = await input.dataLayer.listDocuments<T>(input.collection, { limit: 0 });
  if (docs.length <= input.limit) return;

  const staleDocs = sortByTimestampDesc(docs, input.getTimestamp).slice(input.limit);
  if (staleDocs.length === 0) return;

  await input.dataLayer.batchWrite(
    staleDocs.map((doc) => ({
      type: 'delete' as const,
      collection: input.collection,
      id: doc.id,
    })),
  );
}

// ---------------------------------------------------------------------------
// Pure helpers — delegated to KMP
// ---------------------------------------------------------------------------

/**
 * Strips `undefined` values and replaces them with `null` so the result is
 * safe to write to Firestore. Delegates to KMP; KMP method is toFirestoreSafeJson.
 */
function toFirestoreSafeValue<T>(value: T): T {
  return safeParseKmp(_utils.toFirestoreSafeJson(JSON.stringify(value)), value, 'Persistence.toFirestoreSafeValue');
}

function isUserScopedDecision(
  decision: Pick<ActionOrchestrationMetadata, 'patientScope'>,
): boolean {
  return decision.patientScope !== 'GUEST';
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class OrchestrationPersistenceService {
  // -- Collection path builders: delegated to KMP ---------------------------

  static getProposalCollectionPath(uid: string): string {
    return _utils.getProposalCollectionPath(uid);
  }

  static getExecutionCollectionPath(uid: string): string {
    return _utils.getExecutionCollectionPath(uid);
  }

  static getExecutionFailureCollectionPath(uid: string): string {
    return _utils.getExecutionFailureCollectionPath(uid);
  }

  static getThreadCollectionPath(uid: string): string {
    return _utils.getThreadCollectionPath(uid);
  }

  // -- Record builders: delegated to KMP ------------------------------------

  static toProposalRecord(
    moduleId: string,
    metadata: ActionOrchestrationMetadata,
    storedAt: string,
  ): PersistedProposalRecord {
    try {
      return JSON.parse(
        _utils.toProposalRecord(moduleId, JSON.stringify(metadata), storedAt),
      ) as PersistedProposalRecord;
    } catch (err) {
      NexusLogger.warn('KMP', `Persistence.toProposalRecord JSON.parse failed: ${err}`);
      throw err;
    }
  }

  static toExecutionRecord(
    moduleId: string,
    metadata: ActionOrchestrationMetadata,
    storedAt: string,
  ): PersistedExecutionRecord {
    try {
      return JSON.parse(
        _utils.toExecutionRecord(moduleId, JSON.stringify(metadata), storedAt),
      ) as PersistedExecutionRecord;
    } catch (err) {
      NexusLogger.warn('KMP', `Persistence.toExecutionRecord JSON.parse failed: ${err}`);
      throw err;
    }
  }

  // -- sanitizeRuntimeSummary: delegated to KMP ------------------------------

  static sanitizeRuntimeSummary(
    runtimeSummary: OrchestrationTurnRuntimeSummary | null | undefined,
  ): OrchestrationTurnRuntimeSummary | null {
    if (!runtimeSummary) return null;
    try {
      return JSON.parse(
        _utils.sanitizeRuntimeSummary(JSON.stringify(runtimeSummary)),
      ) as OrchestrationTurnRuntimeSummary | null;
    } catch {
      // Compatibility fallback for KMP serializers that reject null-heavy
      // nested runtime payloads during in-progress migrations.
      return toFirestoreSafeValue(runtimeSummary);
    }
  }

  // -- Thread snapshot: stays in TS (depends on MasterThreadService) ---------

  static buildThreadStateSnapshot(input: {
    moduleId: string;
    threadId?: string | null;
    now?: string;
    runtimeSummary?: OrchestrationTurnRuntimeSummary | null;
  }): PersistedThreadState {
    const updatedAt = input.now ?? new Date().toISOString();
    const threadId = input.threadId ?? input.runtimeSummary?.activeThreadId ?? `${input.moduleId}.shell`;
    return {
      id: threadId,
      moduleId: input.moduleId,
      threadId,
      updatedAt,
      snapshot: MasterThreadService.createNexusShellSnapshot({
        threadId,
        now: updatedAt,
        lastTurnRuntime: input.runtimeSummary ?? null,
      }),
    };
  }

  // -- Async I/O: unchanged --------------------------------------------------

  static async persistRuntimeArtifacts(
    uid: string,
    input: {
      moduleId: string;
      decisions?: ActionOrchestrationMetadata[];
      runtimeSummary?: OrchestrationTurnRuntimeSummary | null;
      threadId?: string | null;
      now?: string;
      retention?: Partial<typeof DEFAULT_ORCHESTRATION_RETENTION_LIMITS>;
    },
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<void> {
    if (!uid) return;

    const now = input.now ?? new Date().toISOString();
    const decisions = (input.decisions ?? []).filter(isUserScopedDecision);
    const retention = {
      ...DEFAULT_ORCHESTRATION_RETENTION_LIMITS,
      ...(input.retention ?? {}),
    };
    const runtimeSummary = this.sanitizeRuntimeSummary(input.runtimeSummary);

    const operations: BatchOperation[] = [
      ...decisions.map((decision) => ({
        type: 'set' as const,
        collection: this.getProposalCollectionPath(uid),
        id: decision.proposal.id,
        data: toFirestoreSafeValue(this.toProposalRecord(input.moduleId, decision, now)),
      })),
      ...decisions.map((decision) => ({
        type: 'set' as const,
        collection: this.getExecutionCollectionPath(uid),
        id: decision.execution.id,
        data: toFirestoreSafeValue(this.toExecutionRecord(input.moduleId, decision, now)),
      })),
    ];

    const threadState = this.buildThreadStateSnapshot({
      moduleId: input.moduleId,
      threadId: input.threadId,
      now,
      runtimeSummary,
    });

    operations.push({
      type: 'set' as const,
      collection: this.getThreadCollectionPath(uid),
      id: threadState.id,
      data: toFirestoreSafeValue(threadState),
    });

    if (operations.length > 0) {
      await dataLayer.batchWrite(operations);
    }

    await Promise.all([
      pruneCollectionByTimestamp<PersistedProposalRecord>({
        dataLayer,
        collection: this.getProposalCollectionPath(uid),
        limit: retention.proposals,
        getTimestamp: (record) => record.createdAt,
      }),
      pruneCollectionByTimestamp<PersistedExecutionRecord>({
        dataLayer,
        collection: this.getExecutionCollectionPath(uid),
        limit: retention.executions,
        getTimestamp: (record) => record.executedAt,
      }),
      pruneCollectionByTimestamp<PersistedExecutionFailureRecord>({
        dataLayer,
        collection: this.getExecutionFailureCollectionPath(uid),
        limit: retention.failures,
        getTimestamp: (record) => record.failedAt,
      }),
      pruneCollectionByTimestamp<PersistedThreadState>({
        dataLayer,
        collection: this.getThreadCollectionPath(uid),
        limit: retention.threads,
        getTimestamp: (record) => record.updatedAt,
      }),
    ]);
  }

  static async listProposalRecords(
    uid: string,
    options?: {
      limit?: number;
    },
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<Array<NexusRecord<PersistedProposalRecord>>> {
    if (!uid) return [];
    const docs = await dataLayer.listDocuments<PersistedProposalRecord>(this.getProposalCollectionPath(uid), { limit: 0 });
    const sorted = sortByTimestampDesc(docs, (record) => record.createdAt);
    return typeof options?.limit === 'number' ? sorted.slice(0, options.limit) : sorted;
  }

  static async listExecutionRecords(
    uid: string,
    options?: {
      limit?: number;
    },
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<Array<NexusRecord<PersistedExecutionRecord>>> {
    if (!uid) return [];
    const docs = await dataLayer.listDocuments<PersistedExecutionRecord>(this.getExecutionCollectionPath(uid), { limit: 0 });
    const sorted = sortByTimestampDesc(docs, (record) => record.executedAt);
    return typeof options?.limit === 'number' ? sorted.slice(0, options.limit) : sorted;
  }

  static async getExecutionFailureRecord(
    uid: string,
    failureId: string,
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<NexusRecord<PersistedExecutionFailureRecord> | null> {
    if (!uid || !failureId) return null;
    return dataLayer.getDocument<PersistedExecutionFailureRecord>(
      this.getExecutionFailureCollectionPath(uid),
      failureId,
    );
  }

  static async getThreadState(
    uid: string,
    input: {
      moduleId: string;
      threadId?: string | null;
      now?: string;
    },
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<NexusRecord<PersistedThreadState>> {
    const fallback = this.buildThreadStateSnapshot(input);
    if (!uid) return fallback;

    const record = await dataLayer.getDocument<PersistedThreadState>(
      this.getThreadCollectionPath(uid),
      fallback.id,
    );

    return record ?? fallback;
  }

  static async persistExecutionFailure(
    uid: string,
    failure: ExecutionFailure,
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<void> {
    if (!uid || failure.patientScope === 'GUEST') return;

    const storedAt = failure.failedAt;
    await dataLayer.batchWrite([
      {
        type: 'set' as const,
        collection: this.getExecutionFailureCollectionPath(uid),
        id: failure.id,
        data: toFirestoreSafeValue({
          ...failure,
          storedAt,
        } satisfies PersistedExecutionFailureRecord),
      },
    ]);

    await pruneCollectionByTimestamp<PersistedExecutionFailureRecord>({
      dataLayer,
      collection: this.getExecutionFailureCollectionPath(uid),
      limit: DEFAULT_ORCHESTRATION_RETENTION_LIMITS.failures,
      getTimestamp: (record) => record.failedAt,
    });
  }

  static async listExecutionFailures(
    uid: string,
    options?: {
      limit?: number;
      executionId?: string;
      proposalId?: string;
    },
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<Array<NexusRecord<PersistedExecutionFailureRecord>>> {
    if (!uid) return [];
    const docs = await dataLayer.listDocuments<PersistedExecutionFailureRecord>(this.getExecutionFailureCollectionPath(uid), { limit: 0 });
    const filtered = docs.filter((record) => {
      if (options?.executionId && record.executionId !== options.executionId) return false;
      if (options?.proposalId && record.proposalId !== options.proposalId) return false;
      return true;
    });
    const sorted = sortByTimestampDesc(filtered, (record) => record.failedAt);
    return typeof options?.limit === 'number' ? sorted.slice(0, options.limit) : sorted;
  }

  static async updateExecutionFailure(
    uid: string,
    failureId: string,
    updates: Partial<PersistedExecutionFailureRecord>,
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<NexusRecord<PersistedExecutionFailureRecord> | null> {
    if (!uid || !failureId) return null;
    return dataLayer.updateDocument<PersistedExecutionFailureRecord>(
      this.getExecutionFailureCollectionPath(uid),
      failureId,
      toFirestoreSafeValue(updates),
    );
  }
}
