import type { ParsedCommandEnvelope, ParsedCommandIntent } from '@/lib/contracts/command-intelligence';
import type { ModuleId } from '@/lib/module-manifest';

export interface AraActionPlanNode {
  id: string;
  intentId: string;
  intentType: ParsedCommandIntent['intentType'];
  label: string;
  summary: string;
  targetModuleId: ModuleId;
  supportingModuleIds: ModuleId[];
  actionType: string;
  mutatesState: boolean;
  canRunInParallel: boolean;
  dependsOn: string[];
  payload: Record<string, unknown>;
}

export interface AraActionPlan {
  id: string;
  sourceThreadId: string;
  parsedCommand: ParsedCommandEnvelope;
  title: string;
  summary: string;
  primaryTargetModuleId: ModuleId;
  supportingTargetModuleIds: ModuleId[];
  requiresApproval: boolean;
  nodes: AraActionPlanNode[];
}

export interface AraActionPlanDispatchNode {
  nodeId: string;
  targetModuleId: ModuleId;
  sourceActionType: string;
  resolvedActionType: string | null;
  payload: Record<string, unknown>;
  dependsOn: string[];
  status: 'resolved' | 'requires_followup';
  reason?: string;
}

export interface AraActionPlanExecutionPacket {
  type: 'ara_action_plan';
  version: 1;
  planId: string;
  retryOfPlanId?: string;
  retryAttempt?: number;
  sourceThreadId: string;
  title: string;
  summary: string;
  rawInput: string;
  primaryTargetModuleId: ModuleId;
  supportingTargetModuleIds: ModuleId[];
  requiresApproval: boolean;
  nodes: AraActionPlanNode[];
  dispatchPlan: AraActionPlanDispatchNode[];
}
