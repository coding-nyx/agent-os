import type { ParsedCommandEnvelope, ParsedCommandIntent } from '@/lib/contracts/command-intelligence';
import type { ModuleId } from '@/lib/module-manifest';

export interface NexusActionPlanNode {
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

export interface NexusActionPlan {
  id: string;
  sourceThreadId: string;
  parsedCommand: ParsedCommandEnvelope;
  title: string;
  summary: string;
  primaryTargetModuleId: ModuleId;
  supportingTargetModuleIds: ModuleId[];
  requiresApproval: boolean;
  nodes: NexusActionPlanNode[];
}

export interface NexusActionPlanDispatchNode {
  nodeId: string;
  targetModuleId: ModuleId;
  sourceActionType: string;
  resolvedActionType: string | null;
  payload: Record<string, unknown>;
  dependsOn: string[];
  status: 'resolved' | 'requires_followup';
  reason?: string;
}

export interface NexusActionPlanExecutionPacket {
  type: 'nexus_action_plan';
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
  nodes: NexusActionPlanNode[];
  dispatchPlan: NexusActionPlanDispatchNode[];
}
