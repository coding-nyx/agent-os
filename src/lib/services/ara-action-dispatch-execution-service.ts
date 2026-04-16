import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import type { AraActionPlanExecutionPacket } from '@/lib/contracts/ara-action-plan';
import type { ThreadExecutionArtifact } from '@/lib/contracts/orchestration';
import { ActionHub } from '@/lib/actions/action-hub';
import { CommandIntelligenceServiceJs, AraDispatchExecutionServiceJs } from '@cortex-logic';
import { serializeExecutionPacket } from './ara-action-planner-service';

const _kmpCommandParser = new CommandIntelligenceServiceJs();
const _execution = AraDispatchExecutionServiceJs ? new AraDispatchExecutionServiceJs() : null;

type PersistencePolicy = 'auto' | 'scout-research' | 'atlas-planning' | 'ledger-financial' | 'manual' | 'ephemeral';

export interface AraDispatchExecutionContext {
  userId?: string;
  isGuest: boolean;
  encryptionKey?: CryptoKey | null;
  persistencePolicy?: PersistencePolicy;
  updateGlobalSoul?: (patch: Record<string, unknown>) => Promise<void>;
  emitSpineEvent?: (type: string, payload: Record<string, unknown>, options?: { domain?: string; priority?: 'info' | 'alert' | 'critical'; target?: string }) => void;
  delegateToModule?: (target: string, reason: string, content: string) => void;
}

export interface AraDispatchExecutionNodeResult {
  nodeId: string;
  status: 'executed' | 'failed' | 'blocked_by_dependency' | 'requires_followup';
  targetModuleId: string;
  sourceActionType: string;
  resolvedActionType: string | null;
  dependsOn: string[];
  reason?: string;
}

function buildParsedCommand(packet: AraActionPlanExecutionPacket): ParsedCommandEnvelope {
  return JSON.parse(_kmpCommandParser.parse(packet.rawInput, 'ara')) as ParsedCommandEnvelope;
}

export class AraActionDispatchExecutionService {
  static canExecutePacketDeterministically(packet: AraActionPlanExecutionPacket): boolean {
    return packet.dispatchPlan.length > 0 && packet.dispatchPlan.every((node) => node.status === 'resolved');
  }

  static buildExecutionSummary(
    packet: AraActionPlanExecutionPacket,
    results: AraDispatchExecutionNodeResult[],
  ): string {
    if (!_execution) return `Executed ${results.filter(r => r.status === 'executed').length}/${results.length} steps.`;
    return _execution.buildExecutionSummary(JSON.stringify(packet), JSON.stringify(results));
  }

  static buildRetryPacket(
    packet: AraActionPlanExecutionPacket,
    results: AraDispatchExecutionNodeResult[],
  ): AraActionPlanExecutionPacket | null {
    if (!_execution) return null;
    const retryJson = _execution.buildRetryPacket(JSON.stringify(packet), JSON.stringify(results));
    if (!retryJson) return null;
    return JSON.parse(retryJson) as AraActionPlanExecutionPacket;
  }

  static buildExecutionArtifacts(
    packet: AraActionPlanExecutionPacket,
    results: AraDispatchExecutionNodeResult[],
    timestamp: string,
  ): ThreadExecutionArtifact[] {
    const retryPacket = this.buildRetryPacket(packet, results);
    const retryPacketJson = retryPacket ? JSON.stringify(retryPacket) : null;
    const retryPrompt = retryPacket
      ? serializeExecutionPacket(retryPacket, {
          instruction: `Retry attempt ${retryPacket.retryAttempt ?? 1} for the remaining action plan steps in the user's request: "${retryPacket.rawInput}"`,
          footer: 'Execute only the retry packet nodes that still need work, preserving their order and dependencies.',
        })
      : null;

    if (!_execution) return [];
    const artifactsJson = _execution.buildExecutionArtifacts(
      JSON.stringify(packet),
      JSON.stringify(results),
      timestamp,
      retryPacketJson,
      retryPrompt,
    );
    // KMP kotlinx.serialization emits null for Kotlin nullable types.
    // JSON.parse preserves null, but TS optional fields (`?:`) expect undefined.
    // Convert null → undefined for optional ThreadExecutionArtifact fields.
    const parsed = JSON.parse(artifactsJson) as Record<string, unknown>[];
    const OPTIONAL_KEYS = ['retryOfPlanId', 'retryAttempt', 'retryParentExecutionId', 'errorMessage', 'retrySummary', 'retryPrompt', 'retryVisibleContent'];
    for (const artifact of parsed) {
      for (const key of OPTIONAL_KEYS) {
        if (key in artifact && artifact[key] === null) {
          artifact[key] = undefined;
        }
      }
    }
    return parsed as unknown as ThreadExecutionArtifact[];
  }

