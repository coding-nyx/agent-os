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
import { OrchestrationActionGateServiceJs } from '@cortex-logic';

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
  emitSpineEvent: (
    type: SpineEventType,
    payload: Record<string, unknown>,
    options?: { domain?: string; priority?: 'info' | 'alert' | 'critical'; target?: string }
  ) => void;
  updateGlobalSoul: (patch: NeuralStateVectorPatch) => Promise<void>;
  delegateToModule: (target: string, reason: string, content: string) => void;
  /** Signal that this action modified the module profile document (not just NSV). */
  markProfileDirty?: () => void;
  /**
   * Per-turn in-memory profile cache shared across all actions in a single AI response.
   * Keyed by userId. Ledger action handlers read from this cache first and write back
   * after each mutation so that sequential actions within one turn share state instead
   * of independently re-reading from Firestore (which risks stale reads between writes).
   */
  profileCache?: Map<string, unknown>;
}

export type ActionHandler = (context: ActionContext) => Promise<void> | void;
type ProviderRegistrationOptions = {
  id?: string;
  title?: string;
  capabilities: AgentCapability[];
  precedence?: number;
  latencyTier?: 'fast' | 'balanced' | 'heavy';
};

// Policy constants are now sourced from KMP OrchestrationActionGateService.
// The singleton is cheap to instantiate (stateless).
const _actionGate = new OrchestrationActionGateServiceJs();

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
  return _actionGate.inferMutatesState(actionType.trim().toLowerCase());
}

class ModuleActionHub {
  private registry = new Map<string, Map<string, ActionHandler>>();
  private dependencies = new Map<string, Set<string>>();

  /**
   * Modules whose action handlers are fully (or partially) implemented in KMP.
   * For these modules, `execute()` tries the KMP `ActionHubJs` bridge first.
   * Actions not registered in KMP (`onComplete(false)`) fall through to the TS registry.
   *
   * Set to `new Set()` to disable KMP delegation and revert to TS-only handlers.
   */
  // 'soma' excluded: KMP's appendProfileList reads the raw encrypted blob and writes plaintext
  //   fields alongside it (no vault encrypt/decrypt). TS handlers correctly read/write the
  //   encrypted format via vault callbacks.
  // 'agnes' excluded: update_belief_graph in KMP does a direct save, bypassing the TS
  //   proposal/conflict-detection workflow (proposeBeliefGraphCandidate + ConflictResolutionOverlay).
  //   All TS agnes handlers are complete and handle encryption correctly via the vault service.
  private static readonly kmpModules = new Set(['titan', 'atlas', 'ledger']);

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

      try {
        const { useOrchestrationStore } = await import('../stores/orchestration-store');
        useOrchestrationStore.getState().recordActionFailure(actionType);
      } catch {
        // ignore — store may not be available in all contexts
      }

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
    if (import.meta.env.DEV && this.registry.get(moduleId)!.has(actionType)) {
      console.warn(`[ActionHub] Handler overwrite: ${moduleId}.${actionType} — check HANDLER_PRECEDENCE in core-handlers.ts`);
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
    if (_actionGate.isNsvReadOnlyModule(moduleId) && _actionGate.isNsvWriteActionType(actionType)) {
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
      return true;
    }

    // Autopilot policy check
    const autopilotLevel = (context.orchestration as any)?.autopilotLevel ?? 0;
    if (autopilotLevel > 0) {
      try {
        const { AutopilotActionPolicyService } = await import('../services/autopilot-action-policy-service');
        if (!AutopilotActionPolicyService.isAllowed(actionType, autopilotLevel)) {
          NexusLogger.warn('ActionHub', `[ActionHub] Action "${actionType}" blocked by autopilot policy at level ${autopilotLevel}`);
          // Don't surface to user — just block silently and log
          return true;
        }
      } catch {
        // If policy service unavailable, allow through
      }
    }

    const scopedContext: ActionContext = {
      ...context,
      updateGlobalSoul: async (patch) => {
        if (!_actionGate.isNsvReadOnlyModule(moduleId)) return context.updateGlobalSoul(patch);

        const filtered = filterReadOnlyModuleNSVUpdate(moduleId, patch);
        if (!filtered) return;
        return context.updateGlobalSoul(filtered);
      },
    };

    // KMP-first delegation: try the cortex-logic ActionHub before the TS registry.
    // onComplete(true) = handled; onComplete(false) = no handler, fall through to TS.
    if (ModuleActionHub.kmpModules.has(moduleId)) {
      try {
        const { getActionHubJs, setExecutingModule } = await import('@/cortex-bridge/action-hub-bridge');
        const hub = getActionHubJs(context.encryptionKey);
        if (hub) {
          setExecutingModule(moduleId);
          try {
            const handled = await new Promise<boolean>((resolve) => {
              const task = hub.execute(
                moduleId,
                actionType,
                JSON.stringify(context.payload),
                context.userId ?? null,
                (wasHandled: boolean) => resolve(wasHandled),
                (err: string) => {
                  NexusLogger.warn('ActionHub', `[KMP] ${moduleId}.${actionType} failed: ${err}`);
                  resolve(false);
                },
              );
              // task is a CancellableTask — no cancellation wired here since
              // ActionContext has no AbortSignal, but capturing the return
              // avoids floating promises from the KMP coroutine runtime.
              void task;
            });
            if (handled) {
              NexusLogger.action(moduleId, actionType, context.payload);
              return true;
            }
          } finally {
            setExecutingModule(null);
          }
        }
      } catch (e) {
        NexusLogger.warn('ActionHub', `[KMP] Bridge unavailable for ${moduleId}.${actionType}: ${e}`);
      }
    }

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

  hasHandler(moduleId: string, actionType: string): boolean {
    return this.registry.get(moduleId)?.has(actionType) ?? false;
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
