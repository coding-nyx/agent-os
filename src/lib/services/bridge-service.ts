/**
 * BridgeService — Headless Spine subscriber / FCM push-notification daemon.
 *
 * Responsibilities:
 *  1. Register the firebase-messaging-sw.js service worker.
 *  2. Request notification permission and persist FCM tokens to Firestore.
 *  3. Handle background FCM messages by showing OS notifications.
 *
 * Bridge is headless — no React component, no UI side-effects.
 * Foreground notifications are handled by NotificationContext.
 */

import { getToken, onMessage, getMessaging } from 'firebase/messaging';
import { getFirebase } from '@/lib/firebase';
import { getNexusDataLayer } from '@/lib/data-layer/provider';

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
  const msg = String((err as any)?.toString?.() || '').toLowerCase();
  const name = String((err as any)?.name || '').toLowerCase();
  const message = String((err as any)?.message || '').toLowerCase();
  const code = String((err as any)?.code || '').toLowerCase();

  return (
    name === 'aborterror' ||
    name === 'domexception' ||
    name.includes('abort') ||
    code.startsWith('messaging/') ||
    msg.includes('abort') ||
    msg.includes('registration failed') ||
    msg.includes('push service error') ||
    msg.includes('service worker') ||
    message.includes('abort') ||
    message.includes('registration failed') ||
    message.includes('push service') ||
    message.includes('service worker')
  );
}

// ---------------------------------------------------------------------------
// BridgeService singleton
// ---------------------------------------------------------------------------

