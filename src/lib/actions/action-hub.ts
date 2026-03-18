import { GlobalProjection, NeuralStateVectorPatch, SpineEventType, Message } from '../types';
import { ConversationContext } from '@/lib/ai-adapters/engine-types';
import { StructuredResponse } from '@/lib/ai-adapters/engine-types';
import { NexusLogger } from '@/lib/nexus-logger';

export type PersistencePolicy = 'auto' | 'scout-research' | 'atlas-planning' | 'ledger-financial' | 'manual' | 'ephemeral';

export interface ActionContext {
  userId: string | undefined;
  isGuest: boolean;
  moduleId: string;
  payload: Record<string, unknown>;
  persistencePolicy?: PersistencePolicy;
  encryptionKey?: CryptoKey | null;
  navigateTo?: (path: string) => void;
  getLatestNSV?: () => Record<string, unknown>;
  pushAssistantMessage?: (content: string) => void;
  sendMessage?: (content: string, context: ConversationContext) => Promise<{ response: StructuredResponse, updatedHistory: Message[] }>;
  emitSpineEvent: (type: SpineEventType, payload: Record<string, unknown>) => void;
  updateGlobalSoul: (patch: NeuralStateVectorPatch) => Promise<void>;
  delegateToModule: (target: string, reason: string, content: string) => void;
  /** Signal that this action modified the module profile document (not just NSV). */
  markProfileDirty?: () => void;
}

export type ActionHandler = (context: ActionContext) => Promise<void> | void;

const NSV_READ_ONLY_MODULES = new Set(['forge']);

/**
 * Action types that constitute a direct NSV/soul write.
 * Any module in NSV_READ_ONLY_MODULES that dispatches one of these
 * action types will receive a hard throw — even before the handler runs.
 * Extend this set as explicit soul-write action types are introduced.
 */
const NSV_WRITE_ACTION_TYPES = new Set([
  'update_soul',
  'write_soul',
  'patch_nsv',
  'update_nsv',
  'commit_nsv',
  'soul_write',
  'nsv_write',
  'UPDATE_SOUL',
  'WRITE_SOUL',
  'PATCH_NSV',
  'UPDATE_NSV',
  'COMMIT_NSV',
]);

class ModuleActionHub {
  private registry = new Map<string, Map<string, ActionHandler>>();
  private dependencies = new Map<string, Set<string>>();

  /**
   * Declare that `moduleId` depends on `dependsOn`, allowing actions
   * registered under `dependsOn` to be resolved when executing or
   * querying allowed actions for `moduleId`.
   */
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
    // Hard guard: read-only modules must never dispatch explicit NSV-write actions.
    if (NSV_READ_ONLY_MODULES.has(moduleId) && NSV_WRITE_ACTION_TYPES.has(actionType)) {
      throw new Error(
        `[ActionHub] Module "${moduleId}" is NSV read-only — soul writes blocked`,
      );
    }

    const scopedContext: ActionContext = {
      ...context,
      updateGlobalSoul: async (patch) => {
        if (NSV_READ_ONLY_MODULES.has(moduleId)) {
          throw new Error('Scout/Forge are NSV read-only');
        }
        return context.updateGlobalSoul(patch);
      },
    };

    // 1. Check module's own handlers
    const moduleHandlers = this.registry.get(moduleId);
    if (moduleHandlers) {
      const handler = moduleHandlers.get(actionType);
      if (handler) {
        await handler(scopedContext);
        NexusLogger.action(moduleId, actionType, context.payload);
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
            await handler(scopedContext);
            NexusLogger.action(moduleId, actionType, context.payload);
            return true;
          }
        }
      }
    }

    // 3. Fallback to orchestrator — orchestrator handlers are privileged
    const orchestratorHandlers = this.registry.get('orchestrator');
    if (orchestratorHandlers && orchestratorHandlers.has(actionType)) {
      await orchestratorHandlers.get(actionType)!(context);
      NexusLogger.action(moduleId, actionType, context.payload);
      return true;
    }

    NexusLogger.warn('ActionHub', `No handler for "${actionType}" in module "${moduleId}"`);
    return false;
  }

  getAllowedActions(moduleId: string): string[] {
    const actions = new Set<string>();

    // Module's own actions
    const moduleHandlers = this.registry.get(moduleId);
    if (moduleHandlers) {
      for (const action of moduleHandlers.keys()) {
        actions.add(action);
      }
    }

    // Dependency module actions
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

    // Orchestrator actions
    const orchestratorHandlers = this.registry.get('orchestrator');
    if (orchestratorHandlers) {
      for (const action of orchestratorHandlers.keys()) {
        actions.add(action);
      }
    }
    return Array.from(actions);
  }
}

export const ActionHub = new ModuleActionHub();
