import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionContext, ActionHandler } from './action-hub';

// Re-create a fresh ActionHub instance per test to avoid shared state
// since the production code exports a singleton.
class TestableActionHub {
  private registry = new Map<string, Map<string, ActionHandler>>();

  register(moduleId: string, actionType: string, handler: ActionHandler) {
    if (!this.registry.has(moduleId)) {
      this.registry.set(moduleId, new Map());
    }
    this.registry.get(moduleId)!.set(actionType, handler);
  }

  registerMultiple(moduleId: string, handlers: Record<string, ActionHandler>) {
    Object.entries(handlers).forEach(([actionType, handler]) => {
      this.register(moduleId, actionType, handler);
    });
  }

  async execute(moduleId: string, actionType: string, context: ActionContext): Promise<boolean> {
    const moduleHandlers = this.registry.get(moduleId);
    if (!moduleHandlers) {
      const orchestratorHandlers = this.registry.get('orchestrator');
      if (orchestratorHandlers && orchestratorHandlers.has(actionType)) {
        await orchestratorHandlers.get(actionType)!(context);
        return true;
      }
      return false;
    }

    const handler = moduleHandlers.get(actionType);
    if (!handler) {
      const orchestratorHandlers = this.registry.get('orchestrator');
      if (orchestratorHandlers && orchestratorHandlers.has(actionType)) {
        await orchestratorHandlers.get(actionType)!(context);
        return true;
      }
      return false;
    }

    await handler(context);
    return true;
  }

  getAllowedActions(moduleId: string): string[] {
    const actions = new Set<string>();
    const moduleHandlers = this.registry.get(moduleId);
    if (moduleHandlers) {
      for (const action of moduleHandlers.keys()) {
        actions.add(action);
      }
    }
    const orchestratorHandlers = this.registry.get('orchestrator');
    if (orchestratorHandlers) {
      for (const action of orchestratorHandlers.keys()) {
        actions.add(action);
      }
    }
    return Array.from(actions);
  }
}

function makeMockContext(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    userId: 'u1',
    isGuest: false,
    moduleId: 'agnes',
    payload: {},
    emitSpineEvent: vi.fn(),
    updateGlobalSoul: vi.fn().mockResolvedValue(undefined),
    delegateToModule: vi.fn(),
    ...overrides,
  };
}

describe('ModuleActionHub', () => {
  let hub: TestableActionHub;

  beforeEach(() => {
    hub = new TestableActionHub();
  });

  it('registers and executes a module handler', async () => {
    const handler = vi.fn();
    hub.register('agnes', 'UPDATE_MOOD', handler);

    const ctx = makeMockContext();
    const result = await hub.execute('agnes', 'UPDATE_MOOD', ctx);

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledWith(ctx);
  });

  it('returns false for unregistered module', async () => {
    const result = await hub.execute('unknown', 'SOME_ACTION', makeMockContext());
    expect(result).toBe(false);
  });

  it('returns false for unregistered action on a known module (no orchestrator fallback)', async () => {
    hub.register('agnes', 'KNOWN_ACTION', vi.fn());
    const result = await hub.execute('agnes', 'UNKNOWN_ACTION', makeMockContext());
    expect(result).toBe(false);
  });

  it('falls back to orchestrator handler when module handler is missing', async () => {
    const orchHandler = vi.fn();
    hub.register('orchestrator', 'GLOBAL_ACTION', orchHandler);
    hub.register('agnes', 'LOCAL_ACTION', vi.fn());

    const ctx = makeMockContext();
    const result = await hub.execute('agnes', 'GLOBAL_ACTION', ctx);

    expect(result).toBe(true);
    expect(orchHandler).toHaveBeenCalledWith(ctx);
  });

  it('falls back to orchestrator when module is not registered at all', async () => {
    const orchHandler = vi.fn();
    hub.register('orchestrator', 'GLOBAL_ACTION', orchHandler);

    const ctx = makeMockContext();
    const result = await hub.execute('unknown_module', 'GLOBAL_ACTION', ctx);

    expect(result).toBe(true);
    expect(orchHandler).toHaveBeenCalledWith(ctx);
  });

  it('registerMultiple registers several handlers at once', async () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    hub.registerMultiple('titan', { SET_ROUTINE: h1, UPDATE_PR: h2 });

    await hub.execute('titan', 'SET_ROUTINE', makeMockContext());
    await hub.execute('titan', 'UPDATE_PR', makeMockContext());

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('getAllowedActions merges module and orchestrator actions', () => {
    hub.register('agnes', 'LOCAL_A', vi.fn());
    hub.register('agnes', 'LOCAL_B', vi.fn());
    hub.register('orchestrator', 'GLOBAL_C', vi.fn());

    const actions = hub.getAllowedActions('agnes');
    expect(actions).toContain('LOCAL_A');
    expect(actions).toContain('LOCAL_B');
    expect(actions).toContain('GLOBAL_C');
  });

  it('getAllowedActions returns only orchestrator actions for unknown module', () => {
    hub.register('orchestrator', 'GLOBAL_ONLY', vi.fn());

    const actions = hub.getAllowedActions('unknown');
    expect(actions).toEqual(['GLOBAL_ONLY']);
  });
});
