/**
 * Event-driven reminder delivery via Cloud Tasks.
 *
 * scheduleReminder  — callable: computes next due time for a schedule and
 *                     enqueues a Cloud Task for that exact moment.
 * deliverReminder   — HTTP handler invoked by Cloud Tasks: writes a Spine
 *                     event which triggers bridgeSpineEvents → FCM push.
 */

import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { CloudTasksClient } from "@google-cloud/tasks";
import crypto from "node:crypto";
import { nextDue } from "./reminder-evaluation.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function occurrenceId(moduleId: string, scheduleId: string, dueAtIso: string): string {
  return crypto.createHash("sha256").update(`${moduleId}:${scheduleId}:${dueAtIso}`).digest("hex");
}

function projectId(): string {
  const id = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!id) throw new Error("GCLOUD_PROJECT not set");
  return id;
}

function tasksQueueName(): string {
  // Cloud Tasks queue: projects/{project}/locations/{location}/queues/{queue}
  const location = process.env.TASKS_LOCATION || "us-central1";
  const queue = process.env.TASKS_QUEUE || "reminder-delivery";
  return `projects/${projectId()}/locations/${location}/queues/${queue}`;
}

function deliverReminderUrl(): string {
  // Prefer an explicit override so the URL never silently targets the wrong
  // region when TASKS_LOCATION and the actual deployment region differ.
  if (process.env.TASKS_TARGET_URL) {
    return process.env.TASKS_TARGET_URL;
  }
  const loc = process.env.TASKS_LOCATION || "us-central1";
  const proj = projectId();
  return `https://${loc}-${proj}.cloudfunctions.net/deliverReminder`;
}

// ---------------------------------------------------------------------------
// scheduleReminder — callable from the client after a logging event
// ---------------------------------------------------------------------------

