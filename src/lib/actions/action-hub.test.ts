import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionHub } from './action-hub';
import type { ActionContext, ActionHandler } from './action-hub';
import type { ActionOrchestrationMetadata } from '@/lib/contracts/orchestration';
import { AgentRegistryService } from '@/lib/agents/agent-registry';
import { OrchestrationExecutionService } from '@/lib/services/orchestration-execution-service';

vi.mock('@/lib/services/orchestration-execution-service', () => ({
  OrchestrationExecutionService: {
    recordFailure: vi.fn(),
    recordMissingHandlerFailure: vi.fn(),
    createResumableSnapshot: vi.fn(),
  },
}));

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

    // 3. Fallback to nexus
    const orchestratorHandlers = this.registry.get('nexus');
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
    const orchestratorHandlers = this.registry.get('nexus');
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

function makeOrchestrationMetadata(): ActionOrchestrationMetadata {
  return {
    actionType: 'UPDATE_MOOD',
    activeThreadId: 'thread-1',
    autopilotLevel: 4,
    proposal: {
      id: 'proposal-1',
      source: 'agnes',
      intent: 'Update mood',
      confidence: 0.9,
      patientScope: 'USER',
      createdAt: '2024-01-01T00:00:00.000Z',
      metadata: { mutatesState: true },
      vectorMutations: { vitality: 0 },
    },
    proposalCard: {
      id: 'card-1',
      proposalId: 'proposal-1',
      title: 'Update mood',
      summary: 'Update mood requested by agnes.',
      source: 'agnes',
      status: 'approved',
      approvalRequirement: { required: false, reason: 'none' },
      executionMode: 'autonomous',
      historyMode: 'standard',
    },
    approvalRequirement: { required: false, reason: 'none' },
    executionMode: 'autonomous',
    historyMode: 'standard',
    patientScope: 'USER',
    execution: {
      id: 'exec-1',
      proposalId: 'proposal-1',
      source: 'agnes',
      autopilotLevel: 4,
      executionMode: 'autonomous',
      historyMode: 'standard',
      patientScope: 'USER',
      executedAt: '2024-01-01T00:00:00.000Z',
      status: 'executed',
    },
    mutatesState: true,
    highRisk: false,
    dispatchStatus: 'approved',
    runtime: {
      autopilotLevel: 4,
      autonomy: 'supervised_autonomy',
      disposition: 'visible_execution',
      historyDestination: 'standard',
      willPersistHistory: true,
      shouldNotifyUser: true,
    },
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

  it('preserves orchestration metadata on dispatched action contexts', async () => {
    const handler = vi.fn();
    hub.register('agnes', 'UPDATE_MOOD', handler);

    const orchestration = makeOrchestrationMetadata();
    const ctx = makeMockContext({ orchestration });
    await hub.execute('agnes', 'UPDATE_MOOD', ctx);

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ orchestration }));
  });

  it('returns false for unregistered module', async () => {
    const result = await hub.execute('unknown', 'SOME_ACTION', makeMockContext());
    expect(result).toBe(false);
  });

  it('returns false for unregistered action on a known module (no nexus fallback)', async () => {
    hub.register('agnes', 'KNOWN_ACTION', vi.fn());
    const result = await hub.execute('agnes', 'UNKNOWN_ACTION', makeMockContext());
    expect(result).toBe(false);
  });

  it('falls back to nexus handler when module handler is missing', async () => {
    const orchHandler = vi.fn();
    hub.register('nexus', 'GLOBAL_ACTION', orchHandler);
    hub.register('agnes', 'LOCAL_ACTION', vi.fn());

    const ctx = makeMockContext();
    const result = await hub.execute('agnes', 'GLOBAL_ACTION', ctx);

    expect(result).toBe(true);
    expect(orchHandler).toHaveBeenCalledWith(ctx);
  });

  it('falls back to nexus when module is not registered at all', async () => {
    const orchHandler = vi.fn();
    hub.register('nexus', 'GLOBAL_ACTION', orchHandler);

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

  it('getAllowedActions merges module and nexus actions', () => {
    hub.register('agnes', 'LOCAL_A', vi.fn());
    hub.register('agnes', 'LOCAL_B', vi.fn());
    hub.register('nexus', 'GLOBAL_C', vi.fn());

    const actions = hub.getAllowedActions('agnes');
    expect(actions).toContain('LOCAL_A');
    expect(actions).toContain('LOCAL_B');
    expect(actions).toContain('GLOBAL_C');
  });

  it('getAllowedActions returns only nexus actions for unknown module', () => {
    hub.register('nexus', 'GLOBAL_ONLY', vi.fn());

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

  it('dependency resolution falls through to nexus when dep has no match', async () => {
    const orchHandler = vi.fn();
    hub.register('nexus', 'GLOBAL_ACTION', orchHandler);
    hub.register('soma', 'create_field', vi.fn());
    hub.addDependency('titan', 'soma');

    const ctx = makeMockContext({ moduleId: 'titan' });
    const result = await hub.execute('titan', 'GLOBAL_ACTION', ctx);

    expect(result).toBe(true);
    expect(orchHandler).toHaveBeenCalledWith(ctx);
  });

  it('returns false when dependency module has no matching action and no nexus', async () => {
    hub.register('soma', 'create_field', vi.fn());
    hub.addDependency('titan', 'soma');

    const result = await hub.execute('titan', 'NONEXISTENT', makeMockContext());
    expect(result).toBe(false);
  });
});

describe('ActionHub guest firewall', () => {
  beforeEach(() => {
    vi.mocked(OrchestrationExecutionService.recordFailure).mockReset();
    vi.mocked(OrchestrationExecutionService.recordMissingHandlerFailure).mockReset();
  });

  it('blocks guest mutating actions before handlers can persist or emit downstream effects', async () => {
    const moduleId = `guest-firewall-${Math.random().toString(36).slice(2)}`;
    const handler = vi.fn();
    const pushAssistantMessage = vi.fn();

    ActionHub.register(moduleId, 'record_transaction', handler);

    const result = await ActionHub.execute(moduleId, 'record_transaction', makeMockContext({
      moduleId,
      isGuest: true,
      pushAssistantMessage,
      orchestration: {
        ...makeOrchestrationMetadata(),
        actionType: 'record_transaction',
        patientScope: 'GUEST',
        proposal: {
          ...makeOrchestrationMetadata().proposal,
          patientScope: 'GUEST',
        },
        execution: {
          ...makeOrchestrationMetadata().execution,
          patientScope: 'GUEST',
        },
      },
    }));

    expect(result).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    expect(pushAssistantMessage).toHaveBeenCalledWith(
      'Not executed in this session: guest mode cannot change saved health, training, or account state.',
    );
  });

  it('still allows guest non-mutating analysis actions', async () => {
    const moduleId = `guest-analysis-${Math.random().toString(36).slice(2)}`;
    const handler = vi.fn();

    ActionHub.register(moduleId, 'generate_summary', handler);

    const result = await ActionHub.execute(moduleId, 'generate_summary', makeMockContext({
      moduleId,
      isGuest: true,
      orchestration: {
        ...makeOrchestrationMetadata(),
        actionType: 'generate_summary',
        mutatesState: false,
        patientScope: 'GUEST',
        proposal: {
          ...makeOrchestrationMetadata().proposal,
          patientScope: 'GUEST',
          metadata: { mutatesState: false },
        },
        execution: {
          ...makeOrchestrationMetadata().execution,
          patientScope: 'GUEST',
        },
      },
    }));

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('records orchestration failures and returns false when a handler throws', async () => {
    const moduleId = `failure-flow-${Math.random().toString(36).slice(2)}`;
    const pushAssistantMessage = vi.fn();
    const orchestration = makeOrchestrationMetadata();
    const error = new Error('Network timeout');

    vi.mocked(OrchestrationExecutionService.recordFailure).mockResolvedValue({
      id: 'exec-1.failure.1',
      executionId: orchestration.execution.id,
      proposalId: orchestration.proposal.id,
      moduleId,
      actionType: orchestration.actionType,
      threadId: orchestration.activeThreadId,
      patientScope: 'USER',
      errorMessage: error.message,
      errorName: error.name,
      errorCode: 'TRANSIENT',
      retryCount: 0,
      maxRetries: 3,
      failedAt: '2024-01-01T00:00:10.000Z',
      nextRetryAt: '2024-01-01T00:00:11.000Z',
      escalatedAt: null,
      status: 'retry_scheduled',
    });

    ActionHub.register(moduleId, 'UPDATE_MOOD', () => {
      throw error;
    });

    const result = await ActionHub.execute(moduleId, 'UPDATE_MOOD', makeMockContext({
      moduleId,
      orchestration,
      pushAssistantMessage,
    }));

    expect(result).toBe(false);
    expect(OrchestrationExecutionService.recordFailure).toHaveBeenCalledWith('u1', expect.objectContaining({
      moduleId,
      actionType: 'UPDATE_MOOD',
      metadata: expect.objectContaining({
        proposal: expect.objectContaining({ source: orchestration.proposal.source }),
        proposalCard: expect.objectContaining({ source: orchestration.proposalCard.source }),
        execution: expect.objectContaining({ source: moduleId }),
      }),
      error,
    }));
    expect(pushAssistantMessage).toHaveBeenCalledWith('Execution failed and was routed into orchestration review.');
  });

  it('records missing-handler failures instead of letting them vanish silently', async () => {
    const moduleId = `missing-handler-${Math.random().toString(36).slice(2)}`;
    const pushAssistantMessage = vi.fn();
    const orchestration = makeOrchestrationMetadata();

    vi.mocked(OrchestrationExecutionService.recordMissingHandlerFailure).mockResolvedValue({
      id: 'exec-1.failure.1',
      executionId: orchestration.execution.id,
      proposalId: orchestration.proposal.id,
      moduleId,
      actionType: 'MISSING_ACTION',
      threadId: orchestration.activeThreadId,
      patientScope: 'USER',
      errorMessage: 'No handler',
      errorName: 'Error',
      errorCode: 'MISSING_HANDLER',
      retryCount: 0,
      maxRetries: 3,
      failedAt: '2024-01-01T00:00:10.000Z',
      nextRetryAt: null,
      escalatedAt: '2024-01-01T00:00:10.000Z',
      status: 'escalated',
    });

    const result = await ActionHub.execute(moduleId, 'MISSING_ACTION', makeMockContext({
      moduleId,
      orchestration,
      pushAssistantMessage,
    }));

    expect(result).toBe(false);
    expect(OrchestrationExecutionService.recordMissingHandlerFailure).toHaveBeenCalledWith('u1', {
      moduleId,
      actionType: 'MISSING_ACTION',
      metadata: orchestration,
    });
    expect(pushAssistantMessage).toHaveBeenCalledWith('Execution failed because no compatible action handler was available.');
  });

  it('prefers capability providers before nexus fallback and records the real execution owner', async () => {
    const actionType = 'daily_plan';
    const atlasHandler = vi.fn();
    const nexusHandler = vi.fn();
    const bridgeModuleId = `bridge-${Math.random().toString(36).slice(2)}`;

    AgentRegistryService.resetForTests();
    ActionHub.register('atlas', actionType, atlasHandler);
    ActionHub.register('nexus', actionType, nexusHandler);
    ActionHub.registerProvider('atlas', {
      id: `atlas-provider-${Math.random().toString(36).slice(2)}`,
      capabilities: ['daily-planning'],
      precedence: 1,
      latencyTier: 'fast',
    });

    const orchestration = {
      ...makeOrchestrationMetadata(),
      actionType,
      proposal: {
        ...makeOrchestrationMetadata().proposal,
        source: 'nexus',
      },
      proposalCard: {
        ...makeOrchestrationMetadata().proposalCard,
        source: 'nexus',
      },
      execution: {
        ...makeOrchestrationMetadata().execution,
        source: 'nexus',
      },
    };

    const result = await ActionHub.execute(bridgeModuleId, actionType, makeMockContext({
      moduleId: bridgeModuleId,
      orchestration,
    }));

    expect(result).toBe(true);
    expect(nexusHandler).not.toHaveBeenCalled();
    expect(atlasHandler).toHaveBeenCalledWith(expect.objectContaining({
      moduleId: 'atlas',
      orchestration: expect.objectContaining({
        proposal: expect.objectContaining({ source: 'nexus' }),
        proposalCard: expect.objectContaining({ source: 'nexus' }),
        execution: expect.objectContaining({ source: 'atlas' }),
      }),
    }));
  });
});

describe('ActionHub capability dispatch fallback', () => {
  it('resolves a provider by capability when nexus lacks a direct handler', async () => {
    const handler = vi.fn();
    ActionHub.register('scout', 'query_knowledge', handler);

    const result = await ActionHub.execute('nexus', 'query_knowledge', makeMockContext({
      moduleId: 'nexus',
      payload: { query: 'sleep debt' },
    }));

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      moduleId: 'scout',
      payload: { query: 'sleep debt' },
    }));
  });

});
