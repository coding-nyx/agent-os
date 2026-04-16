import type {
  AraActionPlan,
  AraActionPlanDispatchNode,
  AraActionPlanExecutionPacket,
  AraActionPlanNode,
} from '@/lib/contracts/ara-action-plan';
import type { ModuleId } from '@/lib/module-manifest';
import { AgentRegistryService } from '@/lib/agents/agent-registry';
import { AraActionDispatchServiceJs } from '@cortex-logic';

// Deterministic dispatch map is sourced from KMP when available.
const _dispatch = AraActionDispatchServiceJs ? new AraActionDispatchServiceJs() : null;

function canDeterministicallyDispatch(moduleId: ModuleId, actionType: string): boolean {
  if (!_dispatch) return false; // conservative: requires_followup when KMP unavailable
  return _dispatch.canDispatchDeterministically(moduleId, actionType);
}

function resolveNode(node: AraActionPlanNode): AraActionPlanDispatchNode {
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

export class AraActionDispatchService {
  static resolvePlan(plan: AraActionPlan): AraActionPlanDispatchNode[] {
    return plan.nodes.map(resolveNode);
  }

  static resolvePacket(packet: AraActionPlanExecutionPacket): AraActionPlanDispatchNode[] {
    return packet.nodes.map(resolveNode);
  }
}
