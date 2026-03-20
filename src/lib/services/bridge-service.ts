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
import { Spine } from '@/lib/spine/spine-event-bus';
import { getFirebase } from '@/lib/firebase';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import type { SpineEvent, SpineEventType } from '@/lib/types';
import { hashOccurrenceId } from '@/lib/notifications/reminder-evaluation';

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
  {
    eventType: 'MODULE_REMINDER_DUE',
    title: 'Nexus Reminder — Log now',
    body: (e) =>
      typeof e.data?.note === 'string'
        ? String(e.data.note)
        : 'A scheduled reminder is due. Log your entry now.',
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

// Maximum number of FCM tokens retained per user in bridge_config.
// Oldest excess tokens are evicted on each update.
const MAX_FCM_TOKENS = 5;

// Log FCM "push service unavailable" only once per page load (e.g. localhost).
let fcmUnavailableLogged = false;

function isPushServiceError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = (err.message || '').toLowerCase();
    const name = (err.name || '').toLowerCase();
    return (
      name === 'aborterror' ||
      msg.includes('abort') ||
      msg.includes('service worker') ||
      msg.includes('push service error') ||
      msg.includes('registration failed') ||
      msg.includes('unsubscribe failed')
    );
  }
  return false;
}

function describeError(err: unknown): Record<string, string> {
  if (err instanceof Error) {
    const withCode = err as Error & { code?: string };
    return {
      name: withCode.name || 'Error',
      code: withCode.code || '',
      message: withCode.message || '',
    };
  }

  return {
    name: typeof err,
    code: '',
    message: String(err),
  };
}

// ---------------------------------------------------------------------------
// BridgeService singleton
// ---------------------------------------------------------------------------

class BridgeServiceClass {
  private unsubscribers: Array<() => void> = [];
  private swRegistration: ServiceWorkerRegistration | null = null;
  private fcmUnsubscribe: (() => void) | null = null;
  private tokenRefreshUnsub: (() => void) | null = null;
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

    // 1. Register service worker (always — needed for background push regardless of permission)
    await this.registerServiceWorker();

    // 2. If permission is already granted (returning user), init FCM immediately.
    //    If permission is 'default', defer until the user explicitly enables a reminder
    //    via requestPermissionAndInit() so we don't hit browser prompt-blocking heuristics.
    if ('Notification' in window && Notification.permission === 'granted') {
      await this.initFCM();
    } else {
      console.log('[Bridge] Notification permission not yet granted — FCM deferred until user action.');
    }

