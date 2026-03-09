/**
 * Ledger Module — Field CRUD Action Registration
 *
 * Registers Ledger field CRUD actions with ActionHub, defines Spine event types,
 * toast templates, action filtering per scope, and Financial Friction computation.
 *
 * Architecture rules:
 *   - Actions registered via ActionHub.registerMultiple('ledger', {...})
 *   - Spine events emitted after successful action execution
 *   - Action filtering prevents hallucinated out-of-scope actions at runtime
 *   - Financial Friction is a cross-module signal written to NSV
 *   - All monetary actions respect user's currency setting
 */

import { ActionHub } from '@/lib/actions/action-hub';
import type { ActionContext } from '@/lib/actions/action-hub';
import { SchemaRegistry } from '@/lib/schema-registry';
import type { FieldDefinition } from '@/lib/field-system/types';
import { FieldType } from '@/lib/field-system/types';
import { LEDGER_SCOPE_ACTIONS } from '@/modules/ledger/prompts/ledger-prompt-builder';
import { getFrictionTier } from '@/modules/ledger/field-templates';
import type { FrictionTier } from '@/modules/ledger/field-templates';

// ============================================================================
// Spine Event Types
// ============================================================================

export type LedgerSpineEventType =
  | 'BUDGET_UPDATED'
  | 'GOAL_PROGRESS'
  | 'FINANCIAL_FRICTION_CHANGED'
  | 'RESONANCE_ROI_UPDATED'
  | 'FINANCIAL_PLAN_CREATED'
  | 'DOCUMENT_ANALYZED'
  | 'FIELD_CREATED'
  | 'FIELD_DELETED'
  | 'FIELD_VALUE_UPDATED';

// ============================================================================
// Toast Templates
// ============================================================================

export interface ToastTemplate {
  title: string;
  description: string;
  variant: 'success' | 'info' | 'warning' | 'error';
  icon: string;
  duration: number;
}

export function buildLedgerToast(
  eventType: LedgerSpineEventType,
  data: Record<string, unknown>,
): ToastTemplate | null {
  switch (eventType) {
    case 'BUDGET_UPDATED':
      return {
        title: 'Budget Updated',
        description:
          data.netCashflow !== undefined
            ? `Net cashflow: ${data.currency ?? 'USD'} ${Number(data.netCashflow).toLocaleString()}`
            : 'Budget snapshot saved',
        variant: 'success',
        icon: 'BarChart3',
        duration: 3000,
      };

    case 'GOAL_PROGRESS':
      return {
        title: `Goal: ${String(data.goalName || 'Updated')}`,
        description: `${Number(data.percentComplete ?? 0).toFixed(0)}% complete — ${Number(data.currentAmount ?? 0).toLocaleString()} of ${Number(data.targetAmount ?? 0).toLocaleString()}`,
        variant: 'success',
        icon: 'Target',
        duration: 3000,
      };

    case 'FINANCIAL_FRICTION_CHANGED': {
      const tier = (data.tier as FrictionTier) || getFrictionTier(Number(data.newScore || 0));
      const variant =
        tier === 'critical'
          ? 'error' as const
          : tier === 'elevated'
            ? 'warning' as const
            : tier === 'moderate'
              ? 'info' as const
              : 'success' as const;
      return {
        title: `Financial Friction: ${data.newScore}/10`,
        description: String(data.analysis || `Tier: ${tier}`),
        variant,
        icon: 'Activity',
        duration: 4000,
      };
    }

    case 'RESONANCE_ROI_UPDATED':
      return {
        title: 'Resonance ROI Updated',
        description: `ROI: ${Number(data.newROI).toFixed(1)}x | Friction: ${data.newFriction}/10`,
        variant: 'info',
        icon: 'Sparkles',
        duration: 3000,
      };

    case 'FINANCIAL_PLAN_CREATED':
      return {
        title: 'Financial Plan Created',
        description: `"${String(data.planTitle || 'New Plan')}" — target: ${Number(data.monthlyTarget || 0).toLocaleString()}/mo`,
        variant: 'success',
        icon: 'FileText',
        duration: 4000,
      };

    case 'DOCUMENT_ANALYZED':
      return {
        title: 'Document Analyzed',
        description: `${String(data.periodLabel || 'Statement')}: ${data.transactionCount || 0} transactions imported`,
        variant: 'success',
        icon: 'FileSearch',
        duration: 3000,
      };

    case 'FIELD_CREATED':
      return {
        title: `Field Added: ${String(data.fieldName || 'Custom Field')}`,
        description: `New ${String(data.fieldType || 'field')} added to Ledger`,
        variant: 'success',
        icon: 'Plus',
        duration: 3000,
      };

    case 'FIELD_DELETED':
      return {
        title: `Field Removed: ${String(data.fieldName || 'Custom Field')}`,
        description: 'Custom field removed from Ledger',
        variant: 'info',
        icon: 'Trash2',
        duration: 3000,
      };

    case 'FIELD_VALUE_UPDATED':
      return {
        title: `${String(data.fieldName || 'Field')} Updated`,
        description: 'Value saved',
        variant: 'success',
        icon: 'Check',
        duration: 2000,
      };

    default:
      return null;
  }
}

