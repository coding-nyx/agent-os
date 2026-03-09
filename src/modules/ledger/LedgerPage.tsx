import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { LedgerDashboard } from './components/LedgerDashboard';
import { LedgerWorkspace } from './components/LedgerWorkspace';
import { LedgerOnboarding } from './onboarding/LedgerOnboarding';
import { ImageCaptureModal } from '@/core/components/ImageCaptureModal';
import { NeuralModal } from '@/core/components/NeuralModal';
import { CollapsibleAIPanel, CollapsibleAIPanelRef } from '@/core/components/CollapsibleAIPanel';
import { BarChart3, Camera, FileUp, FolderOpen } from 'lucide-react';
import { analyzeImageWithVision } from '@/lib/services/vision-analysis-service';
import { ModelRegistry } from '@/llm-engine/engine/ModelRegistry';
import {
  FinancialPlan,
  LedgerIntakeProfile,
  loadLedgerProfile,
  saveLedgerProfile,
  subscribeLedgerProfile,
  syncGuestLedgerProfileToUser
} from './services/ledger-intake-service';
import { LEDGER_PERSONA } from './personas';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { computeResonanceROI } from './services/resonance-roi-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { registerLedgerActions } from './services/actions';
import { registerLedgerFieldActions } from './actions/ledger-field-actions';
import { cn } from '@/lib/utils';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';

registerLedgerActions();
registerLedgerFieldActions();

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

