import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { Recurrence } from '../types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const KIND_OPTIONS: { value: Recurrence['kind']; label: string }[] = [
  { value: 'every_n_days', label: 'Every few days' },
  { value: 'weekly_by_days', label: 'Weekly on specific days' },
  { value: 'daily_window', label: 'Daily reminder window' },
  { value: 'hourly', label: 'Every few hours' },
];

function defaultForKind(kind: Recurrence['kind']): Recurrence {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date().toISOString();
  switch (kind) {
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
      <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
        {label}
      </label>
      <input
        type="time"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-black/40 border border-white/10 rounded-2xl h-11 px-4 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all duration-300 disabled:opacity-40 [color-scheme:dark]"
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
        <div className="relative">
          <select
            value={value.kind === 'rrule' ? 'every_n_days' : value.kind}
            disabled={disabled}
            onChange={(e) => onChange(defaultForKind(e.target.value as Recurrence['kind']))}
            className="w-full appearance-none bg-black/40 border border-white/10 rounded-2xl h-11 pl-4 pr-10 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all duration-300 disabled:opacity-40 [color-scheme:dark]"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        </div>
      </div>

      {/* Every N days */}
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
                        : 'bg-white/[0.03] border border-white/10 text-white/50 hover:border-white/20'
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
          <p className="text-[10px] text-white/40 leading-snug ml-1">
            Reminder fires once within this window each day.
          </p>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
              Remind me
            </label>
            <div className="relative">
              <select
                disabled={disabled}
                value={value.intervalMinutes}
                onChange={(e) => onChange({ ...value, intervalMinutes: Number(e.target.value) })}
                className="w-full appearance-none bg-black/40 border border-white/10 rounded-2xl h-11 pl-4 pr-10 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all duration-300 disabled:opacity-40 [color-scheme:dark]"
              >
                <option value={30}>Every 30 minutes</option>
                <option value={60}>Every hour</option>
                <option value={120}>Every 2 hours</option>
                <option value={180}>Every 3 hours</option>
                <option value={360}>Every 6 hours</option>
                <option value={1440}>Once per day</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            </div>
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
