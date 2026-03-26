import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useAI } from '@/llm-engine/ai-context';
import { UniversalUploadZone } from '@/core/components/forms/UniversalUploadZone';
import { NeuralModal } from '@/core/components/NeuralModal';
import { VaultLockedShell } from '@/core/components/VaultLockedShell';
import { SingleAgentLayout } from '@/core/layout/SingleAgentLayout';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { SectionHeader } from '@/core/components/SectionHeader';
import { NeuralTabGroup } from '@/core/components/NeuralTabGroup';
import { NeuralButton } from '@/core/components/NeuralButton';
import { Camera, FileUp, FolderOpen, Plus, Settings, LayoutDashboard, Receipt as ReceiptIcon, PiggyBank, Target, Scale, Globe } from 'lucide-react';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { SpineEvent } from '@/lib/types';
import { LEDGER_TOAST_EVENTS } from '@/modules/ledger/actions/ledger-field-actions';
import { analyzeImageWithVision } from '@/lib/services/vision-analysis-service';
import {
  FinancialPlan,
  LedgerIntakeProfile,
  Transaction,
  BudgetCategory,
  FinancialGoal,
  saveLedgerProfile,
} from './services/ledger-intake-service';
import { computeBudgetActuals, matchCategoryToTransaction } from './services/aggregation';
import { LEDGER_PERSONA } from './personas';
import { serializeLedgerFinancialContext } from './prompts/ledger-prompt-builder';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { computeResonanceROI } from './services/resonance-roi-service';
import { prepareDocumentChatPrompt } from '@/lib/services/document-chat-handoff-service';
import type { DocumentUploadRequest } from '@/lib/services/document-upload-message';
import { runDocumentPipeline } from '@/lib/services/document-pipeline';
import { ledgerDocumentPolicy, type LedgerDocumentProposal } from './services/ledger-document-policy';
import { useLedgerCrossVerify } from './hooks/use-ledger-cross-verify';
import { LedgerNotificationSettingsPanel } from './components/LedgerNotificationSettingsPanel';
import { SchemaRegistry } from '@/lib/schema-registry';
import { FieldType, type FieldDefinition } from '@/lib/field-system/types';
import type { DebtItem } from './services/ledger-intake-service';
import { ModuleReminderEntry } from '@/core/components/ModuleReminderEntry';
import { LedgerActionsProvider } from './context/LedgerActionsContext';
import { DashboardTab } from './tabs/DashboardTab';
import { TransactionsTab } from './tabs/TransactionsTab';
import { BudgetTab } from './tabs/BudgetTab';
import { GoalsTab } from './tabs/GoalsTab';
import { TaxTab } from './tabs/TaxTab';
import { AccountsTab } from './tabs/AccountsTab';
import { RecurringTab } from './tabs/RecurringTab';
import { FieldsTab } from './components/FieldsTab';
import { NetWorthDashboard } from './components/NetWorthDashboard';
import { CashFlowForecast } from './components/CashFlowForecast';
import AlertsCenter from './components/AlertsCenter';
import SubscriptionManager from './components/SubscriptionManager';
import InvestmentPortfolio from './components/InvestmentPortfolio';
import FinancialCalendar from './components/FinancialCalendar';
import TaxCenter from './components/TaxCenter';
import ExportPanel from './components/ExportPanel';
import CreditScoreTracker from './components/CreditScoreTracker';
import InsuranceManager from './components/InsuranceManager';
import RetirementPlanner from './components/RetirementPlanner';
import AutomationRules from './components/AutomationRules';
import ReceiptLibrary from './components/ReceiptLibrary';
import CurrencySettings from './components/CurrencySettings';
import { useRecurringEngine } from './hooks/use-recurring-engine';
import { computeNetLiquidAssets } from './services/aggregation/account-aggregation';
import { computeCashFlowForecast } from './services/aggregation/forecast-aggregation';
import { buildNetWorthSnapshot } from './services/aggregation/networth-aggregation';
import { recomputeInvestment, buildPortfolioSnapshot } from './services/aggregation/portfolio-aggregation';
import { buildTaxYearSummary } from './services/aggregation/tax-aggregation';
import { inferCreditFactors } from './services/aggregation/credit-aggregation';
import { toMonthlyPremium } from './services/aggregation/insurance-aggregation';
import { projectRetirement } from './services/aggregation/retirement-calculator';
import { runExport } from './services/export-service';
import { evaluateAutomationRules, getDefaultAutomationRules } from './services/automation-engine';
import { upsertCurrencyRate } from './services/currency-service';
import type { Account, AccountTransfer, RecurringRule, PlaidConnection, Subscription, Investment, AlertRule, TaxDeduction, TaxCategory, InsurancePolicy, InsuranceBillingCycle, InsurancePolicyType, RetirementPlan, AutomationRule, AutomationTriggerType, AutomationSuggestionType, Receipt, CreditScoreEntry, CreditBureau } from './services/ledger-intake-service';

/** Deterministic color palette for budget categories — no Math.random(). */
const BUDGET_CATEGORY_COLORS: readonly string[] = [
  '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#3b82f6', '#ec4899', '#f97316',
  '#84cc16', '#a78bfa',
] as const;

function pickBudgetColor(index: number): string {
  return BUDGET_CATEGORY_COLORS[index % BUDGET_CATEGORY_COLORS.length];
}

function createStarterPlan(profile: LedgerIntakeProfile): FinancialPlan {
  const totalFixed = profile.fixedExpenses.reduce((sum, item) => sum + item.amount, 0);
  const totalVariable = profile.variableExpenses.reduce((sum, item) => sum + item.amount, 0);
  const baselineSpend = totalFixed + totalVariable;
  const monthlyTarget = Math.max(profile.monthlyIncome - baselineSpend, 0);
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: 'Starter Financial Plan',
    summary: 'Baseline cashflow stabilization with weekly execution checkpoints.',
    monthlyTarget,
    allocation: {
      essentials: 60,
      growth: 25,
      buffer: 15
    },
    tasks: [
      'Track every variable expense for the next 7 days.',
      'Cap discretionary spending at 80% of current baseline.',
      'Apply first buffer deposit to emergency reserve this month.'
    ],
    status: 'active',
    createdAt: now,
    updatedAt: now
  };
}

type LedgerTab = 'overview' | 'transactions' | 'budget' | 'goals' | 'tax' | 'accounts' | 'recurring' | 'subscriptions' | 'investments' | 'calendar' | 'retirement' | 'credit' | 'insurance' | 'automation' | 'receipts';

const LEDGER_TABS: { id: LedgerTab; label: string }[] = [
  { id: 'overview', label: 'Dashboard' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'investments', label: 'Investments' },
  { id: 'retirement', label: 'Retirement' },
  { id: 'budget', label: 'Budget' },
  { id: 'goals', label: 'Goals' },
  { id: 'tax', label: 'Tax' },
  { id: 'credit', label: 'Credit' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'automation', label: 'Automation' },
  { id: 'receipts', label: 'Receipts' },
];

/** Shape expected by handleApplyBudgetTemplate */
interface BudgetTemplate {
  allocations: Record<string, number>;
}

