/**
 * FinancialCalendar.tsx
 *
 * Monthly calendar grid for the Nexus Ledger finance module.
 * Renders colored event dots per day, a detail panel on day selection,
 * and a monthly summary strip for bills/income/net cash flow.
 *
 * Complexity:
 *   - buildCalendarEvents: O(R + S + G) where R=recurring rules, S=subscriptions, G=goals
 *   - groupEventsByDate: O(E) where E=events in month
 *   - Calendar grid render: O(42) fixed (6 weeks × 7 days)
 */

import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  DollarSign,
  CreditCard,
  Target,
  Receipt,
  Info,
} from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import type { CalendarEvent, CalendarEventType, LedgerIntakeProfile } from '../services/ledger-intake-service';
import { buildCalendarEvents, groupEventsByDate } from '../services/aggregation/calendar-aggregation';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinancialCalendarProps {
  profile: LedgerIntakeProfile;
  currency: string;
}

interface MonthState {
  year: number;
  month: number; // 1-based
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Hex color for each CalendarEventType */
const EVENT_COLOR: Record<CalendarEventType, string> = {
  bill:          '#f43f5e',
  income:        '#10b981',
  subscription:  '#6366f1',
  goal_deadline: '#a78bfa',
  tax:           '#f97316',
  custom:        '#6b7280',
};

/** Human-readable label for each CalendarEventType */
const EVENT_LABEL: Record<CalendarEventType, string> = {
  bill:          'Bill',
  income:        'Income',
  subscription:  'Subscription',
  goal_deadline: 'Goal Deadline',
  tax:           'Tax',
  custom:        'Custom',
};

/** Lucide icon component for each CalendarEventType */
const EVENT_ICON: Record<CalendarEventType, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
  bill:          ({ className, style }) => <CreditCard className={className} style={style} />,
  income:        ({ className, style }) => <DollarSign className={className} style={style} />,
  subscription:  ({ className, style }) => <Receipt className={className} style={style} />,
  goal_deadline: ({ className, style }) => <Target className={className} style={style} />,
  tax:           ({ className, style }) => <Receipt className={className} style={style} />,
  custom:        ({ className, style }) => <Info className={className} style={style} />,
};

