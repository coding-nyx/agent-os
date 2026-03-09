/**
 * BridgeService — Headless Spine subscriber / FCM push-notification daemon.
 *
 * Responsibilities:
 *  1. Subscribe to high-priority Spine events.
 *  2. When the app tab is VISIBLE  → SpineToast handles it (no-op here).
 *  3. When the app tab is HIDDEN   → fire an OS notification via the registered
 *     service worker's `showNotification()`.
 *  4. Register the firebase-messaging-sw.js service worker, request permission,
 *     and persist the FCM token to Firestore so Cloud Functions can later deliver
 *     server-initiated pushes (background / closed state).
 *
 * Bridge is headless — no React component, no agent persona, no onboarding.
 */

import { getToken, onMessage, getMessaging } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Spine } from '@/lib/spine/spine-event-bus';
import { getFirebase } from '@/lib/firebase';
import type { SpineEvent, SpineEventType } from '@/lib/types';

// ---------------------------------------------------------------------------
// Alert Rule definition
// ---------------------------------------------------------------------------

interface AlertRule {
  /** The Spine event type that triggers this alert. */
  eventType: SpineEventType;
  /** Human-readable OS notification title. */
  title: string;
  /** Function that builds a context-aware body string from the event. */
  body: (event: SpineEvent) => string;
  /** If true, skip OS notification and rely on SpineToast (foreground-only). */
  inAppOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Alert rules — one entry per monitored event type
// ---------------------------------------------------------------------------

const ALERT_RULES: AlertRule[] = [
  {
    eventType: 'BURNOUT_WARNING',
    title: 'Nexus Alert — Burnout Risk Detected',
    body: (e) =>
      e.data?.reason === 'high_fatigue_low_resilience'
        ? 'High CNS fatigue combined with low emotional resilience detected. Consider rest.'
        : 'Your system is showing signs of burnout. Take a break.',
  },
  {
    eventType: 'BLOCK_HIGH_INTENSITY',
    title: 'Nexus Alert — High-Intensity Training Blocked',
    body: (e) => {
      const reason = String(e.data?.reason ?? '');
      if (reason === 'cns_fatigue_high') return 'CNS fatigue is too high for intense training today.';
      if (reason.includes('clearance')) return 'Medical clearance is required before high-intensity activity.';
      return 'High-intensity training has been blocked by Nexus.';
    },
  },
  {
    eventType: 'FINANCIAL_STRESS',
    title: 'Nexus Alert — Financial Stress Detected',
    body: () => 'Resource friction is critically high. Ledger recommends reviewing your budget.',
  },
  {
    eventType: 'DEADLINE_APPROACHING',
    title: 'Nexus Alert — Deadline Approaching',
    body: (e) =>
      e.data?.label
        ? `Deadline "${e.data.label}" is approaching soon.`
        : 'A tracked deadline is coming up. Check Atlas for details.',
  },
  {
    eventType: 'DEADLINE_CRUNCH',
    title: 'Nexus Alert — Deadline Pressure Critical',
    body: () => 'Deadline pressure is at critical levels. Atlas suggests re-prioritising tasks.',
  },
  {
    eventType: 'CRISIS_MODE',
    title: 'Nexus Alert — Crisis Mode Activated',
    body: () =>
      'Multiple domains are in critical state simultaneously. Immediate attention recommended.',
  },
  {
    eventType: 'MEDICAL_ALERT',
    title: 'Nexus Alert — Medical Alert',
    body: (e) =>
      e.data?.note
        ? String(e.data.note)
        : 'A medical alert has been issued. Check Soma/Titan for details.',
  },
  {
    eventType: 'COGNITIVE_OVERLOAD',
    title: 'Nexus Alert — Cognitive Overload',
    body: () => 'Cognitive load is critically high. Consider deferring non-urgent decisions.',
  },
  {
    eventType: 'PLANNING_OVERLOAD',
    title: 'Nexus Alert — Planning Overload',
    body: () => 'Planning load is critically high. Atlas recommends simplifying your schedule.',
    inAppOnly: false,
  },
  {
    eventType: 'STREAK_BROKEN',
    title: 'Nexus Alert — Habit Streak At Risk',
    body: () => 'Your habit streak health is critically low. Check Atlas to recover it.',
    inAppOnly: true, // Informational — OS notification would feel intrusive
  },
];

// Index for O(1) lookup
const RULE_MAP = new Map<SpineEventType, AlertRule>(
  ALERT_RULES.map((r) => [r.eventType, r])
);

// ---------------------------------------------------------------------------
// Bridge notification icon
// ---------------------------------------------------------------------------
const NOTIFICATION_ICON = '/assets/images/soma.png';

// ---------------------------------------------------------------------------
// BridgeService singleton
// ---------------------------------------------------------------------------

class BridgeServiceClass {
  private unsubscribers: Array<() => void> = [];
  private swRegistration: ServiceWorkerRegistration | null = null;
  private fcmUnsubscribe: (() => void) | null = null;
  private userId: string | null = null;
  private started = false;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async start(userId: string): Promise<void> {
    if (this.started) {
      console.warn('[Bridge] Already running — ignoring duplicate start()');
      return;
    }
    this.userId = userId;
    this.started = true;

    console.log('[Bridge] Starting for user:', userId);

    // 1. Register service worker
    await this.registerServiceWorker();

    // 2. Request notification permission + get FCM token
    await this.initFCM();

    // 3. Subscribe to Spine events
    this.subscribeToSpineEvents();
  }

  stop(): void {
    if (!this.started) return;

    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];

    if (this.fcmUnsubscribe) {
      this.fcmUnsubscribe();
      this.fcmUnsubscribe = null;
    }