export function LedgerContent({ profile, encryptionKey }: { profile: LedgerIntakeProfile | null; encryptionKey: CryptoKey | null }) {
  const { globalSoul } = useGlobalSoul();
  const { user, isGuest } = useAuth();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('ledger');
  const { sendMessage, analyzeImage } = useAI();

  // Cross-verification: coherence checks + NSV sync + Spine events
  const { coherenceReport } = useLedgerCrossVerify(profile);

  const agentAlias = globalSoul?.displayNames?.ledger || 'Ledger';
  const plannerBootstrappedRef = useRef(false);
  const [activeTab, setActiveTab] = useState<LedgerTab>('overview');
  const [isAddTransactionModalOpen, setIsAddTransactionModalOpen] = useState(false);
  const [isCurrencySettingsOpen, setIsCurrencySettingsOpen] = useState(false);
  const [recentEvents, setRecentEvents] = useState<SpineEvent[]>([]);
  const [isFieldsModalOpen, setIsFieldsModalOpen] = useState(false);

  // ─── Dynamic system prompt enriched with live financial context ────────────
  const enrichedSystemPrompt = useMemo(() => {
    if (!profile) return LEDGER_PERSONA;
    const context = serializeLedgerFinancialContext({
      accounts: profile.accounts,
      debtItems: profile.debtItems,
      netWorthHistory: profile.netWorthHistory,
      recurringRules: profile.recurringRules,
      lastCashFlowForecast: profile.lastCashFlowForecast,
      currency: profile.currency,
      subscriptions: profile.subscriptions,
      investments: profile.investments,
      alertRules: profile.alertRules,
      creditScoreHistory: profile.creditScoreHistory,
      insurancePolicies: profile.insurancePolicies,
      lastRetirementProjection: profile.lastRetirementProjection,
    });
    return context ? `${LEDGER_PERSONA}\n\n${context}` : LEDGER_PERSONA;
  }, [profile?.accounts, profile?.debtItems, profile?.netWorthHistory, profile?.recurringRules, profile?.lastCashFlowForecast, profile?.currency, profile?.subscriptions, profile?.investments, profile?.alertRules, profile?.creditScoreHistory, profile?.insurancePolicies, profile?.lastRetirementProjection]);

  const ai = useModuleAI({
    moduleId: 'ledger',
    systemPrompt: enrichedSystemPrompt,
    encryptionKey,
    persistencePolicy: 'ledger-financial'
  });

  // Vision analysis state for financial documents
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [isVisionAnalyzing, setIsVisionAnalyzing] = useState(false);
  const [visionReviewData, setVisionReviewData] = useState<Record<string, unknown> | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [docProposal, setDocProposal] = useState<LedgerDocumentProposal | null>(null);
  const [docProposalSummary, setDocProposalSummary] = useState<string | null>(null);
  const [isDocReviewOpen, setIsDocReviewOpen] = useState(false);

  const handleOpenDocuments = useCallback(() => {
    ai.handleSendMessage(
      'Open embedded financial document intelligence mode. Ask me to upload a statement, receipt, or invoice for structured extraction.'
    );
  }, [ai]);

  const handleDocumentFile = useCallback(async (file: File) => {
    const llmPrimary = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        systemPrompt: 'You are a financial document analysis engine. Return only valid JSON as instructed.',
        memoryContext: [],
        summary: 'Financial document analysis.',
        history: [],
      });
      return response.publicText;
    };
    const llmFallback = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        systemPrompt: 'Return only valid JSON as instructed.',
        memoryContext: [],
        summary: 'Document analysis fallback.',
        history: [],
      });
      return response.publicText;
    };

    try {
      const result = await runDocumentPipeline({
        file,
        policy: ledgerDocumentPolicy,
        sendMessage: llmPrimary,
        sendMessageFallback: llmFallback,
      });
      setDocProposal(result.proposal);
      setDocProposalSummary(result.summary);
      setIsDocReviewOpen(true);
    } catch (err) {
      ai.handleSendMessage('Document intake failed. Please try again with a PDF, image, or text file.');
      console.error('[Ledger] Document pipeline failed:', err);
    }
  }, [ai, sendMessage]);

  const openDocumentPicker = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.png,.jpg,.jpeg,.webp,.txt';

    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      await handleDocumentFile(file);
      input.value = '';
    };

    input.click();
  }, [handleDocumentFile]);

  const handleDocumentCapture = useCallback(
    async (dataUrl: string) => {
      setIsVisionAnalyzing(true);
      try {
        const apiKey = localStorage.getItem('openrouter_api_key') || process.env.REACT_APP_OPENROUTER_KEY;
        if (!apiKey) {
          ai.handleSendMessage('I need an OpenRouter API key to analyze financial documents. Please set your API key in settings.');
          setIsCaptureModalOpen(false);
          return;
        }

        const modelId = 'openai/gpt-4o';
        const result = await analyzeImageWithVision(dataUrl, 'financial_document', apiKey, modelId);
        if (!result.success) {
          ai.handleSendMessage(`Financial document analysis failed: ${result.error}`);
          setIsCaptureModalOpen(false);
          return;
        }

        setVisionReviewData(result.rawJson);
        setIsReviewModalOpen(true);
        setIsCaptureModalOpen(false);
      } finally {
        setIsVisionAnalyzing(false);
      }
    },
    [ai],
  );

  const handleDocReviewCommit = useCallback(async () => {
    if (!visionReviewData) return;
    
    const sanitized = JSON.stringify(visionReviewData);
    const prompt = [
      'Financial document analysis completed. Review the extracted data:',
      sanitized,
      'User has confirmed this data. Please execute the analyze_financial_document action now to update my profile.'
    ].join('\n\n');
    
    ai.handleSendMessage(prompt);
    setIsReviewModalOpen(false);
    setVisionReviewData(null);
  }, [visionReviewData, ai]);

  const handleStructuredDocCommit = useCallback(() => {
    if (!docProposal) return;
    const fieldLines = Object.entries(docProposal.fields)
      .filter(([, v]) => v.length > 0)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');

    const prompt = [
      'Financial document receipt parsed. Map this into budgeting, cashflow, categories, and anomalies.',
      docProposalSummary ? `Summary: ${docProposalSummary}` : null,
      fieldLines.length > 0 ? `Extracted fields:\n${fieldLines}` : null,
      docProposal.rawTextPreview.length > 0
        ? `Full extracted text (preview):\n${docProposal.rawTextPreview}${docProposal.rawTextPreview.length >= 2400 ? '\n[truncated]' : ''}`
        : 'No text could be extracted from this file.',
      'User has confirmed this data. Now emit: <action type="parse_financial_document">...(include extracted data)</action>'
    ]
      .filter(Boolean)
      .join('\n\n');

    ai.handleSendMessage(prompt);
    setIsDocReviewOpen(false);
    setDocProposal(null);
    setDocProposalSummary(null);
  }, [docProposal, docProposalSummary, ai]);

  const handleChatDocumentUploads = useCallback(async (request: DocumentUploadRequest) => {
    const llmPrimary = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        systemPrompt: 'You are a financial document triage analyst. Return only valid JSON as instructed.',
        memoryContext: [],
        summary: 'Ledger document triage.',
        history: [],
      });
      return response.publicText;
    };

    const llmFallback = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        systemPrompt: 'Return only valid JSON matching the requested schema.',
        memoryContext: [],
        summary: 'Ledger document triage fallback.',
        history: [],
      });
      return response.publicText;
    };

    try {
      const { prompt } = await prepareDocumentChatPrompt({
        moduleId: 'ledger',
        files: request.files,
        sendMessage: llmPrimary,
        sendMessageFallback: llmFallback,
        analyzeImage,
        userContext: request.caption,
      });
      await ai.handleSendMessage(prompt, undefined, { visibleContent: request.visibleContent });
    } catch (error) {
      console.error('[Ledger] Chat document analysis failed:', error);
      await ai.handleSendMessage('I could not analyze those financial documents. Please try again with PDFs, images, or text files.');
    }
  }, [ai, analyzeImage, sendMessage]);

  const persistUpdate = useCallback((nextProfile: LedgerIntakeProfile) => {
     nextProfile.updatedAt = new Date().toISOString();
     saveLedgerProfile(nextProfile, { userId: user?.uid, encryptionKey }).catch((saveError) => {
       console.error('Failed to save ledger profile:', saveError);
     });
  }, [user?.uid, encryptionKey]);

  // ─── Recurring engine — auto-posts due rules on profile load ──────────────
  const handleRecurringEngineUpdate = useCallback(
    (updated: LedgerIntakeProfile) => persistUpdate(updated),
    [persistUpdate],
  );
  const { pendingRules } = useRecurringEngine(profile, handleRecurringEngineUpdate);

  // ─── Derived data ────────────────────────────────────────────────────────

  const transactions = useMemo(() => profile?.transactions ?? [], [profile?.transactions]);
  const budgetCategories = useMemo(() => profile?.budgetCategories ?? [], [profile?.budgetCategories]);
  const financialGoals = useMemo(() => profile?.financialGoals ?? [], [profile?.financialGoals]);

  const automationSuggestions = useMemo(() => {
    if (!profile) return [];
    return evaluateAutomationRules(profile);
  }, [profile]);

  const categories = useMemo((): string[] => {
    if (!profile) return ['Groceries', 'Utilities', 'Transportation', 'Entertainment', 'Healthcare', 'Other'];
    const expenseCategories = [
      ...profile.fixedExpenses.map(e => e.label),
      ...profile.variableExpenses.map(e => e.label),
    ];
    const unique = Array.from(new Set(expenseCategories));
    const defaults = ['Groceries', 'Utilities', 'Transportation', 'Entertainment', 'Healthcare', 'Other'];
    defaults.forEach(cat => { if (!unique.includes(cat)) unique.push(cat); });
    return unique;
  }, [profile]);

  const budgetWithActuals = useMemo((): BudgetCategory[] => {
    const performances = computeBudgetActuals(
      profile?.transactions ?? [],
      profile?.budgetCategories ?? [],
    );
    const actualById = new Map<string, number>(
      performances.map((p) => [p.categoryId, p.actual]),
    );
    return budgetCategories.map((cat) => ({
      ...cat,
      spent: actualById.get(cat.id) ?? 0,
    }));
  }, [profile?.transactions, profile?.budgetCategories, budgetCategories]);

  // ─── Transaction handlers ─────────────────────────────────────────────────

  const handleAddTransaction = useCallback((transaction: Omit<Transaction, 'id'>) => {
    const matchedId = matchCategoryToTransaction(
      transaction.description,
      transaction.category,
      budgetCategories,
    );
    const newTransaction: Transaction = {
      ...transaction,
      id: crypto.randomUUID(),
      budgetCategoryId: transaction.budgetCategoryId ?? matchedId,
    };
    if (!profile) return;
    persistUpdate({ ...profile, transactions: [...transactions, newTransaction] });
  }, [profile, transactions, budgetCategories, persistUpdate]);

  const handleUpdateTransaction = useCallback((id: string, updates: Partial<Transaction>) => {
    if (!profile) return;
    persistUpdate({
      ...profile,
      transactions: transactions.map(t => t.id === id ? { ...t, ...updates } : t),
    });
  }, [profile, transactions, persistUpdate]);

  const handleDeleteTransaction = useCallback((id: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, transactions: transactions.filter(t => t.id !== id) });
  }, [profile, transactions, persistUpdate]);

  const handleImportCSV = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const lines = content.split('\n').filter(line => line.trim());
      const newTransactions: Transaction[] = [];
      lines.slice(1).forEach(line => {
        const [date, description, amount, type, category] = line.split(',').map(s => s.trim());
        if (date && description && amount) {
          newTransactions.push({
            id: crypto.randomUUID(),
            date,
            description,
            amount: parseFloat(amount),
            type: (type?.toLowerCase() as 'income' | 'expense') || 'expense',
            category: category || 'Other',
          });
        }
      });
      if (newTransactions.length > 0 && profile) {
        persistUpdate({ ...profile, transactions: [...transactions, ...newTransactions] });
      }
    };
    reader.readAsText(file);
  }, [profile, transactions, persistUpdate]);

  const handleExportCSV = useCallback(() => {
    const csvContent = [
      'Date,Description,Amount,Type,Category',
      ...transactions.map(t => `${t.date},${t.description},${t.amount},${t.type},${t.category}`),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [transactions]);

  // ─── Budget handlers ──────────────────────────────────────────────────────

  const handleUpdateBudgetCategory = useCallback((id: string, allocated: number) => {
    if (!profile) return;
    persistUpdate({
      ...profile,
      budgetCategories: budgetCategories.map(cat => cat.id === id ? { ...cat, allocated } : cat),
    });
  }, [profile, budgetCategories, persistUpdate]);

  const handleAddBudgetCategory = useCallback((name: string, allocated: number) => {
    if (!profile) return;
    const newCategory: BudgetCategory = {
      id: crypto.randomUUID(),
      name,
      allocated,
      spent: 0,
      color: pickBudgetColor(budgetCategories.length),
    };
    persistUpdate({ ...profile, budgetCategories: [...budgetCategories, newCategory] });
  }, [profile, budgetCategories, persistUpdate]);

  const handleDeleteBudgetCategory = useCallback((id: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, budgetCategories: budgetCategories.filter(cat => cat.id !== id) });
  }, [profile, budgetCategories, persistUpdate]);

  const handleApplyBudgetTemplate = useCallback((template: BudgetTemplate) => {
    if (!profile) return;
    const newCategories: BudgetCategory[] = Object.entries(template.allocations).map(([name, percentage], idx) => ({
      id: crypto.randomUUID(),
      name,
      allocated: (profile.monthlyIncome * percentage) / 100,
      spent: 0,
      color: pickBudgetColor(idx),
    }));
    persistUpdate({ ...profile, budgetCategories: newCategories });
  }, [profile, persistUpdate]);

  // ─── Goal handlers ────────────────────────────────────────────────────────

  const handleAddGoal = useCallback((goal: Omit<FinancialGoal, 'id' | 'createdAt'>) => {
    if (!profile) return;
    const newGoal: FinancialGoal = {
      ...goal,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    persistUpdate({ ...profile, financialGoals: [...financialGoals, newGoal] });
  }, [profile, financialGoals, persistUpdate]);

  const handleUpdateGoal = useCallback((id: string, updates: Partial<FinancialGoal>) => {
    if (!profile) return;
    persistUpdate({
      ...profile,
      financialGoals: financialGoals.map(g => g.id === id ? { ...g, ...updates } : g),
    });
  }, [profile, financialGoals, persistUpdate]);

  const handleDeleteGoal = useCallback((id: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, financialGoals: financialGoals.filter(g => g.id !== id) });
  }, [profile, financialGoals, persistUpdate]);

  // ─── Debt item handlers ──────────────────────────────────────────────────

  const handleAddDebt = useCallback((debt: Omit<DebtItem, 'id'>) => {
    if (!profile) return;
    const newDebt: DebtItem = { ...debt, id: crypto.randomUUID() };
    persistUpdate({ ...profile, debtItems: [...(profile.debtItems ?? []), newDebt] });
  }, [profile, persistUpdate]);

  const handleUpdateDebt = useCallback((id: string, updates: Partial<DebtItem>) => {
    if (!profile) return;
    persistUpdate({
      ...profile,
      debtItems: (profile.debtItems ?? []).map(d => d.id === id ? { ...d, ...updates } : d),
    });
  }, [profile, persistUpdate]);

  const handleDeleteDebt = useCallback((id: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, debtItems: (profile.debtItems ?? []).filter(d => d.id !== id) });
  }, [profile, persistUpdate]);

  // ─── Account handlers ────────────────────────────────────────────────────

  const handleAddAccount = useCallback((accountData: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'isDefault'>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const accounts = profile.accounts ?? [];
    const newAccount: Account = {
      ...accountData,
      id: crypto.randomUUID(),
      isDefault: accounts.length === 0,
      createdAt: now,
      updatedAt: now,
    };
    persistUpdate({ ...profile, accounts: [...accounts, newAccount], updatedAt: now });
  }, [profile, persistUpdate]);

  const handleUpdateAccount = useCallback((id: string, updates: Partial<Account>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const accounts = (profile.accounts ?? []).map(a =>
      a.id === id ? { ...a, ...updates, updatedAt: now } : a
    );
    persistUpdate({ ...profile, accounts, updatedAt: now });
  }, [profile, persistUpdate]);

  const handleDeleteAccount = useCallback((id: string) => {
    if (!profile) return;
    const accounts = (profile.accounts ?? []).filter(a => a.id !== id);
    const transactions = (profile.transactions ?? []).map(t =>
      t.accountId === id ? { ...t, accountId: undefined } : t
    );
    persistUpdate({ ...profile, accounts, transactions, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleTransfer = useCallback((transfer: Omit<AccountTransfer, 'id'>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const newTransfer: AccountTransfer = { ...transfer, id: crypto.randomUUID() };
    const accounts = (profile.accounts ?? []).map(a => {
      if (a.id === transfer.fromAccountId) return { ...a, balance: a.balance - transfer.amount, updatedAt: now };
      if (a.id === transfer.toAccountId) return { ...a, balance: a.balance + transfer.amount, updatedAt: now };
      return a;
    });
    persistUpdate({ ...profile, accounts, transferHistory: [...(profile.transferHistory ?? []), newTransfer], updatedAt: now });
  }, [profile, persistUpdate]);

  // ─── Net Worth handlers ──────────────────────────────────────────────────

  const handleRecordNetWorthSnapshot = useCallback((note?: string) => {
    if (!profile) return;
    const snapshot = buildNetWorthSnapshot(profile.accounts ?? [], profile.debtItems ?? [], note);
    persistUpdate({ ...profile, netWorthHistory: [...(profile.netWorthHistory ?? []), snapshot], updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  // ─── Recurring rule handlers ─────────────────────────────────────────────

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
    const { postSingleRule } = require('./services/recurring-engine');
    const rule = (profile.recurringRules ?? []).find(r => r.id === ruleId);
    if (!rule) return;
    const { updatedProfile } = postSingleRule(rule, profile);
    persistUpdate(updatedProfile);
  }, [profile, persistUpdate]);

  const handleSkipRecurring = useCallback((ruleId: string) => {
    if (!profile) return;
    const { skipNextOccurrence } = require('./services/recurring-engine');
    const rule = (profile.recurringRules ?? []).find(r => r.id === ruleId);
    if (!rule) return;
    persistUpdate(skipNextOccurrence(rule, profile));
  }, [profile, persistUpdate]);

  // ─── Cash flow forecast handler ──────────────────────────────────────────

  const handleGenerateForecast = useCallback((horizon: 30 | 60 | 90) => {
    if (!profile) return;
    const startingBalance = computeNetLiquidAssets(profile.accounts ?? []);
    const forecast = computeCashFlowForecast(profile.recurringRules ?? [], startingBalance, horizon);
    persistUpdate({ ...profile, lastCashFlowForecast: forecast, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  // ─── Plaid connection handlers ───────────────────────────────────────────

  const handleConnectionAdded = useCallback((connection: PlaidConnection, newAccounts: Account[]) => {
    if (!profile) return;
    const now = new Date().toISOString();
    persistUpdate({
      ...profile,
      accounts: [...(profile.accounts ?? []), ...newAccounts],
      plaidConnections: [...(profile.plaidConnections ?? []), connection],
      updatedAt: now,
    });
  }, [profile, persistUpdate]);

  const handleConnectionRemoved = useCallback((connectionId: string) => {
    if (!profile) return;
    const connection = (profile.plaidConnections ?? []).find(c => c.id === connectionId);
    const linkedIds = connection?.linkedAccountIds ?? [];
    persistUpdate({
      ...profile,
      plaidConnections: (profile.plaidConnections ?? []).filter(c => c.id !== connectionId),
      accounts: (profile.accounts ?? []).filter(a => !linkedIds.includes(a.id)),
      updatedAt: new Date().toISOString(),
    });
  }, [profile, persistUpdate]);

  const handleTransactionsSynced = useCallback((newTransactions: Transaction[]) => {
    if (!profile) return;
    const existing = new Set((profile.transactions ?? []).map(t => t.id));
    const deduped = newTransactions.filter(t => !existing.has(t.id));
    persistUpdate({ ...profile, transactions: [...(profile.transactions ?? []), ...deduped], updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleSyncStatusUpdate = useCallback((connectionId: string, status: PlaidConnection['status'], cursor?: string) => {
    if (!profile) return;
    const connections = (profile.plaidConnections ?? []).map(c =>
      c.id === connectionId ? { ...c, status, ...(cursor ? { cursor } : {}), lastSyncAt: new Date().toISOString() } : c
    );
    persistUpdate({ ...profile, plaidConnections: connections, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  // ─── Subscription handlers ────────────────────────────────────────────────

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

  // ─── Investment handlers ──────────────────────────────────────────────────

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

  // ─── Alert handlers ───────────────────────────────────────────────────────

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

  // ─── Tax handlers ─────────────────────────────────────────────────────────

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

  // ─── Export handlers ──────────────────────────────────────────────────────

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

  // ─── Currency handlers ────────────────────────────────────────────────────

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

  // ─── Credit Score handlers ────────────────────────────────────────────────

  const handleAddCreditScoreEntry = useCallback((data: { score: number; bureau: CreditBureau; recordedAt?: string; notes?: string }) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const entry: CreditScoreEntry = {
      id: crypto.randomUUID(),
      score: Math.max(300, Math.min(850, data.score)),
      bureau: data.bureau,
      recordedAt: data.recordedAt ?? now,
      notes: data.notes,
    };
    const factors = inferCreditFactors(entry.score);
    persistUpdate({ ...profile, creditScoreHistory: [...(profile.creditScoreHistory ?? []), entry], creditFactors: factors, updatedAt: now });
  }, [profile, persistUpdate]);

  const handleDeleteCreditScoreEntry = useCallback((entryId: string) => {
    if (!profile) return;
    const history = (profile.creditScoreHistory ?? []).filter(e => e.id !== entryId);
    const latestScore = history.length > 0 ? history[history.length - 1].score : 0;
    persistUpdate({ ...profile, creditScoreHistory: history, creditFactors: history.length > 0 ? inferCreditFactors(latestScore) : [], updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  // ─── Insurance handlers ───────────────────────────────────────────────────

  const handleCreateInsurancePolicy = useCallback((data: Partial<InsurancePolicy>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const billingCycle = (data.billingCycle ?? 'monthly') as InsuranceBillingCycle;
    const premium = data.premium ?? 0;
    const policy: InsurancePolicy = {
      id: crypto.randomUUID(),
      name: data.name ?? 'Policy',
      type: (data.type ?? 'other') as InsurancePolicyType,
      provider: data.provider ?? '',
      premium,
      billingCycle,
      monthlyPremium: toMonthlyPremium(premium, billingCycle),
      coverageAmount: data.coverageAmount,
      deductible: data.deductible,
      policyNumber: data.policyNumber,
      nextRenewalDate: data.nextRenewalDate ?? now.split('T')[0],
      startDate: data.startDate ?? now.split('T')[0],
      isActive: data.isActive !== false,
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    };
    persistUpdate({ ...profile, insurancePolicies: [...(profile.insurancePolicies ?? []), policy], updatedAt: now });
  }, [profile, persistUpdate]);

  const handleUpdateInsurancePolicy = useCallback((policyId: string, data: Partial<InsurancePolicy>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const policies = (profile.insurancePolicies ?? []).map(p => {
      if (p.id !== policyId) return p;
      const premium = data.premium ?? p.premium;
      const billingCycle = data.billingCycle ?? p.billingCycle;
      return { ...p, ...data, premium, billingCycle, monthlyPremium: toMonthlyPremium(premium, billingCycle), updatedAt: now };
    });
    persistUpdate({ ...profile, insurancePolicies: policies, updatedAt: now });
  }, [profile, persistUpdate]);

  const handleDeleteInsurancePolicy = useCallback((policyId: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, insurancePolicies: (profile.insurancePolicies ?? []).filter(p => p.id !== policyId), updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  // ─── Retirement handlers ──────────────────────────────────────────────────

  const handleCreateRetirementPlan = useCallback((data: Partial<RetirementPlan>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const plan: RetirementPlan = {
      id: crypto.randomUUID(),
      name: data.name ?? 'My Retirement Plan',
      currentAge: data.currentAge ?? 30,
      targetRetirementAge: data.targetRetirementAge ?? 65,
      currentSavings: data.currentSavings ?? 0,
      monthlyContribution: data.monthlyContribution ?? 500,
      expectedAnnualReturnPct: data.expectedAnnualReturnPct ?? 7,
      inflationRatePct: data.inflationRatePct ?? 3,
      targetMonthlyIncome: data.targetMonthlyIncome ?? 5000,
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    };
    const projection = projectRetirement(plan);
    persistUpdate({ ...profile, retirementPlans: [...(profile.retirementPlans ?? []), plan], lastRetirementProjection: projection, updatedAt: now });
  }, [profile, persistUpdate]);

  const handleUpdateRetirementPlan = useCallback((planId: string, data: Partial<RetirementPlan>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const plans = (profile.retirementPlans ?? []).map(p => p.id === planId ? { ...p, ...data, updatedAt: now } : p);
    const updatedPlan = plans.find(p => p.id === planId);
    const projection = updatedPlan ? projectRetirement(updatedPlan) : profile.lastRetirementProjection;
    persistUpdate({ ...profile, retirementPlans: plans, lastRetirementProjection: projection, updatedAt: now });
  }, [profile, persistUpdate]);

  const handleDeleteRetirementPlan = useCallback((planId: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, retirementPlans: (profile.retirementPlans ?? []).filter(p => p.id !== planId), updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleProjectRetirement = useCallback((planId?: string) => {
    if (!profile) return;
    const plans = profile.retirementPlans ?? [];
    const plan = planId ? plans.find(p => p.id === planId) : plans[0];
    if (!plan) return;
    const projection = projectRetirement(plan);
    persistUpdate({ ...profile, lastRetirementProjection: projection, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  // ─── Automation handlers ──────────────────────────────────────────────────

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
    const defaults = getDefaultAutomationRules();
    const existing = profile.automationRules ?? [];
    persistUpdate({ ...profile, automationRules: [...existing, ...defaults], updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  // ─── Receipt handlers ─────────────────────────────────────────────────────

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

  // ─── Extension values state for FieldsTab ───────────────────────────────

  const [extensionValues, setExtensionValues] = useState<Record<string, unknown>>(
    () => profile?.extensionValues ?? {}
  );

  const [extraDebtPayment, setExtraDebtPayment] = useState(0);

  const extensionValuesSynced = useRef(false);
  useEffect(() => {
    if (!extensionValuesSynced.current && profile?.extensionValues) {
      setExtensionValues(profile.extensionValues);
      extensionValuesSynced.current = true;
    }
  }, [profile?.extensionValues]);

  const handleExtensionValueChange = useCallback((fieldId: string, value: unknown) => {
    setExtensionValues(prev => {
      const next = { ...prev, [fieldId]: value };
      if (profile) {
        persistUpdate({ ...profile, extensionValues: next });
      }
      return next;
    });
  }, [profile, persistUpdate]);

  const handleAddField = useCallback(() => {
    const newField: FieldDefinition = {
      id: crypto.randomUUID(),
      name: 'Custom Field',
      type: FieldType.TEXT,
      required: false,
    };
    SchemaRegistry.extendSchema('ledger', [newField]).catch(err =>
      console.error('[LedgerPage] Failed to add custom field:', err)
    );
  }, []);

  const handleDeleteField = useCallback((fieldId: string) => {
    SchemaRegistry.removeExtension('ledger', fieldId).catch(err =>
      console.error('[LedgerPage] Failed to delete custom field:', err)
    );
    setExtensionValues(prev => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }, []);

  const handleProfileUpdate = useCallback((updates: Partial<LedgerIntakeProfile>) => {
    if (!profile) return;
    persistUpdate({ ...profile, ...updates });
  }, [profile, persistUpdate]);

  useEffect(() => {
    if (!profile || !profile.onboardingComplete || plannerBootstrappedRef.current) return;
    if (profile.activePlanId) return;

    const starterPlan = createStarterPlan(profile);
    const nextProfile: LedgerIntakeProfile = {
      ...profile,
      plans: [starterPlan, ...profile.plans.filter((plan) => plan.id !== starterPlan.id)].slice(0, 50),
      activePlanId: starterPlan.id,
      plannerBotState: 'active',
      lastPlanGeneratedAt: new Date().toISOString(),
      summary: profile.summary || 'Starter plan auto-generated from current baseline.'
    };

    plannerBootstrappedRef.current = true;
    persistUpdate(nextProfile);
  }, [profile, persistUpdate]);

  useEffect(() => {
    if (!user || isGuest || !profile || !profile.onboardingComplete) return;

    const metrics = computeResonanceROI(profile);
    const current = globalSoul?.crossFunctionalState?.resource;
    const hasChange =
      metrics.resonanceROI !== current?.resonanceROI ||
      metrics.financialFriction !== current?.financialFriction;

    if (!hasChange) return;

    GlobalProjectionService.updateCrossFunctionalState(user.uid, {
      resource: {
        resonanceROI: metrics.resonanceROI,
        financialFriction: metrics.financialFriction
      }
    }).catch((err) => console.error('Failed to update resonance ROI:', err));
  }, [user, isGuest, profile, globalSoul?.crossFunctionalState?.resource]);

  useEffect(() => {
    const unsubs = (LEDGER_TOAST_EVENTS as any[]).map((evtType) =>
      Spine.on(evtType, (evt: SpineEvent) => {
        setRecentEvents((prev) => [evt, ...prev].slice(0, 10));
      })
    );
    return () => unsubs.forEach((fn) => fn());
  }, []);

  useEffect(() => {
    if (profile?.onboardingComplete && ai.messages.length === 0 && !ai.isProcessing && !ai.streamingText) {
      const greeting = !profile.activePlanId 
        ? `No active plan was found. I created a starter financial plan and activated planner mode. Tell me what constraint to optimize first: debt reduction, savings speed, or monthly cashflow.`
        : `Resource link active. I am ${agentAlias}. I optimize your budget, spending strategy, and plan execution. What should we optimize first this week?`;
      
      ai.setMessages([{ role: 'assistant', content: greeting }]);
    }
  }, [profile?.onboardingComplete, profile?.activePlanId, agentAlias, ai.messages.length, ai.isProcessing, ai.streamingText, ai.setMessages]);

  return (
    <LedgerActionsProvider value={{ 
      onAddTransaction: handleAddTransaction, 
      onUpdateTransaction: handleUpdateTransaction, 
      onDeleteTransaction: handleDeleteTransaction, 
      onImportCSV: handleImportCSV, 
      onExportCSV: handleExportCSV, 
      onUpdateCategory: handleUpdateBudgetCategory, 
      onAddCategory: handleAddBudgetCategory, 
      onDeleteCategory: handleDeleteBudgetCategory, 
      onApplyTemplate: handleApplyBudgetTemplate, 
      onAddGoal: handleAddGoal, 
      onUpdateGoal: handleUpdateGoal, 
      onDeleteGoal: handleDeleteGoal, 
      onAddDebt: handleAddDebt, 
      onUpdateDebt: handleUpdateDebt, 
      onDeleteDebt: handleDeleteDebt, 
      onValueChange: handleExtensionValueChange, 
      onAddField: handleAddField, 
      onDeleteField: handleDeleteField, 
      onAskAI: ai.handleSendMessage 
    }}>
      <SingleAgentLayout
        moduleId="ledger"
        agentName={agentAlias}
        themeColor="cyan"
        ai={ai}
        authMode="ledger"
        placeholder="Ask for budgeting or savings optimization..."
        onUploadDocuments={handleChatDocumentUploads}
        primaryAction={
          activeTab === 'transactions' && (
            <NeuralButton
              onClick={() => setIsAddTransactionModalOpen(true)}
              aria-label="Add transaction"
              className="z-[var(--z-fab)] rounded-full w-12 h-12 shadow-lg shadow-cyan-500/25 p-0"
              themeColor="cyan"
            >
              <Plus className="w-5 h-5" />
            </NeuralButton>
          )
        }
      >
        <NeuralModal
          isOpen={isCaptureModalOpen}
          onClose={() => setIsCaptureModalOpen(false)}
          title="Extract Financial Data"
          themeColor="cyan"
          maxWidth="lg"
        >
          <div className="p-2">
            <UniversalUploadZone
              onFileSelected={handleDocumentFile}
              onCameraCapture={handleDocumentCapture}
              phase={isVisionAnalyzing ? 'processing' : 'idle'}
              themeColor="cyan"
              label="Statement or Receipt"
              description="Upload for structured extraction"
            />
          </div>
        </NeuralModal>

        <NeuralModal
          isOpen={isReviewModalOpen}
          onClose={() => {
            setIsReviewModalOpen(false);
            setVisionReviewData(null);
          }}
          title="Confirm Financial Data"
          themeColor="cyan"
          maxWidth="2xl"
        >
          <div className="space-y-6">
            {visionReviewData && (
              <div className="space-y-4">
                {typeof visionReviewData.monthlyIncome === 'number' && (
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Monthly Income</h3>
                    <p className="text-lg font-mono text-cyan-300">${visionReviewData.monthlyIncome.toLocaleString()}</p>
                  </div>
                )}
                <p className="text-xs text-white/50 italic">Extracted document data is ready for profile commitment.</p>
              </div>
            )}
            <div className="flex gap-3 pt-4 border-t border-white/10">
              <NeuralButton onClick={handleDocReviewCommit} themeColor="cyan" className="flex-1 font-bold text-xs">Commit</NeuralButton>
              <NeuralButton onClick={() => setIsReviewModalOpen(false)} variant="secondary" className="flex-1 font-bold text-xs">Discard</NeuralButton>
            </div>
          </div>
        </NeuralModal>

        <NeuralModal
          isOpen={isDocReviewOpen}
          onClose={() => {
            setIsDocReviewOpen(false);
            setDocProposal(null);
            setDocProposalSummary(null);
          }}
          title="Review Document Analysis"
          themeColor="cyan"
          maxWidth="2xl"
        >
          <div className="space-y-6">
            {docProposal && (
              <div className="space-y-4">
                <p className="text-sm text-white/70">{docProposalSummary ?? 'Document analysis ready for review.'}</p>
                <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">Extracted Fields</h4>
                  {Object.entries(docProposal.fields).filter(([, v]) => v.length > 0).length === 0 ? (
                    <p className="text-xs text-white/40 italic">No structured fields detected.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-white/70">
                      {Object.entries(docProposal.fields)
                        .filter(([, v]) => v.length > 0)
                        .map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-3">
                            <span className="text-white/50">{k}</span>
                            <span className="font-mono text-cyan-300">{v}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                <div className="bg-black/30 border border-white/10 rounded-xl p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">Text Preview</h4>
                  <pre className="text-[11px] text-white/50 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {docProposal.rawTextPreview}
                    {docProposal.rawTextPreview.length >= 2400 ? '\n[truncated]' : ''}
                  </pre>
                </div>
              </div>
            )}
            <div className="flex gap-3 pt-4 border-t border-white/10">
              <NeuralButton onClick={handleStructuredDocCommit} themeColor="cyan" className="flex-1 font-bold text-xs">Apply</NeuralButton>
              <NeuralButton onClick={() => setIsDocReviewOpen(false)} variant="secondary" className="flex-1 font-bold text-xs">Discard</NeuralButton>
            </div>
          </div>
        </NeuralModal>

        <NeuralModal
          isOpen={isFieldsModalOpen}
          onClose={() => setIsFieldsModalOpen(false)}
          title="Custom Financial Fields"
          themeColor="cyan"
          maxWidth="2xl"
        >
          <div className="p-4 md:p-8 overflow-y-auto max-h-[80vh]">
            {profile && (
              <FieldsTab
                currency={profile.currency}
                extensionValues={extensionValues}
              />
            )}
          </div>
        </NeuralModal>

        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 md:px-8 pt-4 md:pt-8 pb-2 md:pb-4">
            <SectionHeader
              label="Resource Control"
              title="Financial Command Center"
              subtitle="AI-powered tracking and optimization across spend, savings, and plan execution."
              accentClassName="text-cyan-400"
            />
          </div>

          <div className="flex items-center justify-between border-b border-white/10 px-4 md:px-8 pb-2">
            <div className="min-w-0 flex-1">
              <NeuralTabGroup
                tabs={LEDGER_TABS}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                themeColor="cyan"
              />
            </div>

            <div className="flex gap-2 pb-1 shrink-0 items-center">
              {profile && (
                <AlertsCenter
                  profile={profile}
                  alertRules={profile.alertRules ?? []}
                  onDismissNotification={handleDismissNotification}
                  onToggleRule={handleToggleAlertRule}
                  onCreateRule={handleCreateAlertRule}
                  onDeleteRule={handleDeleteAlertRule}
                />
              )}
              <ModuleReminderEntry
                title="Ledger"
                themeColor="cyan"
                panel={<LedgerNotificationSettingsPanel />}
                compact
              />
              <NeuralButton 
                onClick={() => setIsFieldsModalOpen(true)} 
                variant="secondary" 
                className="p-1.5 md:p-2 h-auto rounded-xl text-white/50 hover:text-white"
              >
                <Settings size={14} className="md:w-4 md:h-4" />
              </NeuralButton>
              <NeuralButton
                onClick={() => setIsCurrencySettingsOpen(true)}
                variant="secondary"
                className="p-1.5 md:p-2 h-auto rounded-xl text-cyan-400/70 hover:text-cyan-300 bg-cyan-500/5 border-cyan-500/20"
                title="Currency settings"
              >
                <Globe size={14} className="md:w-4 md:h-4" />
              </NeuralButton>
              <NeuralButton onClick={() => setIsCaptureModalOpen(true)} variant="secondary" className="p-1.5 md:p-2 bg-violet-500/10 border-violet-500/20 text-violet-400 h-auto rounded-xl"><Camera size={14} className="md:w-4 md:h-4" /></NeuralButton>
              <NeuralButton onClick={openDocumentPicker} variant="secondary" className="p-1.5 md:p-2 bg-cyan-500/10 border-cyan-500/20 text-cyan-400 h-auto rounded-xl"><FileUp size={14} className="md:w-4 md:h-4" /></NeuralButton>
              <NeuralButton onClick={handleOpenDocuments} variant="secondary" className="p-1.5 md:p-2 h-auto rounded-xl"><FolderOpen size={14} className="md:w-4 md:h-4" /></NeuralButton>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar pt-4 md:pt-6 pb-20">
            {!isLocked ? (
              <>
                {activeTab === 'overview' && profile && (
                  <DashboardTab
                    profile={profile}
                    categories={categories}
                    isLocked={isLocked}
                    coherenceReport={coherenceReport}
                    recentEvents={recentEvents}
                    globalSoul={globalSoul}
                    onAnalyzeDocument={openDocumentPicker}
                    onToggleDocumentAnalysis={async (enabled) => {
                      if (!profile) return;
                      persistUpdate({ ...profile, documentAnalysisEnabled: enabled });
                    }}
                  />
                )}

                {activeTab === 'overview' && profile && (
                  <div className="px-4 md:px-8 mt-6 space-y-6">
                    <NetWorthDashboard
                      accounts={profile.accounts ?? []}
                      debtItems={profile.debtItems ?? []}
                      netWorthHistory={profile.netWorthHistory ?? []}
                      currency={profile.currency}
                      onRecordSnapshot={handleRecordNetWorthSnapshot}
                    />
                    <CashFlowForecast
                      forecast={profile.lastCashFlowForecast ?? null}
                      recurringRules={profile.recurringRules ?? []}
                      startingBalance={computeNetLiquidAssets(profile.accounts ?? [])}
                      currency={profile.currency}
                      onRegenerateForecast={handleGenerateForecast}
                    />

                    {/* ── P3 Summary Row ─────────────────────────────────── */}
                    {(automationSuggestions.length > 0 || (profile.creditScoreHistory ?? []).length > 0 || (profile.insurancePolicies ?? []).length > 0 || profile.lastRetirementProjection) && (
                      <div className="space-y-4">
                        {/* Automation suggestion banner — top pending suggestion */}
                        {automationSuggestions.length > 0 && (
                          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                            <span className="mt-0.5 text-amber-400 text-lg">💡</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-amber-300">{automationSuggestions[0].ruleName}</p>
                              <p className="text-xs text-amber-200/70 mt-0.5">{automationSuggestions[0].message}</p>
                            </div>
                            <button
                              onClick={() => handleDismissSuggestion(automationSuggestions[0].ruleId)}
                              className="text-amber-400/60 hover:text-amber-300 text-xs px-2 py-1 rounded shrink-0"
                            >
                              Dismiss
                            </button>
                          </div>
                        )}

                        {/* P3 stat cards row */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {/* Credit Score */}
                          {(profile.creditScoreHistory ?? []).length > 0 && (() => {
                            const sorted = [...(profile.creditScoreHistory ?? [])].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
                            const latest = sorted[0];
                            const tier = latest.score >= 800 ? 'Exceptional' : latest.score >= 740 ? 'Very Good' : latest.score >= 670 ? 'Good' : latest.score >= 580 ? 'Fair' : 'Poor';
                            const color = latest.score >= 740 ? '#10b981' : latest.score >= 670 ? '#3b82f6' : latest.score >= 580 ? '#f59e0b' : '#ef4444';
                            return (
                              <button onClick={() => setActiveTab('credit')} className="text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 transition-colors p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-lg">🛡️</span>
                                  <span className="text-xs text-white/50 font-medium uppercase tracking-wide">Credit Score</span>
                                </div>
                                <div className="text-2xl font-bold" style={{ color }}>{latest.score}</div>
                                <div className="text-xs text-white/50 mt-0.5">{tier} · {latest.bureau}</div>
                              </button>
                            );
                          })()}

                          {/* Insurance */}
                          {(profile.insurancePolicies ?? []).filter(p => p.isActive).length > 0 && (() => {
                            const active = (profile.insurancePolicies ?? []).filter(p => p.isActive);
                            const totalMonthly = active.reduce((s, p) => s + p.monthlyPremium, 0);
                            const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: profile.currency, maximumFractionDigits: 0 }).format(n);
                            const soonRenewing = active.filter(p => {
                              const days = (new Date(p.nextRenewalDate).getTime() - Date.now()) / 86_400_000;
                              return days >= 0 && days <= 30;
                            }).length;
                            return (
                              <button onClick={() => setActiveTab('insurance')} className="text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 transition-colors p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-lg">🔒</span>
                                  <span className="text-xs text-white/50 font-medium uppercase tracking-wide">Insurance</span>
                                </div>
                                <div className="text-2xl font-bold text-emerald-400">{fmt(totalMonthly)}<span className="text-sm font-normal text-white/40">/mo</span></div>
                                <div className="text-xs text-white/50 mt-0.5">{active.length} policies{soonRenewing > 0 ? ` · ⚠ ${soonRenewing} renewing soon` : ''}</div>
                              </button>
                            );
                          })()}

                          {/* Retirement */}
                          {profile.lastRetirementProjection && (() => {
                            const proj = profile.lastRetirementProjection!;
                            const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: profile.currency, notation: 'compact', maximumFractionDigits: 1 }).format(n);
                            return (
                              <button onClick={() => setActiveTab('retirement')} className="text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 transition-colors p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-lg">🏖️</span>
                                  <span className="text-xs text-white/50 font-medium uppercase tracking-wide">Retirement</span>
                                </div>
                                <div className={`text-2xl font-bold ${proj.onTrack ? 'text-emerald-400' : 'text-amber-400'}`}>{fmt(proj.projectedNestEgg)}</div>
                                <div className="text-xs text-white/50 mt-0.5">{proj.onTrack ? '✅ On track' : '⚠ Behind'} · {proj.yearsToRetirement}y left</div>
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    <ExportPanel
                      profile={profile}
                      onExportTransactionsCsv={handleExportTransactionsCsv}
                      onExportTaxSummary={handleExportTaxSummary}
                      onExportNetWorthReport={handleExportNetWorthReport}
                    />
                  </div>
                )}

                {activeTab === 'accounts' && profile && (
                  <AccountsTab
                    accounts={profile.accounts ?? []}
                    transferHistory={profile.transferHistory ?? []}
                    plaidConnections={profile.plaidConnections ?? []}
                    currency={profile.currency}
                    disabled={isLocked}
                    onAddAccount={handleAddAccount}
                    onUpdateAccount={handleUpdateAccount}
                    onDeleteAccount={handleDeleteAccount}
                    onTransfer={handleTransfer}
                    onConnectionAdded={handleConnectionAdded}
                    onConnectionRemoved={handleConnectionRemoved}
                    onTransactionsSynced={handleTransactionsSynced}
                    onSyncStatusUpdate={handleSyncStatusUpdate}
                  />
                )}

                {activeTab === 'recurring' && profile && (
                  <RecurringTab
                    rules={profile.recurringRules ?? []}
                    accounts={profile.accounts ?? []}
                    currency={profile.currency}
                    disabled={isLocked}
                    onAddRule={handleAddRecurringRule}
                    onUpdateRule={handleUpdateRecurringRule}
                    onDeleteRule={handleDeleteRecurringRule}
                    onPostNow={handlePostRecurringNow}
                    onSkipNext={handleSkipRecurring}
                  />
                )}

                {activeTab === 'transactions' && profile && (
                  <TransactionsTab
                    transactions={transactions}
                    categories={categories}
                    currency={profile.currency}
                    isAddTransactionModalOpen={isAddTransactionModalOpen}
                    setIsAddTransactionModalOpen={setIsAddTransactionModalOpen}
                  />
                )}

                {activeTab === 'budget' && profile && (
                  <BudgetTab
                    budgetWithActuals={budgetWithActuals}
                    monthlyIncome={profile.monthlyIncome}
                    currency={profile.currency}
                  />
                )}

                {activeTab === 'goals' && profile && (
                  <GoalsTab
                    financialGoals={financialGoals}
                    currency={profile.currency}
                    monthlyIncome={profile.monthlyIncome}
                    totalMonthlyExpenses={profile.fixedExpenses.reduce((s, i) => s + i.amount, 0) + profile.variableExpenses.reduce((s, i) => s + i.amount, 0)}
                    debtItems={profile.debtItems ?? []}
                    extraDebtPayment={extraDebtPayment}
                    setExtraDebtPayment={setExtraDebtPayment}
                    recommendSnowball={Number(globalSoul?.crossFunctionalState?.resource?.financialFriction ?? 0) > 7}
                  />
                )}

                {activeTab === 'tax' && profile && (
                  <TaxTab
                    profile={profile}
                    onUpdateProfile={handleProfileUpdate}
                  />
                )}

                {activeTab === 'tax' && profile && (
                  <div className="px-4 md:px-8 mt-6">
                    <TaxCenter
                      profile={profile}
                      currency={profile.currency}
                      onSetTaxCategory={handleSetTaxCategory}
                      onAddDeduction={handleAddTaxDeduction}
                      onDeleteDeduction={handleDeleteTaxDeduction}
                      onGenerateSummary={handleGenerateTaxSummary}
                      onExportTaxSummary={handleExportTaxSummary}
                    />
                  </div>
                )}

                {activeTab === 'subscriptions' && profile && (
                  <div className="px-4 md:px-8 py-6">
                    <SubscriptionManager
                      subscriptions={profile.subscriptions ?? []}
                      currency={profile.currency}
                      onCreateSubscription={handleCreateSubscription}
                      onUpdateSubscription={handleUpdateSubscription}
                      onDeleteSubscription={handleDeleteSubscription}
                      onCancelSubscription={handleCancelSubscription}
                    />
                  </div>
                )}

                {activeTab === 'investments' && profile && (
                  <div className="px-4 md:px-8 py-6">
                    <InvestmentPortfolio
                      investments={profile.investments ?? []}
                      portfolioHistory={profile.portfolioHistory ?? []}
                      currency={profile.currency}
                      onAddInvestment={handleAddInvestment}
                      onUpdateInvestment={handleUpdateInvestment}
                      onDeleteInvestment={handleDeleteInvestment}
                      onRecordSnapshot={handleRecordPortfolioSnapshot}
                      onAddDividend={handleAddDividend}
                    />
                  </div>
                )}

                {activeTab === 'calendar' && profile && (
                  <div className="px-4 md:px-8 py-6">
                    <FinancialCalendar
                      profile={profile}
                      currency={profile.currency}
                    />
                  </div>
                )}

                {activeTab === 'credit' && profile && (
                  <div className="px-4 md:px-8 py-6">
                    <CreditScoreTracker
                      creditScoreHistory={profile.creditScoreHistory ?? []}
                      creditFactors={profile.creditFactors ?? []}
                      onAddEntry={handleAddCreditScoreEntry}
                      onDeleteEntry={handleDeleteCreditScoreEntry}
                    />
                  </div>
                )}

                {activeTab === 'insurance' && profile && (
                  <div className="px-4 md:px-8 py-6">
                    <InsuranceManager
                      policies={profile.insurancePolicies ?? []}
                      currency={profile.currency}
                      onCreatePolicy={handleCreateInsurancePolicy}
                      onUpdatePolicy={handleUpdateInsurancePolicy}
                      onDeletePolicy={handleDeleteInsurancePolicy}
                    />
                  </div>
                )}

                {activeTab === 'retirement' && profile && (
                  <div className="px-4 md:px-8 py-6">
                    <RetirementPlanner
                      retirementPlans={profile.retirementPlans ?? []}
                      lastRetirementProjection={profile.lastRetirementProjection}
                      currency={profile.currency}
                      onCreatePlan={handleCreateRetirementPlan}
                      onUpdatePlan={handleUpdateRetirementPlan}
                      onDeletePlan={handleDeleteRetirementPlan}
                      onProjectRetirement={handleProjectRetirement}
                    />
                  </div>
                )}

                {activeTab === 'automation' && profile && (
                  <div className="px-4 md:px-8 py-6">
                    <AutomationRules
                      profile={profile}
                      onCreateRule={handleCreateAutomationRule}
                      onUpdateRule={handleUpdateAutomationRule}
                      onDeleteRule={handleDeleteAutomationRule}
                      onToggleRule={handleToggleAutomationRule}
                      onDismissSuggestion={handleDismissSuggestion}
                      onAddDefaultRules={handleAddDefaultAutomationRules}
                    />
                  </div>
                )}

                {activeTab === 'receipts' && profile && (
                  <div className="px-4 md:px-8 py-6">
                    <ReceiptLibrary
                      receipts={profile.receipts ?? []}
                      transactions={profile.transactions ?? []}
                      currency={profile.currency}
                      onAddReceipt={handleAddReceipt}
                      onDeleteReceipt={handleDeleteReceipt}
                      onLinkToTransaction={handleLinkReceiptToTransaction}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="px-4 md:px-8 py-12">
                <VaultLockedShell 
                  moduleName="Ledger" 
                  moduleDescription="Financial planning and stability tracking are protected by your secure vault."
                />
              </div>
            )}
          </div>
        </div>
      </SingleAgentLayout>

      {/* ── Currency Settings Modal ── */}
      {profile && (
        <CurrencySettings
          isOpen={isCurrencySettingsOpen}
          onClose={() => setIsCurrencySettingsOpen(false)}
          baseCurrency={profile.currency}
          storedRates={profile.currencyRates ?? []}
          onUpdateBaseCurrency={handleUpdateBaseCurrency}
          onUpsertRate={handleUpsertCurrencyRate}
          onDeleteRate={handleDeleteCurrencyRate}
        />
      )}
    </LedgerActionsProvider>
  );
}
