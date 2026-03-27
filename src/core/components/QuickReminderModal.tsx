import React, { useMemo, useState, useEffect } from 'react';
import { X, Bell } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
import { RecurrenceEditor } from '@/lib/notifications/ui/RecurrenceEditor';
import { createReminderSchedule } from '@/lib/notifications/reminder-create';
import type { NotificationDeepLink, NotificationScheduleConfig, Recurrence } from '@/lib/notifications/types';
import type { ModuleId } from '@/lib/module-manifest';
import { useAuth } from '@/lib/auth-context';

export interface QuickReminderModalProps {
  open: boolean;
  moduleId: ModuleId;
  defaultTitle?: string;
  defaultNote?: string;
  source?: NotificationScheduleConfig['source'];
  tags?: string[];
  deepLink?: NotificationDeepLink;
  onClose: () => void;
}

function defaultRecurrence(): Recurrence {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dueAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return { kind: 'once', dueAt, timezone: tz };
}

export function QuickReminderModal({
  open,
  moduleId,
  defaultTitle,
  defaultNote,
  source,
  tags,
  deepLink,
  onClose,
}: QuickReminderModalProps) {
  const { user, isGuest } = useAuth();
  const [title, setTitle] = useState(defaultTitle ?? '');
  const [note, setNote] = useState(defaultNote ?? '');
  const [recurrence, setRecurrence] = useState<Recurrence>(() => defaultRecurrence());
  const [saving, setSaving] = useState(false);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle ?? '');
    setNote(defaultNote ?? '');
    setRecurrence(defaultRecurrence());
  }, [open, defaultTitle, defaultNote]);

  if (!open) return null;

  const save = async () => {
    if (!user || isGuest || !title.trim()) return;
    setSaving(true);
    try {
      await createReminderSchedule(user.uid, {
        moduleId,
        title: title.trim(),
        note: note.trim(),
        recurrence,
        timezone,
        channelPrefs: { os: true, inApp: true },
        priority: 'alert',
        deepLink,
        source,
        tags,
        createdBy: 'user',
      });
      onClose();
    } catch (err) {
      console.error('[QuickReminderModal] Failed to save reminder:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.12] bg-slate-900/95 p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-white/[0.045] border border-white/[0.12] flex items-center justify-center">
              <Bell className="h-4 w-4 text-white/60" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold">Remind Me</p>
              <p className="text-sm font-semibold text-white/80">Create a reminder</p>
            </div>
          </div>
          <NeuralButton variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </NeuralButton>
        </div>

        <div className="space-y-4">
          <NeuralInput
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Reminder title"
          />
          <NeuralTextarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            rows={2}
          />
          <RecurrenceEditor value={recurrence} onChange={setRecurrence} />
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <NeuralButton variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </NeuralButton>
          <NeuralButton size="sm" onClick={save} loading={saving} disabled={!title.trim() || saving || !user || isGuest}>
            Save Reminder
          </NeuralButton>
        </div>
      </div>
    </div>
  );
}
