import { GlobalProjection, NeuralStateVectorPatch, SpineEventType, Message } from '../types';
import { ConversationContext } from '@/llm-engine/types';
import { StructuredResponse } from '@/llm-engine/engine/types';

export interface ActionContext {
  userId: string | undefined;
  isGuest: boolean;
  moduleId: string;
  payload: Record<string, unknown>;
  encryptionKey?: CryptoKey | null;
  navigateTo?: (path: string) => void;
  getLatestNSV?: () => Record<string, unknown>;
  pushAssistantMessage?: (content: string) => void;
  sendMessage?: (content: string, context: ConversationContext) => Promise<{ response: StructuredResponse, updatedHistory: Message[] }>;
  emitSpineEvent: (type: SpineEventType, payload: Record<string, unknown>) => void;
  updateGlobalSoul: (patch: NeuralStateVectorPatch) => Promise<void>;
  delegateToModule: (target: string, reason: string, content: string) => void;
}

export type ActionHandler = (context: ActionContext) => Promise<void> | void;

class ModuleActionHub {
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
    if (!moduleHandlers) return false;

    const handler = moduleHandlers.get(actionType);
    if (!handler) {
      // Allow global/orchestrator fallback handlers
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

export const ActionHub = new ModuleActionHub();