    // 3. Subscribe to Spine events regardless of notification permission state.
    this.subscribeToSpineEvents();
  }

  /**
   * Request OS notification permission and complete FCM initialisation.
   * Should be called in response to a direct user gesture (e.g. enabling a
   * reminder in NotificationSettingsPanel) to satisfy browser prompt policies.
   */
  async requestPermissionAndInit(): Promise<boolean> {
    if (!this.userId) {
      console.warn('[Bridge] requestPermissionAndInit called before start()');
      return false;
    }

    if (!('Notification' in window)) return false;

    if (Notification.permission === 'denied') {
      console.warn('[Bridge] Notification permission was previously denied.');
      return false;
    }

    if (Notification.permission === 'default') {
      let granted: NotificationPermission;
      try {
        granted = await Notification.requestPermission();
      } catch (err) {
        console.warn('[Bridge] Permission request failed:', err);
        return false;
      }
      if (granted !== 'granted') return false;
    }

    await this.initFCM();
    return true;
  }

  stop(): void {
    if (!this.started) return;

    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];

    if (this.fcmUnsubscribe) {
      this.fcmUnsubscribe();
      this.fcmUnsubscribe = null;
    }

    if (this.tokenRefreshUnsub) {
      this.tokenRefreshUnsub();
      this.tokenRefreshUnsub = null;
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
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      console.warn('[Bridge] initFCM called without granted permission — skipping.');
      return;
    }

    // Get FCM token
    try {
      const { app } = getFirebase();
      if (!app) {
        console.warn('[Bridge] Firebase app not initialised — skipping FCM token.');
        return;
      }
      let messaging: ReturnType<typeof getMessaging>;
      try {
        messaging = getMessaging(app);
      } catch (err) {
        console.warn('[Bridge] Firebase Messaging not initialised — skipping FCM token.', err);
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
      const readyRegistration = await this.ensureServiceWorkerReady();
      if (readyRegistration) {
        tokenOptions.serviceWorkerRegistration = readyRegistration;
      }

      const token = await this.getTokenWithRetry(messaging, tokenOptions);
      console.log('[Bridge] FCM token acquired.');

      if (this.userId && token) {
        await this.persistFCMToken(token);
      }

      // The modular Firebase SDK does not expose an onTokenRefresh listener.
      // Re-fetch the token on each tab-focus event — this is low-cost (getToken
      // returns the cached value immediately if the token is still valid) and
      // ensures long-lived sessions always have a fresh token in Firestore.
      const handleVisibilityChange = async () => {
        if (document.visibilityState !== 'visible') return;
        try {
          const refreshed = await getToken(messaging, tokenOptions);
          if (this.userId && refreshed && refreshed !== token) {
            await this.persistFCMToken(refreshed);
            console.log('[Bridge] FCM token refreshed on focus.');
          }
        } catch (err) {
          console.warn('[Bridge] Token refresh on focus failed:', err);
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      this.tokenRefreshUnsub = () =>
        document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Handle foreground FCM messages (server-pushed).
      // SpineToast already handles Spine events; this handles messages pushed
      // by a server/Cloud Function when the tab happens to be in focus.
      this.fcmUnsubscribe = onMessage(messaging, (payload) => {
        console.log('[Bridge] FCM foreground message received:', payload);

        const fcmType = typeof payload.data?.type === 'string' ? payload.data.type : '';
        const moduleId = typeof payload.data?.source === 'string' ? payload.data.source : '';
        const title = payload.notification?.title ?? 'Nexus Reminder';
        const body = payload.notification?.body ?? '';
        const scheduleId = typeof payload.data?.scheduleId === 'string' ? payload.data.scheduleId : undefined;
        const occurrenceId = typeof payload.data?.occurrenceId === 'string'
          ? payload.data.occurrenceId
          : scheduleId
            ? hashOccurrenceId(`${scheduleId}:${payload.data?.dueAt ?? Date.now()}`)
            : hashOccurrenceId(`${moduleId}:${Date.now()}`);
        const dueAt = typeof payload.data?.dueAt === 'string' ? payload.data.dueAt : new Date().toISOString();
        const focusId = typeof payload.data?.focusId === 'string' ? payload.data.focusId : undefined;

        // Foreground path
        if (document.visibilityState === 'visible') {
          if (fcmType === 'MODULE_REMINDER_DUE' && moduleId) {
            // Reminder: show custom in-app card with "Log now" CTA.
            this.showInAppReminderToast({ title, body, moduleId });
          } else if (fcmType) {
            // Other server-pushed alert (e.g. BURNOUT_WARNING sent directly via FCM).
            // Re-publish onto the local Spine bus so SpineToast renders it —
            // SpineToast only listens to Spine, not to the FCM onMessage stream.
            Spine.publish({
              type: fcmType as import('@/lib/types').SpineEventType,
              source: moduleId || 'bridge',
              domain: 'system',
              priority: (payload.data?.priority as import('@/lib/types').SpineEvent['priority']) || 'alert',
              data: payload.data ?? {},
            });
          }
          return;
        }

        // Background path: show native OS notification.
        this.showNativeNotification(title, body, payload.data ?? {});
      });
    } catch (err) {
      const details = describeError(err);
      if (isPushServiceError(err)) {
        if (!fcmUnavailableLogged) {
          fcmUnavailableLogged = true;
          const isLocalhost =
            typeof window !== 'undefined' &&
            (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1');
          console.warn(
            '[Bridge] Push notifications unavailable in this environment.',
            isLocalhost
              ? 'Expected on localhost; reminders and FCM will work when deployed over HTTPS.'
              : 'Check browser permissions and that the app is served over HTTPS.'
          );
          console.warn('[Bridge] FCM init error details:', details);
        }
      } else {
        console.error('[Bridge] FCM init failed:', details, err);
      }
    }
  }

  private async ensureServiceWorkerReady(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null;

    const registration = this.swRegistration;
    if (!registration) return null;

    if (registration.active) return registration;

    const worker = registration.installing ?? registration.waiting;
    if (worker) {
      await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, 5000);
        const handleStateChange = () => {
          if (worker.state === 'activated' || worker.state === 'redundant') {
            worker.removeEventListener('statechange', handleStateChange);
            window.clearTimeout(timeout);
            resolve();
          }
        };

        worker.addEventListener('statechange', handleStateChange);
        handleStateChange();
      });
    }

    try {
      await Promise.race([
        navigator.serviceWorker.ready.then(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, 5000)),
      ]);
    } catch (err) {
      console.warn('[Bridge] Waiting for service worker readiness failed:', describeError(err));
    }

    const refreshed = await navigator.serviceWorker.getRegistration('/');
    if (refreshed) {
      this.swRegistration = refreshed;
      return refreshed;
    }

    return this.swRegistration;
  }

  private async getTokenWithRetry(
    messaging: ReturnType<typeof getMessaging>,
    tokenOptions: { vapidKey: string; serviceWorkerRegistration?: ServiceWorkerRegistration }
  ): Promise<string> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await getToken(messaging, tokenOptions);
      } catch (err) {
        lastError = err;
        if (attempt === 2 || !isPushServiceError(err)) {
          throw err;
        }

        console.warn(
          '[Bridge] FCM token request failed; retrying after service worker readiness check.',
          describeError(err)
        );
        tokenOptions.serviceWorkerRegistration = (await this.ensureServiceWorkerReady()) ?? tokenOptions.serviceWorkerRegistration;
        await new Promise((resolve) => window.setTimeout(resolve, 750));
      }
    }

    throw lastError instanceof Error ? lastError : new Error('FCM token acquisition failed.');
  }

  // -------------------------------------------------------------------------
  // FCM Token Persistence
  // -------------------------------------------------------------------------

  private async persistFCMToken(token: string): Promise<void> {
    if (!this.userId) return;
    const dl = getNexusDataLayer();

    await dl.setDocument(`users/${this.userId}/fcm_tokens`, 'primary', {
      token,
      updatedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
    });

    const existing = await dl.getDocument<{
      channels?: { push?: { tokens?: string[]; enabled?: boolean; eventTypes?: string[]; minPriority?: string } };
    }>('bridge_config', this.userId);

    const existingTokens: string[] = existing?.channels?.push?.tokens ?? [];

    // Deduplicate, promote current token to front, then cap to MAX_FCM_TOKENS.
    const deduped = [token, ...existingTokens.filter((t) => t !== token)];
    const cappedTokens = deduped.slice(0, MAX_FCM_TOKENS);

    await dl.setDocument('bridge_config', this.userId, {
      channels: {
        push: {
          enabled: true,
          tokens: cappedTokens,
          minPriority: existing?.channels?.push?.minPriority ?? 'info',
          eventTypes: existing?.channels?.push?.eventTypes ?? [],
        },
      },
      updatedAt: new Date().toISOString(),
    });

    console.log('[Bridge] FCM token saved and bridge_config updated.');
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
       
      new Notification(title, {
        body,
        icon: NOTIFICATION_ICON,
      });
    } catch (err) {
      console.warn('[Bridge] Fallback Notification() failed:', err);
    }
  }

  // -------------------------------------------------------------------------
  // In-app reminder UX (foreground FCM)
  // -------------------------------------------------------------------------
  showInAppReminderToast({
    title,
    body,
    moduleId,
  }: {
    title: string;
    body: string;
    moduleId: string;
  }): void {
    // Replace existing reminder toast so we don't spam users.
    const existing = document.getElementById('nexus-reminder-toast');
    existing?.remove();

    const toast = document.createElement('div');
    toast.id = 'nexus-reminder-toast';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.zIndex = '999999';
    toast.style.width = '340px';
    toast.style.maxWidth = 'calc(100vw - 3rem)';
    toast.style.borderRadius = '18px';
    toast.style.border = '1px solid rgba(255,255,255,0.12)';
    toast.style.background = 'rgba(5,5,10,0.95)';
    toast.style.backdropFilter = 'blur(12px)';
    toast.style.boxShadow = '0 16px 50px rgba(0,0,0,0.55)';
    toast.style.padding = '16px';
    toast.style.pointerEvents = 'auto';

    const titleEl = document.createElement('p');
    titleEl.textContent = title;
    titleEl.style.fontSize = '12px';
    titleEl.style.fontWeight = '700';
    titleEl.style.color = 'rgba(255,255,255,0.85)';
    titleEl.style.margin = '0 0 6px 0';

    const bodyEl = document.createElement('p');
    bodyEl.textContent = body;
    bodyEl.style.fontSize = '12px';
    bodyEl.style.lineHeight = '1.35';
    bodyEl.style.color = 'rgba(255,255,255,0.65)';
    bodyEl.style.margin = '0 0 12px 0';
    bodyEl.style.whiteSpace = 'pre-wrap';
    bodyEl.style.wordBreak = 'break-word';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'flex-end';
    row.style.gap = '10px';
    row.style.alignItems = 'center';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Log now';
    btn.style.padding = '8px 12px';
    btn.style.borderRadius = '14px';
    btn.style.background = 'rgba(99,102,241,0.18)';
    btn.style.border = '1px solid rgba(99,102,241,0.28)';
    btn.style.color = 'rgba(199,210,254,0.95)';
    btn.style.fontWeight = '700';
    btn.style.fontSize = '12px';
    btn.style.cursor = 'pointer';

    btn.addEventListener('click', () => {
      toast.remove();
      const route = `/${moduleId}`;
      try {
        window.history.pushState({}, '', route);
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch {
        window.location.assign(route);
      }
    });

    row.appendChild(btn);
    toast.appendChild(titleEl);
    toast.appendChild(bodyEl);
    toast.appendChild(row);
    document.body.appendChild(toast);

    window.setTimeout(() => {
      toast.remove();
    }, 10000);
  }
}

