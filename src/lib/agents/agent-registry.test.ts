import { afterEach, describe, expect, it } from 'vitest';
import { AgentRegistryService } from './agent-registry';

describe('AgentRegistryService', () => {
  afterEach(() => {
    AgentRegistryService.resetForTests();
  });

  it('resolves atlas as the primary provider for daily planning', () => {
    const provider = AgentRegistryService.resolvePrimaryProvider(['daily-planning']);
    expect(provider?.moduleId).toBe('atlas');
  });

  it('returns ordered recovery-planning providers for cross-agent support', () => {
    const providers = AgentRegistryService.resolveProvidersForCapabilities(['recovery-planning']);
    expect(providers.map((provider) => provider.moduleId)).toEqual(['atlas', 'agnes', 'soma']);
  });

  it('prefers candidate modules when resolving provider order', () => {
    const providers = AgentRegistryService.resolveProvidersForCapabilities(
      ['recovery-planning'],
      { preferredModuleIds: ['soma', 'agnes', 'atlas'] },
    );
    expect(providers.map((provider) => provider.moduleId)).toEqual(['soma', 'agnes', 'atlas']);
  });

  it('translates generic action aliases for provider execution adapters', () => {
    const resolved = AgentRegistryService.resolveActionForProvider('atlas', 'schedule_item', {
      title: 'Cooking',
      date: '2026-03-25',
      time: '11:00',
    });

    expect(resolved.actionType).toBe('schedule_block');
    expect(resolved.payload).toMatchObject({
      title: 'Cooking',
      scheduledAt: '2026-03-25T11:00:00',
      duration: 60,
      category: 'other',
    });
  });
});
