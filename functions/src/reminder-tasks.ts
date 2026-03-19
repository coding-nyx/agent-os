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

// ---------------------------------------------------------------------------
// Recurrence types (mirrors src/lib/notifications/types.ts)
// ---------------------------------------------------------------------------

type Recurrence =
  | { kind: "every_n_days"; intervalDays: number; dtStart: string; timezone?: string }
  | { kind: "hourly"; intervalHours: number; dtStart: string; timezone?: string }
  | { kind: "weekly_by_days"; intervalWeeks: number; daysOfWeek: number[]; timeOfDay: string; startAt: string; timezone?: string }
  | { kind: "daily_window"; startAt: string; timezone?: string; windowStart: string; windowEnd: string; intervalMinutes: number }
  | { kind: "rrule"; rrule: string; dtStart: string; timezone?: string };

// ---------------------------------------------------------------------------
// Recurrence evaluation — compute the single next due time from now
// ---------------------------------------------------------------------------

function parseHHmm(value: unknown): { h: number; m: number } | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function toMs(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Returns the next due timestamp (ms) strictly after `afterMs`,
 * or null if the recurrence cannot be evaluated.
 */
function nextDue(recurrence: unknown, afterMs: number): number | null {
  const rec = recurrence as Recurrence | undefined;
  if (!rec || typeof rec !== "object" || !("kind" in rec)) return null;

  // Search forward up to 60 days in 1-minute windows to find the first occurrence.
  const windowMs = 60 * 1000;
  const maxMs = afterMs + 60 * 24 * 60 * 60 * 1000;

  let cursor = afterMs;
  while (cursor < maxMs) {
    const hits = computeInRange(rec, cursor, cursor + windowMs);
    const future = hits.filter((t) => t > afterMs);
    if (future.length > 0) return Math.min(...future);
    cursor += windowMs;
  }
  return null;
}

function computeInRange(rec: Recurrence, startMs: number, endMs: number): number[] {
  switch (rec.kind) {
    case "every_n_days": {
      const anchor = toMs(rec.dtStart);
      if (anchor === null) return [];
      const interval = rec.intervalDays * 86400000;
      if (interval <= 0) return [];
      const due: number[] = [];
      const k0 = Math.floor((startMs - anchor) / interval);
      for (let k = k0 - 1; k <= k0 + 2; k++) {
        const t = anchor + k * interval;
        if (t >= startMs && t <= endMs) due.push(t);
      }
      return due;
    }

    case "hourly": {
      const anchor = toMs(rec.dtStart);
      if (anchor === null) return [];
      const interval = rec.intervalHours * 3600000;
      if (interval <= 0) return [];
      const due: number[] = [];
      const k0 = Math.floor((startMs - anchor) / interval);
      for (let k = k0 - 1; k <= k0 + 2; k++) {
        const t = anchor + k * interval;
        if (t >= startMs && t <= endMs) due.push(t);
      }
      return due;
    }

    case "weekly_by_days": {
      const tod = parseHHmm(rec.timeOfDay);
      if (!tod) return [];
      const due: number[] = [];
      // Scan each day in range
      const dayMs = 86400000;
      let d = new Date(startMs);
      d.setHours(0, 0, 0, 0);
      while (d.getTime() <= endMs + dayMs) {
        if (rec.daysOfWeek.includes(d.getDay())) {
          const t = new Date(d).setHours(tod.h, tod.m, 0, 0);
          if (t >= startMs && t <= endMs) due.push(t);
        }
        d = new Date(d.getTime() + dayMs);
      }
      return due;
    }

    case "daily_window": {
      const ws = parseHHmm(rec.windowStart);
      const we = parseHHmm(rec.windowEnd);
      if (!ws || !we) return [];
      const interval = rec.intervalMinutes * 60000;
      if (interval <= 0) return [];
      const due: number[] = [];
      const dayMs = 86400000;
      let d = new Date(startMs);
      d.setHours(0, 0, 0, 0);
      while (d.getTime() <= endMs + dayMs) {
        const wStartMs = new Date(d).setHours(ws.h, ws.m, 0, 0);
        const wEndMs = new Date(d).setHours(we.h, we.m, 0, 0);
        let t = wStartMs;
        while (t <= wEndMs) {
          if (t >= startMs && t <= endMs) due.push(t);
          t += interval;
        }
        d = new Date(d.getTime() + dayMs);
      }
      return due;
    }

    default:
      return [];
  }
}

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
  const loc = process.env.TASKS_LOCATION || "us-central1";
  const proj = projectId();
  // Cloud Functions v2 URL pattern
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

  const spineEventId = occId;
  const spineEventRef = db.doc(`spine_events/${uid}/events/${spineEventId}`);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(spineEventRef);
    if (existing.exists) return; // already delivered

    tx.create(spineEventRef, {
      type: "MODULE_REMINDER_DUE",
      source: moduleId,
      domain: "system",
      priority,
      timestamp: Date.now(),
      cascadeDepth: 0,
      data: { note, title, deepLink, scheduleId, moduleId, occurrenceId: occId, dueAt },
    });

    tx.set(
      db.doc(`users/${uid}/notification_occurrences/${occId}`),
      { status: "delivered", updatedAt: new Date().toISOString() },
      { merge: true }
    );
  });

  logger.info("[deliverReminder] Spine event written", { uid, moduleId, occId });
  res.status(200).send("ok");
});
