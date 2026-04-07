/**
 * useNotificationSchedules
 *
 * Owns the reminder-schedule lifecycle: Firestore subscription, preset
 * merging, agent vs user partitioning, and CRUD for individual schedules
 * (toggle, save, delete).  Also manages the "delete schedule" confirm target.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { AuthUser } from '@/lib/services/auth-service';
import { useDataLayer } from '@/lib/data-layer/provider';
import type { NexusRecord } from '@/lib/data-layer';
import type { NotificationScheduleConfig } from '@/lib/notifications/types';
import { buildAllPresets } from '@/lib/notifications/preset-registry';
import { BridgeService } from '@/lib/services/bridge-service';
import { queueScheduleReminder } from '@/lib/notifications/schedule-dispatch-service';
import { ReminderLifecycleService } from '@/lib/notifications/reminder-lifecycle-service';

interface UseNotificationSchedulesParams {
  user: AuthUser | null;
  isGuest: boolean;
}

export function useNotificationSchedules({ user, isGuest }: UseNotificationSchedulesParams) {
  const dataLayer = useDataLayer();
  const [schedules, setSchedules] = useState<NexusRecord<NotificationScheduleConfig>[]>([]);
  const [deleteScheduleTarget, setDeleteScheduleTarget] = useState<{ id: string; title: string } | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // ── Firestore subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!user || isGuest) {
      setSchedules([]);
      return;
    }
    const unsub = dataLayer.subscribeToQuery<NotificationScheduleConfig>(
      {
        collection: `users/${user.uid}/notification_schedules`,
        orderBy: [{ field: 'updatedAt', direction: 'desc' }],
        limit: 200,
      },
      (docs) => {
        setSchedules(docs);
      },
    );
    return () => unsub?.();
  }, [dataLayer, isGuest, user]);

  // ── Preset merging ──────────────────────────────────────────────────────
  const allPresets = useMemo(() => buildAllPresets(), []);
  const PRESET_IDS = useMemo(() => new Set(allPresets.map((p) => p.scheduleId)), [allPresets]);

  const scheduleMap = useMemo(() => {
    const m = new Map<string, NexusRecord<NotificationScheduleConfig>>();
    for (const s of schedules) m.set(s.id, s);
    return m;
  }, [schedules]);

  const mergedPresets = useMemo(() =>
    allPresets.map((p) => ({
      scheduleId: p.scheduleId,
      config: (scheduleMap.get(p.scheduleId) ?? p.config) as NotificationScheduleConfig,
      moduleId: p.config.moduleId,
    })), [allPresets, scheduleMap],
  );

  const agentSchedules = useMemo(() =>
    schedules.filter((s) => s.createdBy === 'agent' && !PRESET_IDS.has(s.id)),
    [schedules, PRESET_IDS],
  );

  const userSchedules = useMemo(() =>
    schedules.filter((s) => s.createdBy !== 'agent' && !PRESET_IDS.has(s.id)),
    [schedules, PRESET_IDS],
  );

  // ── Schedule CRUD ───────────────────────────────────────────────────────
  const deleteSchedule = useCallback(async (id: string) => {
    if (!user) return;
    const schedule = schedules.find((entry) => entry.id === id);
    if (schedule?.enabled) {
      await ReminderLifecycleService.cancel(user.uid, id);
    }
    await dataLayer.deleteDocument(`users/${user.uid}/notification_schedules`, id);
  }, [dataLayer, schedules, user]);

  const toggleSchedule = useCallback(async (id: string, enabled: boolean) => {
    if (!user) return;

    if (!enabled) {
      await ReminderLifecycleService.cancel(user.uid, id);
      return;
    }

    await dataLayer.updateDocument(`users/${user.uid}/notification_schedules`, id, {
      enabled,
      updatedAt: new Date().toISOString(),
    });

    if (enabled) {
      try {
        await queueScheduleReminder(id);
      } catch (err) {
        console.warn('[NotificationsPage] scheduleReminder failed:', err);
      }
    }
  }, [dataLayer, user]);

  const savePreset = useCallback(async (scheduleId: string, next: NotificationScheduleConfig) => {
    if (!user || isGuest) return;
    const existing = scheduleMap.get(scheduleId);
    const wasEnabled = existing?.enabled ?? false;
    const isNewlyEnabled = next.enabled && !wasEnabled;

    await dataLayer.setDocument<NotificationScheduleConfig>(
      `users/${user.uid}/notification_schedules`,
      scheduleId,
      next,
    );

    if (isNewlyEnabled && 'Notification' in window && Notification.permission !== 'granted') {
      await BridgeService.requestPermissionAndInit();
    }
    if (isNewlyEnabled) {
      try {
        await queueScheduleReminder(scheduleId);
      } catch (err) {
        console.warn('[NotificationsPage] scheduleReminder preset failed:', err);
      }
    }
  }, [dataLayer, isGuest, scheduleMap, user]);

  return {
    mergedPresets,
    agentSchedules,
    userSchedules,
    deleteScheduleTarget,
    setDeleteScheduleTarget,
    isCreateModalOpen,
    setIsCreateModalOpen,
    deleteSchedule,
    toggleSchedule,
    savePreset,
  };
}
