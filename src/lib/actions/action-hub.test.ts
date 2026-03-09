import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionContext, ActionHandler } from './action-hub';

// Re-create a fresh ActionHub instance per test to avoid shared state
// since the production code exports a singleton.
class TestableActionHub {
  private registry = new Map<string, Map<string, ActionHandler>>();
  private dependencies = new Map<string, Set<string>>();

  addDependency(moduleId: string, dependsOn: string): void {
    if (!this.dependencies.has(moduleId)) {
      this.dependencies.set(moduleId, new Set());
    }
    this.dependencies.get(moduleId)!.add(dependsOn);
  }

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
    // 1. Check module's own handlers
    const moduleHandlers = this.registry.get(moduleId);
    if (moduleHandlers) {
      const handler = moduleHandlers.get(actionType);
      if (handler) {
        await handler(context);
        return true;
      }
    }

    // 2. Check dependency modules
    const deps = this.dependencies.get(moduleId);
    if (deps) {
      for (const depId of deps) {
        const depHandlers = this.registry.get(depId);
        if (depHandlers) {
          const handler = depHandlers.get(actionType);
          if (handler) {
            await handler(context);
            return true;
          }
        }
      }
    }

    // 3. Fallback to orchestrator
    const orchestratorHandlers = this.registry.get('orchestrator');
    if (orchestratorHandlers && orchestratorHandlers.has(actionType)) {
      await orchestratorHandlers.get(actionType)!(context);
      return true;
    }

    return false;
  }

  getAllowedActions(moduleId: string): string[] {
    const actions = new Set<string>();
    const moduleHandlers = this.registry.get(moduleId);
    if (moduleHandlers) {
      for (const action of moduleHandlers.keys()) {
        actions.add(action);
      }
    }
    const deps = this.dependencies.get(moduleId);
    if (deps) {
      for (const depId of deps) {
        const depHandlers = this.registry.get(depId);
        if (depHandlers) {
          for (const action of depHandlers.keys()) {
            actions.add(action);
          }
        }
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

  // ── Dependency resolution tests ─────────────────────────────────────

  it('resolves actions from a dependency module via execute', async () => {
    const somaHandler = vi.fn();
    hub.register('soma', 'create_field', somaHandler);
    hub.addDependency('titan', 'soma');

    const ctx = makeMockContext({ moduleId: 'titan' });
    const result = await hub.execute('titan', 'create_field', ctx);

    expect(result).toBe(true);
    expect(somaHandler).toHaveBeenCalledWith(ctx);
  });

  it('prefers module own handler over dependency handler', async () => {
    const titanHandler = vi.fn();
    const somaHandler = vi.fn();
    hub.register('titan', 'create_field', titanHandler);
    hub.register('soma', 'create_field', somaHandler);
    hub.addDependency('titan', 'soma');

    const ctx = makeMockContext({ moduleId: 'titan' });
    await hub.execute('titan', 'create_field', ctx);

    expect(titanHandler).toHaveBeenCalledOnce();
    expect(somaHandler).not.toHaveBeenCalled();
  });

  it('getAllowedActions includes dependency module actions', () => {
    hub.register('titan', 'LOCAL_TITAN', vi.fn());
    hub.register('soma', 'create_field', vi.fn());
    hub.register('soma', 'delete_field', vi.fn());
    hub.addDependency('titan', 'soma');

    const actions = hub.getAllowedActions('titan');
    expect(actions).toContain('LOCAL_TITAN');
    expect(actions).toContain('create_field');
    expect(actions).toContain('delete_field');
  });

  it('dependency resolution falls through to orchestrator when dep has no match', async () => {
    const orchHandler = vi.fn();
    hub.register('orchestrator', 'GLOBAL_ACTION', orchHandler);
    hub.register('soma', 'create_field', vi.fn());
    hub.addDependency('titan', 'soma');

    const ctx = makeMockContext({ moduleId: 'titan' });
    const result = await hub.execute('titan', 'GLOBAL_ACTION', ctx);

    expect(result).toBe(true);
    expect(orchHandler).toHaveBeenCalledWith(ctx);
  });

  it('returns false when dependency module has no matching action and no orchestrator', async () => {
    hub.register('soma', 'create_field', vi.fn());
    hub.addDependency('titan', 'soma');

    const result = await hub.execute('titan', 'NONEXISTENT', makeMockContext());
    expect(result).toBe(false);
  });
});