    this.userId = null;
    this.started = false;
    console.log('[Bridge] Stopped.');
  }

  // -------------------------------------------------------------------------
  // Service Worker Registration
  // -------------------------------------------------------------------------

  private async registerServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.warn('[Bridge] Service workers not supported — OS notifications disabled.');
      return;
    }

    try {
      this.swRegistration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js',
        { scope: '/' }
      );
      console.log('[Bridge] Service worker registered:', this.swRegistration.scope);
    } catch (err) {
      console.error('[Bridge] Service worker registration failed:', err);
    }
  }

  // -------------------------------------------------------------------------
  // FCM Initialisation
  // -------------------------------------------------------------------------

  private async initFCM(): Promise<void> {
    // Check browser permission
    if (!('Notification' in window)) {
      console.warn('[Bridge] Notification API not available.');
      return;
    }

    let permission = Notification.permission;

    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
      } catch (err) {
        console.warn('[Bridge] Permission request failed:', err);
        return;
      }
    }

    if (permission !== 'granted') {
      console.warn('[Bridge] Notification permission denied — OS notifications disabled.');
      return;
    }

    // Get FCM token
    try {
      const { app, db } = getFirebase();
      if (!app) {
        console.warn('[Bridge] Firebase app not initialised — skipping FCM token.');
        return;
      }
      let messaging: ReturnType<typeof getMessaging>;
      try {
        messaging = getMessaging(app);
      } catch {
        console.warn('[Bridge] Firebase Messaging not initialised — skipping FCM token.');
        return;
      }

      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
      if (!vapidKey) {
        console.warn('[Bridge] VITE_FIREBASE_VAPID_KEY not set — skipping FCM token.');
        return;
      }

      const tokenOptions: { vapidKey: string; serviceWorkerRegistration?: ServiceWorkerRegistration } = {
        vapidKey,
      };
      if (this.swRegistration) {
        tokenOptions.serviceWorkerRegistration = this.swRegistration;
      }

      const token = await getToken(messaging, tokenOptions);
      console.log('[Bridge] FCM token acquired.');

      // Persist token to Firestore so Cloud Functions can target this device
      if (db && this.userId && token) {
        await setDoc(
          doc(db, 'users', this.userId, 'fcm_tokens', 'primary'),
          {
            token,
            updatedAt: serverTimestamp(),
            userAgent: navigator.userAgent,
          },
          { merge: true }
        );
        console.log('[Bridge] FCM token saved to Firestore.');
      }

      // Handle foreground FCM messages (server-pushed).
      // SpineToast already handles Spine events; this handles messages pushed
      // by a server/Cloud Function when the tab happens to be in focus.
      this.fcmUnsubscribe = onMessage(messaging, (payload) => {
        console.log('[Bridge] FCM foreground message received:', payload);
        // Let the SW showNotification handle it only if tab is backgrounded.
        // If we're here (onMessage fires when app is foreground), SpineToast
        // should already be showing the event. We still show a native notification
        // if the message came purely from the server (no matching Spine event).
        if (document.visibilityState !== 'visible') {
          const title = payload.notification?.title ?? 'Nexus Alert';
          const body = payload.notification?.body ?? '';
          this.showNativeNotification(title, body, payload.data ?? {});
        }
      });
    } catch (err) {
      console.error('[Bridge] FCM init failed:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Spine Event Subscriptions
  // -------------------------------------------------------------------------

  private subscribeToSpineEvents(): void {
    ALERT_RULES.forEach((rule) => {
      const unsub = Spine.subscribe(rule.eventType, (event) => {
        this.handleSpineEvent(event, rule);
      });
      this.unsubscribers.push(unsub);
    });

    console.log(`[Bridge] Subscribed to ${ALERT_RULES.length} high-priority Spine events.`);
  }

  private handleSpineEvent(event: SpineEvent, rule: AlertRule): void {
    // SpineToast handles foreground display — Bridge only fires OS notifications
    // when the tab is not visible.
    if (document.visibilityState === 'visible') return;

    // Skip if this rule is marked in-app only
    if (rule.inAppOnly) return;

    const title = rule.title;
    const body = rule.body(event);
    const data: Record<string, string> = {
      eventType: event.type,
      moduleId: event.source,
      timestamp: String(event.timestamp),
    };

    this.showNativeNotification(title, body, data);
  }

  // -------------------------------------------------------------------------
  // Native Notification Dispatch
  // -------------------------------------------------------------------------

  private showNativeNotification(
    title: string,
    body: string,
    data: Record<string, string>
  ): void {
    if (Notification.permission !== 'granted') return;

    if (this.swRegistration) {
      // Preferred: use SW registration so the notification persists even if
      // the JS context is garbage-collected while backgrounded.
      // Cast to any to include non-standard-but-widely-supported `renotify` option
      const notifOptions: NotificationOptions & { renotify?: boolean } = {
        body,
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_ICON,
        data,
        tag: data['eventType'] ?? 'nexus-alert',
        renotify: true,
      };
      this.swRegistration.showNotification(title, notifOptions).catch((err) => {
        console.warn('[Bridge] SW showNotification failed, falling back:', err);
        this.showFallbackNotification(title, body);
      });
    } else {
      this.showFallbackNotification(title, body);
    }
  }

  private showFallbackNotification(title: string, body: string): void {
    try {
      // eslint-disable-next-line no-new
      new Notification(title, {
        body,
        icon: NOTIFICATION_ICON,
      });
    } catch (err) {
      console.warn('[Bridge] Fallback Notification() failed:', err);
    }
  }
}

// Export singleton
export const BridgeService = new BridgeServiceClass();
