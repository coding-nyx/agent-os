import React, { useMemo, useState } from 'react';
import { GuidedIntakeFrame } from '@/core/intake/GuidedIntakeFrame';
import { GuidedChatSpec } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { NexusChat } from '@/core/components/NexusChat';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StructuredResponse } from '@/llm-engine/engine/types';
import { useAuth } from '@/lib/auth-context';
import { LedgerIntakeProfile, createEmptyLedgerProfile } from '../services/ledger-intake-service';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { mergeNSVPatch } from '@/lib/services/nsv-service';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { buildCalibrationPrompt } from '@/lib/services/nsv-ownership';

interface LedgerOnboardingProps {
  initialProfile?: LedgerIntakeProfile | null;
  initialBaseContext?: GlobalBaseIntakeContext;
  onGlobalBaseContextFinalize?: (context: GlobalBaseIntakeContext) => Promise<void> | void;
  onComplete: (profile: LedgerIntakeProfile) => void;
}

type LedgerIntakeState = {
  profile: LedgerIntakeProfile;
  baseContext: GlobalBaseIntakeContext;
  stepProgress: number;
};

const LEDGER_ONBOARDING_PROMPT = `
IDENTITY:
You are Ledger Intake Agent.
You collect a concise financial baseline before planning mode begins.

OBJECTIVE:
Collect in sequence:
1. Confirm Nexus handoff context (name/pronouns/occupation/sleep) if present.
2. Monthly income and preferred currency.
3. Fixed and variable expense categories.
4. Debt obligations and savings goals.
5. Preferred planning horizon (monthly/quarterly/yearly) and summary.

ACTION TAGS:
- <action type="update_ledger_profile">{"currency":"USD","monthlyIncome":0,"fixedExpenses":[],"variableExpenses":[],"debtItems":[],"savingsGoals":[],"planningHorizon":"monthly","summary":"..."}</action>
- <action type="update_global_base_context">{"name":"...","pronouns":"...","occupation":"...","typicalSleepHours":7}</action>
- After collecting baseline vitals, emit a bulk update (only once the user has provided actual data):
  <action type="sync_vitals">{"resource":{"financialFriction":null,"resonanceROI":null}}</action>
- Sync the UI stage with your current conversational focus by emitting:
  <action type="focus_income">{}</action> (Step 0)
  <action type="focus_expenses">{}</action> (Step 1)
  <action type="focus_debt_goals">{}</action> (Step 2)
  <action type="focus_plan_horizon">{}</action> (Step 3)
- <action type="complete_ledger_onboarding">{}</action>

RULES:
- Ask short direct questions.
- Emit the relevant focus action whenever you move to a new intake section or if the user redirects you.
- Validate values and keep assumptions explicit.
- No investment/legal advice.
`.trim();

const LEDGER_STEPS = [
  {
    key: 'income',
    label: 'Income & Currency',
    helperText: 'Capture monthly income and primary currency.'
  },
  {
    key: 'expenses',
    label: 'Expense Map',
    helperText: 'Capture fixed and variable spend categories.'
  },
  {
    key: 'debt_goals',
    label: 'Debt & Goals',
    helperText: 'Capture debt pressure and savings targets.'
  },
  {
    key: 'plan_horizon',
    label: 'Planning Horizon',
    helperText: 'Set monthly, quarterly, or yearly planning mode.'
  }
] as const;

function hasBaseContext(context: GlobalBaseIntakeContext): boolean {
  return Boolean(context.name || context.pronouns || context.occupation || typeof context.typicalSleepHours === 'number');
}

function buildBasePrompt(context: GlobalBaseIntakeContext): string {
  const chunks = [
    context.name ? `name as ${context.name}` : null,
    context.pronouns ? `pronouns as ${context.pronouns}` : null,
    context.occupation ? `occupation as ${context.occupation}` : null,
    typeof context.typicalSleepHours === 'number' ? `typical sleep around ${context.typicalSleepHours} hours/night` : null
  ].filter(Boolean);

  if (chunks.length === 0) {
    return 'Ledger intake initialized. What is your monthly income and preferred currency?';
  }

  return `Nexus handoff received. I have your ${chunks.join(', ')}. Is that correct before we start financial intake?`;
}

