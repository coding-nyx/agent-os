import type {
  ActionOrchestrationMetadata,
  ExecutionFailure,
  ExecutionFailureCode,
  ExecutionFailureStatus,
  ResumableActionSnapshot,
  RuntimeSemantics,
} from '@/lib/contracts/orchestration';
import type { AraDataLayer } from '@/lib/data-layer';
import { getAraDataLayer } from '@/lib/data-layer/provider';
import { Spine } from '@/lib/spine/spine-event-bus';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { ActionHub, type ActionContext } from '@/lib/actions/action-hub';
import {
  OrchestrationPersistenceService,
  type PersistedExecutionFailureRecord,
} from './orchestration-persistence-service';
import { OrchestrationExecutionUtilsJs } from '@cortex-logic';

const _utils = new OrchestrationExecutionUtilsJs();

// ---------------------------------------------------------------------------
// Pure computation — delegated to KMP
// ---------------------------------------------------------------------------

function classifyFailureCode(error: unknown): ExecutionFailureCode {
  const serialized = error instanceof Error
    ? JSON.stringify({ name: error.name, message: error.message })
    : JSON.stringify({ message: String(error) });
  return _utils.classifyFailureCode(serialized) as ExecutionFailureCode;
}

function nextFailureStatus(
  errorCode: ExecutionFailureCode,
  retryCount: number,
): ExecutionFailureStatus {
  return _utils.nextFailureStatus(errorCode, retryCount) as ExecutionFailureStatus;
}

// ---------------------------------------------------------------------------
// Local helpers that remain in TS (I/O-adjacent or use TS-only constructs)
// ---------------------------------------------------------------------------

const RETRY_BACKOFF_MS = [1000, 4000, 16000] as const;
const MAX_RETRIES = RETRY_BACKOFF_MS.length;

function addMs(isoTimestamp: string, deltaMs: number): string {
  return new Date(new Date(isoTimestamp).getTime() + deltaMs).toISOString();
}

function toIncidentRuntime(runtime: RuntimeSemantics): RuntimeSemantics {
  return {
    ...runtime,
    disposition: 'incident_review',
    historyDestination: 'standard',
    willPersistHistory: true,
    shouldNotifyUser: true,
  };
}

