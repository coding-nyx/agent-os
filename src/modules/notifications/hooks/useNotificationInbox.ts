/**
 * useNotificationInbox
 *
 * Owns inbox-level concerns: item CRUD (delete, clear-all, navigate),
 * bulk selection, per-item snooze state, filter/view mode, quiet hours,
 * and the derived filtered list.
 */

import { useState, useCallback, useMemo } from 'react';
import type { AuthUser } from '@/lib/services/auth-service';
import { useDataLayer } from '@/lib/data-layer/provider';
import { useNavigate } from 'react-router-dom';
import { useNotifications, type InboxRecord } from '@/lib/notifications/NotificationContext';
import { ReminderOutcomeService } from '@/lib/notifications/reminder-outcome-service';
import {
  isSnoozed,
  QuietHoursConfig,
  createDefaultQuietHours,
} from '../services/notification-service';

type FilterMode = 'all' | 'unread' | 'critical';
type ViewMode = 'notifications' | 'reminders';

interface UseNotificationInboxParams {
  user: AuthUser | null;
}

export function useNotificationInbox({ user }: UseNotificationInboxParams) {
  const dataLayer = useDataLayer();
  const navigate = useNavigate();
  const {
    inbox: items,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    performAction,
  } = useNotifications();

  const [filter, setFilter] = useState<FilterMode>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('notifications');
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // ── Bulk selection ──────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Snooze ──────────────────────────────────────────────────────────────
  const [snoozedMap, setSnoozedMap] = useState<Record<string, string>>({}); // id → snoozedUntil ISO

  // ── Quiet hours ─────────────────────────────────────────────────────────
  const [quietHours, setQuietHours] = useState<QuietHoursConfig>(createDefaultQuietHours());

  // ── AI toggle ───────────────────────────────────────────────────────────
  const [showAI, setShowAI] = useState(false);

  // ── Item CRUD ───────────────────────────────────────────────────────────
  const deleteItem = useCallback(async (id: string) => {
    if (!user) return;
    const record = items.find((item) => item.id === id);
    if (record) {
      await ReminderOutcomeService.recordOutcome(dataLayer, user.uid, record, 'skipped');
    }
    await dataLayer.deleteDocument(`users/${user.uid}/notification_inbox`, id);
  }, [dataLayer, items, user]);

  const clearAll = useCallback(async () => {
    if (!user) return;
    await Promise.all(
      items.map((item) => ReminderOutcomeService.recordOutcome(dataLayer, user.uid, item, 'skipped')),
    );
    await Promise.all(
      items.map((i) =>
        dataLayer.deleteDocument(`users/${user.uid}/notification_inbox`, i.id),
      ),
    );
  }, [dataLayer, items, user]);

  const navigateToItem = useCallback((item: InboxRecord) => {
    if (item.action) {
      void performAction(item.action, item.id);
    } else {
      const route = item.data?.deepLink?.route;
      const focusId = item.data?.deepLink?.focusId;
      if (!item.read) markAsRead(item.id);
      if (route) navigate(route, focusId ? { state: { focusId } } : undefined);
    }
  }, [markAsRead, performAction, navigate]);

  // ── Derived filter data ─────────────────────────────────────────────────
  const criticalCount = items.filter((i) => i.priority === 'critical' || i.priority === 'alert').length;

  const filtered = useMemo(() =>
    items.filter((item) => {
      if (isSnoozed(snoozedMap[item.id])) return false;
      if (filter === 'unread') return !item.read;
      if (filter === 'critical') return item.priority === 'critical' || item.priority === 'alert';
      return true;
    }), [items, snoozedMap, filter],
  );

  // ── Bulk action handlers ────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filtered.map((i) => i.id)));
  }, [filtered]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const markReadSelected = useCallback(async () => {
    await Promise.all(Array.from(selectedIds).map((id) => markAsRead(id)));
    setSelectedIds(new Set());
  }, [selectedIds, markAsRead]);

  const deleteSelected = useCallback(async () => {
    if (!user) return;
    const selectedRecords = Array.from(selectedIds)
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is InboxRecord => Boolean(item));

    await Promise.all(
      selectedRecords.map((record) =>
        ReminderOutcomeService.recordOutcome(dataLayer, user.uid, record, 'skipped'),
      ),
    );

    await Promise.all(
      Array.from(selectedIds).map((id) =>
        dataLayer.deleteDocument(`users/${user.uid}/notification_inbox`, id),
      ),
    );
    setSelectedIds(new Set());
  }, [dataLayer, items, selectedIds, user]);

  // ── Snooze handlers ─────────────────────────────────────────────────────
  const handleSnooze = useCallback((id: string, snoozedUntil: string) => {
    setSnoozedMap((prev) => ({ ...prev, [id]: snoozedUntil }));
  }, []);

  const handleUnsnooze = useCallback((id: string) => {
    setSnoozedMap((prev) => { const next = { ...prev }; delete next[id]; return next; });
  }, []);

  return {
    // Inbox data
    items,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    // Filter / view
    filter,
    setFilter,
    viewMode,
    setViewMode,
    criticalCount,
    filtered,
    // Confirm clear all
    confirmClearAll,
    setConfirmClearAll,
    // CRUD
    deleteItem,
    clearAll,
    navigateToItem,
    // Bulk
    selectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
    markReadSelected,
    deleteSelected,
    // Snooze
    snoozedMap,
    handleSnooze,
    handleUnsnooze,
    // Quiet hours
    quietHours,
    setQuietHours,
    // AI
    showAI,
    setShowAI,
    // Navigation
    navigate,
  };
}
