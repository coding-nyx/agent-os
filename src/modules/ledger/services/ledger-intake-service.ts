import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';

const GUEST_LEDGER_KEY = 'nexus_ledger_profile_guest';
const VAULT_SALT_MARKER = 'vault_salt_used';

export type TaxCategory = 'essential' | 'deductible' | 'discretionary' | 'investment' | 'non-deductible' | 'partial' | 'unknown';

export interface BudgetLineItem {
  id: string;
  label: string;
  amount: number;
  taxCategory?: TaxCategory;
}

export interface DebtItem {
  id: string;
  name: string;
  balance: number;
  minPayment: number;
  apr?: number;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  targetDate?: string;
}

export interface FinancialPlan {
  id: string;
  title: string;
  summary: string;
  monthlyTarget: number;
  allocation: {
    essentials: number;
    growth: number;
    buffer: number;
  };
  tasks: string[];
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface DocumentAnalysis {
  id: string;
  analyzedAt: string;
  periodLabel: string;
  transactionCount: number;
}

export interface LedgerIntakeProfile {
  onboardingComplete: boolean;
  currency: string;
  monthlyIncome: number;
  fixedExpenses: BudgetLineItem[];
  variableExpenses: BudgetLineItem[];
  debtItems: DebtItem[];
  savingsGoals: SavingsGoal[];
  planningHorizon: 'monthly' | 'quarterly' | 'yearly';
  summary: string;
  plans: FinancialPlan[];
  activePlanId: string | null;
  plannerBotState: 'idle' | 'creating' | 'active';
  lastPlanGeneratedAt?: string;
  documentAnalysisEnabled: boolean;
  lastDocumentAnalysis?: DocumentAnalysis;
  createdAt: string;
  updatedAt: string;
}

type LoadContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

function parseArray<T>(value: unknown, mapper: (entry: Record<string, unknown>, index: number) => T): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(mapper);
}

function normalizeLedgerProfile(raw: unknown): LedgerIntakeProfile {
  const now = new Date().toISOString();
  const base = createEmptyLedgerProfile();
  if (!raw || typeof raw !== 'object') return base;

  const candidate = raw as Record<string, unknown>;

  const plans = parseArray(candidate.plans, (plan, index) => ({
    id: typeof plan?.id === 'string' ? plan.id : `plan_${index}_${Date.now()}`,
    title: typeof plan?.title === 'string' ? plan.title : 'Financial Plan',
    summary: typeof plan?.summary === 'string' ? plan.summary : '',
    monthlyTarget: parseNumber(plan?.monthlyTarget),
    allocation: {
      essentials: parseNumber((plan?.allocation as Record<string, unknown>)?.essentials),
      growth: parseNumber((plan?.allocation as Record<string, unknown>)?.growth),
      buffer: parseNumber((plan?.allocation as Record<string, unknown>)?.buffer)
    },
    tasks: Array.isArray(plan?.tasks) ? plan.tasks.filter((t: Record<string, unknown>) => typeof t === 'string') : [],
    status: plan?.status === 'active' || plan?.status === 'archived' ? plan.status as 'active' | 'archived' : 'draft' as const,
    createdAt: typeof plan?.createdAt === 'string' ? plan.createdAt : now,
    updatedAt: typeof plan?.updatedAt === 'string' ? plan.updatedAt : now
  }));

  const normalized: LedgerIntakeProfile = {
    ...base,
    onboardingComplete: candidate.onboardingComplete === true,
    currency: typeof candidate.currency === 'string' && candidate.currency.trim() ? candidate.currency : 'USD',
    monthlyIncome: parseNumber(candidate.monthlyIncome),
    fixedExpenses: parseArray(candidate.fixedExpenses, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `fixed_${index}`,
      label: typeof entry?.label === 'string' ? entry.label : 'Fixed Expense',
      amount: parseNumber(entry?.amount)
    })),
    variableExpenses: parseArray(candidate.variableExpenses, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `variable_${index}`,
      label: typeof entry?.label === 'string' ? entry.label : 'Variable Expense',
      amount: parseNumber(entry?.amount)
    })),
    debtItems: parseArray(candidate.debtItems, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `debt_${index}`,
      name: typeof entry?.name === 'string' ? entry.name : 'Debt Item',
      balance: parseNumber(entry?.balance),
      minPayment: parseNumber(entry?.minPayment),
      apr: typeof entry?.apr === 'number' ? entry.apr : undefined
    })),
    savingsGoals: parseArray(candidate.savingsGoals, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `goal_${index}`,
      name: typeof entry?.name === 'string' ? entry.name : 'Savings Goal',
      targetAmount: parseNumber(entry?.targetAmount),
      targetDate: typeof entry?.targetDate === 'string' ? entry.targetDate : undefined
    })),
    planningHorizon:
      candidate.planningHorizon === 'quarterly' || candidate.planningHorizon === 'yearly'
        ? candidate.planningHorizon
        : 'monthly',
    summary: typeof candidate.summary === 'string' ? candidate.summary : '',
    plans,
    activePlanId: typeof candidate.activePlanId === 'string' ? candidate.activePlanId : null,
    plannerBotState:
      candidate.plannerBotState === 'creating' || candidate.plannerBotState === 'active'
        ? candidate.plannerBotState
        : 'idle',
    lastPlanGeneratedAt:
      typeof candidate.lastPlanGeneratedAt === 'string' ? candidate.lastPlanGeneratedAt : undefined,
    documentAnalysisEnabled: candidate.documentAnalysisEnabled === true,
    lastDocumentAnalysis:
      candidate.lastDocumentAnalysis && typeof candidate.lastDocumentAnalysis === 'object'
        ? {
            id: typeof (candidate.lastDocumentAnalysis as Record<string, unknown>)?.id === 'string'
              ? (candidate.lastDocumentAnalysis as Record<string, unknown>).id as string
              : crypto.randomUUID(),
            analyzedAt: typeof (candidate.lastDocumentAnalysis as Record<string, unknown>)?.analyzedAt === 'string'
              ? (candidate.lastDocumentAnalysis as Record<string, unknown>).analyzedAt as string
              : now,
            periodLabel: typeof (candidate.lastDocumentAnalysis as Record<string, unknown>)?.periodLabel === 'string'
              ? (candidate.lastDocumentAnalysis as Record<string, unknown>).periodLabel as string
              : 'Unknown',
            transactionCount: parseNumber((candidate.lastDocumentAnalysis as Record<string, unknown>)?.transactionCount, 0)
          }
        : undefined,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now
  };

  return normalized;
}

