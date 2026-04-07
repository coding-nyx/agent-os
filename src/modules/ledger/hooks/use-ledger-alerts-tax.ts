import { useCallback } from 'react';
import type {
  LedgerIntakeProfile,
  AlertRule,
  TaxDeduction,
  TaxCategory,
} from '../services/ledger-intake-service';
import { buildTaxYearSummary } from '../services/aggregation/tax-aggregation';

export interface LedgerAlertActions {
  handleDismissNotification: (notificationId: string) => void;
  handleToggleAlertRule: (ruleId: string, enabled: boolean) => void;
  handleCreateAlertRule: (data: Partial<AlertRule>) => void;
  handleDeleteAlertRule: (ruleId: string) => void;
}

export interface LedgerTaxActions {
  handleSetTaxCategory: (transactionIds: string[], category: TaxCategory) => void;
  handleAddTaxDeduction: (data: Partial<TaxDeduction>) => void;
  handleDeleteTaxDeduction: (deductionId: string) => void;
  handleGenerateTaxSummary: (taxYear: number) => void;
}

export function useLedgerAlerts(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerAlertActions {
  const handleDismissNotification = useCallback((notificationId: string) => {
    if (!profile) return;
    const dismissed = [...(profile.dismissedAlertIds ?? [])];
    if (!dismissed.includes(notificationId)) dismissed.push(notificationId);
    persistUpdate({ ...profile, dismissedAlertIds: dismissed, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleToggleAlertRule = useCallback((ruleId: string, enabled: boolean) => {
    if (!profile) return;
    const rules = (profile.alertRules ?? []).map(r => r.id === ruleId ? { ...r, isEnabled: enabled } : r);
    persistUpdate({ ...profile, alertRules: rules, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleCreateAlertRule = useCallback((data: Partial<AlertRule>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const rule: AlertRule = {
      id: crypto.randomUUID(),
      type: data.type ?? 'large_transaction',
      label: data.label ?? 'Alert',
      severity: data.severity ?? 'info',
      isEnabled: data.isEnabled !== false,
      threshold: data.threshold,
      entityId: data.entityId,
      createdAt: now,
    };
    persistUpdate({ ...profile, alertRules: [...(profile.alertRules ?? []), rule], updatedAt: now });
  }, [profile, persistUpdate]);

  const handleDeleteAlertRule = useCallback((ruleId: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, alertRules: (profile.alertRules ?? []).filter(r => r.id !== ruleId), updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  return {
    handleDismissNotification,
    handleToggleAlertRule,
    handleCreateAlertRule,
    handleDeleteAlertRule,
  };
}

export function useLedgerTax(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerTaxActions {
  const handleSetTaxCategory = useCallback((transactionIds: string[], category: TaxCategory) => {
    if (!profile) return;
    const transactions = (profile.transactions ?? []).map(tx =>
      transactionIds.includes(tx.id) ? { ...tx, taxCategory: category } : tx
    );
    persistUpdate({ ...profile, transactions, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleAddTaxDeduction = useCallback((data: Partial<TaxDeduction>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const deduction: TaxDeduction = {
      id: crypto.randomUUID(),
      label: data.label ?? 'Deduction',
      amount: data.amount ?? 0,
      category: data.category ?? 'deductible',
      taxYear: data.taxYear ?? new Date().getFullYear(),
      notes: data.notes,
      receiptRef: data.receiptRef,
      createdAt: now,
    };
    persistUpdate({ ...profile, taxDeductions: [...(profile.taxDeductions ?? []), deduction], updatedAt: now });
  }, [profile, persistUpdate]);

  const handleDeleteTaxDeduction = useCallback((deductionId: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, taxDeductions: (profile.taxDeductions ?? []).filter(d => d.id !== deductionId), updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleGenerateTaxSummary = useCallback((taxYear: number) => {
    if (!profile) return;
    const summary = buildTaxYearSummary(profile, taxYear);
    persistUpdate({ ...profile, lastTaxSummary: summary, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  return {
    handleSetTaxCategory,
    handleAddTaxDeduction,
    handleDeleteTaxDeduction,
    handleGenerateTaxSummary,
  };
}