class BridgeServiceClass {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private fcmUnsubscribe: (() => void) | null = null;
  private tokenRefreshUnsub: (() => void) | null = null;
  private userId: string | null = null;
  private started = false;
  private initPromise: Promise<void> | null = null;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async start(userId: string): Promise<void> {
    if (this.started && this.userId === userId) return;

    if (this.initPromise) return this.initPromise;

    this.userId = userId;
    this.started = true;

    this.initPromise = (async () => {
      console.log('[Bridge] Starting for user:', userId);

      // 1. Register service worker
      await this.registerServiceWorker();

      // 2. If permission is already granted, init FCM.
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          await this.initFCM();
        } catch (err) {
          console.warn('[Bridge] FCM init failed during start:', err);
          // If push failed but we have a user, at least ensure the bridge_config
          // exists so the Cloud Function can still process for inbox.
          if (this.userId) {
            await this.ensureBridgeConfig();
          }
        }
      } else if (this.userId) {
        // Even if permission not granted, ensure config exists for inbox delivery.
        await this.ensureBridgeConfig();
      }
    })();

    return this.initPromise;
  }

  async requestPermissionAndInit(): Promise<boolean> {
    if (!this.userId) return false;
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'denied') return false;

    if (Notification.permission === 'default') {
      const granted = await Notification.requestPermission();
      if (granted !== 'granted') return false;
    }

    try {
      await this.initFCM();
      return true;
    } catch (err) {
      console.warn('[Bridge] FCM init failed after permission request:', err);
      // Ensure config exists even if FCM failed
      await this.ensureBridgeConfig();
      return false;
    }
  }

  stop(): void {
    if (!this.started) return;

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
    this.initPromise = null;
    console.log('[Bridge] Stopped.');
  }

  // -------------------------------------------------------------------------
  // Service Worker Registration
  // -------------------------------------------------------------------------

  private async registerServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;

    try {
      // Check for existing registration first
      const existing = await navigator.serviceWorker.getRegistration('/');
      if (existing && existing.active) {
        this.swRegistration = existing;
        console.log('[Bridge] Using existing service worker');
        return;
      }

      this.swRegistration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js',
        { scope: '/' }
      );
      console.log('[Bridge] Service worker registered');
    } catch (err) {
      console.error('[Bridge] SW registration failed:', err);
    }
  }

  // -------------------------------------------------------------------------
  // FCM Initialisation
  // -------------------------------------------------------------------------

  private async initFCM(): Promise<void> {
    const isLocalhost = typeof window !== 'undefined' && 
      (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1');
    const isSecure = window.location?.protocol === 'https:';
    
    if (isLocalhost && !isSecure) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    try {
      const { app } = getFirebase();
      if (!app) return;
      
      const messaging = getMessaging(app);
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string;

      const readyRegistration = await this.ensureServiceWorkerReady();
      
      // If we still don't have a registration, we can't get a token.
      if (!readyRegistration) {
        console.warn('[Bridge] Service worker not ready, skipping FCM token.');
        return;
      }

      const token = await this.getTokenWithRetry(messaging, {
        vapidKey,
        serviceWorkerRegistration: readyRegistration,
      });

      if (this.userId && token) {
        await this.persistFCMToken(token);
      }

      // Cleanup old listener if any
      if (this.tokenRefreshUnsub) this.tokenRefreshUnsub();

      const handleVisibilityChange = async () => {
        if (document.visibilityState !== 'visible' || !this.userId) return;
        try {
          const refreshed = await getToken(messaging, { vapidKey });
          if (this.userId && refreshed && refreshed !== token) {
            await this.persistFCMToken(refreshed);
          }
        } catch (err) {
          // Suppress noise during tab switching
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      this.tokenRefreshUnsub = () => document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Handle FCM messages
      if (this.fcmUnsubscribe) this.fcmUnsubscribe();
      this.fcmUnsubscribe = onMessage(messaging, (payload) => {
        console.log('[Bridge] FCM message received:', payload);
        
        if (document.visibilityState !== 'visible') {
          const title = payload.notification?.title ?? 'Nexus Alert';
          const body = payload.notification?.body ?? '';
          this.showNativeNotification(title, body, (payload.data as any) ?? {});
        }
      });

    } catch (err) {
      if (isPushServiceError(err)) {
        if (!fcmUnavailableLogged) {
          console.warn('[Bridge] Push notifications unavailable in this environment (likely browser restriction).');
          fcmUnavailableLogged = true;
        }
      } else {
        console.error('[Bridge] FCM init failed:', err);
      }
    }
  }

  private async ensureServiceWorkerReady(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null;
    
    let registration = this.swRegistration || await navigator.serviceWorker.getRegistration('/');
    if (!registration) return null;

    if (registration.active) return registration;

    // Wait for the SW to become active
    const worker = registration.installing ?? registration.waiting;
    if (worker) {
      await new Promise<void>((resolve) => {
        const handler = () => {
          if (worker.state === 'activated') {
            worker.removeEventListener('statechange', handler);
            resolve();
          } else if (worker.state === 'redundant') {
            worker.removeEventListener('statechange', handler);
            resolve(); // Still resolve to let the flow continue
          }
        };
        worker.addEventListener('statechange', handler);
      });
    }

    return registration;
  }

  private async getTokenWithRetry(
    messaging: any,
    options: any
  ): Promise<string> {
    try {
      return await getToken(messaging, options);
    } catch (err) {
      if (isPushServiceError(err)) {
        // One retry with refreshed registration
        options.serviceWorkerRegistration = await this.ensureServiceWorkerReady();
        if (options.serviceWorkerRegistration) {
          try {
            return await getToken(messaging, options);
          } catch (err2) {
            throw err2;
          }
        }
      }
      throw err;
    }
  }

  private async persistFCMToken(token: string): Promise<void> {
    if (!this.userId) return;
    const dl = getNexusDataLayer();

    await dl.setDocument(`users/${this.userId}/fcm_tokens`, 'primary', {
      token,
      updatedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
    });

    const existing = await dl.getDocument<any>('bridge_config', this.userId);
    const existingTokens: string[] = existing?.channels?.push?.tokens ?? [];
    const cappedTokens = [token, ...existingTokens.filter((t) => t !== token)].slice(0, MAX_FCM_TOKENS);

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
  }

  /**
   * Ensures the bridge_config document exists for the current user.
   * This allows the Cloud Function to process notifications for the inbox
   * even if push tokens are not yet available or initialization failed.
   */
  private async ensureBridgeConfig(): Promise<void> {
    if (!this.userId) return;
    const dl = getNexusDataLayer();
    const existing = await dl.getDocument<any>('bridge_config', this.userId);
    
    // Only initialize if it doesn't exist yet
    if (!existing) {
      await dl.setDocument('bridge_config', this.userId, {
        channels: {
          push: {
            enabled: false,
            tokens: [],
            minPriority: 'info',
            eventTypes: [],
          },
        },
        updatedAt: new Date().toISOString(),
      });
    }
  }

  private showNativeNotification(title: string, body: string, data: Record<string, string>): void {
    if (Notification.permission !== 'granted') return;

    if (this.swRegistration) {
      this.swRegistration.showNotification(title, {
        body,
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_ICON,
        data,
        tag: data['type'] || 'nexus-alert',
        renotify: true,
      } as any);
    } else {
      new Notification(title, { body, icon: NOTIFICATION_ICON });
    }
  }
}

export const BridgeService = new BridgeServiceClass();

/**
 * Sends a test notification through every step of the chain and logs
 * a diagnostic report to the console.
 */
export async function diagnoseFCM(): Promise<void> {
  console.group('[FCM Diagnosis]');
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  console.log('1. Notification permission:', perm);

  if ('serviceWorker' in navigator) {
    const swRegs = await navigator.serviceWorker.getRegistrations();
    const fcmSw = swRegs.find((r) => r.active?.scriptURL.includes('firebase-messaging-sw'));
    console.log('2. Service worker:', fcmSw ? `✅ active at ${fcmSw.scope}` : '❌ not registered');
    
    if (fcmSw && perm === 'granted') {
      console.log('3. Firing direct SW showNotification test…');
      await fcmSw.showNotification('FCM Test ✅', {
        body: 'If you see this, the SW notification path works.',
        icon: NOTIFICATION_ICON,
        tag: 'fcm-test',
      });
    }
  }
  console.groupEnd();
}

