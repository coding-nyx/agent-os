import type { CommandCapability } from '@/lib/contracts/command-intelligence';
import type { ModuleId } from '@/lib/module-manifest';

export type AgentCapability = CommandCapability;
export type ActionPayloadAdapter = (payload: Record<string, unknown>) => Record<string, unknown>;

export interface AgentProviderDescriptor {
  id: string;
  moduleId: ModuleId | 'nexus';
  title: string;
  capabilities: AgentCapability[];
  actionAliases?: Partial<Record<string, string>>;
  actionPayloadAdapters?: Partial<Record<string, ActionPayloadAdapter>>;
  precedence: number;
  latencyTier: 'fast' | 'balanced' | 'heavy';
}
