import { AgentRegistryJs } from '@cortex-logic';
import type { AgentCapability, AgentProviderDescriptor, ActionPayloadAdapter } from './agent-capability';
import type { ModuleId } from '@/lib/module-manifest';

// Re-export ActionPayloadAdapter so callers that import it from this module
// continue to compile without change.
export type { ActionPayloadAdapter };

const _service = new AgentRegistryJs();
const _providerAdapterRegistry = new Map<string, AgentProviderDescriptor['actionPayloadAdapters']>();

export const AgentRegistryService = {
  listProviders(): AgentProviderDescriptor[] {
    return JSON.parse(_service.listProviders()) as AgentProviderDescriptor[];
  },

  getProviderByModule(moduleId: ModuleId | 'nexus'): AgentProviderDescriptor | null {
    const result = _service.getProviderByModule(moduleId);
    return result === '' || result === 'null' ? null : (JSON.parse(result) as AgentProviderDescriptor);
  },

  registerProvider(provider: AgentProviderDescriptor): void {
    // actionPayloadAdapters are functions and cannot be serialised across the
    // KMP boundary. Strip them before delegating; the KMP layer manages its own
    // adapter registry for the fields it controls.
    const { actionPayloadAdapters: _dropped, ...serialisable } = provider;
    _service.registerProvider(JSON.stringify(serialisable));
    _providerAdapterRegistry.set(provider.moduleId, provider.actionPayloadAdapters);
  },

  getCapabilitiesForModule(moduleId: ModuleId | 'nexus'): AgentCapability[] {
    return Array.from(_service.getCapabilitiesForModule(moduleId)) as AgentCapability[];
  },

  getProvidersForCapability(
    capability: AgentCapability,
    options?: { preferredModuleIds?: Array<ModuleId | 'nexus'> },
  ): AgentProviderDescriptor[] {
    const preferredJson = options?.preferredModuleIds
      ? JSON.stringify(options.preferredModuleIds)
      : null;
    return JSON.parse(
      _service.getProvidersForCapability(capability, preferredJson),
    ) as AgentProviderDescriptor[];
  },

  resolveProvidersForCapabilities(
    capabilities: AgentCapability[],
    options?: { preferredModuleIds?: Array<ModuleId | 'nexus'> },
  ): AgentProviderDescriptor[] {
    const preferredJson = options?.preferredModuleIds
      ? JSON.stringify(options.preferredModuleIds)
      : null;
    return JSON.parse(
      _service.resolveProvidersForCapabilities(JSON.stringify(capabilities), preferredJson),
    ) as AgentProviderDescriptor[];
  },

  resolvePrimaryProvider(
    capabilities: AgentCapability[],
    options?: { preferredModuleIds?: Array<ModuleId | 'nexus'> },
  ): AgentProviderDescriptor | null {
    const preferredJson = options?.preferredModuleIds
      ? JSON.stringify(options.preferredModuleIds)
      : null;
    const result = _service.resolvePrimaryProvider(JSON.stringify(capabilities), preferredJson);
    return result === '' || result === 'null' ? null : (JSON.parse(result) as AgentProviderDescriptor);
  },

  resolveActionAlias(moduleId: ModuleId | 'nexus', actionType: string): string {
    return _service.resolveActionAlias(moduleId, actionType) as string;
  },

  /**
   * Resolves the aliased action type AND runs the payload through any registered
   * adapter for the provider.
   *
   * actionPayloadAdapters are TS functions and cannot cross the KMP boundary.
   * This method applies them on the TS side, after obtaining the alias from KMP.
   */
  resolveActionForProvider(
    moduleId: ModuleId | 'nexus',
    actionType: string,
    payload: Record<string, unknown>,
  ): { actionType: string; payload: Record<string, unknown> } {
    const alias = this.resolveActionAlias(moduleId, actionType);
    const provider = this.getProviderByModule(moduleId);
    const adapters = provider?.actionPayloadAdapters ?? _providerAdapterRegistry.get(moduleId);
    const adapter = adapters?.[actionType];
    if (!adapter && moduleId === 'atlas' && actionType === 'schedule_item') {
      const title = typeof payload.title === 'string' ? payload.title : '';
      const date = typeof payload.date === 'string' ? payload.date : '';
      const time = typeof payload.time === 'string' ? payload.time : '09:00';
      const scheduledAt = date ? `${date}T${time}:00` : undefined;
      return {
        actionType: alias,
        payload: {
          title,
          ...(scheduledAt ? { scheduledAt } : {}),
          duration: typeof payload.duration === 'number' ? payload.duration : 60,
          category: typeof payload.category === 'string' ? payload.category : 'other',
          sourceSegment: payload.sourceSegment,
        },
      };
    }
    if (!adapter && moduleId === 'atlas' && actionType === 'recovery_day') {
      const date = typeof payload.date === 'string' ? payload.date : null;
      const time = typeof payload.time === 'string' ? payload.time : null;
      const flattenedUntil =
        date && time
          ? `${date}T${time}:00`
          : date
            ? `${date}T23:59:59`
            : new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      return {
        actionType: alias,
        payload: {
          flattenedUntil,
          activeLoad: 2,
          sourceSegment: payload.sourceSegment,
        },
      };
    }
    return {
      actionType: alias,
      payload: adapter ? adapter(payload) : payload,
    };
  },

  resetForTests(): void {
    _providerAdapterRegistry.clear();
    // Exposed for test harnesses. KMP service must support this method;
    // if it does not yet, this is a no-op placeholder that keeps the contract.
    const maybeService = _service as unknown as { resetForTests?: () => void };
    if (typeof maybeService.resetForTests === 'function') {
      maybeService.resetForTests();
    }
  },
};
