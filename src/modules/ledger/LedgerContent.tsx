import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useGlobalSoulStore } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useAI } from '@/cortex-bridge/ai-context';
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
import {
  FinancialPlan,
  LedgerIntakeProfile,
  Transaction,
  BudgetCategory,
  FinancialGoal,
  saveLedgerProfile,
} from './services/ledger-intake-service';
import { computeBudgetActuals, matchCategoryToTransaction } from './services/aggregation';
import { useSchemaRegistry } from '@/lib/hooks/use-schema-registry';
import { useExtensionFieldValues } from '@/lib/hooks/use-extension-field-values';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { computeResonanceROI } from './services/resonance-roi-service';
import { useLedgerCrossVerify } from './hooks/use-ledger-cross-verify';
import { LedgerNotificationSettingsPanel } from './components/LedgerNotificationSettingsPanel';
import { SchemaRegistry } from '@/lib/schema-registry';
import { FieldType, type FieldDefinition } from '@/lib/field-system/types';
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
import { evaluateAutomationRules } from './services/automation-engine';

// ─── Extracted domain hooks ─────────────────────────────────────────────────
import { useLedgerTransactions } from './hooks/use-ledger-transactions';
import { useLedgerBudget, useLedgerGoals, useLedgerDebts } from './hooks/use-ledger-budget-goals';
import { useLedgerAccounts } from './hooks/use-ledger-accounts';
import { useLedgerSubscriptions, useLedgerInvestments } from './hooks/use-ledger-subscriptions-investments';
import { useLedgerAlerts, useLedgerTax } from './hooks/use-ledger-alerts-tax';
import { useLedgerCredit, useLedgerInsurance, useLedgerRetirement } from './hooks/use-ledger-credit-insurance-retirement';
import { useLedgerRecurring, useLedgerAutomation, useLedgerReceipts, useLedgerCurrency, useLedgerExport } from './hooks/use-ledger-recurring-automation-receipts';
import { useLedgerDocumentIntake } from './hooks/use-ledger-document-intake';

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

