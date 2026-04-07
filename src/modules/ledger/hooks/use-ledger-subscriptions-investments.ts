import { useCallback } from 'react';
import type {
  LedgerIntakeProfile,
  Subscription,
  Investment,
} from '../services/ledger-intake-service';
import { recomputeInvestment, buildPortfolioSnapshot } from '../services/aggregation/portfolio-aggregation';

export interface LedgerSubscriptionActions {
  handleCreateSubscription: (data: Partial<Subscription>) => void;
  handleUpdateSubscription: (subscriptionId: string, data: Partial<Subscription>) => void;
  handleDeleteSubscription: (subscriptionId: string) => void;
  handleCancelSubscription: (subscriptionId: string) => void;
}

export interface LedgerInvestmentActions {
  handleAddInvestment: (data: Partial<Investment>) => void;
  handleUpdateInvestment: (investmentId: string, data: Partial<Investment>) => void;
  handleDeleteInvestment: (investmentId: string) => void;
  handleRecordPortfolioSnapshot: (note?: string) => void;
  handleAddDividend: (investmentId: string, amount: number) => void;
}

export function useLedgerSubscriptions(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerSubscriptionActions {
  const handleCreateSubscription = useCallback((data: Partial<Subscription>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const billingCycle = (data.billingCycle ?? 'monthly') as Subscription['billingCycle'];
    const amount = data.amount ?? 0;
    const monthlyMap: Record<Subscription['billingCycle'], number> = {
      weekly: amount * 52 / 12, monthly: amount, quarterly: amount / 3, yearly: amount / 12, lifetime: 0
    };
    const sub: Subscription = {
      id: crypto.randomUUID(),
      name: data.name ?? 'Subscription',
      category: data.category ?? 'Other',
      amount,
      billingCycle,
      monthlyEquivalent: monthlyMap[billingCycle],
      status: data.status ?? 'active',
      nextRenewalDate: data.nextRenewalDate ?? now.split('T')[0],
      trialEndsAt: data.trialEndsAt,
      reminderDays: data.reminderDays ?? 7,
      website: data.website,
      notes: data.notes,
      color: data.color,
      accountId: data.accountId,
      createdAt: now,
      updatedAt: now,
    };
    persistUpdate({ ...profile, subscriptions: [...(profile.subscriptions ?? []), sub], updatedAt: now });
  }, [profile, persistUpdate]);

  const handleUpdateSubscription = useCallback((subscriptionId: string, data: Partial<Subscription>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const subs = (profile.subscriptions ?? []).map(s => {
      if (s.id !== subscriptionId) return s;
      const amount = data.amount ?? s.amount;
      const billingCycle = data.billingCycle ?? s.billingCycle;
      const monthlyMap: Record<Subscription['billingCycle'], number> = {
        weekly: amount * 52 / 12, monthly: amount, quarterly: amount / 3, yearly: amount / 12, lifetime: 0
      };
      return { ...s, ...data, amount, billingCycle, monthlyEquivalent: monthlyMap[billingCycle], updatedAt: now };
    });
    persistUpdate({ ...profile, subscriptions: subs, updatedAt: now });
  }, [profile, persistUpdate]);

  const handleDeleteSubscription = useCallback((subscriptionId: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, subscriptions: (profile.subscriptions ?? []).filter(s => s.id !== subscriptionId), updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleCancelSubscription = useCallback((subscriptionId: string) => {
    if (!profile) return;
    const now = new Date().toISOString();
    persistUpdate({ ...profile, subscriptions: (profile.subscriptions ?? []).map(s => s.id === subscriptionId ? { ...s, status: 'cancelled' as const, updatedAt: now } : s), updatedAt: now });
  }, [profile, persistUpdate]);

  return {
    handleCreateSubscription,
    handleUpdateSubscription,
    handleDeleteSubscription,
    handleCancelSubscription,
  };
}

export function useLedgerInvestments(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerInvestmentActions {
  const handleAddInvestment = useCallback((data: Partial<Investment>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const quantity = data.quantity ?? 1;
    const costBasis = data.costBasis ?? 0;
    const currentPrice = data.currentPrice ?? costBasis;
    const currentValue = quantity * currentPrice;
    const totalCost = quantity * costBasis;
    const inv: Investment = {
      id: crypto.randomUUID(),
      name: data.name ?? 'Investment',
      ticker: data.ticker,
      type: data.type ?? 'other',
      quantity,
      costBasis,
      currentPrice,
      currentValue,
      totalCost,
      unrealizedGain: currentValue - totalCost,
      dividendsReceived: data.dividendsReceived,
      accountId: data.accountId,
      notes: data.notes,
      purchasedAt: data.purchasedAt,
      lastUpdatedAt: now,
      createdAt: now,
    };
    persistUpdate({ ...profile, investments: [...(profile.investments ?? []), inv], updatedAt: now });
  }, [profile, persistUpdate]);

  const handleUpdateInvestment = useCallback((investmentId: string, data: Partial<Investment>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const investments = (profile.investments ?? []).map(inv => {
      if (inv.id !== investmentId) return inv;
      const merged = { ...inv, ...data };
      return recomputeInvestment({ ...merged, lastUpdatedAt: now });
    });
    persistUpdate({ ...profile, investments, updatedAt: now });
  }, [profile, persistUpdate]);

  const handleDeleteInvestment = useCallback((investmentId: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, investments: (profile.investments ?? []).filter(inv => inv.id !== investmentId), updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleRecordPortfolioSnapshot = useCallback((note?: string) => {
    if (!profile) return;
    const snapshot = buildPortfolioSnapshot(profile.investments ?? [], note);
    persistUpdate({ ...profile, portfolioHistory: [...(profile.portfolioHistory ?? []), snapshot], updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleAddDividend = useCallback((investmentId: string, amount: number) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const investments = (profile.investments ?? []).map(inv =>
      inv.id === investmentId ? { ...inv, dividendsReceived: (inv.dividendsReceived ?? 0) + amount, lastUpdatedAt: now } : inv
    );
    persistUpdate({ ...profile, investments, updatedAt: now });
  }, [profile, persistUpdate]);

  return {
    handleAddInvestment,
    handleUpdateInvestment,
    handleDeleteInvestment,
    handleRecordPortfolioSnapshot,
    handleAddDividend,
  };
}