export const scheduleReminder = onCall(
  { enforceAppCheck: false },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Must be signed in.");

    const scheduleId = request.data?.scheduleId;
    if (typeof scheduleId !== "string" || !scheduleId) {
      throw new HttpsError("invalid-argument", "scheduleId required.");
    }

    const db = getFirestore();
    const scheduleSnap = await db.doc(`users/${uid}/notification_schedules/${scheduleId}`).get();
    if (!scheduleSnap.exists) {
      throw new HttpsError("not-found", `Schedule ${scheduleId} not found.`);
    }

    const schedule = scheduleSnap.data() as Record<string, unknown>;
    if (schedule.enabled !== true) {
      return { skipped: true, reason: "disabled" };
    }

    const moduleId = typeof schedule.moduleId === "string" ? schedule.moduleId : null;
    if (!moduleId) throw new HttpsError("internal", "Schedule missing moduleId.");

    const dueAtMs = nextDue(schedule.recurrence, Date.now());
    if (dueAtMs === null) {
      logger.warn("[scheduleReminder] Could not compute next due time", { uid, scheduleId });
      return { skipped: true, reason: "no_next_occurrence" };
    }

    const dueAtIso = new Date(dueAtMs).toISOString();
    const occId = occurrenceId(moduleId, scheduleId, dueAtIso);

    // Check for existing occurrence to prevent duplicates
    const occRef = db.doc(`users/${uid}/notification_occurrences/${occId}`);
    const occSnap = await occRef.get();
    if (occSnap.exists) {
      return { skipped: true, reason: "already_scheduled", dueAt: dueAtIso };
    }

    // Write occurrence record immediately (status: pending)
    await occRef.set({
      occurrenceId: occId,
      scheduleId,
      moduleId,
      dueAt: dueAtIso,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Enqueue Cloud Task to fire at dueAtMs
    const client = new CloudTasksClient();

    const payload = JSON.stringify({ uid, scheduleId, moduleId, occurrenceId: occId, dueAt: dueAtIso });

    await client.createTask({
      parent: tasksQueueName(),
      task: {
        name: `${tasksQueueName()}/tasks/${occId}`,
        scheduleTime: { seconds: Math.floor(dueAtMs / 1000) },
        httpRequest: {
          httpMethod: "POST" as const,
          url: deliverReminderUrl(),
          headers: { "Content-Type": "application/json" },
          body: Buffer.from(payload).toString("base64"),
          oidcToken: {
            serviceAccountEmail: `${projectId()}@appspot.gserviceaccount.com`,
          },
        },
      },
    });

    logger.info("[scheduleReminder] Task enqueued", { uid, scheduleId, dueAt: dueAtIso, occId });
    return { scheduled: true, dueAt: dueAtIso };
  }
);

// ---------------------------------------------------------------------------
// deliverReminder — HTTP handler invoked by Cloud Tasks at the scheduled time
// ---------------------------------------------------------------------------

export const deliverReminder = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  let body: { uid: string; scheduleId: string; moduleId: string; occurrenceId: string; dueAt: string };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).send("Invalid JSON body");
    return;
  }

  const { uid, scheduleId, moduleId, occurrenceId: occId, dueAt } = body;
  if (!uid || !scheduleId || !moduleId || !occId) {
    res.status(400).send("Missing required fields");
    return;
  }

  const db = getFirestore();

  // Re-read schedule to get current message template and priority
  const scheduleSnap = await db.doc(`users/${uid}/notification_schedules/${scheduleId}`).get();
  const schedule = scheduleSnap.exists ? (scheduleSnap.data() as Record<string, unknown>) : null;

  if (!schedule || schedule.enabled !== true) {
    // Schedule was disabled after task was queued — mark skipped and exit cleanly.
    await db.doc(`users/${uid}/notification_occurrences/${occId}`).set(
      { status: "skipped", updatedAt: new Date().toISOString() },
      { merge: true }
    );
    res.status(200).send("skipped");
    return;
  }

  const note =
    typeof schedule?.messageTemplate === "object" &&
    schedule.messageTemplate !== null &&
    typeof (schedule.messageTemplate as Record<string, unknown>).body === "string"
      ? (schedule.messageTemplate as Record<string, unknown>).body as string
      : "A scheduled reminder is due.";

  const title =
    typeof schedule?.messageTemplate === "object" &&
    schedule.messageTemplate !== null &&
    typeof (schedule.messageTemplate as Record<string, unknown>).title === "string"
      ? (schedule.messageTemplate as Record<string, unknown>).title as string
      : "Reminder";

  const priority =
    schedule?.priority === "critical" || schedule?.priority === "alert" || schedule?.priority === "info"
      ? (schedule.priority as string)
      : "alert";

  const deepLink =
    schedule?.deepLink && typeof schedule.deepLink === "object"
      ? schedule.deepLink
      : { route: `/${moduleId}` };

  // Read channel preferences — default to os:true, inApp:false if missing.
  const channelPrefs = (
    schedule?.channelPrefs &&
    typeof schedule.channelPrefs === "object" &&
    schedule.channelPrefs !== null
  )
    ? (schedule.channelPrefs as { os?: boolean; inApp?: boolean })
    : { os: true, inApp: false };

  const osEnabled = channelPrefs.os !== false;
  const inAppEnabled = channelPrefs.inApp === true;

  const now = new Date().toISOString();
  const eventPayload = {
    type: "MODULE_REMINDER_DUE",
    source: moduleId,
    domain: "system",
    priority,
    timestamp: Date.now(),
    cascadeDepth: 0,
    data: { note, title, deepLink, scheduleId, moduleId, occurrenceId: occId, dueAt },
  };

  const spineEventRef = db.doc(`spine_events/${uid}/events/${occId}`);
  const occurrenceRef = db.doc(`users/${uid}/notification_occurrences/${occId}`);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(spineEventRef);

    // Write FCM-triggering Spine event only if the OS push channel is enabled.
    if (osEnabled && !existing.exists) {
      tx.create(spineEventRef, eventPayload);
    }

    tx.set(occurrenceRef, { status: "delivered", updatedAt: now }, { merge: true });
  });

  // Write an in-app inbox record when the inApp channel is enabled.
  // The client reads users/{uid}/notification_inbox to surface unread reminders.
  if (inAppEnabled) {
    await db.doc(`users/${uid}/notification_inbox/${occId}`).set({
      ...eventPayload,
      scheduleId,
      occurrenceId: occId,
      read: false,
      createdAt: now,
    }, { merge: true });
  }

  logger.info("[deliverReminder] Reminder delivered", { uid, moduleId, occId, osEnabled, inAppEnabled });
  res.status(200).send("ok");
});