export function LedgerContent({ profile, encryptionKey }: { profile: LedgerIntakeProfile | null; encryptionKey: CryptoKey | null }) {
  const globalSoul = useGlobalSoulStore(s => s.globalSoul);
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

  // Extension fields — custom user-defined financial tracking fields
  const { extensions } = useSchemaRegistry('ledger');
  const { fieldValues } = useExtensionFieldValues('ledger');

  const ai = useModuleAI({
    moduleId: 'ledger',
    encryptionKey,
    persistencePolicy: 'ledger-financial',
    autopilotLevelOverride: 5,
    moduleContext: {
      ledger_profile: profile,
      ledger_mode: 'general',
    },
  });

  // ─── Persist helper ───────────────────────────────────────────────────────
  const persistUpdate = useCallback((nextProfile: LedgerIntakeProfile) => {
     nextProfile.updatedAt = new Date().toISOString();
     saveLedgerProfile(nextProfile, { userId: user?.uid, encryptionKey }).catch((saveError) => {
       console.error('Failed to save ledger profile:', saveError);
     });
  }, [user?.uid, encryptionKey]);

  // ─── Domain hooks ─────────────────────────────────────────────────────────
  const txActions = useLedgerTransactions(profile, persistUpdate);
  const budgetActions = useLedgerBudget(profile, persistUpdate);
  const goalActions = useLedgerGoals(profile, persistUpdate);
  const debtActions = useLedgerDebts(profile, persistUpdate);
  const accountActions = useLedgerAccounts(profile, persistUpdate);
  const subActions = useLedgerSubscriptions(profile, persistUpdate);
  const investActions = useLedgerInvestments(profile, persistUpdate);
  const alertActions = useLedgerAlerts(profile, persistUpdate);
  const taxActions = useLedgerTax(profile, persistUpdate);
  const creditActions = useLedgerCredit(profile, persistUpdate);
  const insuranceActions = useLedgerInsurance(profile, persistUpdate);
  const retirementActions = useLedgerRetirement(profile, persistUpdate);
  const recurringActions = useLedgerRecurring(profile, persistUpdate);
  const automationActions = useLedgerAutomation(profile, persistUpdate);
  const receiptActions = useLedgerReceipts(profile, persistUpdate);
  const currencyActions = useLedgerCurrency(profile, persistUpdate);
  const exportActions = useLedgerExport(profile);
  const docIntake = useLedgerDocumentIntake(ai.handleSendMessage, sendMessage, analyzeImage);

  // ─── Recurring engine — auto-posts due rules on profile load ──────────────
  const handleRecurringEngineUpdate = useCallback(
    (updated: LedgerIntakeProfile) => persistUpdate(updated),
    [persistUpdate],
  );
  const { pendingRules } = useRecurringEngine(profile, handleRecurringEngineUpdate);

  // ─── Derived data ────────────────────────────────────────────────────────
  const transactions = useMemo(() => profile?.transactions ?? [], [profile?.transactions]);

  const transactionTotals = useMemo(() => {
    let totalIncome = 0;
    let totalExpenses = 0;
    for (const t of transactions) {
      if (t.type === 'income') totalIncome += t.amount;
      else if (t.type === 'expense') totalExpenses += t.amount;
    }
    return { totalIncome, totalExpenses };
  }, [transactions]);

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

  // ─── Bootstrap & side-effects ─────────────────────────────────────────────

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

  // Memoize the context actions object so LedgerActionsContext.value stays stable
  const ledgerActions = useMemo(() => ({
    onAddTransaction: txActions.handleAddTransaction,
    onUpdateTransaction: txActions.handleUpdateTransaction,
    onDeleteTransaction: txActions.handleDeleteTransaction,
    onImportCSV: txActions.handleImportCSV,
    onExportCSV: txActions.handleExportCSV,
    onUpdateCategory: budgetActions.handleUpdateBudgetCategory,
    onAddCategory: budgetActions.handleAddBudgetCategory,
    onDeleteCategory: budgetActions.handleDeleteBudgetCategory,
    onApplyTemplate: budgetActions.handleApplyBudgetTemplate,
    onAddGoal: goalActions.handleAddGoal,
    onUpdateGoal: goalActions.handleUpdateGoal,
    onDeleteGoal: goalActions.handleDeleteGoal,
    onAddDebt: debtActions.handleAddDebt,
    onUpdateDebt: debtActions.handleUpdateDebt,
    onDeleteDebt: debtActions.handleDeleteDebt,
    onValueChange: handleExtensionValueChange,
    onAddField: handleAddField,
    onDeleteField: handleDeleteField,
    onAskAI: ai.handleSendMessage,
  }), [
    txActions.handleAddTransaction, txActions.handleUpdateTransaction, txActions.handleDeleteTransaction,
    txActions.handleImportCSV, txActions.handleExportCSV,
    budgetActions.handleUpdateBudgetCategory, budgetActions.handleAddBudgetCategory, budgetActions.handleDeleteBudgetCategory,
    budgetActions.handleApplyBudgetTemplate,
    goalActions.handleAddGoal, goalActions.handleUpdateGoal, goalActions.handleDeleteGoal,
    debtActions.handleAddDebt, debtActions.handleUpdateDebt, debtActions.handleDeleteDebt,
    handleExtensionValueChange, handleAddField, handleDeleteField,
    ai.handleSendMessage,
  ]);

  return (
    <LedgerActionsProvider value={ledgerActions}>
      <SingleAgentLayout
        moduleId="ledger"
        agentName={agentAlias}
        themeColor="cyan"
        ai={ai}
        authMode="ledger"
        placeholder="Ask for budgeting or savings optimization..."
        onUploadDocuments={docIntake.handleChatDocumentUploads}
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
          isOpen={docIntake.isCaptureModalOpen}
          onClose={() => docIntake.setIsCaptureModalOpen(false)}
          title="Extract Financial Data"
          themeColor="cyan"
          maxWidth="lg"
        >
          <div className="p-2">
            <UniversalUploadZone
              onFileSelected={docIntake.handleDocumentFile}
              onCameraCapture={docIntake.handleDocumentCapture}
              phase={docIntake.isVisionAnalyzing ? 'processing' : 'idle'}
              themeColor="cyan"
              label="Statement or Receipt"
              description="Upload for structured extraction"
            />
          </div>
        </NeuralModal>

        <NeuralModal
          isOpen={docIntake.isReviewModalOpen}
          onClose={docIntake.clearVisionReview}
          title="Confirm Financial Data"
          themeColor="cyan"
          maxWidth="2xl"
        >
          <div className="space-y-6">
            {docIntake.visionReviewData && (
              <div className="space-y-4">
                {typeof docIntake.visionReviewData.monthlyIncome === 'number' && (
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Monthly Income</h3>
                    <p className="text-lg font-mono text-cyan-300">${docIntake.visionReviewData.monthlyIncome.toLocaleString()}</p>
                  </div>
                )}
                <p className="text-sm text-white/68 italic">Extracted document data is ready for profile commitment.</p>
              </div>
            )}
            <div className="flex gap-3 pt-4 border-t border-white/[0.12]">
              <NeuralButton onClick={docIntake.handleDocReviewCommit} themeColor="cyan" className="flex-1 font-bold text-xs">Commit</NeuralButton>
              <NeuralButton onClick={() => docIntake.setIsReviewModalOpen(false)} variant="secondary" className="flex-1 font-bold text-xs">Discard</NeuralButton>
            </div>
          </div>
        </NeuralModal>

        <NeuralModal
          isOpen={docIntake.isDocReviewOpen}
          onClose={docIntake.clearDocReview}
          title="Review Document Analysis"
          themeColor="cyan"
          maxWidth="2xl"
        >
          <div className="space-y-6">
            {docIntake.docProposal && (
              <div className="space-y-4">
                <p className="text-sm text-white/70">{docIntake.docProposalSummary ?? 'Document analysis ready for review.'}</p>
                <div className="bg-white/[0.045] border border-white/[0.12] rounded-xl p-3">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-white/60 mb-2">Extracted Fields</h4>
                  {Object.entries(docIntake.docProposal.fields).filter(([, v]) => v.length > 0).length === 0 ? (
                    <p className="text-sm text-white/50 italic">No structured fields detected.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-white/68">
                      {Object.entries(docIntake.docProposal.fields)
                        .filter(([, v]) => v.length > 0)
                        .map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-3">
                            <span className="text-white/60">{k}</span>
                            <span className="font-mono text-cyan-300">{v}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                <div className="bg-slate-900/60 border border-white/[0.12] rounded-xl p-3">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-white/60 mb-2">Text Preview</h4>
                  <pre className="text-[11px] text-white/50 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {docIntake.docProposal.rawTextPreview}
                    {docIntake.docProposal.rawTextPreview.length >= 2400 ? '\n[truncated]' : ''}
                  </pre>
                </div>
              </div>
            )}
            <div className="flex gap-3 pt-4 border-t border-white/[0.12]">
              <NeuralButton onClick={docIntake.handleStructuredDocCommit} themeColor="cyan" className="flex-1 font-bold text-xs">Apply</NeuralButton>
              <NeuralButton onClick={() => docIntake.setIsDocReviewOpen(false)} variant="secondary" className="flex-1 font-bold text-xs">Discard</NeuralButton>
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

          <div className="flex items-center justify-between border-b border-white/[0.12] px-4 md:px-8 pb-2">
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
                  onDismissNotification={alertActions.handleDismissNotification}
                  onToggleRule={alertActions.handleToggleAlertRule}
                  onCreateRule={alertActions.handleCreateAlertRule}
                  onDeleteRule={alertActions.handleDeleteAlertRule}
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
                className="p-1.5 md:p-2 min-h-[44px] h-auto rounded-xl text-white/50 hover:text-white"
              >
                <Settings size={14} className="md:w-4 md:h-4" />
              </NeuralButton>
              <NeuralButton
                onClick={() => setIsCurrencySettingsOpen(true)}
                variant="secondary"
                className="p-1.5 md:p-2 min-h-[44px] h-auto rounded-xl text-cyan-400/70 hover:text-cyan-300 bg-cyan-500/5 border-cyan-500/20"
                title="Currency settings"
              >
                <Globe size={14} className="md:w-4 md:h-4" />
              </NeuralButton>
              <NeuralButton onClick={() => docIntake.setIsCaptureModalOpen(true)} variant="secondary" className="p-1.5 md:p-2 min-h-[44px] bg-violet-500/10 border-violet-500/20 text-violet-400 h-auto rounded-xl"><Camera size={14} className="md:w-4 md:h-4" /></NeuralButton>
              <NeuralButton onClick={docIntake.openDocumentPicker} variant="secondary" className="p-1.5 md:p-2 min-h-[44px] bg-cyan-500/10 border-cyan-500/20 text-cyan-400 h-auto rounded-xl"><FileUp size={14} className="md:w-4 md:h-4" /></NeuralButton>
              <NeuralButton onClick={docIntake.handleOpenDocuments} variant="secondary" className="p-1.5 md:p-2 min-h-[44px] min-h-[44px] h-auto rounded-xl"><FolderOpen size={14} className="md:w-4 md:h-4" /></NeuralButton>
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
                    onAnalyzeDocument={docIntake.openDocumentPicker}
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
                      onRecordSnapshot={accountActions.handleRecordNetWorthSnapshot}
                    />
                    <CashFlowForecast
                      forecast={profile.lastCashFlowForecast ?? null}
                      recurringRules={profile.recurringRules ?? []}
                      startingBalance={computeNetLiquidAssets(profile.accounts ?? [])}
                      currency={profile.currency}
                      onRegenerateForecast={recurringActions.handleGenerateForecast}
                    />

                    {/* P3 Summary Row */}
                    {(automationSuggestions.length > 0 || (profile.creditScoreHistory ?? []).length > 0 || (profile.insurancePolicies ?? []).length > 0 || profile.lastRetirementProjection) && (
                      <div className="space-y-4">
                        {automationSuggestions.length > 0 && (
                          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                            <span className="mt-0.5 text-amber-400 text-lg">💡</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-amber-300">{automationSuggestions[0].ruleName}</p>
                              <p className="text-xs text-amber-200/70 mt-0.5">{automationSuggestions[0].message}</p>
                            </div>
                            <button
                              onClick={() => automationActions.handleDismissSuggestion(automationSuggestions[0].ruleId)}
                              className="text-amber-400/60 hover:text-amber-300 text-xs px-2 py-1 rounded shrink-0"
                            >
                              Dismiss
                            </button>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {(profile.creditScoreHistory ?? []).length > 0 && (() => {
                            const sorted = [...(profile.creditScoreHistory ?? [])].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
                            const latest = sorted[0];
                            const tier = latest.score >= 800 ? 'Exceptional' : latest.score >= 740 ? 'Very Good' : latest.score >= 670 ? 'Good' : latest.score >= 580 ? 'Fair' : 'Poor';
                            const color = latest.score >= 740 ? '#10b981' : latest.score >= 670 ? '#3b82f6' : latest.score >= 580 ? '#f59e0b' : '#ef4444';
                            return (
                              <button onClick={() => setActiveTab('credit')} className="text-left rounded-xl border border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] transition-colors p-4 shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-lg">🛡️</span>
                                  <span className="text-xs text-white/60 font-medium uppercase tracking-wide">Credit Score</span>
                                </div>
                                <div className="text-2xl font-bold" style={{ color }}>{latest.score}</div>
                                <div className="text-xs text-white/60 mt-0.5">{tier} · {latest.bureau}</div>
                              </button>
                            );
                          })()}

                          {(profile.insurancePolicies ?? []).filter(p => p.isActive).length > 0 && (() => {
                            const active = (profile.insurancePolicies ?? []).filter(p => p.isActive);
                            const totalMonthly = active.reduce((s, p) => s + p.monthlyPremium, 0);
                            const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: profile.currency, maximumFractionDigits: 0 }).format(n);
                            const soonRenewing = active.filter(p => {
                              const days = (new Date(p.nextRenewalDate).getTime() - Date.now()) / 86_400_000;
                              return days >= 0 && days <= 30;
                            }).length;
                            return (
                              <button onClick={() => setActiveTab('insurance')} className="text-left rounded-xl border border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] transition-colors p-4 shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-lg">🔒</span>
                                  <span className="text-xs text-white/60 font-medium uppercase tracking-wide">Insurance</span>
                                </div>
                                <div className="text-2xl font-bold text-emerald-400">{fmt(totalMonthly)}<span className="text-sm font-normal text-white/50">/mo</span></div>
                                <div className="text-xs text-white/60 mt-0.5">{active.length} policies{soonRenewing > 0 ? ` · ⚠ ${soonRenewing} renewing soon` : ''}</div>
                              </button>
                            );
                          })()}

                          {profile.lastRetirementProjection && (() => {
                            const proj = profile.lastRetirementProjection!;
                            const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: profile.currency, notation: 'compact', maximumFractionDigits: 1 }).format(n);
                            return (
                              <button onClick={() => setActiveTab('retirement')} className="text-left rounded-xl border border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] transition-colors p-4 shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-lg">🏖️</span>
                                  <span className="text-xs text-white/60 font-medium uppercase tracking-wide">Retirement</span>
                                </div>
                                <div className={`text-2xl font-bold ${proj.onTrack ? 'text-emerald-400' : 'text-amber-400'}`}>{fmt(proj.projectedNestEgg)}</div>
                                <div className="text-xs text-white/60 mt-0.5">{proj.onTrack ? '✅ On track' : '⚠ Behind'} · {proj.yearsToRetirement}y left</div>
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    <ExportPanel
                      profile={profile}
                      onExportTransactionsCsv={exportActions.handleExportTransactionsCsv}
                      onExportTaxSummary={exportActions.handleExportTaxSummary}
                      onExportNetWorthReport={exportActions.handleExportNetWorthReport}
                    />
                  </div>
                )}

                {activeTab === 'accounts' && profile && (
                  <AccountsTab
                    accounts={profile.accounts ?? []}
                    transferHistory={profile.transferHistory ?? []}
                    currency={profile.currency}
                    disabled={isLocked}
                    onAddAccount={accountActions.handleAddAccount}
                    onUpdateAccount={accountActions.handleUpdateAccount}
                    onDeleteAccount={accountActions.handleDeleteAccount}
                    onTransfer={accountActions.handleTransfer}
                  />
                )}

                {activeTab === 'recurring' && profile && (
                  <RecurringTab
                    rules={profile.recurringRules ?? []}
                    accounts={profile.accounts ?? []}
                    currency={profile.currency}
                    disabled={isLocked}
                    onAddRule={recurringActions.handleAddRecurringRule}
                    onUpdateRule={recurringActions.handleUpdateRecurringRule}
                    onDeleteRule={recurringActions.handleDeleteRecurringRule}
                    onPostNow={recurringActions.handlePostRecurringNow}
                    onSkipNext={recurringActions.handleSkipRecurring}
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
                      onSetTaxCategory={taxActions.handleSetTaxCategory}
                      onAddDeduction={taxActions.handleAddTaxDeduction}
                      onDeleteDeduction={taxActions.handleDeleteTaxDeduction}
                      onGenerateSummary={taxActions.handleGenerateTaxSummary}
                      onExportTaxSummary={exportActions.handleExportTaxSummary}
                    />
                  </div>
                )}

                {activeTab === 'subscriptions' && profile && (
                  <div className="px-4 md:px-8 py-6">
                    <SubscriptionManager
                      subscriptions={profile.subscriptions ?? []}
                      currency={profile.currency}
                      onCreateSubscription={subActions.handleCreateSubscription}
                      onUpdateSubscription={subActions.handleUpdateSubscription}
                      onDeleteSubscription={subActions.handleDeleteSubscription}
                      onCancelSubscription={subActions.handleCancelSubscription}
                    />
                  </div>
                )}

                {activeTab === 'investments' && profile && (
                  <div className="px-4 md:px-8 py-6">
                    <InvestmentPortfolio
                      investments={profile.investments ?? []}
                      portfolioHistory={profile.portfolioHistory ?? []}
                      currency={profile.currency}
                      onAddInvestment={investActions.handleAddInvestment}
                      onUpdateInvestment={investActions.handleUpdateInvestment}
                      onDeleteInvestment={investActions.handleDeleteInvestment}
                      onRecordSnapshot={investActions.handleRecordPortfolioSnapshot}
                      onAddDividend={investActions.handleAddDividend}
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
                      onAddEntry={creditActions.handleAddCreditScoreEntry}
                      onDeleteEntry={creditActions.handleDeleteCreditScoreEntry}
                    />
                  </div>
                )}

                {activeTab === 'insurance' && profile && (
                  <div className="px-4 md:px-8 py-6">
                    <InsuranceManager
                      policies={profile.insurancePolicies ?? []}
                      currency={profile.currency}
                      onCreatePolicy={insuranceActions.handleCreateInsurancePolicy}
                      onUpdatePolicy={insuranceActions.handleUpdateInsurancePolicy}
                      onDeletePolicy={insuranceActions.handleDeleteInsurancePolicy}
                    />
                  </div>
                )}

                {activeTab === 'retirement' && profile && (
                  <div className="px-4 md:px-8 py-6">
                    <RetirementPlanner
                      retirementPlans={profile.retirementPlans ?? []}
                      lastRetirementProjection={profile.lastRetirementProjection}
                      currency={profile.currency}
                      onCreatePlan={retirementActions.handleCreateRetirementPlan}
                      onUpdatePlan={retirementActions.handleUpdateRetirementPlan}
                      onDeletePlan={retirementActions.handleDeleteRetirementPlan}
                      onProjectRetirement={retirementActions.handleProjectRetirement}
                    />
                  </div>
                )}

                {activeTab === 'automation' && profile && (
                  <div className="px-4 md:px-8 py-6">
                    <AutomationRules
                      profile={profile}
                      onCreateRule={automationActions.handleCreateAutomationRule}
                      onUpdateRule={automationActions.handleUpdateAutomationRule}
                      onDeleteRule={automationActions.handleDeleteAutomationRule}
                      onToggleRule={automationActions.handleToggleAutomationRule}
                      onDismissSuggestion={automationActions.handleDismissSuggestion}
                      onAddDefaultRules={automationActions.handleAddDefaultAutomationRules}
                    />
                  </div>
                )}

                {activeTab === 'receipts' && profile && (
                  <div className="px-4 md:px-8 py-6">
                    <ReceiptLibrary
                      receipts={profile.receipts ?? []}
                      transactions={profile.transactions ?? []}
                      currency={profile.currency}
                      onAddReceipt={receiptActions.handleAddReceipt}
                      onDeleteReceipt={receiptActions.handleDeleteReceipt}
                      onLinkToTransaction={receiptActions.handleLinkReceiptToTransaction}
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

      {/* Currency Settings Modal */}
      {profile && (
        <CurrencySettings
          isOpen={isCurrencySettingsOpen}
          onClose={() => setIsCurrencySettingsOpen(false)}
          baseCurrency={profile.currency}
          storedRates={profile.currencyRates ?? []}
          onUpdateBaseCurrency={currencyActions.handleUpdateBaseCurrency}
          onUpsertRate={currencyActions.handleUpsertCurrencyRate}
          onDeleteRate={currencyActions.handleDeleteCurrencyRate}
        />
      )}
    </LedgerActionsProvider>
  );
}