export function createEmptyLedgerProfile(): LedgerIntakeProfile {
  const now = new Date().toISOString();
  return {
    onboardingComplete: false,
    currency: 'USD',
    monthlyIncome: 0,
    fixedExpenses: [],
    variableExpenses: [],
    debtItems: [],
    savingsGoals: [],
    planningHorizon: 'monthly',
    summary: '',
    plans: [],
    activePlanId: null,
    plannerBotState: 'idle',
    documentAnalysisEnabled: false,
    createdAt: now,
    updatedAt: now
  };
}

export async function loadLedgerProfile({ userId, encryptionKey }: LoadContext): Promise<LedgerIntakeProfile | null> {
  if (userId && encryptionKey) {
    const dataLayer = getNexusDataLayer();
    const data = await dataLayer.getDocument<{ encryptedData?: string; iv?: string }>('ledger_profiles', userId);
    if (!data) return null;
    if (!data.encryptedData || !data.iv) return null;
    try {
      const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
      return normalizeLedgerProfile(JSON.parse(decrypted));
    } catch (e) {
      console.error('Failed to decrypt ledger profile:', e);
      return null;
    }
  }

  return loadGuestLedgerProfile();
}

export function subscribeLedgerProfile(
  { userId, encryptionKey }: LoadContext,
  onUpdate: (profile: LedgerIntakeProfile | null) => void
): () => void {
  if (userId && encryptionKey) {
    const dataLayer = getNexusDataLayer();
    const unsubscribe = dataLayer.subscribeToDocument<{ encryptedData?: string; iv?: string }>(
      'ledger_profiles',
      userId,
      async (data) => {
        if (!data) {
          onUpdate(null);
          return;
        }
        if (!data.encryptedData || !data.iv) {
          onUpdate(null);
          return;
        }
        try {
          const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
          onUpdate(normalizeLedgerProfile(JSON.parse(decrypted)));
        } catch (e) {
          console.error('Failed to decrypt ledger profile:', e);
          onUpdate(null);
        }
      }
    );
    return unsubscribe;
  }

  onUpdate(loadGuestLedgerProfile());
  return () => {};
}

export async function saveLedgerProfile(profile: LedgerIntakeProfile, { userId, encryptionKey }: LoadContext): Promise<void> {
  const normalizedProfile = normalizeLedgerProfile(profile);

  if (userId && encryptionKey) {
    const dataLayer = getNexusDataLayer();
    const encrypted = await encryptWithKey(JSON.stringify(normalizedProfile), encryptionKey);
    try {
      await dataLayer.setDocument('ledger_profiles', userId, {
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: VAULT_SALT_MARKER,
        metadata: {
          onboardingComplete: normalizedProfile.onboardingComplete,
          lastActive: new Date().toISOString(),
          activePlanId: normalizedProfile.activePlanId,
          plannerBotState: normalizedProfile.plannerBotState
        }
      });
    } catch (error) {
      console.error('[LedgerIntakeService] Failed to save ledger profile:', error);
    }
    return;
  }

  saveGuestLedgerProfile(normalizedProfile);
}

export async function syncGuestLedgerProfileToUser({ userId, encryptionKey }: LoadContext): Promise<boolean> {
  if (!userId || !encryptionKey) return false;

  const guestProfile = loadGuestLedgerProfile();
  if (!guestProfile) return false;

  const dataLayer = getNexusDataLayer();
  const existing = await dataLayer.getDocument<{ encryptedData?: string }>('ledger_profiles', userId);
  if (existing?.encryptedData) {
    return false;
  }

  await saveLedgerProfile(guestProfile, { userId, encryptionKey });
  clearGuestLedgerProfile();
  return true;
}

export function loadGuestLedgerProfile(): LedgerIntakeProfile | null {
  const raw = localStorage.getItem(GUEST_LEDGER_KEY);
  if (!raw) return null;

  try {
    return normalizeLedgerProfile(JSON.parse(raw));
  } catch (e) {
    console.error('Failed to parse guest ledger profile:', e);
    return null;
  }
}

export function saveGuestLedgerProfile(profile: LedgerIntakeProfile) {
  localStorage.setItem(GUEST_LEDGER_KEY, JSON.stringify(normalizeLedgerProfile(profile)));
}

export function clearGuestLedgerProfile() {
  localStorage.removeItem(GUEST_LEDGER_KEY);
}
