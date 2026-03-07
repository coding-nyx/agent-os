import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { LedgerDashboard } from './components/LedgerDashboard';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { NexusChat } from '@/core/components/NexusChat';
import { LedgerOnboarding } from './onboarding/LedgerOnboarding';
import { ImageCaptureModal } from '@/core/components/ImageCaptureModal';
import { NeuralModal } from '@/core/components/NeuralModal';
import { BarChart3 } from 'lucide-react';
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

registerLedgerActions();

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

  const agentAlias = globalSoul?.displayNames?.ledger || 'Ledger';
  const plannerBootstrappedRef = useRef(false);

  const { messages, setMessages, isProcessing, streamingText, error, quota, handleSendMessage } = useModuleAI({
    moduleId: 'ledger',
    systemPrompt: LEDGER_PERSONA,
    encryptionKey
  });

  // Vision analysis state for financial documents
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [isVisionAnalyzing, setIsVisionAnalyzing] = useState(false);
  const [visionReviewData, setVisionReviewData] = useState<Record<string, unknown> | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  const handleDocumentCapture = useCallback(
    async (dataUrl: string) => {
      setIsVisionAnalyzing(true);
      try {
        // Check API key availability
        const apiKey = localStorage.getItem('openrouter_api_key') || process.env.REACT_APP_OPENROUTER_KEY;
        if (!apiKey) {
          await handleSendMessage('I need an OpenRouter API key to analyze financial documents. Please set your API key in settings.');
          setIsCaptureModalOpen(false);
          return;
        }

        // Check if model supports vision (use default GPT-4o for vision analysis)
        const modelId = 'openai/gpt-4o';
        if (!ModelRegistry.isVisionCapable(modelId)) {
          await handleSendMessage('Document analysis requires a vision-capable model. GPT-4o will be used for this analysis.');
        }

        const result = await analyzeImageWithVision(dataUrl, 'financial_document', apiKey, modelId);
        if (!result.success) {
          await handleSendMessage(`Financial document analysis failed: ${result.error}`);
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
    [handleSendMessage]
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

    await handleSendMessage(prompt);
    setIsReviewModalOpen(false);
    setVisionReviewData(null);
  }, [visionReviewData, handleSendMessage]);

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
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content:
          `No active plan was found. I created a starter financial plan and activated planner mode. ` +
          `Tell me what constraint to optimize first: debt reduction, savings speed, or monthly cashflow.`
      }
    ]);
  }, [profile, setMessages, persistUpdate]);

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
    if (messages.length === 0 && !isProcessing && !streamingText && profile?.onboardingComplete && profile.activePlanId) {
      setMessages([
        {
          role: 'assistant',
          content:
            `Resource link active. I am ${agentAlias}. I optimize your budget, spending strategy, and plan execution. ` +
            `What should we optimize first this week?`
        }
      ]);
    }
  }, [messages.length, isProcessing, streamingText, agentAlias, setMessages, profile?.onboardingComplete, profile?.activePlanId]);

  const handleLedgerMessage = useCallback(async (content: string) => {
    const medicalIntent = /\b(symptom|diagnosis|doctor|medication|lab|biomarker|hormone|pain|clinical)\b/i.test(content);
    if (medicalIntent) {
      const redirectText =
        'Ledger is dedicated to financial planning. I routed your medical query to Soma domain. Open Soma for clinical guidance.';
      setMessages((prev) => [...prev, { role: 'user', content }, { role: 'assistant', content: redirectText }]);
      import('@/lib/spine/spine-event-bus').then(({ Spine }) => {
          Spine.emit({
            type: 'MODULE_DELEGATED',
            source: 'ledger',
            target: 'soma',
            domain: 'system',
            data: { content, reason: 'medical_query_in_finance_module' },
            cascadeDepth: 0,
            priority: 'info'
          });
      });
      import('@/lib/services/nexus-handoff-service').then(({ NexusHandoffService }) => {
          NexusHandoffService.store({
            moduleId: 'soma',
            type: 'delegate',
            content,
            reason: 'medical_query_in_finance_module',
            sourceModuleId: 'ledger',
            createdAt: new Date().toISOString()
          });
      });
      return;
    }
    await handleSendMessage(content);
  }, [handleSendMessage, setMessages]);

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

      <NexusChat
        moduleId="ledger"
        ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage: handleLedgerMessage }}
        agentName={agentAlias}
        themeColor="cyan"
        authMode="ledger"
        placeholder="Ask for budgeting, debt strategy, cashflow planning, or savings optimization..."
        renderCustomActions={() => (
          <div className="flex gap-3">
            <button
              onClick={() => setIsCaptureModalOpen(true)}
              className="flex flex-col items-center justify-center gap-3 p-4 rounded-2xl bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 transition-all group"
            >
              <BarChart3 className="w-6 h-6 text-violet-400 group-hover:scale-110 transition-transform" />
              <span className="text-[8px] font-black uppercase tracking-widest text-violet-400/60">Analyze Statement</span>
            </button>

            <button
              onClick={() => {
                 const input = document.createElement('input');
                 input.type = 'file';
                 input.accept = '.csv,.txt';
                 input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (re) => {
                         const text = re.target?.result as string;
                         handleLedgerMessage(`CSV Import received: ${file.name}. Content: ${text || 'FILE_EMPTY'}`);
                      };
                      reader.readAsText(file);
                    }
                 };
                 input.click();
              }}
              className="flex flex-col items-center justify-center gap-3 p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all group"
            >
              <BarChart3 className="w-6 h-6 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span className="text-[8px] font-black uppercase tracking-widest text-cyan-400/60">Import CSV Data</span>
            </button>
          </div>
        )}
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
