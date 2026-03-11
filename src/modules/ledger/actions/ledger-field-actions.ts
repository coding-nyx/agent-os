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
import type { ConversationContext } from '@/lib/ai-adapters/engine-types';
import {
  validateFieldValue,
  LEDGER_VALIDATION_CONTEXT,
} from '../services/ledger-field-validator';

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
  | 'FIELD_VALUE_UPDATED'
  | 'TRANSACTION_CREATED'
  | 'TRANSACTION_UPDATED'
  | 'TRANSACTION_DELETED'
  | 'BUDGET_CREATED'
  | 'BUDGET_MODIFIED'
  | 'GOAL_CREATED'
  | 'GOAL_COMPLETED'
  | 'FINANCIAL_HEALTH_CHECK'
  | 'RISK_DETECTED';

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

    case 'TRANSACTION_CREATED':
      return {
        title: 'Transaction Added',
        description: `${String(data.transactionType || 'New')} transaction: ${String(data.description || 'Untitled')}`,
        variant: 'success',
        icon: 'Plus',
        duration: 3000,
      };

    case 'TRANSACTION_UPDATED':
      return {
        title: 'Transaction Updated',
        description: `${String(data.transactionType || 'Transaction')} updated: ${String(data.description || 'Untitled')}`,
        variant: 'info',
        icon: 'Edit',
        duration: 3000,
      };

    case 'TRANSACTION_DELETED':
      return {
        title: 'Transaction Deleted',
        description: `${String(data.transactionType || 'Transaction')} deleted: ${String(data.description || 'Untitled')}`,
        variant: 'warning',
        icon: 'Trash2',
        duration: 3000,
      };

    case 'BUDGET_CREATED':
      return {
        title: 'Budget Created',
        description: `${String(data.budgetName || 'New Budget')} created with ${String(data.period || 'Monthly')} period`,
        variant: 'success',
        icon: 'BarChart3',
        duration: 4000,
      };

    case 'BUDGET_MODIFIED':
      return {
        title: 'Budget Modified',
        description: `${String(data.budgetName || 'Budget')} modified: ${String(data.changeSummary || 'Changes applied')}`,
        variant: 'info',
        icon: 'Edit',
        duration: 3000,
      };

    case 'GOAL_CREATED':
      return {
        title: 'Goal Created',
        description: `${String(data.goalName || 'New Goal')} created: ${String(data.targetAmount || 'Target')} by ${String(data.targetDate || 'Target Date')}`,
        variant: 'success',
        icon: 'Target',
        duration: 4000,
      };

    case 'GOAL_COMPLETED':
      return {
        title: 'Goal Completed',
        description: `${String(data.goalName || 'Goal')} completed! ${String(data.achievement || 'Achievement')} achieved`,
        variant: 'success',
        icon: 'Award',
        duration: 5000,
      };

    case 'FINANCIAL_HEALTH_CHECK':
      return {
        title: 'Financial Health Check',
        description: `${String(data.healthScore || 'Health Score')}/10 - ${String(data.healthStatus || 'Status')}`,
        variant: 'info',
        icon: 'Activity',
        duration: 4000,
      };

    case 'RISK_DETECTED':
      return {
        title: 'Risk Detected',
        description: `${String(data.riskType || 'Risk Type')}: ${String(data.riskDescription || 'Description')}`,
        variant: 'warning',
        icon: 'AlertTriangle',
        duration: 5000,
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
  'TRANSACTION_CREATED',
  'TRANSACTION_UPDATED',
  'TRANSACTION_DELETED',
  'BUDGET_CREATED',
  'BUDGET_MODIFIED',
  'GOAL_CREATED',
  'GOAL_COMPLETED',
  'FINANCIAL_HEALTH_CHECK',
  'RISK_DETECTED',
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


}

// ============================================================================
// LLM sendMessage adapter
// ============================================================================

/**
 * Converts the full ActionContext.sendMessage signature into the lightweight
 * `(prompt: string) => Promise<string>` interface expected by the field
 * validator.  Returns `undefined` when sendMessage is not available so the
 * validator can fall back to keyword heuristics immediately.
 */
function buildSendMessageAdapter(
  sendMessage: ActionContext['sendMessage'],
): ((prompt: string) => Promise<string>) | undefined {
  if (!sendMessage) return undefined;

  return async (prompt: string): Promise<string> => {
    const context: ConversationContext = {
      systemPrompt:
        'You are a financial data validator. Respond with valid JSON only. No markdown.',
      memoryContext: [],
      summary: '',
      history: [],
    };
    const { response } = await sendMessage(prompt, context);
    return response.fullText;
  };
}

