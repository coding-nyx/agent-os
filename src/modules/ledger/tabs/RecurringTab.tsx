import React from 'react';
import { RecurringManager } from '../components/RecurringManager';
import type { RecurringRule, Account } from '../services/ledger-intake-service';

interface RecurringTabProps {
  rules: RecurringRule[];
  accounts?: Account[];
  currency?: string;
  disabled?: boolean;
  onAddRule: (rule: Omit<RecurringRule, 'id' | 'createdAt' | 'nextDueDate'>) => void;
  onUpdateRule: (id: string, updates: Partial<RecurringRule>) => void;
  onDeleteRule: (id: string) => void;
  onPostNow: (ruleId: string) => void;
  onSkipNext: (ruleId: string) => void;
}

export function RecurringTab({
  rules,
  accounts,
  currency,
  disabled,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  onPostNow,
  onSkipNext,
}: RecurringTabProps) {
  return (
    <div className="px-4 md:px-8">
      <RecurringManager
        rules={rules}
        accounts={accounts}
        currency={currency}
        disabled={disabled}
        onAddRule={onAddRule}
        onUpdateRule={onUpdateRule}
        onDeleteRule={onDeleteRule}
        onPostNow={onPostNow}
        onSkipNext={onSkipNext}
      />
    </div>
  );
}
