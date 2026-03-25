import type { AutomationRule, AutomationSuggestion, LedgerIntakeProfile, Transaction, Subscription, FinancialGoal, RecurringRule } from './ledger-intake-service';

function makeSuggestion(rule: AutomationRule): AutomationSuggestion {
  return {
    id: crypto.randomUUID(),
    ruleId: rule.id,
    ruleName: rule.name,
    suggestionType: rule.suggestionType,
    message: rule.suggestionMessage,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Evaluates all enabled AutomationRules against the current profile and returns
 * a list of AutomationSuggestions. These are SUGGESTIONS ONLY — no auto-execution.
 * The user must review and manually act on them.
 */
export function evaluateAutomationRules(profile: LedgerIntakeProfile): AutomationSuggestion[] {
  const suggestions: AutomationSuggestion[] = [];
  const dismissed = new Set(profile.dismissedSuggestionIds ?? []);
  const now = new Date();

  for (const rule of profile.automationRules ?? []) {
    if (!rule.isEnabled) continue;

    let triggered = false;

    switch (rule.triggerType) {
      case 'spending_exceeds': {
        if (rule.triggerThreshold !== undefined) {
          const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const monthlySpend = (profile.transactions ?? [])
            .filter((tx: Transaction) => tx.type === 'expense' && tx.date.startsWith(thisMonth))
            .filter((tx: Transaction) => !rule.triggerCategory || tx.category === rule.triggerCategory)
            .reduce((s: number, tx: Transaction) => s + tx.amount, 0);
          triggered = monthlySpend > rule.triggerThreshold;
        }
        break;
      }
      case 'balance_below': {
        if (rule.triggerThreshold !== undefined) {
          const totalBalance = (profile.accounts ?? []).reduce((s: number, a: { balance: number }) => s + a.balance, 0);
          triggered = totalBalance < rule.triggerThreshold;
        }
        break;
      }
      case 'goal_progress_below': {
        if (rule.triggerThreshold !== undefined) {
          const goals = (profile.financialGoals ?? []) as FinancialGoal[];
          const targetGoal = rule.triggerEntityId
            ? goals.find((g: FinancialGoal) => g.id === rule.triggerEntityId)
            : goals[0];
          if (targetGoal && targetGoal.targetAmount > 0) {
            const pct = targetGoal.currentAmount / targetGoal.targetAmount;
            triggered = pct < rule.triggerThreshold / 100;
          }
        }
        break;
      }
      case 'subscription_unused': {
        const subs = (profile.subscriptions ?? []) as Subscription[];
        const txDescriptions = new Set((profile.transactions ?? []).map((tx: Transaction) => tx.description.toLowerCase()));
        triggered = subs.some((sub: Subscription) => {
          if (sub.status !== 'active') return false;
          const daysSinceCreation = (now.getTime() - new Date(sub.createdAt).getTime()) / 86_400_000;
          const hasMatchingTx = txDescriptions.has(sub.name.toLowerCase());
          return daysSinceCreation > 60 && !hasMatchingTx;
        });
        break;
      }
      case 'net_worth_drops': {
        const history = profile.netWorthHistory ?? [];
        if (history.length >= 2 && rule.triggerThreshold !== undefined) {
          const sorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          const drop = sorted[1].netWorth > 0 ? (sorted[1].netWorth - sorted[0].netWorth) / sorted[1].netWorth : 0;
          triggered = drop > rule.triggerThreshold / 100;
        }
        break;
      }
      case 'bill_overdue': {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        triggered = (profile.recurringRules ?? []).some((r: RecurringRule) => {
          if (!r.isActive) return false;
          const dueDate = new Date(r.nextDueDate);
          dueDate.setHours(0, 0, 0, 0);
          return dueDate < today;
        });
        break;
      }
      case 'month_end': {
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        triggered = now.getDate() >= lastDay - 2;
        break;
      }
    }

    if (triggered) {
      const suggestion = makeSuggestion(rule);
      const dayKey = `${rule.id}_${now.toISOString().split('T')[0]}`;
      if (!dismissed.has(dayKey) && !dismissed.has(rule.id)) {
        suggestions.push(suggestion);
      }
    }
  }

  return suggestions;
}

/** Returns a set of default automation rules for a new user. */
export function getDefaultAutomationRules(): AutomationRule[] {
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      name: 'High Dining Spend',
      isEnabled: true,
      triggerType: 'spending_exceeds',
      triggerThreshold: 300,
      triggerCategory: 'Food',
      suggestionType: 'review_budget',
      suggestionMessage: 'Your dining/food spend exceeded $300 this month. Consider meal prepping or cooking at home to save.',
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: 'Low Balance Warning',
      isEnabled: true,
      triggerType: 'balance_below',
      triggerThreshold: 500,
      suggestionType: 'transfer_to_savings',
      suggestionMessage: 'Your total balance dropped below $500. Review upcoming expenses and consider pausing non-essential subscriptions.',
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: 'Month-End Snapshot',
      isEnabled: true,
      triggerType: 'month_end',
      suggestionType: 'record_snapshot',
      suggestionMessage: 'End of month — a good time to record a net worth snapshot and review your budget performance.',
      createdAt: now,
    },
  ];
}
