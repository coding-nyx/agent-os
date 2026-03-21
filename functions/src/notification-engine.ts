import * as logger from "firebase-functions/logger";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging, type SendResponse } from "firebase-admin/messaging";

export type NotificationPriority = "info" | "alert" | "critical";

export type NotificationActionType = "NAVIGATE" | "MARK_READ" | "DISMISS" | "CUSTOM_ACTION";

export interface NotificationAction {
  type: NotificationActionType;
  payload?: Record<string, any>;
}

export interface NotificationRequest {
  uid: string;
  id: string; // Unique ID for this notification (e.g. eventId or occurrenceId)
  type: string;
  source: string;
  priority: NotificationPriority;
  title: string;
  body: string;
  data?: Record<string, any>;
  action?: NotificationAction;
}

export class NotificationEngine {
  private static instance: NotificationEngine;
  private db = (() => {
    const db = getFirestore();
    db.settings({ ignoreUndefinedProperties: true });
    return db;
  })();
  private messaging = getMessaging();

  private constructor() {}

  public static getInstance(): NotificationEngine {
    if (!NotificationEngine.instance) {
      NotificationEngine.instance = new NotificationEngine();
    }
    return NotificationEngine.instance;
  }

  /**
   * Main entry point for processing a notification.
   * Handles both persistence (inbox) and delivery (FCM).
   */
  public async processNotification(req: NotificationRequest): Promise<void> {
    const { uid, id, type, source, priority, title, body, data, action } = req;

    try {
      // 1. Resolve configuration for the user
      const configSnap = await this.db.doc(`bridge_config/${uid}`).get();
      const config = configSnap.data() || {};
      const pushConfig = config.channels?.push || {};

      // 2. Determine delivery channels
      const shouldWriteToInbox = true; // Always write to inbox by default for now
      const shouldSendPush = this.evaluatePushRules(req, pushConfig);

      // 3. Prepare common payload
      const now = new Date().toISOString();
      const inboxRecord = {
        type,
        source,
        priority,
        title,
        note: body,
        data: {
          ...data,
          title, // Redundant but kept for compatibility
          note: body, // Redundant but kept for compatibility
        },
        action: action || this.deriveAction(req),
        read: false,
        createdAt: now,
        updatedAt: now,
      };

      // 4. Atomic write to inbox with push deduplication
      let alreadyPushed = false;
      if (shouldWriteToInbox) {
        const inboxRef = this.db.doc(`users/${uid}/notification_inbox/${id}`);
        await this.db.runTransaction(async (tx) => {
          const snap = await tx.get(inboxRef);
          const existingData = snap.exists ? snap.data() : null;
          
          if (existingData?.pushedAt) {
            alreadyPushed = true;
          }

          const finalRecord = {
            ...inboxRecord,
            pushedAt: alreadyPushed ? existingData?.pushedAt : (shouldSendPush ? now : null),
            updatedAt: now,
          };

          tx.set(inboxRef, finalRecord, { merge: true });
        });
      }

      // 5. Dispatch FCM if needed and not already pushed
      if (shouldSendPush && !alreadyPushed) {
        await this.dispatchPush(req, pushConfig);
      }

      logger.info("[NotificationEngine] Processed notification", { uid, id, type, shouldSendPush });
    } catch (error) {
      logger.error("[NotificationEngine] Failed to process notification", {
        uid, id,
        errorMessage: (error as any)?.message ?? String(error),
        errorCode: (error as any)?.code,
        errorStack: (error as any)?.stack,
      });
      throw error;
    }
  }

  private evaluatePushRules(req: NotificationRequest, pushConfig: any): boolean {
    const { type, priority } = req;

    if (pushConfig.enabled !== true) {
      logger.info("[NotificationEngine] Push blocked: enabled !== true", { uid: req.uid, type, pushEnabled: pushConfig.enabled });
      return false;
    }

    if (!Array.isArray(pushConfig.tokens) || pushConfig.tokens.length === 0) {
      logger.info("[NotificationEngine] Push blocked: no FCM tokens", { uid: req.uid, type });
      return false;
    }

    // Priority check
    const minPriority = typeof pushConfig.minPriority === "string" ? pushConfig.minPriority : "alert";
    const priorityRank: Record<string, number> = { info: 0, alert: 1, critical: 2 };
    const reqRank = priorityRank[priority] ?? 0;
    const minRank = priorityRank[minPriority as NotificationPriority] ?? 1;

    if (reqRank < minRank) {
      logger.info("[NotificationEngine] Push blocked: priority too low", { uid: req.uid, type, priority, minPriority });
      return false;
    }

    // Event type filtering
    const allowedEvents: string[] = Array.isArray(pushConfig.eventTypes) ? pushConfig.eventTypes : [];
    if (allowedEvents.length > 0 && !allowedEvents.includes(type)) {
      logger.info("[NotificationEngine] Push blocked: event type not in allowedEvents", { uid: req.uid, type, allowedEvents });
      return false;
    }

    return true;
  }

  private async dispatchPush(req: NotificationRequest, pushConfig: any): Promise<void> {
    const { uid, type, source, priority, title, body, data, action } = req;
    const tokens = Array.isArray(pushConfig.tokens) 
      ? pushConfig.tokens.filter((t: any) => typeof t === "string" && t.length > 0) 
      : [];

    if (tokens.length === 0) {
      logger.info("[NotificationEngine] No tokens for push", { uid, type });
      return;
    }

    const derivedAction = action || this.deriveAction(req);
    const truncatedTokens = tokens.slice(0, 500);

    const response = await this.messaging.sendEachForMulticast({
      tokens: truncatedTokens,
      notification: { title, body },
      data: {
        type: String(type),
        source: String(source),
        priority: String(priority),
        action: JSON.stringify(derivedAction),
        // Legacy deepLink support if needed by older clients
        deepLink: data?.deepLink ? JSON.stringify(data.deepLink) : "",
      }
    });

    // Prune invalid tokens
    const invalidTokens: string[] = [];
    response.responses.forEach((res: SendResponse, idx: number) => {
      if (res.success) return;
      const code = res.error?.code || "";
      if (code.includes("invalid-registration-token") || code.includes("registration-token-not-registered")) {
        invalidTokens.push(truncatedTokens[idx]);
      }
    });

    if (invalidTokens.length > 0) {
      await this.db.doc(`bridge_config/${uid}`).set({
        channels: {
          push: {
            tokens: FieldValue.arrayRemove(...invalidTokens)
          }
        },
        updatedAt: new Date().toISOString()
      }, { merge: true });
      logger.info("[NotificationEngine] Pruned invalid tokens", { uid, count: invalidTokens.length });
    }
  }

  private deriveAction(req: NotificationRequest): NotificationAction {
    if (req.data?.deepLink) {
      const payload: Record<string, string> = { route: req.data.deepLink.route };
      if (req.data.deepLink.focusId) payload.focusId = req.data.deepLink.focusId;
      return { type: "NAVIGATE", payload };
    }
    return { type: "MARK_READ" };
  }
}
