import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useDataLayer } from '@/lib/data-layer/provider';
import { useNavigate } from 'react-router-dom';
import type { NotificationAction, NotificationPriority } from '@/lib/notifications/types';
import { ActionRegistry } from './action-registry';
import { ReminderOutcomeService } from './reminder-outcome-service';
import { Spine } from '@/lib/spine/spine-event-bus';
import {
  isSnoozed,
  shouldSuppressNotification,
  loadQuietHoursConfig,
  createDefaultQuietHours,
  type QuietHoursConfig,
} from '@/modules/notifications/services/notification-service';

// Module-level set — persists across NotificationProvider remounts (e.g. navigation).
// Cleared only when the user changes so the next session starts fresh.
let _toastedIdsGlobal = new Set<string>();
let _toastedIdsUid: string | null = null;

export interface InboxRecord {
  id: string;
  type: string;
  source: string;
  priority: NotificationPriority;
  title: string;
  note: string;
  data?: Record<string, any>;
  action?: NotificationAction;
  read: boolean;
  /** ISO string. When set and in the future, the notification is snoozed. */
  snoozedUntil?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationToast extends InboxRecord {
  visible: boolean;
}

interface NotificationContextValue {
  inbox: InboxRecord[];
  unreadCount: number;
  toasts: NotificationToast[];
  loading: boolean;
  /** Set when the Firestore inbox subscription encounters an error. */
  error: Error | null;
  /** Current quiet hours config (persisted to Firestore). */
  quietHoursConfig: QuietHoursConfig;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismissToast: (id: string) => void;
  performAction: (action: NotificationAction, notificationId?: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const dataLayer = useDataLayer();
  const navigate = useNavigate();
  
  const [inbox, setInbox] = useState<InboxRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<NotificationToast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [quietHoursConfig, setQuietHoursConfig] = useState<QuietHoursConfig>(createDefaultQuietHours);

  // Load persisted quiet hours config on user change
  useEffect(() => {
    if (!user) {
      setQuietHoursConfig(createDefaultQuietHours());
      return;
    }
    loadQuietHoursConfig(dataLayer, user.uid)
      .then(setQuietHoursConfig)
      .catch(() => setQuietHoursConfig(createDefaultQuietHours()));
  }, [user, dataLayer]);

  // Keep a ref so the toast effect always reads the latest config without
  // triggering re-runs of the entire inbox subscription effect.
  const quietHoursRef = useRef(quietHoursConfig);
  quietHoursRef.current = quietHoursConfig;

  // Stable ref for inbox so performAction doesn't re-create on every inbox change.
  const inboxRef = useRef(inbox);
  inboxRef.current = inbox;

  // Tracks notification IDs that have already been toasted in this session.
  // Module-level set (not a ref) so it survives provider remounts on navigation.
  // Cleared when the user changes to prevent cross-user leakage.
  const toastedIds = useRef<Set<string>>(_toastedIdsGlobal);

  // 1. Sync Inbox from Firestore
  useEffect(() => {
    if (!user) {
      setInbox([]);
      setUnreadCount(0);
      setLoading(false);
      // Clear toasted IDs and reset the global set for the next user session.
      _toastedIdsGlobal = new Set();
      _toastedIdsUid = null;
      toastedIds.current = _toastedIdsGlobal;
      return;
    }

    // If the user changed, reset the global set for the new session.
    if (_toastedIdsUid !== user.uid) {
      _toastedIdsGlobal = new Set();
      _toastedIdsUid = user.uid;
      toastedIds.current = _toastedIdsGlobal;
    }

    setError(null);
    const inboxPath = `users/${user.uid}/notification_inbox`;
    
    // Subscribe to the inbox collection, sorted by createdAt desc
    const unsubscribe = dataLayer.subscribeToQuery<InboxRecord>(
      {
        collection: inboxPath,
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: 50
      },
      (records: InboxRecord[]) => {
        try {
          setInbox(records);
          setUnreadCount(records.filter(r => !r.read).length);
          setLoading(false);
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err : new Error('Notification inbox update failed'));
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [user, dataLayer]);

  // 2. Handle Actions
  const performAction = useCallback(async (action: NotificationAction, notificationId?: string) => {
    const record = notificationId ? inboxRef.current.find(r => r.id === notificationId) : undefined;
    if (notificationId) {
      // Mark as read when an action is performed
      if (record && !record.read) {
        const inboxPath = `users/${user?.uid}/notification_inbox`;
        await dataLayer.updateDocument(inboxPath, notificationId, { read: true, updatedAt: new Date().toISOString() });
      }
    }

    await ActionRegistry.handleAction(action, {
      navigate,
      markAsRead: async (id: string) => {
        if (!user) return;
        const inboxPath = `users/${user.uid}/notification_inbox`;
        await dataLayer.updateDocument(inboxPath, id, { read: true, updatedAt: new Date().toISOString() });
      },
      userId: user?.uid
    });

    if (record) {
      await ReminderOutcomeService.recordOutcome(dataLayer, user?.uid, record, 'completed');
    }

    if (action.type === 'DISMISS' && notificationId) {
      setToasts(prev => prev.filter(t => t.id !== notificationId));
    }
  }, [user, dataLayer, navigate]);

  // 3. Foreground Toast Logic (triggered by new unread items in inbox)
  // Use a ref-based set of already-toasted IDs instead of a time window.
  // The time-window approach (e.g. < 30 seconds old) has a race condition where
  // items arriving near the boundary are silently dropped, and items present on
  // initial page load (which are old) are never suppressed if 30 seconds pass
  // between loads. The Set approach is deterministic: each ID is toasted once.
  useEffect(() => {
    const freshItems = inbox.filter(r =>
      !r.read &&
      !toastedIds.current.has(r.id) &&
      !isSnoozed(r.snoozedUntil ?? undefined) &&
      !shouldSuppressNotification(r, quietHoursRef.current),
    );
    if (freshItems.length === 0) return;

    // Mark as toasted before updating state to prevent double-fire if the
    // effect runs again before the state update settles.
    for (const item of freshItems) {
      toastedIds.current.add(item.id);
    }

    setToasts(prev => {
      const existingIds = new Set(prev.map(t => t.id));
      const filteredNew = freshItems.filter(item => !existingIds.has(item.id));
      if (filteredNew.length === 0) return prev;

      const dueItems = filteredNew.filter(item => item.type === 'MODULE_REMINDER_DUE');
      for (const item of dueItems) {
        Spine.emit({
          type: 'MODULE_REMINDER_DUE',
          source: 'ara',
          domain: 'system',
          data: { ...item.data, moduleId: item.data?.moduleId, reminderId: item.id },
          cascadeDepth: 0,
          priority: 'info',
        });
      }

      return [
        ...prev,
        ...filteredNew.map(item => ({ ...item, visible: true }))
      ];
    });
  }, [inbox]);

  const markAsRead = useCallback(async (id: string) => {
    if (!user) return;
    const inboxPath = `users/${user.uid}/notification_inbox`;
    const record = inbox.find((item) => item.id === id);
    await dataLayer.updateDocument(inboxPath, id, { read: true, updatedAt: new Date().toISOString() });
    if (record) {
      await ReminderOutcomeService.recordOutcome(dataLayer, user.uid, record, 'skipped');
    }
  }, [dataLayer, inbox, user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    const unread = inbox.filter(r => !r.read);
    if (unread.length === 0) return;
    const inboxPath = `users/${user.uid}/notification_inbox`;
    const now = new Date().toISOString();

    // Merge read flag + reminderOutcome into a single batch write per doc.
    await dataLayer.batchWrite(
      unread.map(r => ({
        type: 'update' as const,
        collection: inboxPath,
        id: r.id,
        data: {
          read: true,
          updatedAt: now,
          ...(r.type === 'MODULE_REMINDER_DUE' && r.data
            ? { data: { ...r.data, reminderOutcome: 'skipped' as const } }
            : {}),
        },
      })),
    );

    // Record outcomes in batch (skip inbox update since we handled it above).
    await ReminderOutcomeService.recordOutcomeBatch(
      dataLayer, user.uid, unread, 'skipped', { skipInboxUpdate: true },
    );
  }, [user, inbox, dataLayer]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const value = useMemo(() => ({
    inbox,
    unreadCount,
    toasts,
    loading,
    error,
    quietHoursConfig,
    markAsRead,
    markAllAsRead,
    dismissToast,
    performAction,
  }), [inbox, unreadCount, toasts, loading, error, quietHoursConfig, markAsRead, markAllAsRead, dismissToast, performAction]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
