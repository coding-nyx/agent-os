import type { NotificationAction } from './types';

export type ActionHandler = (payload: any, context: ActionContext) => Promise<void> | void;

export interface ActionContext {
  navigate: (route: string, options?: { state?: any }) => void;
  markAsRead: (id: string) => Promise<void>;
  userId?: string;
}

class NotificationActionRegistry {
  private handlers = new Map<string, ActionHandler>();

  constructor() {
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers() {
    this.register('NAVIGATE', async (payload, { navigate }) => {
      if (payload?.route) {
        navigate(payload.route, { 
          state: payload.focusId ? { focusId: payload.focusId } : undefined 
        });
      }
    });

    this.register('MARK_READ', async (_, { markAsRead, userId }) => {
      // Logic for MARK_READ is often handled by the caller, but can be here too
    });

    this.register('DISMISS', async () => {
      // Logic for DISMISS is usually handled by UI state
    });
  }

  public register(type: string, handler: ActionHandler) {
    this.handlers.set(type, handler);
  }

  public async handleAction(action: NotificationAction, context: ActionContext) {
    const handler = this.handlers.get(action.type);
    if (handler) {
      await handler(action.payload, context);
    } else {
      console.warn(`[NotificationActionRegistry] No handler for action type: ${action.type}`);
    }
  }
}

export const ActionRegistry = new NotificationActionRegistry();