export const LEDGER_TOAST_EVENTS: LedgerSpineEventType[] = [
  'BUDGET_UPDATED',
  'GOAL_PROGRESS',
  'FINANCIAL_FRICTION_CHANGED',
  'RESONANCE_ROI_UPDATED',
  'FINANCIAL_PLAN_CREATED',
  'DOCUMENT_ANALYZED',
  'FIELD_CREATED',
  'FIELD_DELETED',
  'FIELD_VALUE_UPDATED',
];

// ============================================================================
// Action Filtering
// ============================================================================

/**
 * Filter an action based on the current conversation scope.
 * Returns true if allowed, false if the action should be silently dropped.
 */
export function isActionAllowed(
  actionType: string,
  scopeKind: keyof typeof LEDGER_SCOPE_ACTIONS,
): boolean {
  const allowed = LEDGER_SCOPE_ACTIONS[scopeKind];
  if (!allowed) {
    console.warn(
      `[Ledger] Unknown scope kind: ${scopeKind}. Blocking action: ${actionType}`,
    );
    return false;
  }
  return allowed.includes(actionType);
}

// ============================================================================
// Financial Friction Computation Helper
// ============================================================================

/**
 * Compute Financial Friction score from profile data.
 * Returns a 0-10 score based on 7 weighted factors.
 * This is a cross-module signal read by Atlas for planning load adjustments.
 */
export function computeFinancialFriction(data: {
  monthlyIncome: number;
  totalExpenses: number;
  totalDebt: number;
  totalSavings: number;
  emergencyFundMonths: number;
  budgetAdherencePercent: number;
  subscriptionTotal: number;
  incomeIsRegular: boolean;
  upcomingLargePayment: boolean;
}): { score: number; tier: FrictionTier; factors: Record<string, number> } {
  const factors: Record<string, number> = {};

  // 1. Cashflow pressure (25%) — 0 if large buffer, 10 if deeply negative
  const cashflowRatio =
    data.monthlyIncome > 0
      ? (data.monthlyIncome - data.totalExpenses) / data.monthlyIncome
      : -1;
  factors.cashflowPressure =
    cashflowRatio >= 0.3 ? 0 : cashflowRatio >= 0.1 ? 3 : cashflowRatio >= 0 ? 5 : Math.min(10, 7 + Math.abs(cashflowRatio) * 3);

  // 2. Debt burden (20%) — DTI ratio
  const annualIncome = data.monthlyIncome * 12;
  const dti = annualIncome > 0 ? data.totalDebt / annualIncome : 10;
  factors.debtBurden =
    dti <= 0.15 ? 0 : dti <= 0.35 ? 3 : dti <= 0.5 ? 5 : Math.min(10, Math.round(dti * 10));

  // 3. Savings adequacy (15%) — emergency fund months
  factors.savingsAdequacy =
    data.emergencyFundMonths >= 6 ? 0 : data.emergencyFundMonths >= 3 ? 3 : data.emergencyFundMonths >= 1 ? 6 : 9;

  // 4. Budget adherence (15%)
  factors.budgetAdherence =
    data.budgetAdherencePercent >= 90 ? 0 : data.budgetAdherencePercent >= 70 ? 3 : data.budgetAdherencePercent >= 50 ? 6 : 9;

  // 5. Subscription creep (10%)
  const subRatio =
    data.monthlyIncome > 0 ? data.subscriptionTotal / data.monthlyIncome : 0;
  factors.subscriptionCreep =
    subRatio <= 0.03 ? 0 : subRatio <= 0.07 ? 3 : subRatio <= 0.12 ? 6 : 9;

  // 6. Income stability (10%)
  factors.incomeStability = data.incomeIsRegular ? 0 : 6;

  // 7. Payment deadline stress (5%)
  factors.paymentDeadline = data.upcomingLargePayment ? 6 : 0;

  // Weighted sum
  const weights = {
    cashflowPressure: 0.25,
    debtBurden: 0.2,
    savingsAdequacy: 0.15,
    budgetAdherence: 0.15,
    subscriptionCreep: 0.1,
    incomeStability: 0.1,
    paymentDeadline: 0.05,
  };

  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    score += (factors[key] ?? 0) * weight;
  }
  score = Math.round(Math.min(10, Math.max(0, score)) * 10) / 10;

  return { score, tier: getFrictionTier(score), factors };
}

