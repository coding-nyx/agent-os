import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
import { NeuralToggle } from '@/core/components/NeuralToggle';
import { useAuth } from '@/lib/auth-context';
import { useDataLayer } from '@/lib/data-layer/provider';
import { BridgeService } from '@/lib/services/bridge-service';
import { useLocation } from 'react-router-dom';
import type { ModuleId } from '@/lib/module-manifest';
import type { NotificationScheduleConfig, Recurrence } from '../types';
import { ReminderLifecycleService } from '../reminder-lifecycle-service';
import { queueScheduleReminder } from '../schedule-dispatch-service';
import { RecurrenceEditor } from './RecurrenceEditor';
import { recurrenceSummary } from '../recurrence-summary';
import { type NotificationSchedulePreset } from '../preset-registry';

import type { NexusRecord } from '@/lib/data-layer';
import { cn } from '@/lib/utils';

export type { NotificationSchedulePreset } from '../preset-registry';

function formatNowIso(): string {
  return new Date().toISOString();
}

function NotificationScheduleEditor({
  scheduleId,
  initial,
  onSave,
  disabled,
}: {
  scheduleId: string;
  initial: NotificationScheduleConfig;
  onSave: (next: NotificationScheduleConfig) => Promise<void>;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<NotificationScheduleConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    setDraft(initial);
    dirtyRef.current = false;
  }, [initial]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await onSave({ ...draft, updatedAt: formatNowIso() });
      dirtyRef.current = false;
      setExpanded(false);
    } finally {
      setSaving(false);
    }
  }, [draft, onSave]);

  const setEnabled = (enabled: boolean) => {
    dirtyRef.current = true;
    const next = { ...draft, enabled };
    setDraft(next);
    void onSave({ ...next, updatedAt: formatNowIso() });
  };

  const setRecurrence = (recurrence: Recurrence) => {
    dirtyRef.current = true;
    setDraft((d) => ({ ...d, recurrence }));
  };

  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
      {/* Header row — always visible */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 text-left min-w-0"
          disabled={disabled}
        >
          <p className="text-sm font-semibold text-white/85 leading-none break-words">
            {draft.messageTemplate.title || 'Reminder'}
          </p>
          <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
            {recurrenceSummary(draft.recurrence)}
          </p>
        </button>
        <NeuralToggle
          checked={draft.enabled}
          onChange={setEnabled}
          color="emerald"
          size="sm"
          disabled={disabled}
        />
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-4">
          {/* Notification message */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
              Reminder message
            </label>
            <NeuralInput
              label=""
              value={draft.messageTemplate.title}
              onChange={(e) => {
                dirtyRef.current = true;
                setDraft((d) => ({ ...d, messageTemplate: { ...d.messageTemplate, title: e.target.value } }));
              }}
              placeholder="Short reminder title"
              disabled={disabled}
            />
              <NeuralTextarea
                disabled={disabled}
                value={draft.messageTemplate.body}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                  dirtyRef.current = true;
                  setDraft((d) => ({ ...d, messageTemplate: { ...d.messageTemplate, body: e.target.value } }));
                }}
              placeholder="Optional longer message"
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
              When to remind
            </label>
            <RecurrenceEditor value={draft.recurrence} onChange={setRecurrence} disabled={disabled} />
          </div>

          {/* Delivery channels */}
          <div className="flex items-center gap-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 shrink-0">Deliver via</span>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draft.channelPrefs.os}
                disabled={disabled}
                onChange={(e) => {
                  dirtyRef.current = true;
                  setDraft((d) => ({ ...d, channelPrefs: { ...d.channelPrefs, os: e.target.checked } }));
                }}
                className="accent-indigo-500 w-4 h-4"
              />
              <span className="text-xs text-white/70">Push</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draft.channelPrefs.inApp}
                disabled={disabled}
                onChange={(e) => {
                  dirtyRef.current = true;
                  setDraft((d) => ({ ...d, channelPrefs: { ...d.channelPrefs, inApp: e.target.checked } }));
                }}
                className="accent-indigo-500 w-4 h-4"
              />
              <span className="text-xs text-white/70">In-app</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <NeuralButton
              variant="ghost"
              size="sm"
              onClick={() => { setDraft(initial); setExpanded(false); dirtyRef.current = false; }}
              disabled={disabled || saving}
            >
              Cancel
            </NeuralButton>
            <NeuralButton
              size="sm"
              onClick={save}
              loading={saving}
              disabled={disabled || saving}
              className="px-5"
            >
              Save
            </NeuralButton>
          </div>
        </div>
      )}
    </div>
  );
}

