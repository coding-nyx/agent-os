import React from 'react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import type { Recurrence } from '../types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const KIND_OPTIONS: { value: Recurrence['kind']; label: string }[] = [
  { value: 'once', label: 'One-time reminder' },
  { value: 'every_n_days', label: 'Every few days' },
  { value: 'weekly_by_days', label: 'Weekly on specific days' },
  { value: 'daily_window', label: 'Daily reminder window' },
  { value: 'hourly', label: 'Every few hours' },
];

function defaultForKind(kind: Recurrence['kind']): Recurrence {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date().toISOString();
  switch (kind) {
    case 'once': {
      const due = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      return { kind, dueAt: due, timezone: tz };
    }
    case 'every_n_days':
      return { kind, intervalDays: 2, dtStart: now, timezone: tz };
    case 'hourly':
      return { kind, intervalHours: 2, dtStart: now, timezone: tz };
    case 'weekly_by_days':
      return { kind, intervalWeeks: 1, daysOfWeek: [1], timeOfDay: '09:00', startAt: now, timezone: tz };
    case 'daily_window':
      return { kind, startAt: now, timezone: tz, windowStart: '20:00', windowEnd: '22:00', intervalMinutes: 1440 };
    default:
      return { kind: 'rrule', rrule: 'FREQ=DAILY', dtStart: now, timezone: tz };
  }
}

function TimeInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex-1 space-y-1.5">
      <NeuralInput
        label={label}
        type="time"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-900/70 border border-white/[0.12] rounded-2xl h-11 px-4 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all duration-300 disabled:opacity-40 [color-scheme:dark]"
      />
    </div>
  );
}

export function RecurrenceEditor({
  value,
  onChange,
  disabled,
}: {
  value: Recurrence;
  onChange: (next: Recurrence) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Schedule type */}
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
          Schedule
        </label>
        <NeuralSelectMenu
          value={value.kind === 'rrule' ? 'every_n_days' : value.kind}
          disabled={disabled}
          options={KIND_OPTIONS}
          onChange={(next) => onChange(defaultForKind(next as Recurrence['kind']))}
          ariaLabel="Schedule"
        />
      </div>

      {/* Every N days */}
      {value.kind === 'once' && (
        <div className="space-y-2">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
            Due at
          </label>
          <NeuralInput
            label=""
            type="datetime-local"
            disabled={disabled}
            value={isoToLocalInput(value.dueAt)}
            onChange={(e) => {
              const nextIso = localInputToIso(e.target.value, value.dueAt);
              onChange({ ...value, dueAt: nextIso });
            }}
            className="w-full bg-slate-900/70 border border-white/[0.12] rounded-2xl h-11 px-4 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all duration-300 disabled:opacity-40 [color-scheme:dark]"
          />
          <p className="text-[11px] text-white/40 leading-snug ml-1">
            One-time reminders fire once and won’t repeat.
          </p>
        </div>
      )}

      {value.kind === 'every_n_days' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
              Repeat every
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={14}
                step={1}
                disabled={disabled}
                value={value.intervalDays}
                onChange={(e) => onChange({ ...value, intervalDays: Number(e.target.value) })}
                className="flex-1 accent-indigo-500 disabled:opacity-40"
              />
              <span className="text-sm text-white/80 w-20 text-right shrink-0">
                {value.intervalDays === 1 ? 'every day' : `every ${value.intervalDays} days`}
              </span>
            </div>
          </div>
          <TimeInput
            label="At time"
            value={extractTime(value.dtStart)}
            onChange={(t) => onChange({ ...value, dtStart: setTimePart(value.dtStart, t) })}
            disabled={disabled}
          />
        </div>
      )}

      {/* Hourly */}
      {value.kind === 'hourly' && (
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
            Repeat every
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              disabled={disabled}
              value={value.intervalHours}
              onChange={(e) => onChange({ ...value, intervalHours: Number(e.target.value) })}
              className="flex-1 accent-indigo-500 disabled:opacity-40"
            />
            <span className="text-sm text-white/80 w-20 text-right shrink-0">
              {value.intervalHours === 1 ? '1 hour' : `${value.intervalHours} hours`}
            </span>
          </div>
        </div>
      )}

      {/* Weekly by days */}
      {value.kind === 'weekly_by_days' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
              Days of the week
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {DAY_LABELS.map((label, idx) => {
                const checked = value.daysOfWeek.includes(idx);
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      const next = checked
                        ? value.daysOfWeek.filter((d) => d !== idx)
                        : [...value.daysOfWeek, idx].sort((a, b) => a - b);
                      if (next.length > 0) onChange({ ...value, daysOfWeek: next });
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 disabled:opacity-40 ${
                      checked
                        ? 'bg-indigo-500/30 border border-indigo-500/60 text-indigo-300'
                        : 'bg-white/[0.045] border border-white/[0.12] text-white/50 hover:border-white/20'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <TimeInput
            label="At time"
            value={value.timeOfDay}
            onChange={(t) => onChange({ ...value, timeOfDay: t })}
            disabled={disabled}
          />
        </div>
      )}

      {/* Daily window */}
      {value.kind === 'daily_window' && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <TimeInput
              label="Start"
              value={value.windowStart}
              onChange={(t) => onChange({ ...value, windowStart: t })}
              disabled={disabled}
            />
            <TimeInput
              label="End"
              value={value.windowEnd}
              onChange={(t) => onChange({ ...value, windowEnd: t })}
              disabled={disabled}
            />
          </div>
          <p className="text-[11px] text-white/40 leading-snug ml-1">
            Reminder fires once within this window each day.
          </p>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
              Remind me
            </label>
            <NeuralSelectMenu
              disabled={disabled}
              value={value.intervalMinutes}
              onChange={(next) => onChange({ ...value, intervalMinutes: Number(next) })}
              options={[
                { value: 30, label: 'Every 30 minutes' },
                { value: 60, label: 'Every hour' },
                { value: 120, label: 'Every 2 hours' },
                { value: 180, label: 'Every 3 hours' },
                { value: 360, label: 'Every 6 hours' },
                { value: 1440, label: 'Once per day' },
              ]}
              ariaLabel="Remind me"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---- helpers ----

function extractTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '09:00';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '09:00';
  }
}

function setTimePart(iso: string, hhmm: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) {
      const nd = new Date();
      const [h, m] = hhmm.split(':').map(Number);
      nd.setHours(h, m, 0, 0);
      return nd.toISOString();
    }
    const [h, m] = hhmm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  } catch {
    return iso;
  }
}

function isoToLocalInput(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
}

function localInputToIso(value: string, fallbackIso: string): string {
  try {
    if (!value) return fallbackIso;
    const d = new Date(value);
    if (isNaN(d.getTime())) return fallbackIso;
    return d.toISOString();
  } catch {
    return fallbackIso;
  }
}