export function LedgerOnboarding({
  initialProfile,
  initialBaseContext,
  onGlobalBaseContextFinalize,
  onComplete
}: LedgerOnboardingProps) {
  const { user } = useAuth();
  const initialContext = useMemo(() => initialBaseContext ?? {}, [initialBaseContext]);

  const [fastCurrency, setFastCurrency] = useState('');
  const [fastIncome, setFastIncome] = useState('');
  const [fastFixedExpenses, setFastFixedExpenses] = useState('');
  const [fastVariableExpenses, setFastVariableExpenses] = useState('');
  const [fastDebt, setFastDebt] = useState('');
  const [fastSavingsGoal, setFastSavingsGoal] = useState('');
  const [fastHorizon, setFastHorizon] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');

  const handleFastTrack = () => {
    if (!fastCurrency.trim() || !fastIncome.trim()) return;
    const income = Number.parseFloat(fastIncome);
    if (!Number.isFinite(income) || income < 0) return;
    const now = new Date().toISOString();
    const fixedExpenses = fastFixedExpenses.trim()
      ? fastFixedExpenses.split(',').map((s, i) => ({ id: `ft-fix-${i}`, label: s.trim(), amount: 0 })).filter(e => e.label)
      : [];
    const variableExpenses = fastVariableExpenses.trim()
      ? fastVariableExpenses.split(',').map((s, i) => ({ id: `ft-var-${i}`, label: s.trim(), amount: 0 })).filter(e => e.label)
      : [];
    const debtItems = fastDebt.trim()
      ? fastDebt.split(',').map((s, i) => ({ id: `ft-debt-${i}`, name: s.trim(), balance: 0, minPayment: 0 })).filter(d => d.name)
      : [];
    const savingsGoals = fastSavingsGoal.trim()
      ? fastSavingsGoal.split(',').map((s, i) => ({ id: `ft-sav-${i}`, name: s.trim(), targetAmount: 0 })).filter(g => g.name)
      : [];
    const profile: LedgerIntakeProfile = {
      onboardingComplete: true,
      currency: fastCurrency.trim().toUpperCase(),
      monthlyIncome: income,
      fixedExpenses,
      variableExpenses,
      debtItems,
      savingsGoals,
      planningHorizon: fastHorizon,
      summary: `Express onboarding: ${fastCurrency.trim().toUpperCase()} ${income}/mo, ${fastHorizon} horizon.`,
      plans: [],
      activePlanId: null,
      plannerBotState: 'idle',
      createdAt: now,
      updatedAt: now
    };
    onComplete(profile);
  };

  const spec = useMemo<GuidedChatSpec<LedgerIntakeState>>(
    () => ({
      initialState: {
        profile: initialProfile ?? createEmptyLedgerProfile(),
        baseContext: initialContext,
        stepProgress: 0
      },
      initialMessages: [
        {
          role: 'assistant',
          content: buildBasePrompt(initialContext)
        }
      ],
      initialStep: 0,
      steps: [...LEDGER_STEPS],
      summary: 'Ledger finance onboarding intake.',
      placeholder: 'Share your financial baseline...',
      buildContext: (state, history) => ({
        systemPrompt: `${LEDGER_ONBOARDING_PROMPT}
[PREFILLED_BASE_CONTEXT]
- Name: ${state.baseContext.name || 'Unknown'}
- Pronouns: ${state.baseContext.pronouns || 'Unknown'}
- Occupation: ${state.baseContext.occupation || 'Unknown'}
- Typical Sleep Hours: ${
          typeof state.baseContext.typicalSleepHours === 'number' ? state.baseContext.typicalSleepHours : 'Unknown'
        }
${hasBaseContext(state.baseContext) ? '- IMPORTANT: Do NOT ask for name or pronouns again if they are already known in this context. Move directly to the next missing piece of information.' : ''}
`,
        memoryContext: [],
        summary: 'Ledger finance onboarding intake.',
        history
      }),
      onResponse: async (response, state) => {
        let nextProfile = { ...state.profile };
        let nextBaseContext = { ...state.baseContext };
        let nextStep = state.stepProgress;

        const focusAction = [...response.actions].reverse().find((a) =>
          ['focus_income', 'focus_expenses', 'focus_debt_goals', 'focus_plan_horizon'].includes(a.type)
        );
        let explicitFocus: number | undefined;
        if (focusAction) {
          if (focusAction.type === 'focus_income') explicitFocus = 0;
          if (focusAction.type === 'focus_expenses') explicitFocus = 1;
          if (focusAction.type === 'focus_debt_goals') explicitFocus = 2;
          if (focusAction.type === 'focus_plan_horizon') explicitFocus = 3;
        }

        const updatePayloads = response.actions
          .filter(a => a.type === 'update_ledger_profile')
          .map(a => a.payload as Partial<LedgerIntakeProfile>);

        if (updatePayloads.length > 0) {
          for (const parsed of updatePayloads) {
            nextProfile = {
              ...nextProfile,
              ...parsed,
              updatedAt: new Date().toISOString()
            };
          }
        }

        // Use explicit focus if provided, otherwise move forward based on context updates
        if (explicitFocus !== undefined) {
          nextStep = explicitFocus;
        }

        const baseContextUpdates = response.actions
          .filter(a => a.type === 'update_global_base_context')
          .map(a => a.payload as Partial<GlobalBaseIntakeContext>);

        if (baseContextUpdates.length > 0) {
          for (const parsed of baseContextUpdates) {
            if (typeof parsed.name === 'string' && parsed.name.trim()) nextBaseContext.name = parsed.name.trim();
            if (typeof parsed.pronouns === 'string' && parsed.pronouns.trim())
              nextBaseContext.pronouns = parsed.pronouns.trim();
            if (typeof parsed.occupation === 'string' && parsed.occupation.trim())
              nextBaseContext.occupation = parsed.occupation.trim();
            if (
              typeof parsed.typicalSleepHours === 'number' &&
              Number.isFinite(parsed.typicalSleepHours) &&
              parsed.typicalSleepHours > 0 &&
              parsed.typicalSleepHours <= 24
            ) {
              nextBaseContext.typicalSleepHours = parsed.typicalSleepHours;
            }
          }
        }

        const completed = response.actions.some(a => a.type === 'complete_ledger_onboarding');
        if (completed) {
          nextProfile.onboardingComplete = true;
          nextProfile.updatedAt = new Date().toISOString();
          nextStep = LEDGER_STEPS.length - 1;
        }

        const rawVitalsPayload = response.actions
          .filter((action) => action.type === 'sync_vitals')
          .map((action) => action.payload as any);

        let vitalsPatch: Record<string, any> = {};
        if (rawVitalsPayload.length > 0) {
           const payload = rawVitalsPayload[rawVitalsPayload.length - 1]; // Take the latest sync
           if (payload && payload.resource) {
              vitalsPatch = { resource: {} };
              if (typeof payload.resource.financialFriction === 'number') vitalsPatch.resource.financialFriction = payload.resource.financialFriction;
              if (typeof payload.resource.resonanceROI === 'number') vitalsPatch.resource.resonanceROI = payload.resource.resonanceROI;
           }
        }

        if (user?.uid && Object.keys(vitalsPatch).length > 0 && Object.keys(vitalsPatch.resource || {}).length > 0) {
          await GlobalProjectionService.updateCrossFunctionalState(user.uid, vitalsPatch as any).catch((e) => {
            console.error('Ledger onboarding sync_vitals failed:', e);
          });
        }
        if (completed && Object.keys(vitalsPatch).length === 0) {
          NexusHandoffService.store({
            moduleId: 'ledger',
            type: 'delegate',
            content: buildCalibrationPrompt('ledger'),
            reason: 'calibration_request',
            sourceModuleId: 'ledger',
            createdAt: new Date().toISOString()
          });
        }

        return {
          nextState: {
            profile: nextProfile,
            baseContext: nextBaseContext,
            stepProgress: nextStep
          },
          nextStep,
          completed
        };
      }
    }),
    [initialContext, initialProfile]
  );

  const intake = useGuidedChatIntake({
    spec,
    onComplete: async (state) => {
      if (onGlobalBaseContextFinalize) {
        await onGlobalBaseContextFinalize(state.baseContext);
      }
      onComplete({ ...state.profile, onboardingComplete: true });
    }
  });

  return (
    <GuidedIntakeFrame
      title="Ledger Finance Intake"
      subtitle="Collecting your cashflow baseline before automated planning." 
      statusLabel="FINANCE_BASELINE"
      steps={[...LEDGER_STEPS]}
      currentStep={intake.stepIndex}
      themeColor="cyan"
      prelude={
        <div className="p-4 md:p-6 flex flex-col gap-4 border-b border-cyan-500/20 bg-cyan-500/5">
          <div className="flex-1 w-full space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400 flex items-center gap-2">
              <Zap className="w-3 h-3" /> Fast Track Initialization
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  placeholder="Currency (e.g., USD, EUR, INR)"
                  value={fastCurrency}
                  onChange={e => setFastCurrency(e.target.value)}
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-cyan-500/50"
                />
                <input
                  type="number"
                  placeholder="Monthly Income"
                  value={fastIncome}
                  onChange={e => setFastIncome(e.target.value)}
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-cyan-500/50"
                />
                <input
                  placeholder="Fixed expenses (e.g., rent, insurance)"
                  value={fastFixedExpenses}
                  onChange={e => setFastFixedExpenses(e.target.value)}
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-cyan-500/50"
                />
                <input
                  placeholder="Variable expenses (e.g., groceries, dining)"
                  value={fastVariableExpenses}
                  onChange={e => setFastVariableExpenses(e.target.value)}
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-cyan-500/50"
                />
                <input
                  placeholder="Debt (e.g., student loan, credit card)"
                  value={fastDebt}
                  onChange={e => setFastDebt(e.target.value)}
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-cyan-500/50"
                />
                <input
                  placeholder="Savings goals (e.g., emergency fund)"
                  value={fastSavingsGoal}
                  onChange={e => setFastSavingsGoal(e.target.value)}
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
              <div>
                <p className="text-[9px] text-white/40 uppercase tracking-wider mb-2">Planning Horizon</p>
                <div className="flex gap-2 flex-wrap">
                  {(['monthly', 'quarterly', 'yearly'] as const).map(h => (
                    <button
                      key={h}
                      onClick={() => setFastHorizon(h)}
                      className={cn(
                        'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all',
                        fastHorizon === h
                          ? 'bg-cyan-600/30 border-cyan-500/50 text-cyan-300'
                          : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
                      )}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleFastTrack}
                  disabled={!fastCurrency.trim() || !fastIncome.trim()}
                  className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center whitespace-nowrap"
                >
                  Execute
                </button>
              </div>
            </div>
            <p className="text-[9px] text-white/40 uppercase tracking-tight">
              Bypass conversational intake. Requires currency and income.
            </p>
          </div>
        </div>
      }
    >
      <NexusChat
        ai={{
          messages: intake.messages,
          isProcessing: intake.isProcessing,
          streamingText: intake.streamingText,
          error: intake.error,
          quota: null,
          handleSendMessage: intake.handleSendMessage
        }}
        agentName="Ledger Intake"
        themeColor="cyan"
        placeholder={spec.placeholder}
        showInternalSignals={false}
      />
    </GuidedIntakeFrame>
  );
}
