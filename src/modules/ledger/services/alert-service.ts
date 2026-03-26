import type {
  AlertRule,
  AlertNotification,
  AlertType,
  AlertSeverity,
  LedgerIntakeProfile,
  Subscription,
} from './ledger-intake-service';
import { getUpcomingRenewals, getExpiringTrials } from './aggregation/subscription-aggregation';

function makeNotification(
  type: AlertType,
  severity: AlertSeverity,
  title: string,
  message: string,
  ruleId?: string,
  actionTab?: string,
): AlertNotification {
  return {
    id: crypto.randomUUID(),
    ruleId,
    type,
    severity,
    title,
    message,
    createdAt: new Date().toISOString(),
    actionTab,
  };
}

export interface AlertEvaluationResult {
  notifications: AlertNotification[];
}

/**
 * Evaluates all enabled AlertRules against the current profile state and
 * returns a list of fired AlertNotifications. Does NOT mutate the profile.
 */
export function evaluateAlerts(profile: LedgerIntakeProfile): AlertEvaluationResult {
  const notifications: AlertNotification[] = [];
  const rules = profile.alertRules ?? [];
  const dismissed = new Set(profile.dismissedAlertIds ?? []);

  const totalBalance = (profile.accounts ?? []).reduce((sum, a) => sum + a.balance, 0);
  const monthlyIncome = profile.monthlyIncome ?? 0;

  for (const rule of rules) {
    if (!rule.isEnabled) continue;

    if (rule.type === 'low_balance' && rule.threshold !== undefined) {
      if (totalBalance < rule.threshold) {
        const notif = makeNotification(
          'low_balance',
          rule.severity,
          'Low Balance Alert',
          `Your total balance is ${totalBalance.toFixed(2)} — below your threshold of ${rule.threshold}.`,
          rule.id,
          'accounts',
        );
        if (!dismissed.has(notif.type + '_low_balance')) notifications.push(notif);
      }
    }

    if (rule.type === 'budget_breach') {
      const budgetCategories = profile.budgetCategories ?? [];
      for (const cat of budgetCategories) {
        if (cat.spent > cat.allocated) {
          const notif = makeNotification(
            'budget_breach',
            rule.severity,
            `Budget Exceeded: ${cat.name}`,
            `You've spent ${cat.spent.toFixed(2)} of your ${cat.allocated.toFixed(2)} ${cat.name} budget.`,
            rule.id,
            'budget',
          );
          notifications.push(notif);
        }
      }
    }

    if (rule.type === 'large_transaction' && rule.threshold !== undefined) {
      const recentTxs = (profile.transactions ?? []).filter(tx => {
        const days = (Date.now() - new Date(tx.date).getTime()) / 86_400_000;
        return days <= 3 && tx.amount >= rule.threshold!;
      });
      for (const tx of recentTxs) {
        notifications.push(makeNotification(
          'large_transaction',
          rule.severity,
          'Large Transaction Detected',
          `Transaction "${tx.description}" for ${tx.amount.toFixed(2)} was recorded recently.`,
          rule.id,
          'transactions',
        ));
      }
    }

    if (rule.type === 'bill_overdue') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const overdueBills = (profile.recurringRules ?? []).filter(r => {
        if (!r.isActive) return false;
        const dueDate = new Date(r.nextDueDate);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate < today;
      });
      for (const bill of overdueBills) {
        notifications.push(makeNotification(
          'bill_overdue',
          'critical',
          `Overdue Bill: ${bill.description}`,
          `"${bill.description}" was due on ${bill.nextDueDate.split('T')[0]} and hasn't been posted.`,
          rule.id,
          'recurring',
        ));
      }
    }

    if (rule.type === 'payment_upcoming') {
      const windowDays = rule.threshold ?? 5;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const currency = profile.currency ?? '$';

      // Helper: compute next occurrence of a day-of-month relative to today
      const nextOccurrence = (dueDay: number): Date => {
        const d = new Date(today);
        d.setDate(dueDay);
        if (d <= today) d.setMonth(d.getMonth() + 1);
        return d;
      };

      const daysUntil = (target: Date) =>
        Math.round((target.getTime() - today.getTime()) / 86_400_000);

      // Check DebtItem.dueDay
      for (const debt of profile.debtItems ?? []) {
        if (!debt.dueDay) continue;
        const due = nextOccurrence(debt.dueDay);
        const days = daysUntil(due);
        if (days >= 0 && days <= windowDays) {
          const minAmt = debt.minPayment > 0 ? `Min. payment ${currency}${debt.minPayment.toFixed(2)}. ` : '';
          notifications.push(makeNotification(
            'payment_upcoming',
            'warning',
            `Payment Due: ${debt.name}`,
            `${minAmt}${debt.name} payment due on ${due.toISOString().split('T')[0]} (${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}).`,
            rule.id,
            'overview',
          ));
        }
      }

      // Check credit card Account.paymentDueDay
      for (const acct of profile.accounts ?? []) {
        if (acct.type !== 'credit_card' || !acct.paymentDueDay) continue;
        const due = nextOccurrence(acct.paymentDueDay);
        const days = daysUntil(due);
        if (days >= 0 && days <= windowDays) {
          const owed = Math.abs(acct.balance);
          const amtStr = owed > 0 ? `Balance ${currency}${owed.toFixed(2)}. ` : '';
          notifications.push(makeNotification(
            'payment_upcoming',
            'warning',
            `Card Payment Due: ${acct.name}`,
            `${amtStr}${acct.name}${acct.lastFour ? ` (···· ${acct.lastFour})` : ''} payment due on ${due.toISOString().split('T')[0]} (${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}).`,
            rule.id,
            'accounts',
          ));
        }
      }
    }

    if (rule.type === 'goal_behind') {
      const goals = profile.financialGoals ?? [];
      for (const goal of goals) {
        if (!goal.targetDate) continue;
        const pct = goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0;
        const daysLeft = (new Date(goal.targetDate).getTime() - Date.now()) / 86_400_000;
        // Behind if < 70% progress with < 30% of time remaining
        if (daysLeft > 0 && pct < 0.7 && daysLeft < 90) {
          notifications.push(makeNotification(
            'goal_behind',
            rule.severity,
            `Goal Behind Schedule: ${goal.name}`,
            `You're at ${(pct * 100).toFixed(0)}% of your goal with ${Math.round(daysLeft)} days left.`,
            rule.id,
            'goals',
          ));
        }
      }
    }

    if (rule.type === 'trial_ending') {
      const subs: Subscription[] = profile.subscriptions ?? [];
      const expiring = getExpiringTrials(subs, rule.threshold ?? 7);
      for (const sub of expiring) {
        notifications.push(makeNotification(
          'trial_ending',
          rule.severity,
          `Trial Ending: ${sub.name}`,
          `Your free trial for ${sub.name} ends on ${sub.trialEndsAt?.split('T')[0]}.`,
          rule.id,
          'subscriptions',
        ));
      }
    }

    if (rule.type === 'subscription_renewal') {
      const subs: Subscription[] = profile.subscriptions ?? [];
      const upcoming = getUpcomingRenewals(subs, rule.threshold ?? 3);
      for (const sub of upcoming) {
        notifications.push(makeNotification(
          'subscription_renewal',
          rule.severity,
          `Subscription Renewing: ${sub.name}`,
          `${sub.name} will renew for ${sub.amount.toFixed(2)} on ${sub.nextRenewalDate.split('T')[0]}.`,
          rule.id,
          'subscriptions',
        ));
      }
    }

    if (rule.type === 'net_worth_drop') {
      const history = profile.netWorthHistory ?? [];
      if (history.length >= 2) {
        const sorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const latest = sorted[0].netWorth;
        const previous = sorted[1].netWorth;
        const drop = previous > 0 ? (previous - latest) / previous : 0;
        const threshold = rule.threshold ?? 0.05;
        if (drop > threshold) {
          notifications.push(makeNotification(
            'net_worth_drop',
            rule.severity,
            'Net Worth Drop Detected',
            `Your net worth dropped ${(drop * 100).toFixed(1)}% since the last snapshot.`,
            rule.id,
            'overview',
          ));
        }
      }
    }
  }

  // Built-in alerts (no rule required) — always evaluated
  // Income-to-expense ratio warning
  const fixedMonthly = (profile.fixedExpenses ?? []).reduce((s, e) => s + e.amount, 0);
  const varMonthly = (profile.variableExpenses ?? []).reduce((s, e) => s + e.amount, 0);
  if (monthlyIncome > 0 && (fixedMonthly + varMonthly) > monthlyIncome * 0.95) {
    notifications.push(makeNotification(
      'budget_breach',
      'warning',
      'Expenses Near Income Limit',
      `Your monthly expenses (${(fixedMonthly + varMonthly).toFixed(0)}) are ≥95% of your income (${monthlyIncome.toFixed(0)}).`,
      undefined,
      'budget',
    ));
  }

  return { notifications };
}

