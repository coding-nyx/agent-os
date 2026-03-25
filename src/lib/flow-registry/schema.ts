import type { ModuleId } from '@/lib/module-manifest';
import type { CommandIntentType, CommandCapability } from '@/lib/contracts/command-intelligence';
import type { SpineEventType } from '@/lib/types';

export type FlowRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type FlowVisibility = 'silent' | 'standard' | 'audited';
export type FlowMutability = 'read' | 'write';

export interface FlowEventSpec {
  type: SpineEventType;
  description?: string;
  visibility: FlowVisibility;
  producedBy: ModuleId[];
  consumedBy: ModuleId[];
  source?: 'curated' | 'heuristic';
}

export interface FlowActionSpec {
  actionType: string;
  label: string;
  moduleId: ModuleId;
  mutability: FlowMutability;
  risk: FlowRiskLevel;
  emits?: SpineEventType[];
  dependsOnEvents?: SpineEventType[];
  status?: 'planned' | 'implemented';
  source?: 'curated' | 'heuristic';
}

export interface FlowProposalSpec {
  proposalType: string;
  sourceModule: ModuleId | 'nexus';
  requiresApproval: boolean;
  lifecycleEvents: SpineEventType[];
}

export interface FlowIntentSpec {
  intentType: CommandIntentType;
  capabilities: CommandCapability[];
  primaryModule: ModuleId;
  supportingModules?: ModuleId[];
  defaultActionTypes?: string[];
  fallbackProposalType?: string;
}

export interface FlowRegistrySchema {
  intents: FlowIntentSpec[];
  actions: FlowActionSpec[];
  events: FlowEventSpec[];
  proposals: FlowProposalSpec[];
}

// Placeholder: the actual registry will be defined in Phase 1.
export const FLOW_REGISTRY: FlowRegistrySchema = {
  intents: [],
  actions: [],
  events: [],
  proposals: [],
};
