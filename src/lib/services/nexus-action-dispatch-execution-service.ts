import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import type { NexusActionPlanExecutionPacket } from '@/lib/contracts/nexus-action-plan';
import type { ThreadExecutionArtifact } from '@/lib/contracts/orchestration';
import { ActionHub } from '@/lib/actions/action-hub';
import { CommandIntelligenceServiceJs, NexusDispatchExecutionServiceJs } from '@cortex-logic';
import { serializeExecutionPacket } from './nexus-action-planner-service';

const _kmpCommandParser = new CommandIntelligenceServiceJs();
const _execution = new NexusDispatchExecutionServiceJs();

type PersistencePolicy = 'auto' | 'scout-research' | 'atlas-planning' | 'ledger-financial' | 'manual' | 'ephemeral';

export interface NexusDispatchExecutionContext {
  userId?: string;
  isGuest: boolean;
  encryptionKey?: CryptoKey | null;
  persistencePolicy?: PersistencePolicy;
  updateGlobalSoul?: (patch: Record<string, unknown>) => Promise<void>;
  emitSpineEvent?: (type: string, payload: Record<string, unknown>, options?: { domain?: string; priority?: 'info' | 'alert' | 'critical'; target?: string }) => void;
  delegateToModule?: (target: string, reason: string, content: string) => void;
}

export interface NexusDispatchExecutionNodeResult {
  nodeId: string;
  status: 'executed' | 'failed' | 'blocked_by_dependency' | 'requires_followup';
  targetModuleId: string;
  sourceActionType: string;
  resolvedActionType: string | null;
  dependsOn: string[];
  reason?: string;
}

function buildParsedCommand(packet: NexusActionPlanExecutionPacket): ParsedCommandEnvelope {
  return JSON.parse(_kmpCommandParser.parse(packet.rawInput, 'nexus')) as ParsedCommandEnvelope;
}

export class NexusActionDispatchExecutionService {
  static canExecutePacketDeterministically(packet: NexusActionPlanExecutionPacket): boolean {
    return packet.dispatchPlan.length > 0 && packet.dispatchPlan.every((node) => node.status === 'resolved');
  }

  static buildExecutionSummary(
    packet: NexusActionPlanExecutionPacket,
    results: NexusDispatchExecutionNodeResult[],
  ): string {
    return _execution.buildExecutionSummary(JSON.stringify(packet), JSON.stringify(results));
  }

  static buildRetryPacket(
    packet: NexusActionPlanExecutionPacket,
    results: NexusDispatchExecutionNodeResult[],
  ): NexusActionPlanExecutionPacket | null {
    const retryJson = _execution.buildRetryPacket(JSON.stringify(packet), JSON.stringify(results));
    if (!retryJson) return null;
    return JSON.parse(retryJson) as NexusActionPlanExecutionPacket;
  }

  static buildExecutionArtifacts(
    packet: NexusActionPlanExecutionPacket,
    results: NexusDispatchExecutionNodeResult[],
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

    const artifactsJson = _execution.buildExecutionArtifacts(
      JSON.stringify(packet),
      JSON.stringify(results),
      timestamp,
      retryPacketJson,
      retryPrompt,
    );
    return JSON.parse(artifactsJson) as ThreadExecutionArtifact[];
  }

  static async executePacket(
    packet: NexusActionPlanExecutionPacket,
    context: NexusDispatchExecutionContext,
  ): Promise<NexusDispatchExecutionNodeResult[]> {
    const parsedCommand = buildParsedCommand(packet);
    const results = new Map<string, NexusDispatchExecutionNodeResult>();

    const cycleNodeIds = new Set(
      _execution.detectDependencyCycles(JSON.stringify(packet.dispatchPlan))
    );
    if (cycleNodeIds.size > 0) {
      console.error(
        `[NexusActionDispatchExecutionService] Circular dependency detected in action plan "${packet.planId}". Affected nodes: ${[...cycleNodeIds].join(', ')}. Aborting execution.`,
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
