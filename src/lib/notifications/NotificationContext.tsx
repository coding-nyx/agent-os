import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useDataLayer } from '@/lib/data-layer/provider';
import { useNavigate } from 'react-router-dom';
import type { NotificationAction, NotificationPriority } from '@/lib/notifications/types';
import { ActionRegistry } from './action-registry';
import { ReminderOutcomeService } from './reminder-outcome-service';

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

  // 1. Sync Inbox from Firestore
  useEffect(() => {
    if (!user) {
      setInbox([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    const inboxPath = `users/${user.uid}/notification_inbox`;
    
    // Subscribe to the inbox collection, sorted by createdAt desc
    const unsubscribe = dataLayer.subscribeToQuery<InboxRecord>(
      {
        collection: inboxPath,
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: 50
      },
      (records: InboxRecord[]) => {
        setInbox(records);
        setUnreadCount(records.filter(r => !r.read).length);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, dataLayer]);

  // 2. Handle Actions
  const performAction = useCallback(async (action: NotificationAction, notificationId?: string) => {
    const record = notificationId ? inbox.find(r => r.id === notificationId) : undefined;
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
  }, [user, dataLayer, navigate, inbox]);

  // 3. Foreground Toast Logic (triggered by new unread items in inbox)
  // We only show toasts for items that arrived VERY recently (e.g. within the last 30 seconds)
  // to avoid showing old notifications on page load.
  useEffect(() => {
    const now = Date.now();
    const newItems = inbox.filter(r => !r.read && (now - new Date(r.createdAt).getTime()) < 30000);
    
    setToasts(prev => {
      const existingIds = new Set(prev.map(t => t.id));
      const filteredNew = newItems.filter(item => !existingIds.has(item.id));
      
      if (filteredNew.length === 0) return prev;

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
    const inboxPath = `users/${user.uid}/notification_inbox`;
    
    await Promise.all(unread.map(r => 
      dataLayer.updateDocument(inboxPath, r.id, { read: true, updatedAt: new Date().toISOString() })
    ));
    await Promise.all(unread.map((record) =>
      ReminderOutcomeService.recordOutcome(dataLayer, user.uid, record, 'skipped'),
    ));
  }, [user, inbox, dataLayer]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const value = useMemo(() => ({
    inbox,
    unreadCount,
    toasts,
    loading,
    markAsRead,
    markAllAsRead,
    dismissToast,
    performAction,
  }), [inbox, unreadCount, toasts, loading, markAsRead, markAllAsRead, dismissToast, performAction]);

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