/** Maximum event dots visible per day cell before "+N" overflow label */
const MAX_DOTS = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD string for a given year/month/day (1-based). */
function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Returns today as a YYYY-MM-DD string. */
function todayKey(): string {
  const d = new Date();
  return toDateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Number of days in a given month (handles leap years). */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 0-based weekday (0=Sun) of the 1st of the given month. */
function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

/** Format a currency amount to 2 decimal places. */
function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface EventDotProps {
  color: string;
}

function EventDot({ color }: EventDotProps) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

interface DayCellProps {
  day: number;
  dateKey: string;
  events: CalendarEvent[];
  isToday: boolean;
  isSelected: boolean;
  onClick: (dateKey: string) => void;
}

function DayCell({ day, dateKey, events, isToday, isSelected, onClick }: DayCellProps) {
  const visibleEvents = events.slice(0, MAX_DOTS);
  const overflow = events.length - MAX_DOTS;

  return (
    <button
      type="button"
      onClick={() => onClick(dateKey)}
      aria-label={`${day}${events.length > 0 ? `, ${events.length} event${events.length > 1 ? 's' : ''}` : ''}`}
      aria-pressed={isSelected}
      className={[
        'relative flex min-h-[72px] w-full flex-col items-start rounded-xl border p-2 text-left transition-all duration-150',
        isSelected
          ? 'border-indigo-500/60 bg-indigo-500/10 ring-1 ring-indigo-500/40'
          : isToday
          ? 'border-white/20 bg-white/8'
          : 'border-white/5 bg-white/3 hover:border-white/15 hover:bg-white/6',
      ].join(' ')}
    >
      {/* Day number */}
      <span
        className={[
          'mb-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold leading-none',
          isToday
            ? 'bg-indigo-500 text-white'
            : isSelected
            ? 'text-indigo-300'
            : 'text-white/70',
        ].join(' ')}
      >
        {day}
      </span>

      {/* Event dots */}
      {events.length > 0 && (
        <div className="flex flex-wrap items-center gap-0.5">
          {visibleEvents.map((ev) => (
            <EventDot key={ev.id} color={ev.color ?? EVENT_COLOR[ev.type]} />
          ))}
          {overflow > 0 && (
            <span className="text-[9px] font-medium leading-none text-white/40">
              +{overflow}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

interface EventDetailItemProps {
  event: CalendarEvent;
  currency: string;
}

function EventDetailItem({ event, currency }: EventDetailItemProps) {
  const color = event.color ?? EVENT_COLOR[event.type];
  const IconComp = EVENT_ICON[event.type];
  const isExpense = !event.isIncome && event.type !== 'goal_deadline' && event.type !== 'custom';

  return (
    <li className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/3 px-4 py-3">
      {/* Type icon */}
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}20` }}
      >
        <IconComp
          className="h-4 w-4"
          style={{ color }}
        />
      </span>

      {/* Title + notes */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white/90 leading-snug">{event.title}</p>
        {event.notes && (
          <p className="mt-0.5 text-xs text-white/40 leading-relaxed">{event.notes}</p>
        )}
        <span
          className="mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {EVENT_LABEL[event.type]}
        </span>
      </div>

      {/* Amount */}
      {event.amount != null && (
        <span
          className={[
            'shrink-0 text-sm font-semibold tabular-nums',
            event.isIncome ? 'text-emerald-400' : isExpense ? 'text-rose-400' : 'text-white/60',
          ].join(' ')}
        >
          {event.isIncome ? '+' : isExpense ? '-' : ''}
          {formatAmount(event.amount, currency)}
        </span>
      )}
    </li>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FinancialCalendar({ profile, currency }: FinancialCalendarProps) {
  const today = new Date();

  // ── State ──────────────────────────────────────────────────────────────────

  const [monthState, setMonthState] = useState<MonthState>({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  });

  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // ── Derived calendar data ─────────────────────────────────────────────────

  /**
   * Recompute events whenever profile, year, or month changes.
   * buildCalendarEvents: O(R + S + G)
   * groupEventsByDate:   O(E)
   */
  const { events, eventsByDate } = useMemo(() => {
    const evts = buildCalendarEvents(profile, monthState.year, monthState.month);
    return { events: evts, eventsByDate: groupEventsByDate(evts) };
  }, [profile, monthState.year, monthState.month]);

  /** Calendar grid: 42 slots (6 rows × 7 cols), null = padding cell */
  const gridDays = useMemo((): (number | null)[] => {
    const offset = firstWeekday(monthState.year, monthState.month);
    const total  = daysInMonth(monthState.year, monthState.month);
    const cells: (number | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    // Pad to 42 cells so grid is always 6 complete rows
    while (cells.length < 42) cells.push(null);
    return cells;
  }, [monthState.year, monthState.month]);

  // ── Monthly summary ────────────────────────────────────────────────────────

  const { totalBills, totalIncome } = useMemo(() => {
    let bills = 0;
    let income = 0;
    for (const ev of events) {
      if (ev.isIncome) {
        income += ev.amount ?? 0;
      } else if (ev.type === 'bill' || ev.type === 'subscription' || ev.type === 'tax') {
        bills += ev.amount ?? 0;
      }
    }
    return { totalBills: bills, totalIncome: income };
  }, [events]);

  const netCashFlow = totalIncome - totalBills;

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handlePrevMonth() {
    setMonthState((prev) => {
      if (prev.month === 1) return { year: prev.year - 1, month: 12 };
      return { year: prev.year, month: prev.month - 1 };
    });
    setSelectedDay(null);
  }

  function handleNextMonth() {
    setMonthState((prev) => {
      if (prev.month === 12) return { year: prev.year + 1, month: 1 };
      return { year: prev.year, month: prev.month + 1 };
    });
    setSelectedDay(null);
  }

  function handleDayClick(dateKey: string) {
    setSelectedDay((prev) => (prev === dateKey ? null : dateKey));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const today_key = todayKey();
  const selectedEvents: CalendarEvent[] = selectedDay ? (eventsByDate[selectedDay] ?? []) : [];

  return (
    <section className="flex flex-col gap-5" aria-label="Financial Calendar">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
        {/* Month navigation – previous */}
        <NeuralButton
          variant="ghost"
          size="sm"
          onClick={handlePrevMonth}
          aria-label="Previous month"
          className="flex-shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </NeuralButton>

        {/* Month / Year label */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-indigo-400" aria-hidden="true" />
          <h2 className="text-base font-semibold tracking-tight text-white">
            {MONTH_NAMES[monthState.month - 1]} {monthState.year}
          </h2>
        </div>

        {/* Month navigation – next */}
        <NeuralButton
          variant="ghost"
          size="sm"
          onClick={handleNextMonth}
          aria-label="Next month"
          className="flex-shrink-0"
        >
          <ChevronRight className="h-4 w-4" />
        </NeuralButton>
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/5 bg-white/3 px-4 py-3"
        role="list"
        aria-label="Event type legend"
      >
        {(Object.keys(EVENT_COLOR) as CalendarEventType[]).map((type) => (
          <span
            key={type}
            role="listitem"
            className="flex items-center gap-1.5"
          >
            <span
              className="inline-block h-2 w-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: EVENT_COLOR[type] }}
              aria-hidden="true"
            />
            <span className="text-xs text-white/50">{EVENT_LABEL[type]}</span>
          </span>
        ))}
      </div>

      {/* ── Calendar Grid ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
        {/* Day name headers */}
        <div className="mb-2 grid grid-cols-7 gap-1" role="row">
          {DAY_NAMES.map((name) => (
            <div
              key={name}
              role="columnheader"
              className="py-1 text-center text-[10px] font-semibold uppercase tracking-widest text-white/30"
            >
              {name}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Calendar days">
          {gridDays.map((day, idx) => {
            if (day === null) {
              return (
                <div
                  key={`pad-${idx}`}
                  role="gridcell"
                  aria-disabled="true"
                  className="min-h-[72px] rounded-xl"
                />
              );
            }
            const dateKey = toDateKey(monthState.year, monthState.month, day);
            const dayEvents = eventsByDate[dateKey] ?? [];
            return (
              <div key={dateKey} role="gridcell">
                <DayCell
                  day={day}
                  dateKey={dateKey}
                  events={dayEvents}
                  isToday={dateKey === today_key}
                  isSelected={selectedDay === dateKey}
                  onClick={handleDayClick}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Day Detail Panel ────────────────────────────────────────────── */}
      {selectedDay !== null && (
        <div
          className="rounded-2xl border border-white/10 bg-white/4 p-4"
          aria-live="polite"
          aria-label="Events for selected day"
        >
          {/* Panel header */}
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white/80">
              {(() => {
                const [y, m, d] = selectedDay.split('-').map(Number);
                return new Date(y, m - 1, d).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                });
              })()}
            </h3>
            <NeuralButton
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDay(null)}
              aria-label="Close day detail panel"
            >
              <span className="text-xs text-white/40">Close</span>
            </NeuralButton>
          </div>

          {selectedEvents.length === 0 ? (
            <p className="py-4 text-center text-sm text-white/30">
              No financial events on this day.
            </p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Events list">
              {selectedEvents.map((ev) => (
                <EventDetailItem key={ev.id} event={ev} currency={currency} />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Monthly Summary Strip ───────────────────────────────────────── */}
      <div
        className="grid grid-cols-3 gap-3"
        aria-label="Monthly financial summary"
      >
        {/* Total Bills */}
        <div className="flex flex-col gap-1 rounded-xl border border-rose-500/15 bg-rose-500/8 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-rose-400/70">
              Bills Due
            </span>
          </div>
          <span className="text-sm font-bold tabular-nums text-rose-300">
            {formatAmount(totalBills, currency)}
          </span>
        </div>

        {/* Total Income */}
        <div className="flex flex-col gap-1 rounded-xl border border-emerald-500/15 bg-emerald-500/8 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400/70">
              Income
            </span>
          </div>
          <span className="text-sm font-bold tabular-nums text-emerald-300">
            +{formatAmount(totalIncome, currency)}
          </span>
        </div>

        {/* Net Cash Flow */}
        <div
          className={[
            'flex flex-col gap-1 rounded-xl border px-4 py-3',
            netCashFlow >= 0
              ? 'border-emerald-500/15 bg-emerald-500/8'
              : 'border-rose-500/15 bg-rose-500/8',
          ].join(' ')}
        >
          <div className="flex items-center gap-1.5">
            <ChevronRight
              className={['h-3.5 w-3.5', netCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'].join(' ')}
              aria-hidden="true"
            />
            <span
              className={[
                'text-[10px] font-semibold uppercase tracking-widest',
                netCashFlow >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70',
              ].join(' ')}
            >
              Net Flow
            </span>
          </div>
          <span
            className={[
              'text-sm font-bold tabular-nums',
              netCashFlow >= 0 ? 'text-emerald-300' : 'text-rose-300',
            ].join(' ')}
          >
            {netCashFlow >= 0 ? '+' : ''}
            {formatAmount(netCashFlow, currency)}
          </span>
        </div>
      </div>

    </section>
  );
}