// Export singleton
export const BridgeService = new BridgeServiceClass();

/**
 * Sends a test notification through every step of the chain and logs
 * a diagnostic report to the console. Call from the browser console:
 *   import('/src/lib/services/bridge-service.ts').then(m => m.diagnoseFCM())
 * Or expose via window in dev:
 *   window.__diagnoseFCM()
 */
export async function diagnoseFCM(): Promise<void> {
  console.group('[FCM Diagnosis]');

  // 1. Permission
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  console.log('1. Notification permission:', perm);
  if (perm !== 'granted') {
    console.error('   ❌ Permission not granted — notifications cannot fire.');
    console.groupEnd();
    return;
  }

  // 2. Service worker
  if (!('serviceWorker' in navigator)) {
    console.error('2. ❌ Service workers not supported.');
    console.groupEnd();
    return;
  }
  const swRegs = await navigator.serviceWorker.getRegistrations();
  const fcmSw = swRegs.find((r) => r.active?.scriptURL.includes('firebase-messaging-sw'));
  console.log('2. Service worker:', fcmSw ? `✅ active at ${fcmSw.scope}` : '❌ not registered');

  // 3. FCM token in Firestore
  const dl = getNexusDataLayer();
  const uid = (BridgeService as unknown as { userId: string | null }).userId;
  console.log('3. BridgeService userId:', uid ?? '❌ not set (not logged in or start() not called)');

  if (uid) {
    const tokenDoc = await dl.getDocument<{ token?: string }>(`users/${uid}/fcm_tokens`, 'primary');
    console.log('4. FCM token in Firestore:', tokenDoc?.token ? `✅ ${tokenDoc.token.slice(0, 20)}…` : '❌ missing');

    const bridgeCfg = await dl.getDocument<{
      channels?: { push?: { enabled?: boolean; tokens?: string[]; minPriority?: string } };
    }>('bridge_config', uid);
    const pushCfg = bridgeCfg?.channels?.push;
    console.log('5. bridge_config push.enabled:', pushCfg?.enabled ? '✅ true' : '❌ false / missing');
    console.log('5. bridge_config push.tokens count:', pushCfg?.tokens?.length ?? '❌ 0 / missing');
    console.log('5. bridge_config push.minPriority:', pushCfg?.minPriority ?? '(not set)');

    // 6. Try firing a test OS notification directly
    console.log('6. Firing direct SW showNotification test…');
    if (fcmSw) {
      await fcmSw.showNotification('FCM Test ✅', {
        body: 'If you see this, the SW notification path works.',
        icon: '/assets/images/soma.png',
        tag: 'fcm-test',
      });
      console.log('   ✅ SW showNotification called — check your OS notification tray.');
    } else {
      console.warn('   ⚠️ No SW — trying Notification() directly');
      new Notification('FCM Test ✅', { body: 'Direct Notification() fallback.' });
    }
  }

  console.groupEnd();
}