// ============================================================================
// set_field_value handler
// ============================================================================

/**
 * Handle set_field_value action — validates a custom field value via LLM
 * semantic analysis (with keyword fallback) before accepting it.
 *
 * Payload shape:
 *   { fieldId: string; value: string; fieldName?: string }
 *
 * On validation failure the action is silently dropped (consistent with how
 * other handlers in this file behave on bad input) and a warning is logged.
 * On success a FIELD_VALUE_UPDATED Spine event is emitted.
 */
async function handleSetFieldValue(context: ActionContext): Promise<void> {
  const { payload, emitSpineEvent, sendMessage } = context;

  const fieldId = String(payload.fieldId ?? payload.id ?? '');
  const value = String(payload.value ?? '');
  // Caller may provide fieldName as a hint; we prefer the registry name when
  // the field is found so the validator works with the canonical label.
  const hintName = String(payload.fieldName ?? payload.name ?? '');

  if (!fieldId) {
    console.warn('[Ledger] set_field_value: missing fieldId');
    return;
  }

  // Resolve the canonical field name from the schema registry when possible.
  const extensions = SchemaRegistry.getExtensions('ledger');
  const fieldDef = extensions.find((f) => f.id === fieldId);
  const fieldName = fieldDef?.name ?? hintName;

  if (!fieldName) {
    console.warn(
      `[Ledger] set_field_value: field "${fieldId}" not found and no fieldName hint provided`,
    );
    return;
  }

  const sendMessageAdapter = buildSendMessageAdapter(sendMessage);
  const result = await validateFieldValue(
    fieldName,
    value,
    LEDGER_VALIDATION_CONTEXT,
    sendMessageAdapter,
  );

  if (!result.valid) {
    console.warn(
      `[Ledger] set_field_value: validation failed for "${fieldName}": ${result.reason ?? 'invalid value'} (source: ${result.source})`,
    );
    return;
  }

  // Use LLM-corrected value if provided, otherwise keep the original.
  const finalValue = result.correctedValue ?? value;

  emitSpineEvent('FIELD_VALUE_UPDATED', {
    moduleId: 'ledger',
    fieldId,
    fieldName,
    value: finalValue,
    validationSource: result.source,
  });

}

// ============================================================================
// Registration
// ============================================================================

let fieldActionsRegistered = false;
let transactionActionsRegistered = false;

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
    set_field_value: handleSetFieldValue,
    update_financial_friction: handleUpdateFinancialFriction,
    compute_resonance_roi: handleComputeResonanceROI,
  });


}

// ---------------------------------------------------------------------------
// Stub handlers for transaction / budget / goal operations.
// Full implementations live in transaction-actions.ts; these stubs satisfy
// the ActionHub registration below without creating a circular import.
// ---------------------------------------------------------------------------
 
const handleCreateTransaction = async (_ctx: unknown): Promise<void> => {};
const handleUpdateTransaction = async (_ctx: unknown): Promise<void> => {};
const handleDeleteTransaction = async (_ctx: unknown): Promise<void> => {};
const handleCreateBudget = async (_ctx: unknown): Promise<void> => {};
const handleModifyBudget = async (_ctx: unknown): Promise<void> => {};
const handleCreateGoal = async (_ctx: unknown): Promise<void> => {};
const handleUpdateGoalProgress = async (_ctx: unknown): Promise<void> => {};
const handleCompleteGoal = async (_ctx: unknown): Promise<void> => {};
const handleFinancialHealthCheck = async (_ctx: unknown): Promise<void> => {};
const handleDetectRisk = async (_ctx: unknown): Promise<void> => {};
 

/**
 * Register Ledger transaction + budget + goal actions with ActionHub.
 * Safe to call multiple times — idempotent.
 */
export function registerLedgerTransactionActions(): void {
  if (transactionActionsRegistered) return;
  transactionActionsRegistered = true;

  ActionHub.registerMultiple('ledger', {
    create_transaction: handleCreateTransaction,
    update_transaction: handleUpdateTransaction,
    delete_transaction: handleDeleteTransaction,
    create_budget: handleCreateBudget,
    modify_budget: handleModifyBudget,
    create_goal: handleCreateGoal,
    update_goal_progress: handleUpdateGoalProgress,
    complete_goal: handleCompleteGoal,
    financial_health_check: handleFinancialHealthCheck,
    detect_risk: handleDetectRisk
  });


}