/** Returns default alert rules for a new user. */
export function getDefaultAlertRules(): AlertRule[] {
  const now = new Date().toISOString();
  return [
    { id: crypto.randomUUID(), type: 'low_balance', label: 'Low Balance', severity: 'warning', isEnabled: true, threshold: 100, createdAt: now },
    { id: crypto.randomUUID(), type: 'large_transaction', label: 'Large Transaction', severity: 'info', isEnabled: true, threshold: 500, createdAt: now },
    { id: crypto.randomUUID(), type: 'budget_breach', label: 'Budget Over Limit', severity: 'warning', isEnabled: true, createdAt: now },
    { id: crypto.randomUUID(), type: 'trial_ending', label: 'Trial Ending Soon', severity: 'info', isEnabled: true, threshold: 7, createdAt: now },
    { id: crypto.randomUUID(), type: 'subscription_renewal', label: 'Subscription Renewal', severity: 'info', isEnabled: true, threshold: 3, createdAt: now },
    { id: crypto.randomUUID(), type: 'bill_overdue', label: 'Overdue Bill', severity: 'critical', isEnabled: true, createdAt: now },
    { id: crypto.randomUUID(), type: 'payment_upcoming', label: 'Upcoming Payment Due', severity: 'warning', isEnabled: true, threshold: 5, createdAt: now },
    { id: crypto.randomUUID(), type: 'goal_behind', label: 'Goal Behind Schedule', severity: 'warning', isEnabled: true, createdAt: now },
    { id: crypto.randomUUID(), type: 'net_worth_drop', label: 'Net Worth Drop', severity: 'warning', isEnabled: true, threshold: 0.05, createdAt: now },
  ];
}
