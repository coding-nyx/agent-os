import type {
  NexusActionPlan,
  NexusActionPlanDispatchNode,
  NexusActionPlanExecutionPacket,
  NexusActionPlanNode,
} from '@/lib/contracts/nexus-action-plan';
import type { ModuleId } from '@/lib/module-manifest';
import { AgentRegistryService } from '@/lib/agents/agent-registry';
import { NexusActionDispatchServiceJs } from '@cortex-logic';

// Deterministic dispatch map is now sourced from KMP.
const _dispatch = new NexusActionDispatchServiceJs();

function canDeterministicallyDispatch(moduleId: ModuleId, actionType: string): boolean {
  return _dispatch.canDispatchDeterministically(moduleId, actionType);
}

function resolveNode(node: NexusActionPlanNode): NexusActionPlanDispatchNode {
  const resolved = AgentRegistryService.resolveActionForProvider(
    node.targetModuleId,
    node.actionType,
    node.payload,
  );

  if (!canDeterministicallyDispatch(node.targetModuleId, resolved.actionType)) {
    return {
      nodeId: node.id,
      targetModuleId: node.targetModuleId,
      sourceActionType: node.actionType,
      resolvedActionType: null,
      payload: node.payload,
      dependsOn: node.dependsOn,
      status: 'requires_followup',
      reason: `No deterministic handler mapping exists yet for ${node.targetModuleId}.${node.actionType}.`,
    };
  }

  return {
    nodeId: node.id,
    targetModuleId: node.targetModuleId,
    sourceActionType: node.actionType,
    resolvedActionType: resolved.actionType,
    payload: resolved.payload,
    dependsOn: node.dependsOn,
    status: 'resolved',
  };
}

export class NexusActionDispatchService {
  static resolvePlan(plan: NexusActionPlan): NexusActionPlanDispatchNode[] {
    return plan.nodes.map(resolveNode);
  }

  static resolvePacket(packet: NexusActionPlanExecutionPacket): NexusActionPlanDispatchNode[] {
    return packet.nodes.map(resolveNode);
  }
}