// ============================================================================
// Field CRUD Action Handlers
// ============================================================================

const LEDGER_ALLOWED_FIELD_TYPES: FieldType[] = [
  FieldType.NUMBER,
  FieldType.RANGE,
  FieldType.SELECT,
  FieldType.MULTI_SELECT,
  FieldType.DATE,
];

/**
 * Handle suggest_field action — emits an inline suggestion without creating.
 */
async function handleSuggestField(context: ActionContext): Promise<void> {
  const { payload, emitSpineEvent } = context;
  const description = String(payload.description || '');
  const purpose = String(payload.purpose || '');

  if (!description) {
    console.warn('[Ledger] suggest_field: empty description, ignoring');
    return;
  }

  console.log(
    `[Ledger] Field suggestion: "${description}" — purpose: ${purpose}`,
  );

  // The suggestion is shown inline in chat via the response.
  // No Spine event needed — the UI renders the suggestion card from the action tag.
}

/**
 * Handle create_field action — validates and adds to SchemaRegistry.
 */
async function handleCreateField(context: ActionContext): Promise<void> {
  const { payload, emitSpineEvent } = context;

  const fieldId = String(payload.id || payload.fieldId || '');
  const fieldName = String(payload.name || '');
  const fieldType = String(payload.type || 'number') as FieldType;

  if (!fieldId || !fieldName) {
    console.warn('[Ledger] create_field: missing id or name');
    return;
  }

  // Enforce Ledger type restriction
  if (!LEDGER_ALLOWED_FIELD_TYPES.includes(fieldType)) {
    console.warn(
      `[Ledger] create_field: type "${fieldType}" not allowed. Must be NUMBER, RANGE, SELECT, MULTI_SELECT, or DATE.`,
    );
    return;
  }

  const fieldDef: FieldDefinition = {
    id: fieldId,
    name: fieldName,
    type: fieldType,
    description: typeof payload.description === 'string' ? payload.description : undefined,
    required: false,
    defaultValue: payload.defaultValue ?? (fieldType === FieldType.NUMBER ? 0 : undefined),
    validation:
      payload.validation && typeof payload.validation === 'object'
        ? (payload.validation as FieldDefinition['validation'])
        : undefined,
    metadata:
      payload.metadata && typeof payload.metadata === 'object'
        ? (payload.metadata as FieldDefinition['metadata'])
        : { category: 'custom', icon: 'Database' },
    options: Array.isArray(payload.options) ? payload.options as FieldDefinition['options'] : undefined,
  };

  // Structural validation via SchemaRegistry
  const registry = SchemaRegistry;
  const validation = registry.validateExtension('ledger', fieldDef);
  if (!validation.valid) {
    console.warn(
      '[Ledger] create_field: structural validation failed:',
      validation.errors,
    );
    return;
  }

  // Add to registry
  const result = await registry.extendSchema('ledger', [fieldDef]);
  if (!result.valid) {
    console.warn('[Ledger] create_field: extendSchema failed:', result.errors);
    return;
  }

  emitSpineEvent('FIELD_CREATED', {
    moduleId: 'ledger',
    fieldId: fieldDef.id,
    fieldName: fieldDef.name,
    fieldType: fieldDef.type,
  });

  console.log(`[Ledger] Field created: ${fieldDef.id} (${fieldDef.name})`);
}

