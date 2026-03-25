import type { AgentCapability, AgentProviderDescriptor, ActionPayloadAdapter } from './agent-capability';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';

const atlasScheduleItemAdapter: ActionPayloadAdapter = (payload) => {
  const date = typeof payload.date === 'string' ? payload.date : undefined;
  const time = typeof payload.time === 'string' ? payload.time : undefined;
  const scheduledAt =
    date && time
      ? `${date}T${time}:00`
      : date
        ? `${date}T09:00:00`
        : time
          ? new Date(`1970-01-01T${time}:00`).toISOString()
          : new Date().toISOString();

  return {
    title: payload.title,
    scheduledAt,
    duration: typeof payload.duration === 'number' ? payload.duration : 60,
    category: typeof payload.category === 'string' ? payload.category : 'other',
    sourceSegment: payload.sourceSegment,
  };
};

const atlasRecoveryDayAdapter: ActionPayloadAdapter = (payload) => {
  const date = typeof payload.date === 'string' ? payload.date : null;
  const time = typeof payload.time === 'string' ? payload.time : null;
  const flattenedUntil =
    date && time
      ? `${date}T${time}:00`
      : date
        ? `${date}T23:59:59`
        : new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  return {
    flattenedUntil,
    activeLoad: 2,
    sourceSegment: payload.sourceSegment,
  };
};

const DEFAULT_AGENT_PROVIDERS: AgentProviderDescriptor[] = [
  {
    id: 'nexus-orchestrator',
    moduleId: 'nexus',
    title: MODULE_MANIFEST.nexus.title,
    capabilities: ['general-orchestration', 'reminder-management'],
    precedence: 0,
    latencyTier: 'fast',
  },
  {
    id: 'atlas-planner',
    moduleId: 'atlas',
    title: MODULE_MANIFEST.atlas.title,
    capabilities: ['daily-planning', 'schedule-mutation', 'recovery-planning', 'reminder-management'],
    actionAliases: {
      schedule_item: 'schedule_block',
      recovery_day: 'flatten_schedule',
    },
    actionPayloadAdapters: {
      schedule_item: atlasScheduleItemAdapter,
      recovery_day: atlasRecoveryDayAdapter,
    },
    precedence: 10,
    latencyTier: 'balanced',
  },
  {
    id: 'agnes-guide',
    moduleId: 'agnes',
    title: MODULE_MANIFEST.agnes.title,
    capabilities: ['emotional-support', 'recovery-planning'],
    precedence: 20,
    latencyTier: 'balanced',
  },
  {
    id: 'titan-coach',
    moduleId: 'titan',
    title: MODULE_MANIFEST.titan.title,
    capabilities: ['fitness-planning', 'medical-review'],
    precedence: 30,
    latencyTier: 'balanced',
  },
  {
    id: 'soma-review',
    moduleId: 'soma',
    title: MODULE_MANIFEST.soma.title,
    capabilities: ['recovery-planning'],
    precedence: 40,
    latencyTier: 'balanced',
  },
  {
    id: 'ledger-planner',
    moduleId: 'ledger',
    title: MODULE_MANIFEST.ledger.title,
    capabilities: ['financial-planning'],
    precedence: 50,
    latencyTier: 'balanced',
  },
  {
    id: 'scout-research',
    moduleId: 'scout',
    title: MODULE_MANIFEST.scout.title,
    capabilities: ['research', 'research-enrichment'],
    precedence: 60,
    latencyTier: 'heavy',
  },
  {
    id: 'forge-builder',
    moduleId: 'forge',
    title: MODULE_MANIFEST.forge.title,
    capabilities: ['technical-work'],
    precedence: 70,
    latencyTier: 'heavy',
  },
];

function uniqueCapabilities(capabilities: AgentCapability[]): AgentCapability[] {
  return Array.from(new Set(capabilities));
}

function uniqueModuleIds(moduleIds: Array<ModuleId | 'nexus'>): Array<ModuleId | 'nexus'> {
  return Array.from(new Set(moduleIds));
}

