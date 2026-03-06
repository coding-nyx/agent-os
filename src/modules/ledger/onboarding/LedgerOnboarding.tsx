import React, { useMemo } from 'react';
import { GuidedIntakeFrame } from '@/core/intake/GuidedIntakeFrame';
import { GuidedChatSpec } from '@/core/intake/types';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { NexusChat } from '@/core/components/NexusChat';
import { StructuredResponse } from '@/llm-engine/engine/types';
import { useAuth } from '@/lib/auth-context';
import { LedgerIntakeProfile, createEmptyLedgerProfile } from '../services/ledger-intake-service';
import { GlobalBaseIntakeContext } from '@/lib/services/intake-base-context-service';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { mergeNSVPatch } from '@/lib/services/nsv-service';
import { NyxHandoffService } from '@/lib/services/nyx-handoff-service';
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
1. Confirm Nyx handoff context (name/pronouns/occupation/sleep) if present.
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

  return `Nyx handoff received. I have your ${chunks.join(', ')}. Is that correct before we start financial intake?`;
}

export function LedgerOnboarding({
  initialProfile,
  initialBaseContext,
  onGlobalBaseContextFinalize,
  onComplete
}: LedgerOnboardingProps) {
  const { user } = useAuth();
  const initialContext = useMemo(() => initialBaseContext ?? {}, [initialBaseContext]);

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
${hasBaseContext(state.baseContext) ? '- Confirm/correct this handoff context briefly first.' : ''}
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

        const vitalsPatch = response.actions
          .filter((action) => action.type === 'sync_vitals')
          .map((action) => action.payload as Partial<any>)
          .reduce((acc, payload) => mergeNSVPatch(acc, payload), {} as any);

        if (user?.uid && Object.keys(vitalsPatch).length > 0) {
          await GlobalProjectionService.updateCrossFunctionalState(user.uid, vitalsPatch).catch((e) => {
            console.error('Ledger onboarding sync_vitals failed:', e);
          });
        }
        if (completed && Object.keys(vitalsPatch).length === 0) {
          NyxHandoffService.store({
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
