import { GlobalProjection, NeuralStateVectorPatch, SpineEventType, Message } from '../types';
import { ConversationContext } from '@/lib/ai-adapters/engine-types';
import { StructuredResponse } from '@/lib/ai-adapters/engine-types';
import { NexusLogger } from '@/lib/nexus-logger';
import type { ActionOrchestrationMetadata, SpecialistConsultationArtifact } from '@/lib/contracts/orchestration';
import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';
import type { AgentCapability } from '@/lib/agents/agent-capability';
import { ActionCapabilityResolver } from '@/lib/agents/action-capability-resolver';
import { AgentRegistryService } from '@/lib/agents/agent-registry';
import { NSV_OWNERSHIP, type NSVMetricPath } from '@/lib/services/nsv-ownership';
import { OrchestrationExecutionService } from '@/lib/services/orchestration-execution-service';

export type PersistencePolicy = 'auto' | 'scout-research' | 'atlas-planning' | 'ledger-financial' | 'manual' | 'ephemeral';

export interface ActionContext {
  userId: string | undefined;
  isGuest: boolean;
  moduleId: string;
  payload: Record<string, unknown>;
  parsedCommand?: ParsedCommandEnvelope;
  orchestration?: ActionOrchestrationMetadata;
  persistencePolicy?: PersistencePolicy;
  encryptionKey?: CryptoKey | null;
  navigateTo?: (path: string) => void;
  getLatestNSV?: () => Record<string, unknown>;
  pushAssistantMessage?: (content: string) => void;
  emitThreadArtifact?: (artifact: SpecialistConsultationArtifact) => void;
  sendMessage?: (content: string, context: ConversationContext) => Promise<{ response: StructuredResponse, updatedHistory: Message[] }>;
  emitSpineEvent: (type: SpineEventType, payload: Record<string, unknown>) => void;
  updateGlobalSoul: (patch: NeuralStateVectorPatch) => Promise<void>;
  delegateToModule: (target: string, reason: string, content: string) => void;
  /** Signal that this action modified the module profile document (not just NSV). */
  markProfileDirty?: () => void;
}

export type ActionHandler = (context: ActionContext) => Promise<void> | void;
type ProviderRegistrationOptions = {
  id?: string;
  title?: string;
  capabilities: AgentCapability[];
  precedence?: number;
  latencyTier?: 'fast' | 'balanced' | 'heavy';
};

const NSV_READ_ONLY_MODULES = new Set(['forge', 'scout']);
const NON_MUTATING_ACTION_PREFIXES = ['analyze_', 'compare_', 'detect_', 'explain_', 'generate_', 'identify_', 'navigate_', 'query_', 'suggest_', 'validate_'];
const NON_MUTATING_ACTIONS = new Set([
  'analyze_medical_image',
  'create_module_handoff',
  'detect_data_hint',
  'generate_summary',
  'navigate_to_module',
  'delegate_to_module',
  'query_memory',
  'query_module_data',
  'query_profile',
  'query_reminders',
  'suggest_field',
  'suggest_interventions',
  'create_emotional_support_session',
  'create_workout_plan',
  'create_medical_review',
  'create_financial_plan_request',
  'create_research_request',
  'create_technical_task',
  'create_general_request',
]);

function getMetricValueFromPatch(patch: NeuralStateVectorPatch, metric: NSVMetricPath): unknown {
  // NeuralStateVectorPatch supports both domain-based updates (e.g. `cognitive.researchLoad`)
  // and legacy root aliases (e.g. `cnsFatigue`, `emotionalResilience`).
  switch (metric) {
    case 'biological.cnsFatigue': return patch.biological?.cnsFatigue ?? (patch as any).cnsFatigue;
    case 'biological.sleepQuality': return patch.biological?.sleepQuality ?? (patch as any).sleepQuality;
    case 'biological.recoveryScore': return patch.biological?.recoveryScore;
    case 'biological.hormonalContext': return patch.biological?.hormonalContext ?? (patch as any).hormonalContext;
    case 'emotional.emotionalResilience': return patch.emotional?.emotionalResilience ?? (patch as any).emotionalResilience;
    case 'emotional.stressLoad': return patch.emotional?.stressLoad;
    case 'emotional.moodTrend': return patch.emotional?.moodTrend;
    case 'emotional.traumaMarkers': return patch.emotional?.traumaMarkers ?? (patch as any).traumaMarkers;
    case 'cognitive.energyBudget': return patch.cognitive?.energyBudget;
    case 'cognitive.focusScore': return patch.cognitive?.focusScore;
    case 'cognitive.activeLoad': return patch.cognitive?.activeLoad;
    case 'cognitive.researchLoad': return patch.cognitive?.researchLoad;
    case 'cognitive.planningLoad': return patch.cognitive?.planningLoad;
    case 'cognitive.taskCompletionRate': return patch.cognitive?.taskCompletionRate;
    case 'cognitive.interestDiversity': return patch.cognitive?.interestDiversity;
    case 'planning.streakHealth': return patch.planning?.streakHealth;
    case 'planning.deadlinePressure': return patch.planning?.deadlinePressure;
    case 'resource.financialFriction': return patch.resource?.financialFriction;
    case 'resource.resonanceROI': return patch.resource?.resonanceROI;
    default: return undefined;
  }
}

