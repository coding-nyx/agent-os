import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import type { NexusActionPlanDispatchNode, NexusActionPlanExecutionPacket } from '@/lib/contracts/nexus-action-plan';
import type { ThreadExecutionArtifact } from '@/lib/contracts/orchestration';
import { ActionHub } from '@/lib/actions/action-hub';
import { CommandIntelligenceService } from './command-intelligence-service';
import { serializeExecutionPacket } from './nexus-action-planner-service';

type PersistencePolicy = 'auto' | 'scout-research' | 'atlas-planning' | 'ledger-financial' | 'manual' | 'ephemeral';

export interface NexusDispatchExecutionContext {
  userId?: string;
  isGuest: boolean;
  encryptionKey?: CryptoKey | null;
  persistencePolicy?: PersistencePolicy;
  updateGlobalSoul?: (patch: Record<string, unknown>) => Promise<void>;
  emitSpineEvent?: (type: string, payload: Record<string, unknown>) => void;
  delegateToModule?: (target: string, reason: string, content: string) => void;
}

export interface NexusDispatchExecutionNodeResult {
  nodeId: string;
  status: 'executed' | 'failed' | 'blocked_by_dependency' | 'requires_followup';
  targetModuleId: NexusActionPlanDispatchNode['targetModuleId'];
  sourceActionType: string;
  resolvedActionType: string | null;
  dependsOn: string[];
  reason?: string;
}

function buildParsedCommand(packet: NexusActionPlanExecutionPacket): ParsedCommandEnvelope {
  return CommandIntelligenceService.parse(packet.rawInput, {
    sourceModuleId: 'nexus',
  });
}

function getRetryLineage(packet: NexusActionPlanExecutionPacket): {
  rootPlanId: string;
  nextAttempt: number;
} {
  return {
    rootPlanId: packet.retryOfPlanId ?? packet.planId,
    nextAttempt: (packet.retryAttempt ?? 0) + 1,
  };
}

function formatRetryAttemptLabel(retryAttempt?: number): string | null {
  return retryAttempt ? `retry attempt ${retryAttempt}` : null;
}

function buildExecutionId(planId: string, nodeId: string): string {
  return `${planId}.${nodeId}.execution`;
}

function getRetryParentPlanId(packet: NexusActionPlanExecutionPacket): string | null {
  if (!packet.retryAttempt) return null;
  if (packet.retryAttempt <= 1) {
    return packet.retryOfPlanId ?? null;
  }
  const rootPlanId = packet.retryOfPlanId ?? packet.planId;
  return `${rootPlanId}.retry.${packet.retryAttempt - 1}`;
}

/**
 * DFS cycle detection over the dispatchPlan dependency graph.
 * Returns the set of nodeIds involved in at least one cycle.
 */
function detectDependencyCycles(dispatchPlan: NexusActionPlanDispatchNode[]): Set<string> {
  const adjList = new Map<string, string[]>();
  for (const node of dispatchPlan) {
    adjList.set(node.nodeId, node.dependsOn);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycleNodes = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (inStack.has(nodeId)) {
      cycleNodes.add(nodeId);
      return true;
    }
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    inStack.add(nodeId);
    for (const dep of adjList.get(nodeId) ?? []) {
      if (dfs(dep)) cycleNodes.add(nodeId);
    }
    inStack.delete(nodeId);
    return false;
  }

  for (const node of dispatchPlan) {
    if (!visited.has(node.nodeId)) dfs(node.nodeId);
  }

  return cycleNodes;
}

export class NexusActionDispatchExecutionService {
  static canExecutePacketDeterministically(packet: NexusActionPlanExecutionPacket): boolean {
    return packet.dispatchPlan.length > 0 && packet.dispatchPlan.every((node) => node.status === 'resolved');
  }

  static buildExecutionSummary(
    packet: NexusActionPlanExecutionPacket,
    results: NexusDispatchExecutionNodeResult[],
  ): string {
    const labelById = new Map(packet.nodes.map((node) => [node.id, node.label]));
    const executed = results.filter((result) => result.status === 'executed');
    const failed = results.filter((result) => result.status === 'failed');
    const blocked = results.filter((result) => result.status === 'blocked_by_dependency');
    const followup = results.filter((result) => result.status === 'requires_followup');

    const executedLabels = executed
      .map((result) => labelById.get(result.nodeId) ?? result.sourceActionType)
      .join(', ');

    if (failed.length === 0 && blocked.length === 0 && followup.length === 0) {
      return `Executed ${executed.length} planned action${executed.length === 1 ? '' : 's'}: ${executedLabels}.`;
    }

    const parts: string[] = [];
    if (executed.length > 0) {
      parts.push(`Executed: ${executedLabels}.`);
    }
    if (failed.length > 0) {
      parts.push(`Failed: ${failed.map((result) => labelById.get(result.nodeId) ?? result.sourceActionType).join(', ')}.`);
    }
    if (blocked.length > 0) {
      parts.push(`Blocked by dependencies: ${blocked.map((result) => labelById.get(result.nodeId) ?? result.sourceActionType).join(', ')}.`);
    }
    if (followup.length > 0) {
      parts.push(`Still needs follow-up: ${followup.map((result) => labelById.get(result.nodeId) ?? result.sourceActionType).join(', ')}.`);
    }
    const retryPacket = this.buildRetryPacket(packet, results);
    if (retryPacket) {
      parts.push(`Retry available for ${retryPacket.dispatchPlan.length} node${retryPacket.dispatchPlan.length === 1 ? '' : 's'}.`);
    }
    return parts.join(' ');
  }