export function NotificationSettingsPanel({
  moduleId,
  title,
  presets,
  className,
  manageAllHref,
}: {
  moduleId: ModuleId;
  title?: string;
  presets: NotificationSchedulePreset[];
  className?: string;
  manageAllHref?: string;
}) {
  const { user, isGuest } = useAuth();
  const dataLayer = useDataLayer();
  const location = useLocation();
  const [schedules, setSchedules] = useState<NexusRecord<NotificationScheduleConfig>[]>([]);
  const [hydrating, setHydrating] = useState(true);
  useEffect(() => {
    if (!user || isGuest) {
      setHydrating(false);
      setSchedules([]);
      return;
    }

    setHydrating(true);
    const unsub = dataLayer.subscribeToQuery<NotificationScheduleConfig>(
      {
        collection: `users/${user.uid}/notification_schedules`,
        where: [{ field: 'moduleId', op: '==', value: moduleId }],
      },
      (docs) => {
        setSchedules(docs);
        setHydrating(false);
      },
    );

    return () => unsub?.();
  }, [dataLayer, isGuest, moduleId, user]);

  const saveSchedule = useCallback(
    async (scheduleId: string, next: NotificationScheduleConfig) => {
      if (!user || isGuest) return;

      // Determine if this is a disabled→enabled transition (new or re-enabled).
      const existing = schedules.find((s) => s.id === scheduleId);
      const wasEnabled = existing?.enabled ?? false;
      const isNewlyEnabled = next.enabled && !wasEnabled;

      await dataLayer.setDocument<NotificationScheduleConfig>(
        `users/${user.uid}/notification_schedules`,
        scheduleId,
        next,
      );

      if (!next.enabled && wasEnabled) {
        await ReminderLifecycleService.cancel(user.uid, scheduleId);
        return;
      }

      // Request OS notification permission the first time a user enables a schedule.
      if (isNewlyEnabled && 'Notification' in window && Notification.permission !== 'granted') {
        await BridgeService.requestPermissionAndInit();
      }

      // Enqueue the first Cloud Task only when the schedule transitions to enabled.
      // Saves that only update message/recurrence text do not re-enqueue.
      if (isNewlyEnabled) {
        try {
          await queueScheduleReminder(scheduleId);
        } catch (err) {
          const maybe = err as { code?: string; message?: string; details?: unknown };
          console.warn('[NotificationSettingsPanel] scheduleReminder failed:', {
            scheduleId,
            code: maybe?.code,
            message: maybe?.message,
            details: maybe?.details,
          });
        }
      }
    },
    [dataLayer, isGuest, schedules, user],
  );


  const scheduleEditors = useMemo(() => {
    const loadedMap = new Map<string, NotificationScheduleConfig>();
    for (const s of schedules) loadedMap.set(s.id, s);

    return presets.map((p) => {
      const existing = loadedMap.get(p.scheduleId);
      return {
        scheduleId: p.scheduleId,
        // If not in DB, default to the preset config
        initial: existing ?? p.config,
      };
    });
  }, [presets, schedules]);

  if (isGuest) {
    return (
      <div className={cn('w-[320px] max-w-[320px]', className)}>
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-2">
          <p className="text-sm font-semibold text-white/85">Reminders</p>
          <p className="text-[11px] text-white/35 leading-relaxed">
            Sign in to configure reminders.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('w-[320px] max-w-[320px] overflow-y-auto no-scrollbar', className)}>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1 pb-1">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-[0.15em]">
            {title ?? 'Reminders'}
          </p>
          {hydrating && (
            <span className="text-[10px] text-white/30 uppercase tracking-widest">Loading…</span>
          )}
        </div>

        {scheduleEditors.map((s) => (
          <NotificationScheduleEditor
            key={s.scheduleId}
            scheduleId={s.scheduleId}
            initial={s.initial}
            onSave={(next) => saveSchedule(s.scheduleId, next)}
          />
        ))}
        {manageAllHref && location.pathname !== manageAllHref && (
          <a
            href={manageAllHref}
            className="block text-[10px] uppercase tracking-[0.18em] text-cyan-300/70 hover:text-cyan-200 px-1 pt-2"
          >
            Manage all in Notifications
          </a>
        )}
      </div>
    </div>
  );
}
