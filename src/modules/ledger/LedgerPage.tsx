import React, { useEffect, useMemo, useCallback, useRef } from 'react';
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
import { BarChart3 } from 'lucide-react';
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
      renderDashboard={({ profile }) => (
        <LedgerDashboard soul={globalSoul} profile={profile} isLocked={isLocked} />
      )}
      renderContent={({ profile, encryptionKey }) => {
        const agentAlias = globalSoul?.displayNames?.ledger || 'Ledger';
        const plannerBootstrappedRef = useRef(false);

        const { messages, setMessages, isProcessing, streamingText, error, quota, handleSendMessage } = useModuleAI({
          moduleId: 'ledger',
          systemPrompt: LEDGER_PERSONA,
          encryptionKey
        });

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
            import('@/lib/services/nyx-handoff-service').then(({ NyxHandoffService }) => {
                NyxHandoffService.store({
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

        return (
          <NexusChat
            moduleId="ledger"
            ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage: handleLedgerMessage }}
            agentName={agentAlias}
            themeColor="cyan"
            authMode="ledger"
            placeholder="Ask for budgeting, debt strategy, cashflow planning, or savings optimization..."
            renderCustomActions={() => (
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
            )}
          />
        );
      }}
    />
  );
}
