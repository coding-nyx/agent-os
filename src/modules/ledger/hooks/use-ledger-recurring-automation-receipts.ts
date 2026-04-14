import { useCallback } from 'react';
import type {
  LedgerIntakeProfile,
  RecurringRule,
  AutomationRule,
  AutomationTriggerType,
  AutomationSuggestionType,
  Receipt,
} from '../services/ledger-intake-service';
import { computeNetLiquidAssets } from '../services/aggregation/account-aggregation';
import { computeCashFlowForecast } from '../services/aggregation/forecast-aggregation';
import { upsertCurrencyRate } from '../services/currency-service';
import { runExport } from '../services/export-service';
import { postSingleRule, skipNextOccurrence } from '../services/recurring-engine';

// Default automation rules — mirrors LedgerAutomationEngine.getDefaultRules() in cortex-logic.
// Source of truth is cortex; these exist here only for the hook's direct-profile mutation path.
const DEFAULT_AUTOMATION_RULES: Array<Omit<AutomationRule, 'id' | 'createdAt'>> = [
  {
    name: 'High Dining Spend',
    isEnabled: true,
    triggerType: 'spending_exceeds' as AutomationTriggerType,
    triggerThreshold: 300,
    triggerCategory: 'Food',
    suggestionType: 'review_budget' as AutomationSuggestionType,
    suggestionMessage: 'Your dining/food spend exceeded $300 this month. Consider meal prepping or cooking at home to save.',
  },
  {
    name: 'Low Balance Warning',
    isEnabled: true,
    triggerType: 'balance_below' as AutomationTriggerType,
    triggerThreshold: 500,
    suggestionType: 'transfer_to_savings' as AutomationSuggestionType,
    suggestionMessage: 'Your total balance dropped below $500. Review upcoming expenses and consider pausing non-essential subscriptions.',
  },
  {
    name: 'Month-End Snapshot',
    isEnabled: true,
    triggerType: 'month_end' as AutomationTriggerType,
    suggestionType: 'record_snapshot' as AutomationSuggestionType,
    suggestionMessage: 'End of month \u2014 a good time to record a net worth snapshot and review your budget performance.',
  },
];

export interface LedgerRecurringActions {
  handleAddRecurringRule: (data: Omit<RecurringRule, 'id' | 'createdAt' | 'nextDueDate'>) => void;
  handleUpdateRecurringRule: (id: string, updates: Partial<RecurringRule>) => void;
  handleDeleteRecurringRule: (id: string) => void;
  handlePostRecurringNow: (ruleId: string) => void;
  handleSkipRecurring: (ruleId: string) => void;
  handleGenerateForecast: (horizon: 30 | 60 | 90) => void;
}

export interface LedgerAutomationActions {
  handleCreateAutomationRule: (data: Partial<AutomationRule>) => void;
  handleUpdateAutomationRule: (ruleId: string, data: Partial<AutomationRule>) => void;
  handleDeleteAutomationRule: (ruleId: string) => void;
  handleToggleAutomationRule: (ruleId: string, enabled: boolean) => void;
  handleDismissSuggestion: (suggestionId: string) => void;
  handleAddDefaultAutomationRules: () => void;
}

export interface LedgerReceiptActions {
  handleAddReceipt: (data: Partial<Receipt>) => void;
  handleDeleteReceipt: (receiptId: string) => void;
  handleLinkReceiptToTransaction: (receiptId: string, transactionId: string) => void;
}

export interface LedgerCurrencyActions {
  handleUpdateBaseCurrency: (currency: string) => void;
  handleUpsertCurrencyRate: (from: string, to: string, rate: number) => void;
  handleDeleteCurrencyRate: (from: string, to: string) => void;
}

export interface LedgerExportActions {
  handleExportTransactionsCsv: (fromDate?: string, toDate?: string) => void;
  handleExportTaxSummary: (taxYear: number) => void;
  handleExportNetWorthReport: () => void;
}