function LedgerContent({ profile, encryptionKey }: { profile: LedgerIntakeProfile | null; encryptionKey: CryptoKey | null }) {
  const { globalSoul } = useGlobalSoul();
  const { user, isGuest } = useAuth();
  const navigate = useNavigate();

  const agentAlias = globalSoul?.displayNames?.ledger || 'Ledger';
  const plannerBootstrappedRef = useRef(false);
  const aiPanelRef = useRef<CollapsibleAIPanelRef>(null);

  // Vision analysis state for financial documents
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [isVisionAnalyzing, setIsVisionAnalyzing] = useState(false);
  const [visionReviewData, setVisionReviewData] = useState<Record<string, unknown> | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  const handleOpenDocuments = useCallback(() => {
    NexusHandoffService.store({
      moduleId: 'documents',
      type: 'delegate',
      content: 'Open document intelligence for financial analysis.',
      reason: 'ledger_document_notebook',
      sourceModuleId: 'ledger',
      createdAt: new Date().toISOString()
    });
    navigate('/documents');
  }, [navigate]);

  const handleDocumentCapture = useCallback(
    async (dataUrl: string) => {
      setIsVisionAnalyzing(true);
      try {
        // Check API key availability
        const apiKey = localStorage.getItem('openrouter_api_key') || process.env.REACT_APP_OPENROUTER_KEY;
        if (!apiKey) {
          aiPanelRef.current?.sendMessage('I need an OpenRouter API key to analyze financial documents. Please set your API key in settings.');
          setIsCaptureModalOpen(false);
          return;
        }

        // Check if model supports vision (use default GPT-4o for vision analysis)
        const modelId = 'openai/gpt-4o';
        if (!ModelRegistry.isVisionCapable(modelId)) {
          aiPanelRef.current?.sendMessage('Document analysis requires a vision-capable model. GPT-4o will be used for this analysis.');
        }

        const result = await analyzeImageWithVision(dataUrl, 'financial_document', apiKey, modelId);
        if (!result.success) {
          aiPanelRef.current?.sendMessage(`Financial document analysis failed: ${result.error}`);
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
    [],
  );

  const handleDocReviewCommit = useCallback(async () => {
    if (!visionReviewData) return;

    // Sanitize to prevent prompt injection
    const sanitized = JSON.stringify(visionReviewData).replace(/<action/gi, '[action');

    const prompt = [
      'Financial document analysis completed. Review the extracted data:',
      sanitized,
      'User has confirmed this data. Now emit: <action type="analyze_financial_document">...(include the extracted data)</action>'
    ].join('\n\n');

    aiPanelRef.current?.sendMessage(prompt);
    setIsReviewModalOpen(false);
    setVisionReviewData(null);
  }, [visionReviewData]);

  const persistUpdate = useCallback((nextProfile: LedgerIntakeProfile) => {
     nextProfile.updatedAt = new Date().toISOString();
     saveLedgerProfile(nextProfile, { userId: user?.uid, encryptionKey }).catch((saveError) => {
       console.error('Failed to save ledger profile:', saveError);
     });
  }, [user?.uid, encryptionKey]);

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

  // Determine greeting based on starter plan state
  const greeting = useMemo(() => {
    if (!profile?.onboardingComplete) return undefined;
    if (!profile.activePlanId) {
      return `No active plan was found. I created a starter financial plan and activated planner mode. Tell me what constraint to optimize first: debt reduction, savings speed, or monthly cashflow.`;
    }
    return `Resource link active. I am ${agentAlias}. I optimize your budget, spending strategy, and plan execution. What should we optimize first this week?`;
  }, [profile?.onboardingComplete, profile?.activePlanId, agentAlias]);

  const handleImportCsv = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.txt';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (re) => {
          const text = re.target?.result as string;
          aiPanelRef.current?.sendMessage(`CSV Import received: ${file.name}. Content: ${text || 'FILE_EMPTY'}`);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, []);

  // Render FinancialDocumentReviewModal
  const financialDocumentReviewModal = (
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
          <>
            {typeof visionReviewData.monthlyIncome === 'number' && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Monthly Income</h3>
                <p className="text-lg font-mono text-cyan-300">${visionReviewData.monthlyIncome.toLocaleString()}</p>
              </div>
            )}

            {typeof visionReviewData.currency === 'string' && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Currency</h3>
                <p className="text-sm font-mono text-white/70">{visionReviewData.currency}</p>
              </div>
            )}

            {Array.isArray(visionReviewData.fixedExpenses) && visionReviewData.fixedExpenses.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Fixed Expenses</h3>
                <div className="space-y-1">
                  {(visionReviewData.fixedExpenses as any[]).map((e: any, i: number) => (
                    <div key={i} className="text-xs text-white/70 flex justify-between font-mono">
                      <span>{e.description || `Expense ${i + 1}`}</span>
                      <span className="text-cyan-300">${(e.amount || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(visionReviewData.variableExpenses) && visionReviewData.variableExpenses.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Variable Expenses</h3>
                <div className="space-y-1">
                  {(visionReviewData.variableExpenses as any[]).map((e: any, i: number) => (
                    <div key={i} className="text-xs text-white/70 flex justify-between font-mono">
                      <span>{e.description || `Expense ${i + 1}`}</span>
                      <span className="text-cyan-300">${(e.amount || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex gap-3 pt-4 border-t border-white/10">
          <button
            onClick={handleDocReviewCommit}
            disabled={isVisionAnalyzing}
            className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg disabled:opacity-50"
          >
            {isVisionAnalyzing ? 'Processing...' : 'Commit to Profile'}
          </button>
          <button
            onClick={() => {
              setIsReviewModalOpen(false);
              setVisionReviewData(null);
            }}
            className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-lg"
          >
            Discard
          </button>
        </div>
      </div>
    </NeuralModal>
  );

  return (
    <>
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

      {financialDocumentReviewModal}

      {/* Financial Workspace — always visible as primary content */}
      {profile && (
        <div className="p-4 sm:p-6 space-y-4">
          {/* Quick actions toolbar */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setIsCaptureModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 transition-all text-violet-400 text-xs font-bold uppercase tracking-wider"
            >
              <Camera className="w-4 h-4" />
              Analyze Statement
            </button>
            <button
              onClick={handleImportCsv}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all text-cyan-400 text-xs font-bold uppercase tracking-wider"
            >
              <FileUp className="w-4 h-4" />
              Import CSV
            </button>
            <button
              onClick={handleOpenDocuments}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white/60 text-xs font-bold uppercase tracking-wider"
            >
              <FolderOpen className="w-4 h-4" />
              Open Notebook
            </button>
          </div>

          <LedgerWorkspace
            profile={profile}
            onUpdateProfile={(updates) => {
              const nextProfile = { ...profile, ...updates };
              nextProfile.updatedAt = new Date().toISOString();
              saveLedgerProfile(nextProfile, { userId: user?.uid, encryptionKey }).catch((saveError) => {
                console.error('Failed to save ledger profile:', saveError);
              });
            }}
          />
        </div>
      )}

      {/* Collapsible AI chat panel */}
      <CollapsibleAIPanel
        ref={aiPanelRef}
        moduleId="ledger"
        persona={agentAlias}
        systemPrompt={LEDGER_PERSONA}
        themeColor="cyan"
        encryptionKey={encryptionKey}
        placeholder="Ask for budgeting, debt strategy, cashflow planning, or savings optimization..."
        greeting={greeting}
        authMode="ledger"
      />
    </>
  );
}

export default function LedgerPage() {
  const { globalSoul } = useGlobalSoul();
  const { user, isGuest, profile: coreProfile, refreshProfile } = useAuth();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('ledger');
  
  const baseContext = useMemo(() => IntakeBaseContextService.buildForLedger({ coreProfile }), [coreProfile]);

  return (
    <UnifiedModulePage<LedgerIntakeProfile>
      moduleId="ledger"
      workspaceType="command"
      profileOptions={{
        loadProfile: loadLedgerProfile,
        saveProfile: saveLedgerProfile,
        subscribeProfile: subscribeLedgerProfile,
        syncGuestProfile: syncGuestLedgerProfileToUser
      }}
      renderOnboarding={({ profile, onComplete }) => (
        <LedgerOnboarding
          initialProfile={profile}
          initialBaseContext={baseContext}
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
      renderDashboard={({ profile }) => {
        const handleToggleDocumentAnalysis = async (enabled: boolean) => {
          if (!profile) return;
          const updated: LedgerIntakeProfile = {
            ...profile,
            documentAnalysisEnabled: enabled,
            updatedAt: new Date().toISOString()
          };
          await saveLedgerProfile(updated, { userId: user?.uid, encryptionKey: null });
        };

        return (
          <LedgerDashboard
            soul={globalSoul}
            profile={profile}
            onAnalyzeDocument={async () => {}}
            onToggleDocumentAnalysis={handleToggleDocumentAnalysis}
            isLocked={isLocked}
          />
        );
      }}
      renderContent={LedgerContent}
    />
  );
}