  static buildRetryPacket(
    packet: NexusActionPlanExecutionPacket,
    results: NexusDispatchExecutionNodeResult[],
  ): NexusActionPlanExecutionPacket | null {
    const retryableNodeIds = new Set(
      results
        .filter((result) => result.status === 'failed' || result.status === 'blocked_by_dependency')
        .map((result) => result.nodeId),
    );
    if (retryableNodeIds.size === 0) return null;

    const retryNodes = packet.nodes.filter((node) => retryableNodeIds.has(node.id));
    const retryDispatchPlan = packet.dispatchPlan
      .filter((dispatch) => retryableNodeIds.has(dispatch.nodeId))
      .map((dispatch) => ({
        ...dispatch,
        dependsOn: dispatch.dependsOn.filter((dependencyId) => retryableNodeIds.has(dependencyId)),
        status: dispatch.resolvedActionType ? 'resolved' : dispatch.status,
      }));
    const { rootPlanId, nextAttempt } = getRetryLineage(packet);

    return {
      ...packet,
      planId: `${rootPlanId}.retry.${nextAttempt}`,
      retryOfPlanId: rootPlanId,
      retryAttempt: nextAttempt,
      title: `${packet.title.replace(/\s+\(retry(?:\s+\d+)?\)$/i, '')} (retry ${nextAttempt})`,
      summary: `Retry attempt ${nextAttempt} for ${retryDispatchPlan.length} blocked or failed node${retryDispatchPlan.length === 1 ? '' : 's'} from ${packet.title.replace(/\s+\(retry(?:\s+\d+)?\)$/i, '')}.`,
      nodes: retryNodes,
      dispatchPlan: retryDispatchPlan,
    };
  }

  static buildExecutionArtifacts(
    packet: NexusActionPlanExecutionPacket,
    results: NexusDispatchExecutionNodeResult[],
    timestamp: string,
  ): ThreadExecutionArtifact[] {
    const nodeById = new Map(packet.nodes.map((node) => [node.id, node]));
    const retryPacket = this.buildRetryPacket(packet, results);
    const retryableNodeIds = new Set(retryPacket?.dispatchPlan.map((dispatch) => dispatch.nodeId) ?? []);
    const retryPrompt = retryPacket
      ? serializeExecutionPacket(retryPacket, {
          instruction: `Retry attempt ${retryPacket.retryAttempt ?? 1} for the remaining action plan steps in the user's request: "${retryPacket.rawInput}"`,
          footer: 'Execute only the retry packet nodes that still need work, preserving their order and dependencies.',
        })
      : undefined;
    return results
      .filter((result) => result.status !== 'requires_followup')
      .map((result) => {
        const node = nodeById.get(result.nodeId);
        const retryAttemptLabel = formatRetryAttemptLabel(packet.retryAttempt);
        const summary = result.status === 'executed'
          ? `${node?.label ?? result.sourceActionType} executed${retryAttemptLabel ? ` on ${retryAttemptLabel}` : ''}.`
          : result.status === 'blocked_by_dependency'
            ? `${node?.label ?? result.sourceActionType} blocked by dependency${retryAttemptLabel ? ` on ${retryAttemptLabel}` : ''}.`
            : `${node?.label ?? result.sourceActionType} failed${retryAttemptLabel ? ` on ${retryAttemptLabel}` : ''}.`;
        return {
          id: `execution.${packet.planId}.${result.nodeId}`,
          threadId: packet.sourceThreadId,
          sourceModuleId: result.targetModuleId,
          actionType: result.resolvedActionType ?? result.sourceActionType,
          proposalId: `${packet.planId}.${result.nodeId}.proposal`,
          executionId: buildExecutionId(packet.planId, result.nodeId),
          requestedAt: timestamp,
          resolvedAt: timestamp,
          status:
            result.status === 'executed'
              ? 'executed'
              : result.status === 'blocked_by_dependency'
                ? 'blocked'
                : 'failed',
          summary,
          patientScope: 'USER',
          errorMessage: result.status === 'failed' || result.status === 'blocked_by_dependency'
            ? result.reason
            : undefined,
          retryable: retryableNodeIds.has(result.nodeId),
          retrySummary: retryableNodeIds.has(result.nodeId)
            ? `Retry attempt ${retryPacket?.retryAttempt ?? 1} available.`
            : undefined,
          retryPrompt: retryableNodeIds.has(result.nodeId) ? retryPrompt : undefined,
          retryVisibleContent: retryableNodeIds.has(result.nodeId) ? retryPacket?.summary : undefined,
          retryOfPlanId: packet.retryOfPlanId,
          retryAttempt: packet.retryAttempt,
          retryParentExecutionId: getRetryParentPlanId(packet)
            ? buildExecutionId(getRetryParentPlanId(packet)!, result.nodeId)
            : undefined,
        };
      });
  }

  static async executePacket(
    packet: NexusActionPlanExecutionPacket,
    context: NexusDispatchExecutionContext,
  ): Promise<NexusDispatchExecutionNodeResult[]> {
    const parsedCommand = buildParsedCommand(packet);
    const results = new Map<string, NexusDispatchExecutionNodeResult>();

    // Detect dependency cycles before executing — a cycle causes infinite blocking.
    const cycleNodeIds = detectDependencyCycles(packet.dispatchPlan);
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
        emitSpineEvent: (type, payload) => context.emitSpineEvent?.(type, payload),
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
