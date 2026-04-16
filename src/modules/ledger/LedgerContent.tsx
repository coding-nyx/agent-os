import React, { useCallback, useMemo, useState } from 'react';
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
import { Camera, FileUp, FolderOpen, Plus, Settings, Globe } from 'lucide-react';
import {
  LedgerIntakeProfile,
  saveLedgerProfile,
} from './services/ledger-intake-service';
import { useSchemaRegistry } from '@/lib/hooks/use-schema-registry';
import { useExtensionFieldValues } from '@/lib/hooks/use-extension-field-values';
import { useLedgerCrossVerify } from './hooks/use-ledger-cross-verify';
import { LedgerNotificationSettingsPanel } from './components/LedgerNotificationSettingsPanel';
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
import { LedgerOverviewSummaryCards } from './components/LedgerOverviewSummaryCards';
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

// ─── Extracted domain hooks ─────────────────────────────────────────────────
import { useLedgerTransactions } from './hooks/use-ledger-transactions';
import { useLedgerBudget, useLedgerGoals, useLedgerDebts } from './hooks/use-ledger-budget-goals';
import { useLedgerAccounts } from './hooks/use-ledger-accounts';
import { useLedgerSubscriptions, useLedgerInvestments } from './hooks/use-ledger-subscriptions-investments';
import { useLedgerAlerts, useLedgerTax } from './hooks/use-ledger-alerts-tax';
import { useLedgerCredit, useLedgerInsurance, useLedgerRetirement } from './hooks/use-ledger-credit-insurance-retirement';
import { useLedgerRecurring, useLedgerAutomation, useLedgerReceipts, useLedgerCurrency, useLedgerExport } from './hooks/use-ledger-recurring-automation-receipts';
import { useLedgerDocumentIntake } from './hooks/use-ledger-document-intake';
import { useLedgerExtensionFields } from './hooks/use-ledger-extension-fields';
import { useLedgerDerivedData } from './hooks/use-ledger-derived-data';
import { useLedgerBootstrap } from './hooks/use-ledger-bootstrap';

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

export function LedgerContent({ profile, encryptionKey, profileError, isLoading }: { profile: LedgerIntakeProfile | null; encryptionKey: CryptoKey | null; profileError?: 'subscription_failed' | null; isLoading?: boolean }) {
  const globalSoul = useGlobalSoulStore(s => s.globalSoul);
  const { user, isGuest } = useAuth();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('ledger');
  const { sendMessage, analyzeImage } = useAI();

  const agentAlias = globalSoul?.displayNames?.ledger || 'Ledger';
  const [activeTab, setActiveTab] = useState<LedgerTab>('overview');
  const [isAddTransactionModalOpen, setIsAddTransactionModalOpen] = useState(false);
  const [isCurrencySettingsOpen, setIsCurrencySettingsOpen] = useState(false);
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
      ledger_profile_status: profile !== null
        ? 'loaded'
        : profileError === 'subscription_failed'
          ? 'unavailable'
          : isLoading
            ? 'loading'
            : 'empty',
    },
  });

  // ─── Persist helper ───────────────────────────────────────────────────────
  const persistUpdate = useCallback((nextProfile: LedgerIntakeProfile) => {
     nextProfile.updatedAt = new Date().toISOString();
     saveLedgerProfile(nextProfile, { userId: user?.uid, encryptionKey }).catch((saveError) => {
       console.error('Failed to save ledger profile:', saveError);
     });
  }, [user?.uid, encryptionKey]);

  // Cross-verification: coherence checks + NSV sync + Spine events
  const { coherenceReport } = useLedgerCrossVerify(profile, persistUpdate);

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
  const {
    transactions,
    budgetCategories,
    financialGoals,
    automationSuggestions,
    categories,
    budgetWithActuals,
  } = useLedgerDerivedData(profile);

  // ─── Extension fields ─────────────────────────────────────────────────────
  const {
    extensionValues,
    handleExtensionValueChange,
    handleAddField,
    handleDeleteField,
  } = useLedgerExtensionFields(profile, persistUpdate);

  const [extraDebtPayment, setExtraDebtPayment] = useState(0);

  const handleProfileUpdate = useCallback((updates: Partial<LedgerIntakeProfile>) => {
    if (!profile) return;
    persistUpdate({ ...profile, ...updates });
  }, [profile, persistUpdate]);

  // ─── Bootstrap & side-effects ─────────────────────────────────────────────
  const { recentEvents } = useLedgerBootstrap({
    profile,
    persistUpdate,
    userId: user?.uid,
    isGuest,
    globalSoul,
    agentAlias,
    ai,
  });

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
                    <LedgerOverviewSummaryCards
                      profile={profile}
                      automationSuggestions={automationSuggestions}
                      onDismissSuggestion={automationActions.handleDismissSuggestion}
                      onNavigateTab={setActiveTab}
                    />

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