export function useLedgerRecurring(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerRecurringActions {
  const handleAddRecurringRule = useCallback((ruleData: Omit<RecurringRule, 'id' | 'createdAt' | 'nextDueDate'>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const newRule: RecurringRule = {
      ...ruleData,
      id: crypto.randomUUID(),
      nextDueDate: ruleData.startDate,
      createdAt: now,
    };
    persistUpdate({ ...profile, recurringRules: [...(profile.recurringRules ?? []), newRule], updatedAt: now });
  }, [profile, persistUpdate]);

  const handleUpdateRecurringRule = useCallback((id: string, updates: Partial<RecurringRule>) => {
    if (!profile) return;
    const rules = (profile.recurringRules ?? []).map(r => r.id === id ? { ...r, ...updates } : r);
    persistUpdate({ ...profile, recurringRules: rules, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleDeleteRecurringRule = useCallback((id: string) => {
    if (!profile) return;
    const rules = (profile.recurringRules ?? []).filter(r => r.id !== id);
    persistUpdate({ ...profile, recurringRules: rules, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handlePostRecurringNow = useCallback((ruleId: string) => {
    if (!profile) return;
    const rule = (profile.recurringRules ?? []).find(r => r.id === ruleId);
    if (!rule) return;
    const { updatedProfile } = postSingleRule(rule, profile);
    persistUpdate(updatedProfile);
  }, [profile, persistUpdate]);

  const handleSkipRecurring = useCallback((ruleId: string) => {
    if (!profile) return;
    const rule = (profile.recurringRules ?? []).find(r => r.id === ruleId);
    if (!rule) return;
    persistUpdate(skipNextOccurrence(rule, profile));
  }, [profile, persistUpdate]);

  const handleGenerateForecast = useCallback((horizon: 30 | 60 | 90) => {
    if (!profile) return;
    const startingBalance = computeNetLiquidAssets(profile.accounts ?? []);
    const forecast = computeCashFlowForecast(profile.recurringRules ?? [], startingBalance, horizon);
    persistUpdate({ ...profile, lastCashFlowForecast: forecast, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  return {
    handleAddRecurringRule,
    handleUpdateRecurringRule,
    handleDeleteRecurringRule,
    handlePostRecurringNow,
    handleSkipRecurring,
    handleGenerateForecast,
  };
}

export function useLedgerAutomation(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerAutomationActions {
  const handleCreateAutomationRule = useCallback((data: Partial<AutomationRule>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const rule: AutomationRule = {
      id: crypto.randomUUID(),
      name: data.name ?? 'Rule',
      isEnabled: data.isEnabled !== false,
      triggerType: (data.triggerType ?? 'spending_exceeds') as AutomationTriggerType,
      triggerThreshold: data.triggerThreshold,
      triggerEntityId: data.triggerEntityId,
      triggerCategory: data.triggerCategory,
      suggestionType: (data.suggestionType ?? 'review_budget') as AutomationSuggestionType,
      suggestionMessage: data.suggestionMessage ?? 'Review your finances.',
      createdAt: now,
    };
    persistUpdate({ ...profile, automationRules: [...(profile.automationRules ?? []), rule], updatedAt: now });
  }, [profile, persistUpdate]);

  const handleUpdateAutomationRule = useCallback((ruleId: string, data: Partial<AutomationRule>) => {
    if (!profile) return;
    persistUpdate({ ...profile, automationRules: (profile.automationRules ?? []).map(r => r.id === ruleId ? { ...r, ...data } : r), updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleDeleteAutomationRule = useCallback((ruleId: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, automationRules: (profile.automationRules ?? []).filter(r => r.id !== ruleId), updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleToggleAutomationRule = useCallback((ruleId: string, enabled: boolean) => {
    if (!profile) return;
    persistUpdate({ ...profile, automationRules: (profile.automationRules ?? []).map(r => r.id === ruleId ? { ...r, isEnabled: enabled } : r), updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleDismissSuggestion = useCallback((suggestionId: string) => {
    if (!profile) return;
    const dismissed = [...(profile.dismissedSuggestionIds ?? [])];
    if (!dismissed.includes(suggestionId)) dismissed.push(suggestionId);
    persistUpdate({ ...profile, dismissedSuggestionIds: dismissed, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleAddDefaultAutomationRules = useCallback(() => {
    if (!profile) return;
    const now = new Date().toISOString();
    const existing = profile.automationRules ?? [];
    const existingTriggers = new Set(existing.map(r => r.triggerType));
    const toAdd: AutomationRule[] = DEFAULT_AUTOMATION_RULES
      .filter(d => !existingTriggers.has(d.triggerType))
      .map(d => ({ ...d, id: crypto.randomUUID(), createdAt: now }));
    if (toAdd.length === 0) return;
    persistUpdate({ ...profile, automationRules: [...existing, ...toAdd], updatedAt: now });
  }, [profile, persistUpdate]);

  return {
    handleCreateAutomationRule,
    handleUpdateAutomationRule,
    handleDeleteAutomationRule,
    handleToggleAutomationRule,
    handleDismissSuggestion,
    handleAddDefaultAutomationRules,
  };
}

export function useLedgerReceipts(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerReceiptActions {
  const handleAddReceipt = useCallback((data: Partial<Receipt>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const receipt: Receipt = {
      id: crypto.randomUUID(),
      label: data.label ?? 'Receipt',
      amount: data.amount ?? 0,
      date: data.date ?? now.split('T')[0],
      transactionId: data.transactionId,
      category: data.category,
      taxCategory: data.taxCategory,
      taxYear: data.taxYear ?? new Date().getFullYear(),
      imageRef: data.imageRef,
      notes: data.notes,
      createdAt: now,
    };
    persistUpdate({ ...profile, receipts: [...(profile.receipts ?? []), receipt], updatedAt: now });
  }, [profile, persistUpdate]);

  const handleDeleteReceipt = useCallback((receiptId: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, receipts: (profile.receipts ?? []).filter(r => r.id !== receiptId), updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleLinkReceiptToTransaction = useCallback((receiptId: string, transactionId: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, receipts: (profile.receipts ?? []).map(r => r.id === receiptId ? { ...r, transactionId } : r), updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  return { handleAddReceipt, handleDeleteReceipt, handleLinkReceiptToTransaction };
}

export function useLedgerCurrency(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerCurrencyActions {
  const handleUpdateBaseCurrency = useCallback((currency: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, currency, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleUpsertCurrencyRate = useCallback((from: string, to: string, rate: number) => {
    if (!profile) return;
    const updated = upsertCurrencyRate(profile.currencyRates ?? [], from, to, rate);
    persistUpdate({ ...profile, currencyRates: updated, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleDeleteCurrencyRate = useCallback((from: string, to: string) => {
    if (!profile) return;
    const filtered = (profile.currencyRates ?? []).filter(r => !(r.from === from && r.to === to));
    persistUpdate({ ...profile, currencyRates: filtered, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  return { handleUpdateBaseCurrency, handleUpsertCurrencyRate, handleDeleteCurrencyRate };
}

export function useLedgerExport(
  profile: LedgerIntakeProfile | null,
): LedgerExportActions {
  const handleExportTransactionsCsv = useCallback((fromDate?: string, toDate?: string) => {
    if (!profile) return;
    runExport(profile, { type: 'transactions_csv', fromDate, toDate });
  }, [profile]);

  const handleExportTaxSummary = useCallback((taxYear: number) => {
    if (!profile) return;
    runExport(profile, { type: 'tax_summary_json', taxYear });
  }, [profile]);

  const handleExportNetWorthReport = useCallback(() => {
    if (!profile) return;
    runExport(profile, { type: 'net_worth_json' });
  }, [profile]);

  return { handleExportTransactionsCsv, handleExportTaxSummary, handleExportNetWorthReport };
}
