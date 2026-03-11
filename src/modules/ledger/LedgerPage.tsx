import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { LedgerDashboard } from './components/LedgerDashboard';
import { TransactionManager } from './components/TransactionManager';
import { BudgetPlanner } from './components/BudgetPlanner';
import { GoalTracker } from './components/GoalTracker';
import { DebtStrategist } from './components/DebtStrategist';
import { FieldsTab } from './components/FieldsTab';
import { TaxTracker } from './components/TaxTracker';
import { LedgerOnboarding } from './onboarding/LedgerOnboarding';
import { ImageCaptureModal } from '@/core/components/ImageCaptureModal';
import { NeuralModal } from '@/core/components/NeuralModal';
import { SingleAgentLayout } from '@/core/layout/SingleAgentLayout';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { NeuralTabGroup, NeuralTabItem } from '@/core/components/NeuralTabGroup';
import { SectionHeader } from '@/core/components/SectionHeader';
import { BarChart3, Camera, FileUp, FolderOpen, LayoutDashboard, ArrowLeftRight, PieChart, Target, Database, Plus, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { analyzeImageWithVision } from '@/lib/services/vision-analysis-service';
import { ModelRegistry } from '@/lib/ai-adapters/model-registry';
import {
  FinancialPlan,
  LedgerIntakeProfile,
  Transaction,
  BudgetCategory,
  FinancialGoal,
  loadLedgerProfile,
  saveLedgerProfile,
  subscribeLedgerProfile,
  syncGuestLedgerProfileToUser
} from './services/ledger-intake-service';
import { computeBudgetActuals, matchCategoryToTransaction } from './services/ledger-aggregation-service';
import { LEDGER_PERSONA } from './personas';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { computeResonanceROI } from './services/resonance-roi-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { registerDiagnosisSpec } from '@/core/diagnosis/diagnosis-registry';
import { ledgerDiagnosisSpec } from './diagnosis/ledger-diagnosis-spec';
import { useDocumentIntelligence } from '@/lib/hooks/use-document-intelligence';
import { registerLedgerFieldActions, registerLedgerTransactionActions } from '@/modules/ledger/actions/ledger-field-actions';
import { registerLedgerCascadeRules } from '@/lib/spine/cascade-rules';
import { useLedgerCrossVerify } from './hooks/use-ledger-cross-verify';

registerDiagnosisSpec(ledgerDiagnosisSpec);
registerLedgerFieldActions();
registerLedgerTransactionActions();
registerLedgerCascadeRules();

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

type LedgerTab = 'overview' | 'transactions' | 'budget' | 'goals' | 'fields' | 'tax';

/** Shape expected by handleApplyBudgetTemplate */
interface BudgetTemplate {
  allocations: Record<string, number>;
}

function LedgerContent({ profile, encryptionKey }: { profile: LedgerIntakeProfile | null; encryptionKey: CryptoKey | null }) {
  const { globalSoul } = useGlobalSoul();
  const { user, isGuest } = useAuth();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('ledger');

  // Cross-verification: coherence checks + NSV sync + Spine events
  const { coherenceReport } = useLedgerCrossVerify(profile);

  const agentAlias = globalSoul?.displayNames?.ledger || 'Ledger';
  const plannerBootstrappedRef = useRef(false);
  const [activeTab, setActiveTab] = useState<LedgerTab>('overview');
  const [isAddTransactionModalOpen, setIsAddTransactionModalOpen] = useState(false);

  const ai = useModuleAI({
    moduleId: 'ledger',
    systemPrompt: LEDGER_PERSONA,
    encryptionKey,
    persistencePolicy: 'ledger-financial'
  });

  // Vision analysis state for financial documents
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [isVisionAnalyzing, setIsVisionAnalyzing] = useState(false);
  const [visionReviewData, setVisionReviewData] = useState<Record<string, unknown> | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  const handleOpenDocuments = useCallback(() => {
    ai.handleSendMessage(
      'Open embedded financial document intelligence mode. Ask me to upload a statement, receipt, or invoice for structured extraction.'
    );
  }, [ai]);

  const { parseDocument: parseDoc } = useDocumentIntelligence();

  /**
   * Receipt / financial document picker (S10-003 migration).
   * Delegates text extraction and field parsing to the shared
   * document-intelligence-service, then forwards the structured result to the
   * Ledger AI agent as a formatted prompt.
   */
  const openDocumentPicker = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.png,.jpg,.jpeg,.webp,.txt';

    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const result = await parseDoc(file, { domain: 'receipt', moduleId: 'ledger' });
      input.value = '';

      if (!result) {
        ai.handleSendMessage('Document intake failed. Please try again with a PDF, image, or text file.');
        return;
      }

      const fieldLines = Object.entries(result.fields)
        .filter(([, v]) => v.length > 0)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n');

      const prompt = [
        'Financial document receipt parsed. Map this into budgeting, cashflow, categories, and anomalies.',
        `File: ${file.name} | Type: ${result.type} | Confidence: ${(result.confidence * 100).toFixed(0)}%`,
        fieldLines.length > 0 ? `Extracted fields:\n${fieldLines}` : null,
        result.rawText.length > 0
          ? `Full extracted text:\n${result.rawText.slice(0, 3000)}${result.rawText.length > 3000 ? '\n[truncated]' : ''}`
          : 'No text could be extracted from this file.',
      ]
        .filter(Boolean)
        .join('\n\n');

      ai.handleSendMessage(prompt);
    };

    input.click();
  }, [parseDoc, ai]);

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
    const sanitized = JSON.stringify(visionReviewData).replace(/<action/gi, '[action');
    const prompt = [
      'Financial document analysis completed. Review the extracted data:',
      sanitized,
      'User has confirmed this data. Now emit: <action type="analyze_financial_document">...(include the extracted data)</action>'
    ].join('\n\n');
    ai.handleSendMessage(prompt);
    setIsReviewModalOpen(false);
    setVisionReviewData(null);
  }, [visionReviewData, ai]);

  const persistUpdate = useCallback((nextProfile: LedgerIntakeProfile) => {
     nextProfile.updatedAt = new Date().toISOString();
     saveLedgerProfile(nextProfile, { userId: user?.uid, encryptionKey }).catch((saveError) => {
       console.error('Failed to save ledger profile:', saveError);
     });
  }, [user?.uid, encryptionKey]);

  // ─── Derived data (lifted from LedgerWorkspace) ───────────────────────────

  const transactions = useMemo(() => profile?.transactions ?? [], [profile?.transactions]);
  const budgetCategories = useMemo(() => profile?.budgetCategories ?? [], [profile?.budgetCategories]);
  const financialGoals = useMemo(() => profile?.financialGoals ?? [], [profile?.financialGoals]);

  /** Unique transaction category labels sourced from profile expenses + defaults */
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

  /**
   * Budget categories with per-category actual spend injected from transactions.
   * O(n + b): single-pass accumulation then b-length map.
   */
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
      color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
    };
    persistUpdate({ ...profile, budgetCategories: [...budgetCategories, newCategory] });
  }, [profile, budgetCategories, persistUpdate]);

  const handleDeleteBudgetCategory = useCallback((id: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, budgetCategories: budgetCategories.filter(cat => cat.id !== id) });
  }, [profile, budgetCategories, persistUpdate]);

  const handleApplyBudgetTemplate = useCallback((template: BudgetTemplate) => {
    if (!profile) return;
    const newCategories: BudgetCategory[] = Object.entries(template.allocations).map(([name, percentage]) => ({
      id: crypto.randomUUID(),
      name,
      allocated: (profile.monthlyIncome * percentage) / 100,
      spent: 0,
      color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
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
    if (profile?.onboardingComplete && ai.messages.length === 0 && !ai.isProcessing && !ai.streamingText) {
      const greeting = !profile.activePlanId 
        ? `No active plan was found. I created a starter financial plan and activated planner mode. Tell me what constraint to optimize first: debt reduction, savings speed, or monthly cashflow.`
        : `Resource link active. I am ${agentAlias}. I optimize your budget, spending strategy, and plan execution. What should we optimize first this week?`;
      
      ai.setMessages([{ role: 'assistant', content: greeting }]);
    }
  }, [profile?.onboardingComplete, profile?.activePlanId, agentAlias, ai.messages.length, ai.isProcessing, ai.streamingText, ai.setMessages]);

  const mainTabs: NeuralTabItem<LedgerTab>[] = [
    { id: 'overview',     label: 'Overview',      icon: LayoutDashboard },
    { id: 'transactions', label: 'Transactions',  icon: ArrowLeftRight },
    { id: 'budget',       label: 'Budget',        icon: PieChart },
    { id: 'goals',        label: 'Goals',         icon: Target },
    { id: 'fields',       label: 'Fields',        icon: Database },
    { id: 'tax',          label: 'Tax',           icon: Receipt },
  ];

  return (
    <SingleAgentLayout
      moduleId="ledger"
      agentName={agentAlias}
      themeColor="cyan"
      ai={ai}
      authMode="ledger"
      placeholder="Ask for budgeting or savings optimization..."
      primaryAction={
        activeTab === 'transactions' && (
          <button
            onClick={() => setIsAddTransactionModalOpen(true)}
            aria-label="Add transaction"
            className={cn(
              'z-[var(--z-fab)] rounded-full flex items-center justify-center',
              'bg-cyan-600 text-white shadow-lg shadow-cyan-500/25',
              'hover:bg-cyan-500 active:bg-cyan-700 transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900',
              'w-12 h-12'
            )}
          >
            <Plus className="w-5 h-5" />
          </button>
        )
      }
    >
      <ImageCaptureModal
        isOpen={isCaptureModalOpen}
        onClose={() => setIsCaptureModalOpen(false)}
        onCapture={handleDocumentCapture}
        isAnalyzing={isVisionAnalyzing}
        themeColor="indigo"
        title="Capture Financial Statement"
        acceptedTypes="image/jpeg,image/png"
        maxFileSizeMb={10}
      />

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
              {/* Simplified review content for brevity */}
              <p className="text-xs text-white/50 italic">Extracted document data is ready for profile commitment.</p>
            </div>
          )}
          <div className="flex gap-3 pt-4 border-t border-white/10">
            <button onClick={handleDocReviewCommit} className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg">Commit</button>
            <button onClick={() => setIsReviewModalOpen(false)} className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-lg">Discard</button>
          </div>
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

        <div className="px-4 md:px-8 pb-3 md:pb-6 border-b border-white/5 flex items-center justify-between">
          <NeuralTabGroup
            tabs={mainTabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            themeColor="cyan"
          />
          
          <div className="flex gap-2">
            <button onClick={() => setIsCaptureModalOpen(true)} className="p-1.5 md:p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 text-violet-400 transition-all"><Camera size={14} className="md:w-4 md:h-4" /></button>
            <button onClick={openDocumentPicker} className="p-1.5 md:p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 text-cyan-400 transition-all"><FileUp size={14} className="md:w-4 md:h-4" /></button>
            <button onClick={handleOpenDocuments} className="p-1.5 md:p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 transition-all"><FolderOpen size={14} className="md:w-4 md:h-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar pt-4 md:pt-6 pb-20">
          {activeTab === 'overview' && (
            <>
              {coherenceReport && coherenceReport.issues.length > 0 && (
                <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm">
                  <span className="text-amber-400 font-medium">Data coherence: {coherenceReport.score}/100</span>
                  <span className="text-white/60 ml-2">{coherenceReport.issues.length} issue(s) detected</span>
                </div>
              )}
              <LedgerDashboard
                soul={globalSoul}
                profile={profile}
                isLocked={isLocked}
                onToggleDocumentAnalysis={async (enabled) => {
                  if (!profile) return;
                  persistUpdate({ ...profile, documentAnalysisEnabled: enabled });
                }}
              />
            </>
          )}

          {activeTab === 'transactions' && profile && (
            <div className="px-4 md:px-8">
              <TransactionManager
                transactions={transactions}
                categories={categories}
                currency={profile.currency}
                onAddTransaction={handleAddTransaction}
                onUpdateTransaction={handleUpdateTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                onImportCSV={handleImportCSV}
                onExportCSV={handleExportCSV}
                isAddModalOpen={isAddTransactionModalOpen}
                onAddModalOpenChange={setIsAddTransactionModalOpen}
                showAddButton={false}
              />
            </div>
          )}

          {activeTab === 'budget' && profile && (
            <div className="px-4 md:px-8">
              <BudgetPlanner
                categories={budgetWithActuals}
                monthlyIncome={profile.monthlyIncome}
                currency={profile.currency}
                onUpdateCategory={handleUpdateBudgetCategory}
                onAddCategory={handleAddBudgetCategory}
                onDeleteCategory={handleDeleteBudgetCategory}
                onApplyTemplate={handleApplyBudgetTemplate}
              />
            </div>
          )}

          {activeTab === 'goals' && profile && (
            <div className="px-4 md:px-8 space-y-8">
              <GoalTracker
                goals={financialGoals}
                currency={profile.currency}
                onAddGoal={handleAddGoal}
                onUpdateGoal={handleUpdateGoal}
                onDeleteGoal={handleDeleteGoal}
              />
              <DebtStrategist
                debtItems={profile.debtItems ?? []}
                currency={profile.currency}
              />
            </div>
          )}

          {activeTab === 'fields' && profile && (
            <div className="px-4 md:px-8">
              <FieldsTab
                currency={profile.currency}
                extensionValues={{}}
              />
            </div>
          )}

          {activeTab === 'tax' && profile && (
            <TaxTracker
              profile={profile}
              encryptionKey={encryptionKey ?? undefined}
            />
          )}
        </div>
      </div>
    </SingleAgentLayout>
  );
}

export default function LedgerPage() {
  const { user, isGuest, profile: coreProfile, refreshProfile } = useAuth();

  return (
    <UnifiedModulePage<LedgerIntakeProfile>
      moduleId="ledger"
      profileOptions={{
        loadProfile: loadLedgerProfile,
        saveProfile: saveLedgerProfile,
        subscribeProfile: subscribeLedgerProfile,
        refreshProfile: loadLedgerProfile,
        syncGuestProfile: syncGuestLedgerProfileToUser
      }}
      renderOnboarding={({ profile, onComplete }) => (
        <LedgerOnboarding
          initialProfile={profile}
          initialBaseContext={IntakeBaseContextService.buildForLedger({ coreProfile })}
          onGlobalBaseContextFinalize={async (context) => {
            if (!user || isGuest) return;
            const patch = IntakeBaseContextService.toCoreProfilePatch(context);
            if (Object.keys(patch).length > 0) {
              await CoreProfileService.updateProfile(user.uid, patch);
              await refreshProfile();
            }
          }}
          onComplete={async (completed) => {
            onComplete(completed);
          }}
        />
      )}
      renderContent={({ profile, encryptionKey }) => (
        <LedgerContent profile={profile} encryptionKey={encryptionKey} />
      )}
    />
  );
}
