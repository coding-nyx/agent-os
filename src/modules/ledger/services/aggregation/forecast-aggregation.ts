import type { RecurringRule, CashFlowForecast, CashFlowForecastDay, CashFlowEvent } from '../ledger-intake-service';
import { advanceByFrequency } from '../recurring-engine';
import { round2 } from './utils';

function toDateOnly(iso: string): Date {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDateOnly(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

/**
 * Expand recurring rules into per-day events over a horizon window.
 */
function expandRulesToEvents(
  rules: RecurringRule[],
  start: Date,
  end: Date,
): Map<string, CashFlowEvent[]> {
  const eventsByDate = new Map<string, CashFlowEvent[]>();

  for (const rule of rules) {
    if (!rule.isActive) continue;

    // Start from nextDueDate or startDate, whichever is later relative to window
    let current = toDateOnly(rule.nextDueDate);
    // Walk back to find first occurrence within window if nextDueDate is after end
    if (current > end) continue;

    // Walk forward from nextDueDate through the horizon
    while (current <= end) {
      if (current >= start) {
        const key = formatDateOnly(current);
        const existing = eventsByDate.get(key) ?? [];
        existing.push({
          date: key,
          label: rule.description,
          amount: rule.amount,
          type: rule.type,
          source: 'recurring',
        });
        eventsByDate.set(key, existing);
      }
      const next = advanceByFrequency(current, rule.frequency);
      if (next.getTime() === current.getTime()) break; // safety guard
      current = next;
    }
  }

  return eventsByDate;
}

/**
 * Compute a forward-looking cash flow forecast.
 *
 * @param recurringRules Active recurring rules
 * @param startingBalance Net liquid balance to start from
 * @param horizon Number of days to forecast (30 | 60 | 90)
 */
export function computeCashFlowForecast(
  recurringRules: RecurringRule[],
  startingBalance: number,
  horizon: 30 | 60 | 90,
): CashFlowForecast {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = addDays(start, horizon - 1);

  const eventsByDate = expandRulesToEvents(recurringRules, start, end);

  const days: CashFlowForecastDay[] = [];
  let runningBalance = startingBalance;
  let lowestPoint = { date: formatDateOnly(start), balance: runningBalance };
  let highestPoint = { date: formatDateOnly(start), balance: runningBalance };

  for (let i = 0; i < horizon; i++) {
    const date = addDays(start, i);
    const key = formatDateOnly(date);
    const events = eventsByDate.get(key) ?? [];

    let netFlow = 0;
    for (const event of events) {
      netFlow = round2(netFlow + (event.type === 'income' ? event.amount : -event.amount));
    }

    runningBalance = round2(runningBalance + netFlow);

    if (runningBalance < lowestPoint.balance) {
      lowestPoint = { date: key, balance: runningBalance };
    }
    if (runningBalance > highestPoint.balance) {
      highestPoint = { date: key, balance: runningBalance };
    }

    days.push({ date: key, netFlow, runningBalance, events });
  }

  return {
    generatedAt: new Date().toISOString(),
    horizon,
    startingBalance,
    days,
    lowestPoint,
    highestPoint,
    endBalance: runningBalance,
  };
}

/** Summarize forecast into monthly buckets for table display. */
export interface ForecastMonthSummary {
  label: string; // e.g. "Apr 2026"
  totalIncome: number;
  totalExpenses: number;
  net: number;
}

export function summarizeForecastByMonth(forecast: CashFlowForecast): ForecastMonthSummary[] {
  const buckets = new Map<string, ForecastMonthSummary>();

  for (const day of forecast.days) {
    const date = new Date(day.date);
    const label = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const bucket = buckets.get(label) ?? { label, totalIncome: 0, totalExpenses: 0, net: 0 };

    for (const event of day.events) {
      if (event.type === 'income') {
        bucket.totalIncome = round2(bucket.totalIncome + event.amount);
      } else {
        bucket.totalExpenses = round2(bucket.totalExpenses + event.amount);
      }
    }
    bucket.net = round2(bucket.totalIncome - bucket.totalExpenses);
    buckets.set(label, bucket);
  }

  return Array.from(buckets.values());
}
