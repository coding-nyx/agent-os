import type { CalendarEvent, LedgerIntakeProfile } from '../ledger-intake-service';
import { computeUpcomingBills } from '../recurring-engine';

function dateToYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Builds CalendarEvent[] for the given month (year/month 1-based) by
 * aggregating recurring bills, subscriptions, and financial goal deadlines.
 */
export function buildCalendarEvents(profile: LedgerIntakeProfile, year: number, month: number): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const target = dateToYearMonth(new Date(year, month - 1));

  // Recurring rules (bills + income)
  const allBills = computeUpcomingBills(profile.recurringRules ?? [], 90);
  for (const bill of allBills) {
    const billDate = new Date(bill.nextDueDate);
    if (dateToYearMonth(billDate) === target) {
      events.push({
        id: `rec_${bill.id}_${target}`,
        type: bill.type === 'income' ? 'income' : 'bill',
        title: bill.description,
        date: bill.nextDueDate,
        amount: bill.amount,
        isIncome: bill.type === 'income',
        color: bill.type === 'income' ? '#10b981' : '#f43f5e',
        entityId: bill.id,
      });
    }
  }

  // Subscriptions
  for (const sub of profile.subscriptions ?? []) {
    if (sub.status === 'cancelled') continue;
    const renewDate = new Date(sub.nextRenewalDate);
    if (dateToYearMonth(renewDate) === target) {
      events.push({
        id: `sub_${sub.id}_${target}`,
        type: 'subscription',
        title: `${sub.name} renewal`,
        date: sub.nextRenewalDate,
        amount: sub.amount,
        isIncome: false,
        color: sub.color ?? '#6366f1',
        entityId: sub.id,
      });
    }
    // Trial end
    if (sub.status === 'trial' && sub.trialEndsAt) {
      const trialDate = new Date(sub.trialEndsAt);
      if (dateToYearMonth(trialDate) === target) {
        events.push({
          id: `trial_${sub.id}_${target}`,
          type: 'subscription',
          title: `${sub.name} trial ends`,
          date: sub.trialEndsAt,
          amount: sub.amount,
          isIncome: false,
          color: '#f59e0b',
          entityId: sub.id,
          notes: 'Trial period ending',
        });
      }
    }
  }

  // Financial goal deadlines
  for (const goal of profile.financialGoals ?? []) {
    if (!goal.targetDate) continue;
    const goalDate = new Date(goal.targetDate);
    if (dateToYearMonth(goalDate) === target) {
      events.push({
        id: `goal_${goal.id}`,
        type: 'goal_deadline',
        title: `Goal deadline: ${goal.name}`,
        date: goal.targetDate,
        amount: goal.targetAmount,
        color: '#a78bfa',
        entityId: goal.id,
      });
    }
  }

  // Paid quarters (tax events)
  const quarters: Record<number, string> = { 0: '04-15', 1: '06-15', 2: '09-15', 3: '01-15' };
  for (const [qIdx, mmdd] of Object.entries(quarters)) {
    const taxYear = Number(qIdx) === 3 ? year + 1 : year;
    const dateStr = `${taxYear}-${mmdd}`;
    const taxDate = new Date(dateStr);
    if (dateToYearMonth(taxDate) === target) {
      events.push({
        id: `tax_q${qIdx}_${year}`,
        type: 'tax',
        title: `Q${Number(qIdx) + 1} Estimated Tax Due`,
        date: dateStr,
        color: '#f97316',
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/** Groups CalendarEvents by ISO date string within a month. */
export function groupEventsByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const grouped: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    const key = ev.date.split('T')[0];
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ev);
  }
  return grouped;
}