/**
 * Handle delete_field action — removes from SchemaRegistry.
 */
async function handleDeleteField(context: ActionContext): Promise<void> {
  const { payload, emitSpineEvent } = context;

  const fieldId = String(payload.fieldId || payload.id || '');
  if (!fieldId) {
    console.warn('[Ledger] delete_field: missing fieldId');
    return;
  }

  const registry = SchemaRegistry;
  const extensions = registry.getExtensions('ledger');
  const field = extensions.find((f) => f.id === fieldId);

  if (!field) {
    console.warn(`[Ledger] delete_field: field "${fieldId}" not found`);
    return;
  }

  await registry.removeExtension('ledger', fieldId);

  emitSpineEvent('FIELD_DELETED', {
    moduleId: 'ledger',
    fieldId,
    fieldName: field.name,
  });

  console.log(`[Ledger] Field deleted: ${fieldId} (${field.name})`);
}

/**
 * Handle update_financial_friction action.
 */
async function handleUpdateFinancialFriction(context: ActionContext): Promise<void> {
  const { payload, emitSpineEvent, updateGlobalSoul } = context;

  const score = Number(payload.score);
  const analysis = String(payload.analysis || '');

  if (!Number.isFinite(score) || score < 0 || score > 10) {
    console.warn(`[Ledger] update_financial_friction: invalid score "${payload.score}"`);
    return;
  }

  const tier = getFrictionTier(score);

  // Write to NSV via GlobalSoul
  await updateGlobalSoul({
    resource: {
      financialFriction: score,
    },
  });

  emitSpineEvent('FINANCIAL_FRICTION_CHANGED', {
    moduleId: 'ledger',
    newScore: score,
    analysis,
    tier,
  });

  console.log(`[Ledger] Financial Friction updated: ${score}/10 (${tier})`);
}

/**
 * Handle compute_resonance_roi action.
 */
async function handleComputeResonanceROI(context: ActionContext): Promise<void> {
  const { payload, emitSpineEvent, updateGlobalSoul } = context;

  const financialFriction = Number(payload.financialFriction);
  const resonanceROI = Number(payload.resonanceROI);

  if (!Number.isFinite(financialFriction) || !Number.isFinite(resonanceROI)) {
    console.warn('[Ledger] compute_resonance_roi: invalid values');
    return;
  }

  await updateGlobalSoul({
    resource: {
      financialFriction,
      resonanceROI,
    },
  });

  emitSpineEvent('RESONANCE_ROI_UPDATED', {
    moduleId: 'ledger',
    newROI: resonanceROI,
    newFriction: financialFriction,
  });

  console.log(`[Ledger] Resonance ROI updated: ${resonanceROI}x, Friction: ${financialFriction}/10`);
}

// ============================================================================
// Registration
// ============================================================================

let fieldActionsRegistered = false;

/**
 * Register Ledger field CRUD + financial metric actions with ActionHub.
 * Safe to call multiple times — idempotent.
 */
export function registerLedgerFieldActions(): void {
  if (fieldActionsRegistered) return;
  fieldActionsRegistered = true;

  ActionHub.registerMultiple('ledger', {
    suggest_field: handleSuggestField,
    create_field: handleCreateField,
    delete_field: handleDeleteField,
    update_financial_friction: handleUpdateFinancialFriction,
    compute_resonance_roi: handleComputeResonanceROI,
  });

  console.log('[Ledger] Field CRUD + financial metric actions registered');
}