  static async executePacket(
    packet: AraActionPlanExecutionPacket,
    context: AraDispatchExecutionContext,
  ): Promise<AraDispatchExecutionNodeResult[]> {
    const parsedCommand = buildParsedCommand(packet);
    const results = new Map<string, AraDispatchExecutionNodeResult>();

    const cycleNodeIds = new Set(
      _execution ? _execution.detectDependencyCycles(JSON.stringify(packet.dispatchPlan)) : []
    );
    if (cycleNodeIds.size > 0) {
      console.error(
        `[AraActionDispatchExecutionService] Circular dependency detected in action plan "${packet.planId}". Affected nodes: ${[...cycleNodeIds].join(', ')}. Aborting execution.`,
      );
      return packet.dispatchPlan.map((dispatch) => ({
        nodeId: dispatch.nodeId,
        status: 'failed',
        targetModuleId: dispatch.targetModuleId,
        sourceActionType: dispatch.sourceActionType,
        resolvedActionType: dispatch.resolvedActionType,
        dependsOn: dispatch.dependsOn,
        reason: cycleNodeIds.has(dispatch.nodeId)
          ? 'Circular dependency detected — execution aborted.'
          : 'Execution aborted due to circular dependency in plan.',
      }));
    }

    for (const dispatch of packet.dispatchPlan) {
      if (dispatch.status === 'requires_followup' || !dispatch.resolvedActionType) {
        results.set(dispatch.nodeId, {
          nodeId: dispatch.nodeId,
          status: 'requires_followup',
          targetModuleId: dispatch.targetModuleId,
          sourceActionType: dispatch.sourceActionType,
          resolvedActionType: null,
          dependsOn: dispatch.dependsOn,
          reason: dispatch.reason,
        });
        continue;
      }

      const blockedDependency = dispatch.dependsOn.find((dependencyId) => {
        const dependency = results.get(dependencyId);
        return dependency && dependency.status !== 'executed';
      });

      if (blockedDependency) {
        results.set(dispatch.nodeId, {
          nodeId: dispatch.nodeId,
          status: 'blocked_by_dependency',
          targetModuleId: dispatch.targetModuleId,
          sourceActionType: dispatch.sourceActionType,
          resolvedActionType: dispatch.resolvedActionType,
          dependsOn: dispatch.dependsOn,
          reason: `Blocked by ${blockedDependency}.`,
        });
        continue;
      }

      const executed = await ActionHub.execute(dispatch.targetModuleId, dispatch.resolvedActionType, {
        userId: context.userId,
        isGuest: context.isGuest,
        moduleId: dispatch.targetModuleId,
        payload: dispatch.payload,
        parsedCommand,
        persistencePolicy: context.persistencePolicy ?? 'auto',
        encryptionKey: context.encryptionKey,
        emitSpineEvent: (type, payload, options) => context.emitSpineEvent?.(type, payload, options),
        updateGlobalSoul: async (patch) => {
          await context.updateGlobalSoul?.(patch as Record<string, unknown>);
        },
        delegateToModule: (target, reason, content) => {
          context.delegateToModule?.(target, reason, content);
        },
      });

      results.set(dispatch.nodeId, {
        nodeId: dispatch.nodeId,
        status: executed ? 'executed' : 'failed',
        targetModuleId: dispatch.targetModuleId,
        sourceActionType: dispatch.sourceActionType,
        resolvedActionType: dispatch.resolvedActionType,
        dependsOn: dispatch.dependsOn,
        reason: executed ? undefined : `Execution failed for ${dispatch.targetModuleId}.${dispatch.resolvedActionType}.`,
      });
    }

    return packet.dispatchPlan.map((dispatch) => results.get(dispatch.nodeId) ?? {
      nodeId: dispatch.nodeId,
      status: 'requires_followup',
      targetModuleId: dispatch.targetModuleId,
      sourceActionType: dispatch.sourceActionType,
      resolvedActionType: dispatch.resolvedActionType,
      dependsOn: dispatch.dependsOn,
      reason: dispatch.reason,
    });
  }
}
