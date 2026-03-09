import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { SingleAgentLayout } from '@/core/layout/SingleAgentLayout';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { NeuralTabGroup, NeuralTabItem } from '@/core/components/NeuralTabGroup';
import { SectionHeader } from '@/core/components/SectionHeader';
import { BarChart3, Camera, FileUp, FolderOpen, LayoutDashboard, Receipt, PieChart, Target, Database } from 'lucide-react';
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
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { registerDiagnosisSpec } from '@/core/diagnosis/diagnosis-registry';
import { ledgerDiagnosisSpec } from './diagnosis/ledger-diagnosis-spec';

registerDiagnosisSpec(ledgerDiagnosisSpec);

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

type LedgerMainTab = 'dashboard' | 'workspace';

function LedgerContent({ profile, encryptionKey }: { profile: LedgerIntakeProfile | null; encryptionKey: CryptoKey | null }) {
  const { globalSoul } = useGlobalSoul();
  const { user, isGuest } = useAuth();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('ledger');
  const navigate = useNavigate();

  const agentAlias = globalSoul?.displayNames?.ledger || 'Ledger';
  const plannerBootstrappedRef = useRef(false);
  const [activeMainTab, setActiveMainTab] = useState<LedgerMainTab>('dashboard');

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
          ai.handleSendMessage(`CSV Import received: ${file.name}. Content: ${text || 'FILE_EMPTY'}`);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [ai]);

  const mainTabs: NeuralTabItem<LedgerMainTab>[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'workspace', label: 'Workspace', icon: Database },
  ];

  return (
    <SingleAgentLayout
      moduleId="ledger"
      agentName={agentAlias}
      themeColor="cyan"
      ai={ai}
      authMode="ledger"
      placeholder="Ask for budgeting or savings optimization..."
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
            activeTab={activeMainTab}
            onTabChange={setActiveMainTab}
            themeColor="cyan"
          />
          
          <div className="flex gap-2">
            <button onClick={() => setIsCaptureModalOpen(true)} className="p-1.5 md:p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 text-violet-400 transition-all"><Camera size={14} className="md:w-4 md:h-4" /></button>
            <button onClick={handleImportCsv} className="p-1.5 md:p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 text-cyan-400 transition-all"><FileUp size={14} className="md:w-4 md:h-4" /></button>
            <button onClick={handleOpenDocuments} className="p-1.5 md:p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 transition-all"><FolderOpen size={14} className="md:w-4 md:h-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar pt-4 md:pt-6 pb-20">
          {activeMainTab === 'dashboard' ? (
            <LedgerDashboard
              soul={globalSoul}
              profile={profile}
              isLocked={isLocked}
              onToggleDocumentAnalysis={async (enabled) => {
                if (!profile) return;
                persistUpdate({ ...profile, documentAnalysisEnabled: enabled });
              }}
            />
          ) : (
            <div className="px-4 md:px-8">
              <LedgerWorkspace
                profile={profile!}
                onUpdateProfile={(updates) => {
                  if (!profile) return;
                  persistUpdate({ ...profile, ...updates });
                }}
              />
            </div>
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