function filterReadOnlyModuleNSVUpdate(
  moduleId: string,
  patch: NeuralStateVectorPatch,
): NeuralStateVectorPatch | null {
  const allowedPaths = NSV_OWNERSHIP[moduleId as ModuleId] ?? [];
  if (allowedPaths.length === 0) return null;

  const filtered: NeuralStateVectorPatch = {};
  let wroteAny = false;

  for (const metric of allowedPaths) {
    const value = getMetricValueFromPatch(patch, metric);
    if (value === undefined) continue;

    const [domain, leaf] = metric.split('.') as ['biological' | 'emotional' | 'cognitive' | 'planning' | 'resource', string];
    // Domain objects are optional; we only create them if we have a value to write.
    const domainObj = (filtered as any)[domain] ?? {};
    domainObj[leaf] = value;
    (filtered as any)[domain] = domainObj;
    wroteAny = true;
  }

  return wroteAny ? filtered : null;
}

function inferMutatesState(actionType: string, context: ActionContext): boolean {
  if (typeof context.orchestration?.mutatesState === 'boolean') {
    return context.orchestration.mutatesState;
  }

  const normalized = actionType.trim().toLowerCase();
  if (!normalized) return false;
  if (NON_MUTATING_ACTIONS.has(normalized)) return false;
  if (NON_MUTATING_ACTION_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return false;
  return true;
}

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

  private rewriteExecutionOwner(
    resolvedModuleId: string,
    context: ActionContext,
  ): ActionContext {
    if (!context.orchestration || context.orchestration.execution.source === resolvedModuleId) {
      return resolvedModuleId === context.moduleId
        ? context
        : {
            ...context,
            moduleId: resolvedModuleId,
          };
    }

    return {
      ...context,
      moduleId: resolvedModuleId,
      orchestration: {
        ...context.orchestration,
        execution: {
          ...context.orchestration.execution,
          source: resolvedModuleId as ModuleId | 'nexus',
        },
        failure: context.orchestration.failure
          ? {
              ...context.orchestration.failure,
              moduleId: resolvedModuleId,
            }
          : context.orchestration.failure,
      },
    };
  }

  private async executeHandler(
    resolvedModuleId: string,
    actionType: string,
    handler: ActionHandler,
    context: ActionContext,
  ): Promise<boolean> {
    const resolvedContext = this.rewriteExecutionOwner(resolvedModuleId, context);
    try {
      await handler(resolvedContext);
      NexusLogger.action(resolvedModuleId, actionType, resolvedContext.payload);
      return true;
    } catch (error) {
      NexusLogger.warn(
        'ActionHub',
        `[ActionHub] Action "${actionType}" failed in module "${resolvedModuleId}": ${error instanceof Error ? error.message : String(error)}`,
      );

      if (resolvedContext.userId && resolvedContext.orchestration) {
        try {
          await OrchestrationExecutionService.recordFailure(resolvedContext.userId, {
            moduleId: resolvedModuleId,
            actionType,
            metadata: resolvedContext.orchestration,
            error,
            resumableSnapshot: OrchestrationExecutionService.createResumableSnapshot(
              actionType,
              resolvedContext,
              resolvedContext.orchestration,
            ),
          });
        } catch (persistenceError) {
          NexusLogger.warn(
            'ActionHub',
            `[ActionHub] Failed to persist execution failure: ${persistenceError instanceof Error ? persistenceError.message : String(persistenceError)}`,
          );
        }
      }

      resolvedContext.pushAssistantMessage?.('Execution failed and was routed into orchestration review.');
      return false;
    }
  }

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

  registerProvider(moduleId: ModuleId | 'nexus', options: ProviderRegistrationOptions): void {
    const existing = AgentRegistryService.getProviderByModule(moduleId);
    const manifest = moduleId === 'nexus' ? MODULE_MANIFEST.nexus : MODULE_MANIFEST[moduleId];
    AgentRegistryService.registerProvider({
      id: options.id ?? existing?.id ?? `${moduleId}-provider`,
      moduleId,
      title: options.title ?? existing?.title ?? manifest.title,
      capabilities: options.capabilities,
      precedence: options.precedence ?? existing?.precedence ?? 100,
      latencyTier: options.latencyTier ?? existing?.latencyTier ?? 'balanced',
    });
  }

  private async executeCapabilityFallback(
    moduleId: string,
    actionType: string,
    scopedContext: ActionContext,
  ): Promise<boolean | null> {
    const capabilities = ActionCapabilityResolver.resolve(actionType);
    if (capabilities.length === 0) return null;

    const preferredModuleIds: Array<ModuleId | 'nexus'> = [];
    if (moduleId in MODULE_MANIFEST) {
      preferredModuleIds.push(moduleId as ModuleId);
    } else if (moduleId === 'nexus') {
      preferredModuleIds.push('nexus');
    }

    const providers = AgentRegistryService.resolveProvidersForCapabilities(capabilities, {
      preferredModuleIds,
    });

    for (const provider of providers) {
      const resolved = AgentRegistryService.resolveActionForProvider(
        provider.moduleId,
        actionType,
        scopedContext.payload,
      );
      const providerHandlers = this.registry.get(provider.moduleId);
      const handler = providerHandlers?.get(resolved.actionType);
      if (!handler) continue;

      const providerContext: ActionContext = {
        ...scopedContext,
        moduleId: provider.moduleId,
        payload: resolved.payload,
      };
      return this.executeHandler(provider.moduleId, resolved.actionType, handler, providerContext);
    }

    return null;
  }

  async execute(moduleId: string, actionType: string, context: ActionContext): Promise<boolean> {
    // Hard guard: read-only modules must never dispatch explicit NSV-write actions.
    if (NSV_READ_ONLY_MODULES.has(moduleId) && NSV_WRITE_ACTION_TYPES.has(actionType)) {
      NexusLogger.warn(
        'ActionHub',
        `[ActionHub] Module "${moduleId}" is NSV read-only — action "${actionType}" ignored`,
      );
      return true;
    }

    if ((context.isGuest || context.orchestration?.patientScope === 'GUEST') && inferMutatesState(actionType, context)) {
      NexusLogger.warn(
        'ActionHub',
        `[ActionHub] Guest firewall blocked mutating action "${actionType}" for module "${moduleId}"`,
      );
      context.pushAssistantMessage?.('Not executed in this session: guest mode cannot change saved health, training, or account state.');
      return true;
    }

    const scopedContext: ActionContext = {
      ...context,
      updateGlobalSoul: async (patch) => {
        if (!NSV_READ_ONLY_MODULES.has(moduleId)) return context.updateGlobalSoul(patch);

        const filtered = filterReadOnlyModuleNSVUpdate(moduleId, patch);
        if (!filtered) return;
        return context.updateGlobalSoul(filtered);
      },
    };

    // 1. Check module's own handlers
    const moduleHandlers = this.registry.get(moduleId);
    if (moduleHandlers) {
      const handler = moduleHandlers.get(actionType);
      if (handler) {
        return this.executeHandler(moduleId, actionType, handler, scopedContext);
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
            return this.executeHandler(depId, actionType, handler, scopedContext);
          }
        }
      }
    }

    const capabilityFallback = await this.executeCapabilityFallback(moduleId, actionType, scopedContext);
    if (typeof capabilityFallback === 'boolean') {
      return capabilityFallback;
    }

    // 3. Fallback to nexus — nexus handlers remain the last coordinator-owned escape hatch
    const orchestratorHandlers = this.registry.get('nexus');
    if (orchestratorHandlers && orchestratorHandlers.has(actionType)) {
      return this.executeHandler('nexus', actionType, orchestratorHandlers.get(actionType)!, context);
    }

    NexusLogger.warn('ActionHub', `No handler for "${actionType}" in module "${moduleId}"`);
    if (context.userId && context.orchestration) {
      try {
        await OrchestrationExecutionService.recordMissingHandlerFailure(context.userId, {
          moduleId,
          actionType,
          metadata: context.orchestration,
        });
      } catch (persistenceError) {
        NexusLogger.warn(
          'ActionHub',
          `[ActionHub] Failed to persist missing-handler failure: ${persistenceError instanceof Error ? persistenceError.message : String(persistenceError)}`,
        );
      }
    }
    context.pushAssistantMessage?.('Execution failed because no compatible action handler was available.');
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

    // Nexus actions
    const orchestratorHandlers = this.registry.get('nexus');
    if (orchestratorHandlers) {
      for (const action of orchestratorHandlers.keys()) {
        actions.add(action);
      }
    }
    return Array.from(actions);
  }

  getModuleCapabilities(moduleId: ModuleId | 'nexus'): AgentCapability[] {
    return AgentRegistryService.getCapabilitiesForModule(moduleId);
  }

  resolveProvidersForCapability(
    capability: AgentCapability,
    options?: { preferredModuleIds?: Array<ModuleId | 'nexus'> },
  ): Array<ModuleId | 'nexus'> {
    return AgentRegistryService
      .getProvidersForCapability(capability, options)
      .map((provider) => provider.moduleId);
  }

  resolveActionForProvider(
    moduleId: ModuleId | 'nexus',
    actionType: string,
    payload: Record<string, unknown>,
  ): { actionType: string; payload: Record<string, unknown> } {
    return AgentRegistryService.resolveActionForProvider(moduleId, actionType, payload);
  }
}

export const ActionHub = new ModuleActionHub();