function sortProviders(
  providers: AgentProviderDescriptor[],
  preferredModuleIds?: Array<ModuleId | 'nexus'>,
): AgentProviderDescriptor[] {
  const preferenceIndex = new Map(
    (preferredModuleIds ?? []).map((moduleId, index) => [moduleId, index]),
  );

  return [...providers].sort((left, right) => {
    const leftPreferred = preferenceIndex.get(left.moduleId);
    const rightPreferred = preferenceIndex.get(right.moduleId);
    if (leftPreferred !== undefined || rightPreferred !== undefined) {
      if (leftPreferred === undefined) return 1;
      if (rightPreferred === undefined) return -1;
      if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred;
    }
    return left.precedence - right.precedence;
  });
}

class AgentRegistry {
  private providers = new Map<string, AgentProviderDescriptor>();
  private bootstrapped = false;

  private ensureDefaults(): void {
    if (this.bootstrapped) return;
    this.bootstrapped = true;
    for (const provider of DEFAULT_AGENT_PROVIDERS) {
      this.providers.set(provider.id, provider);
    }
  }

  listProviders(): AgentProviderDescriptor[] {
    this.ensureDefaults();
    return Array.from(this.providers.values()).sort((left, right) => left.precedence - right.precedence);
  }

  getProviderByModule(moduleId: ModuleId | 'nexus'): AgentProviderDescriptor | null {
    this.ensureDefaults();
    return this.listProviders().find((provider) => provider.moduleId === moduleId) ?? null;
  }

  registerProvider(provider: AgentProviderDescriptor): void {
    this.ensureDefaults();
    const existing = this.providers.get(provider.id);
    this.providers.set(provider.id, existing
        ? {
            ...existing,
            ...provider,
            capabilities: uniqueCapabilities([...existing.capabilities, ...provider.capabilities]),
            actionAliases: {
              ...existing.actionAliases,
              ...provider.actionAliases,
            },
            actionPayloadAdapters: {
              ...existing.actionPayloadAdapters,
              ...provider.actionPayloadAdapters,
            },
          }
        : {
            ...provider,
            capabilities: uniqueCapabilities(provider.capabilities),
        });
  }

  getCapabilitiesForModule(moduleId: ModuleId | 'nexus'): AgentCapability[] {
    this.ensureDefaults();
    return uniqueCapabilities(
      this.listProviders()
        .filter((provider) => provider.moduleId === moduleId)
        .flatMap((provider) => provider.capabilities),
    );
  }

  getProvidersForCapability(
    capability: AgentCapability,
    options?: { preferredModuleIds?: Array<ModuleId | 'nexus'> },
  ): AgentProviderDescriptor[] {
    this.ensureDefaults();
    const matches = this.listProviders().filter((provider) => provider.capabilities.includes(capability));
    return sortProviders(matches, options?.preferredModuleIds);
  }

  resolveProvidersForCapabilities(
    capabilities: AgentCapability[],
    options?: { preferredModuleIds?: Array<ModuleId | 'nexus'> },
  ): AgentProviderDescriptor[] {
    this.ensureDefaults();
    const moduleIds = uniqueModuleIds(
      capabilities.flatMap((capability) =>
        this.getProvidersForCapability(capability, options).map((provider) => provider.moduleId),
      ),
    );
    return moduleIds
      .map((moduleId) => this.getProviderByModule(moduleId))
      .filter((provider): provider is AgentProviderDescriptor => provider !== null)
      .sort((left, right) => {
        const sorted = sortProviders([left, right], options?.preferredModuleIds);
        return sorted[0]?.id === left.id ? -1 : 1;
      });
  }

  resolvePrimaryProvider(
    capabilities: AgentCapability[],
    options?: { preferredModuleIds?: Array<ModuleId | 'nexus'> },
  ): AgentProviderDescriptor | null {
    return this.resolveProvidersForCapabilities(capabilities, options)[0] ?? null;
  }

  resolveActionForProvider(
    moduleId: ModuleId | 'nexus',
    actionType: string,
    payload: Record<string, unknown>,
  ): { actionType: string; payload: Record<string, unknown> } {
    const provider = this.getProviderByModule(moduleId);
    const alias = provider?.actionAliases?.[actionType] ?? actionType;
    const adapter = provider?.actionPayloadAdapters?.[actionType];
    return {
      actionType: alias,
      payload: adapter ? adapter(payload) : payload,
    };
  }

  resetForTests(): void {
    this.providers.clear();
    this.bootstrapped = false;
  }
}

export const AgentRegistryService = new AgentRegistry();
