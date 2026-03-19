import { setGlobalOptions } from "firebase-functions/v2";
// import { onRequest, type Request } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";
import { getMessaging, type SendResponse } from "firebase-admin/messaging";
// import type { Response } from "express";
import type { FirestoreEvent, QueryDocumentSnapshot } from "firebase-functions/v2/firestore";
// import vm from "node:vm";

setGlobalOptions({ maxInstances: 10 });

initializeApp();

export { webCrawler } from "./webCrawler";

// export const forgeExecute = onRequest({ cors: true }, async (req: Request, res: Response) => {
//   if (req.method !== "POST") {
//     res.status(405).json({ error: "Method not allowed" });
//     return;
//   }
// 
//   const code = typeof req.body?.code === "string" ? req.body.code : "";
//   const language = typeof req.body?.language === "string" ? req.body.language : "javascript";
// 
//   if (!code.trim()) {
//     res.status(400).json({ error: "Missing code" });
//     return;
//   }
// 
//   if (code.length > 20000) {
//     res.status(413).json({ error: "Code payload too large" });
//     return;
//   }
// 
//   if (language !== "javascript" && language !== "js") {
//     res.status(400).json({ error: "Only JavaScript execution is supported" });
//     return;
//   }
// 
//   const logs: string[] = [];
//   const sandboxConsole = {
//     log: (...args: unknown[]) => {
//       if (logs.length > 200) return;
//       logs.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
//     }
//   };
// 
//   const sandbox = {
//     console: sandboxConsole,
//     Math,
//     Date,
//     JSON,
//     Array,
//     Object,
//     Number,
//     String,
//     Boolean,
//     RegExp
//   };
// 
//   const start = Date.now();
//   try {
//     const script = new vm.Script(code);
//     let result = script.runInNewContext(sandbox, { timeout: 1200 });
// 
//     if (result && typeof (result as Promise<unknown>).then === "function") {
//       result = await Promise.race([
//         result as Promise<unknown>,
//         new Promise((_, reject) => setTimeout(() => reject(new Error("Execution timed out")), 1200))
//       ]);
//     }
// 
//     const durationMs = Date.now() - start;
//     const resultText = typeof result === "string" ? result : result === undefined ? "" : JSON.stringify(result);
//     res.status(200).json({
//       status: "success",
//       logs,
//       result: resultText,
//       durationMs
//     });
//   } catch (error) {
//     const durationMs = Date.now() - start;
//     const message = error instanceof Error ? error.message : "Execution failed";
//     res.status(200).json({
//       status: "error",
//       logs,
//       error: message,
//       durationMs
//     });
//   }
// });

export const bridgeSpineEvents = onDocumentCreated(
  "spine_events/{uid}/events/{eventId}",
  async (event: FirestoreEvent<QueryDocumentSnapshot | undefined, { uid: string; eventId: string }>) => {
  const uid = event.params.uid as string;
  const snapshot = event.data;
  if (!snapshot) return;

  const payload = snapshot.data();
  if (!payload) return;

  try {
    const db = getFirestore();
    const configSnap = await db.doc(`bridge_config/${uid}`).get();
    if (!configSnap.exists) {
      logger.info("Bridge config missing, skipping", { uid, eventId: event.params.eventId });
      return;
    }

    const config = configSnap.data() || {};
    const pushConfig = config.channels?.push || {};
    const enabled = pushConfig.enabled === true;
    if (!enabled) {
      logger.info("Bridge push disabled", { uid, eventType: payload.type });
      return;
    }

    const minPriority = typeof pushConfig.minPriority === "string" ? pushConfig.minPriority : "alert";
    const priorityRank: Record<string, number> = { info: 0, alert: 1, critical: 2 };
    const eventPriority = typeof payload.priority === "string" ? payload.priority : "info";
    if ((priorityRank[eventPriority] ?? 0) < (priorityRank[minPriority] ?? 1)) {
      logger.info("Bridge event below priority threshold", { uid, eventType: payload.type, eventPriority, minPriority });
      return;
    }

    const allowedEvents: string[] = Array.isArray(pushConfig.eventTypes) ? pushConfig.eventTypes : [];
    if (allowedEvents.length > 0 && !allowedEvents.includes(payload.type)) {
      logger.info("Bridge event filtered by eventTypes", { uid, eventType: payload.type });
      return;
    }

    const tokens = Array.isArray(pushConfig.tokens) ? pushConfig.tokens.filter((token: unknown) => typeof token === "string" && token.length > 0) : [];
    if (tokens.length === 0) {
      logger.info("Bridge push has no tokens", { uid, eventType: payload.type });
      return;
    }

    const truncatedTokens = tokens.slice(0, 500);
    const notificationTitle: string =
      typeof payload.data?.title === "string" && payload.data.title
        ? payload.data.title
        : (payload.type === "MODULE_REMINDER_DUE" ? "Nexus Reminder" : "Nexus Alert");
    const bodySource: string =
      typeof payload.data?.note === "string"
        ? payload.data.note
        : typeof payload.data?.body === "string"
        ? payload.data.body
        : typeof payload.data?.reason === "string"
        ? payload.data.reason
        : "";
    const response = await getMessaging().sendEachForMulticast({
      tokens: truncatedTokens,
      notification: {
        title: notificationTitle,
        body: bodySource
      },
      data: {
        type: String(payload.type),
        source: String(payload.source || ""),
        priority: eventPriority,
        deepLink:
          payload.data && typeof payload.data.deepLink === "object"
            ? JSON.stringify(payload.data.deepLink)
            : ""
      }
    });

    const invalidTokens: string[] = [];
    response.responses.forEach((res: SendResponse, idx: number) => {
      if (res.success) return;
      const code = res.error?.code || "";
      if (code.includes("invalid-registration-token") || code.includes("registration-token-not-registered")) {
        invalidTokens.push(truncatedTokens[idx]);
      }
    });

    if (invalidTokens.length > 0) {
      const filtered = tokens.filter((token: string) => !invalidTokens.includes(token));
      await db.doc(`bridge_config/${uid}`).set(
        {
          channels: {
            push: {
              tokens: filtered
            }
          },
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
      logger.info("Bridge tokens pruned", { uid, removed: invalidTokens.length });
    }
    logger.info("Bridge push dispatched", { uid, eventType: payload.type, tokens: truncatedTokens.length });
  } catch (error) {
    logger.error("Bridge spine event handler failed", error);
  }
  }
);

export { scheduleReminder, deliverReminder } from './reminder-tasks';