function buildResumableSnapshot(context: Pick<
  ActionContext,
  'userId' | 'isGuest' | 'moduleId' | 'payload' | 'persistencePolicy'
>, actionType: string, metadata: ActionOrchestrationMetadata): ResumableActionSnapshot | null {
  if (!context.userId || context.isGuest) return null;
  return {
    userId: context.userId,
    isGuest: context.isGuest,
    moduleId: context.moduleId,
    actionType,
    payload: context.payload,
    persistencePolicy: context.persistencePolicy,
    activeThreadId: metadata.activeThreadId,
    orchestration: JSON.parse(JSON.stringify(metadata)) as ActionOrchestrationMetadata,
  };
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class OrchestrationExecutionService {
  static readonly MAX_RETRIES = MAX_RETRIES;

  static classifyFailureCode = classifyFailureCode;

  static getRetryBackoffMs(retryCount: number): number {
    return _utils.getRetryBackoffMs(retryCount);
  }

  static async recordFailure(
    uid: string | undefined,
    input: {
      moduleId: string;
      actionType: string;
      metadata: ActionOrchestrationMetadata;
      error: unknown;
      errorCode?: ExecutionFailureCode;
      resumableSnapshot?: ResumableActionSnapshot | null;
      dataLayer?: AraDataLayer;
    },
  ): Promise<ExecutionFailure | null> {
    if (!uid || input.metadata.patientScope === 'GUEST') return null;

    const dataLayer = input.dataLayer ?? getAraDataLayer();
    const previousFailures = await OrchestrationPersistenceService.listExecutionFailures(
      uid,
      { executionId: input.metadata.execution.id },
      dataLayer,
    );
    const retryCount = previousFailures.length;
    const failedAt = new Date().toISOString();
    const errorCode = input.errorCode ?? classifyFailureCode(input.error);
    const status = nextFailureStatus(errorCode, retryCount);
    const nextRetryAt =
      status === 'retry_scheduled' ? addMs(failedAt, this.getRetryBackoffMs(retryCount)) : null;
    const escalatedAt = status === 'escalated' ? failedAt : null;
    const failure: ExecutionFailure = {
      id: `${input.metadata.execution.id}.failure.${retryCount + 1}`,
      executionId: input.metadata.execution.id,
      proposalId: input.metadata.proposal.id,
      moduleId: input.moduleId,
      actionType: input.actionType,
      threadId: input.metadata.activeThreadId,
      patientScope: input.metadata.patientScope,
      errorMessage: input.error instanceof Error ? input.error.message : String(input.error),
      errorName: input.error instanceof Error ? input.error.name : 'UnknownError',
      errorCode,
      retryCount,
      maxRetries: MAX_RETRIES,
      failedAt,
      nextRetryAt,
      escalatedAt,
      resolvedAt: null,
      status,
      metadata: {
        executionMode: input.metadata.executionMode,
        dispatchStatus: input.metadata.dispatchStatus,
        autopilotLevel: input.metadata.autopilotLevel,
        resumableSnapshot: input.resumableSnapshot ?? null,
      },
    };

    await OrchestrationPersistenceService.persistExecutionFailure(uid, failure, dataLayer);
    this.applyFailureToMetadata(input.metadata, failure);
    return failure;
  }

  static async recordMissingHandlerFailure(
    uid: string | undefined,
    input: {
      moduleId: string;
      actionType: string;
      metadata: ActionOrchestrationMetadata;
      dataLayer?: AraDataLayer;
    },
  ): Promise<ExecutionFailure | null> {
    return this.recordFailure(uid, {
      ...input,
      error: new Error(`No handler for "${input.actionType}" in module "${input.moduleId}"`),
      errorCode: 'MISSING_HANDLER',
    });
  }

  static applyFailureToMetadata(
    metadata: ActionOrchestrationMetadata,
    failure: ExecutionFailure,
  ): void {
    metadata.execution = {
      ...metadata.execution,
      status: failure.status === 'escalated' ? 'failed_escalated' : 'failed',
      executedAt: failure.failedAt,
    };
    metadata.proposalCard = {
      ...metadata.proposalCard,
      status: failure.status === 'escalated' ? 'incident' : 'failed',
      summary:
        failure.status === 'escalated'
          ? `${metadata.proposalCard.summary} Escalated after execution failure.`
          : failure.status === 'retry_scheduled'
            ? `${metadata.proposalCard.summary} Execution failed and is queued for retry review.`
            : `${metadata.proposalCard.summary} Execution failed and requires manual follow-up.`,
    };
    metadata.runtime = toIncidentRuntime(metadata.runtime);
    metadata.proposal = {
      ...metadata.proposal,
      metadata: {
        ...metadata.proposal.metadata,
        latestFailureId: failure.id,
        latestFailureCode: failure.errorCode,
        latestFailureMessage: failure.errorMessage,
        retryCount: failure.retryCount,
        nextRetryAt: failure.nextRetryAt,
      },
    };
    metadata.failure = { ...failure };
  }

  static createResumableSnapshot(
    actionType: string,
    context: Pick<ActionContext, 'userId' | 'isGuest' | 'moduleId' | 'payload' | 'persistencePolicy'>,
    metadata: ActionOrchestrationMetadata,
  ): ResumableActionSnapshot | null {
    return buildResumableSnapshot(context, actionType, metadata);
  }

  static async markFailureResolved(
    uid: string,
    failureId: string,
    dataLayer: AraDataLayer = getAraDataLayer(),
  ): Promise<void> {
    await OrchestrationPersistenceService.updateExecutionFailure(uid, failureId, {
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      nextRetryAt: null,
    }, dataLayer);
  }

  static async listFailures(
    uid: string,
    options?: {
      executionId?: string;
      proposalId?: string;
      limit?: number;
    },
    dataLayer: AraDataLayer = getAraDataLayer(),
  ): Promise<Array<PersistedExecutionFailureRecord>> {
    return OrchestrationPersistenceService.listExecutionFailures(uid, options, dataLayer);
  }

  static async listDueRetries(
    uid: string,
    options?: {
      now?: string;
      limit?: number;
    },
    dataLayer: AraDataLayer = getAraDataLayer(),
  ): Promise<Array<PersistedExecutionFailureRecord>> {
    const now = options?.now ?? new Date().toISOString();
    const failures = await this.listFailures(uid, { limit: options?.limit }, dataLayer);
    return failures.filter((failure) =>
      failure.status === 'retry_scheduled' &&
      typeof failure.nextRetryAt === 'string' &&
      failure.nextRetryAt <= now,
    );
  }

  static async processDueRetries(
    uid: string,
    options?: {
      now?: string;
      limit?: number;
      dataLayer?: AraDataLayer;
    },
  ): Promise<{ attempted: number; succeeded: number; failed: number }> {
    if (!uid) return { attempted: 0, succeeded: 0, failed: 0 };

    const dataLayer = options?.dataLayer ?? getAraDataLayer();
    const dueFailures = await this.listDueRetries(uid, { now: options?.now, limit: options?.limit }, dataLayer);
    let attempted = 0;
    let succeeded = 0;
    let failed = 0;

    for (const failure of dueFailures) {
      const snapshot = failure.metadata?.resumableSnapshot as ResumableActionSnapshot | undefined;
      if (!snapshot || snapshot.userId !== uid) {
        await OrchestrationPersistenceService.updateExecutionFailure(uid, failure.id, {
          status: 'escalated',
          escalatedAt: options?.now ?? new Date().toISOString(),
          nextRetryAt: null,
          metadata: {
            ...failure.metadata,
            retryWorker: 'missing_snapshot',
          },
        }, dataLayer);
        failed += 1;
        continue;
      }

      attempted += 1;
      const failureCountBefore = (await this.listFailures(uid, { executionId: failure.executionId }, dataLayer)).length;
      const retryContext: ActionContext = {
        userId: snapshot.userId,
        isGuest: snapshot.isGuest,
        moduleId: snapshot.moduleId,
        orchestration: JSON.parse(JSON.stringify(snapshot.orchestration)) as ActionOrchestrationMetadata,
        payload: {
          ...snapshot.payload,
          __retryAttempt: true,
        },
        persistencePolicy: snapshot.persistencePolicy as ActionContext['persistencePolicy'],
        emitSpineEvent: (type, payload) => {
          Spine.emit({
            type,
            source: snapshot.moduleId,
            domain: 'system',
            data: {
              ...payload,
              retryFailureId: failure.id,
            },
            cascadeDepth: 0,
            priority: 'info',
          });
        },
        updateGlobalSoul: (patch) => GlobalProjectionService.updateCrossFunctionalState(snapshot.userId, patch, dataLayer),
        delegateToModule: () => {},
        pushAssistantMessage: () => {},
        navigateTo: () => {},
      };

      const succeededThisRun = await ActionHub.execute(snapshot.moduleId, snapshot.actionType, retryContext);
      if (succeededThisRun) {
        await this.markFailureResolved(uid, failure.id, dataLayer);
        succeeded += 1;
        continue;
      }

      const failureCountAfter = (await this.listFailures(uid, { executionId: failure.executionId }, dataLayer)).length;
      await OrchestrationPersistenceService.updateExecutionFailure(uid, failure.id, {
        status: 'resolved',
        resolvedAt: options?.now ?? new Date().toISOString(),
        nextRetryAt: null,
        metadata: {
          ...failure.metadata,
          retryWorker: failureCountAfter > failureCountBefore ? 'superseded' : 'failed_without_new_record',
        },
      }, dataLayer);
      failed += 1;
    }

    return { attempted, succeeded, failed };
  }
}
