/**
 * Atlas Module — Field CRUD Action Registration & Spine Events
 *
 * Registers suggest_field, create_field, delete_field, and update_field_value
 * actions with ActionHub. Emits Spine events for cross-module reactivity.
 *
 * Architecture rules:
 *   - All actions registered via ActionHub.registerMultiple('atlas', {...})
 *   - Spine events propagate via the event bus
 *   - Toast templates provide user feedback
 *   - Action filtering enforces scope boundaries at runtime
 *   - Atlas NEVER emits Spine events for biological/emotional/resource domains
 */

import { ActionHub } from '@/lib/actions/action-hub';
import { SchemaRegistry } from '@/lib/schema-registry';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { FieldDefinition } from '@/lib/field-system/types';
import { FieldType } from '@/lib/field-system/types';
import type { SpineEventType } from '@/lib/types';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { encryptWithKey, decryptWithKey } from '@/lib/encryption';

// ============================================================================
// Atlas Spine Event Constants
// ============================================================================

export const ATLAS_SPINE_EVENTS = {
  // ── Task Events ────────────────────────────────────────────────────────
  TASK_COMPLETED: 'ATLAS_TASK_COMPLETED' as SpineEventType,
  TASK_CREATED: 'ATLAS_TASK_CREATED' as SpineEventType,
  TASK_BLOCKED: 'ATLAS_TASK_BLOCKED' as SpineEventType,
  TASK_UNBLOCKED: 'ATLAS_TASK_UNBLOCKED' as SpineEventType,

  // ── Habit Events ───────────────────────────────────────────────────────
  HABIT_LOGGED: 'ATLAS_HABIT_LOGGED' as SpineEventType,
  HABIT_STREAK_BROKEN: 'HABIT_STREAK_BROKEN' as SpineEventType,
  HABIT_MILESTONE: 'ATLAS_HABIT_MILESTONE' as SpineEventType,

  // ── Goal Events ────────────────────────────────────────────────────────
  GOAL_MILESTONE: 'ATLAS_GOAL_MILESTONE' as SpineEventType,
  GOAL_COMPLETED: 'ATLAS_GOAL_COMPLETED' as SpineEventType,

  // ── Energy Events ──────────────────────────────────────────────────────
  ENERGY_BUDGET_UPDATED: 'ATLAS_ENERGY_UPDATED' as SpineEventType,
  ENERGY_OVERLOAD: 'ATLAS_ENERGY_OVERLOAD' as SpineEventType,
  RECOVERY_WINDOW_CREATED: 'ATLAS_RECOVERY_WINDOW_CREATED' as SpineEventType,

  // ── Field Events ───────────────────────────────────────────────────────
  FIELD_CREATED: 'ATLAS_FIELD_CREATED' as SpineEventType,
  FIELD_DELETED: 'ATLAS_FIELD_DELETED' as SpineEventType,
  FIELD_VALUE_UPDATED: 'ATLAS_FIELD_VALUE_UPDATED' as SpineEventType,
} as const;

// ============================================================================
// Toast Templates
// ============================================================================

/**
 * Toast notification templates for Atlas field actions.
 */
export const ATLAS_FIELD_TOAST_TEMPLATES: Record<
  string,
  (data: Record<string, unknown>) => {
    title: string;
    description: string;
    variant: 'default' | 'success' | 'warning' | 'destructive';
  }
> = {
  create_field: (data) => ({
    title: '📊 Field Created',
    description: `"${data.name || 'Custom field'}" added to your Atlas dashboard.`,
    variant: 'success',
  }),
  delete_field: (data) => ({
    title: '📊 Field Removed',
    description: `"${data.name || 'Custom field'}" removed from your Atlas dashboard.`,
    variant: 'default',
  }),
  suggest_field: (data) => ({
    title: '💡 Field Suggestion',
    description: `Atlas suggests tracking "${data.name || 'a new metric'}".`,
    variant: 'default',
  }),
  update_field_value: (data) => ({
    title: '📊 Field Updated',
    description: `"${data.name || 'Field'}" value updated.`,
    variant: 'success',
  }),

  // ── Task Toasts ────────────────────────────────────────────────────────
  create_task: (data) => ({
    title: '📋 Task Created',
    description: `"${data.title || 'Untitled'}" added to your task list.`,
    variant: 'default',
  }),
  complete_task: (data) => ({
    title: '✅ Task Completed',
    description: `"${data.title || 'Task'}" marked as done.`,
    variant: 'success',
  }),
  delete_task: (data) => ({
    title: '🗑️ Task Removed',
    description: `"${data.title || 'Task'}" has been deleted.`,
    variant: 'default',
  }),
  move_task: (data) => ({
    title: '📅 Task Rescheduled',
    description: `Moved to ${data.newSlot || 'new time slot'}. Reason: ${data.reason || 'rescheduled'}.`,
    variant: 'default',
  }),

  // ── Goal Toasts ────────────────────────────────────────────────────────
  create_goal: (data) => ({
    title: '🎯 Goal Created',
    description: `"${data.title || 'Untitled Goal'}" with ${data.milestoneCount || 0} milestone(s).`,
    variant: 'default',
  }),
  update_goal_progress: (data) => ({
    title: '📈 Goal Progress',
    description: `"${data.goalTitle || 'Goal'}" now at ${data.progressPercent || 0}%.`,
    variant: 'success',
  }),
  delete_goal: (data) => ({
    title: '🗑️ Goal Removed',
    description: `"${data.title || 'Goal'}" has been deleted.`,
    variant: 'default',
  }),

  // ── Habit Toasts ───────────────────────────────────────────────────────
  create_habit: (data) => ({
    title: '🔥 Habit Created',
    description: `"${data.title || 'Untitled Habit'}" — ${data.frequency || 'daily'} tracking activated.`,
    variant: 'default',
  }),
  update_habit_streak: (data) => ({
    title: '🔥 Streak Updated',
    description: `"${data.title || 'Habit'}" — ${data.currentStreak || 0} day streak.`,
    variant: 'success',
  }),
  pause_habit: (data) => ({
    title: '⏸️ Habit Paused',
    description: `"${data.title || 'Habit'}" paused. ${data.resumeDate ? `Resumes ${data.resumeDate}.` : 'Resume when ready.'}`,
    variant: 'default',
  }),
  delete_habit: (data) => ({
    title: '🗑️ Habit Removed',
    description: `"${data.title || 'Habit'}" has been deleted.`,
    variant: 'default',
  }),

  // ── Energy & Recovery Toasts ───────────────────────────────────────────
  update_energy_wave: (data) => ({
    title: '⚡ Energy Wave Updated',
    description: `Energy budget: ${data.energyBudget || '—'}/10, Focus: ${data.focusScore || '—'}/10.`,
    variant: 'default',
  }),
  create_recovery_window: (data) => ({
    title: '🛡️ Recovery Window Created',
    description: `Protected block: ${data.reason || 'recovery'}. Tasks cannot be scheduled here.`,
    variant: 'warning',
  }),
  flatten_schedule: (data) => ({
    title: '📉 Schedule Flattened',
    description: `Load reduced. ${data.tasksDeferred ? `${(data.tasksDeferred as string[]).length} task(s) deferred.` : 'Recovery mode active.'}`,
    variant: 'warning',
  }),

  // ── Schedule Toasts ────────────────────────────────────────────────────
  daily_plan: (data) => ({
    title: '📋 Daily Plan Created',
    description: `Plan for ${data.date || 'today'} with ${data.blockCount || 0} time blocks.`,
    variant: 'success',
  }),
  weekly_review: (data) => ({
    title: '📊 Weekly Review Complete',
    description: `Week of ${data.weekOf || '—'}: ${data.completionRate || 0}% completion rate.`,
    variant: 'success',
  }),
};

/**
 * Get toast template for a given action type.
 */
export function getAtlasToast(
  actionType: string,
  data: Record<string, unknown>
): { title: string; description: string; variant: 'default' | 'success' | 'warning' | 'destructive' } | null {
  const templateFn = ATLAS_FIELD_TOAST_TEMPLATES[actionType];
  if (!templateFn) return null;
  return templateFn(data);
}

// ============================================================================
// Field CRUD Action Registration
// ============================================================================

let fieldActionsRegistered = false;

/**
 * Register Atlas field CRUD actions with ActionHub.
 * Safe to call multiple times — guards against duplicate registration.
 */
export function registerAtlasFieldActions(): void {
  if (fieldActionsRegistered) return;
  fieldActionsRegistered = true;

  ActionHub.registerMultiple('atlas', {
    /**
     * create_field — Create a new extension field for Atlas.
     * Validates structurally via SchemaRegistry (LLM validated domain relevance already).
     */
    create_field: async ({ userId, payload, emitSpineEvent }) => {
      if (!userId) {
        console.warn('[Atlas] create_field: No userId, skipping');
        return;
      }

      const fieldId = typeof payload.id === 'string' ? payload.id : '';
      const fieldName = typeof payload.name === 'string' ? payload.name : '';
      const fieldType = typeof payload.type === 'string' ? payload.type : 'text';

      if (!fieldId || !fieldName) {
        console.warn('[Atlas] create_field: Missing field id or name');
        return;
      }

      const field: FieldDefinition = {
        id: fieldId,
        name: fieldName,
        type: fieldType as FieldType,
        description: typeof payload.description === 'string' ? payload.description : undefined,
        required: false,
        defaultValue: payload.defaultValue ?? undefined,
        validation: typeof payload.validation === 'object' && payload.validation !== null
          ? payload.validation as FieldDefinition['validation']
          : undefined,
        metadata: typeof payload.metadata === 'object' && payload.metadata !== null
          ? payload.metadata as FieldDefinition['metadata']
          : { category: 'custom', icon: 'SlidersHorizontal' },
        options: Array.isArray(payload.options) ? payload.options as FieldDefinition['options'] : undefined,
      };

      // Structural validation via SchemaRegistry
      const result = await SchemaRegistry.extendSchema('atlas', [field]);

      if (!result.valid) {
        console.warn('[Atlas] create_field validation failed:', result.errors);
        return;
      }

      // Persist to Firestore
      try {
        await SchemaRegistry.saveExtensions(userId, 'atlas');
      } catch (saveErr) {
        console.error('[Atlas] Failed to persist extension field:', saveErr);
      }

      // Emit Spine event
      emitSpineEvent(ATLAS_SPINE_EVENTS.FIELD_CREATED, {
        moduleId: 'atlas',
        fieldId: field.id,
        fieldName: field.name,
        fieldType: field.type,
        category: field.metadata?.category || 'custom',
      });
    },

    /**
     * delete_field — Remove an extension field from Atlas.
     */
    delete_field: async ({ userId, payload, emitSpineEvent, encryptionKey }) => {
      if (!userId) {
        console.warn('[Atlas] delete_field: No userId, skipping');
        return;
      }

      const fieldId = typeof payload.fieldId === 'string'
        ? payload.fieldId
        : (typeof payload.id === 'string' ? payload.id : '');

      if (!fieldId) {
        console.warn('[Atlas] delete_field: Missing fieldId');
        return;
      }

      // Get field name before deletion for toast
      const existingExtensions = SchemaRegistry.getExtensions('atlas');
      const deletedField = existingExtensions.find(f => f.id === fieldId);
      const fieldName = deletedField?.name || fieldId;

      try {
        await SchemaRegistry.removeExtension('atlas', fieldId);
        await SchemaRegistry.saveExtensions(userId, 'atlas');
      } catch (err) {
        console.error('[Atlas] Failed to delete extension field:', err);
        return;
      }

      // Clean up any stored field values from the extension_field_values store
      try {
        const dataLayer = getNexusDataLayer();
        type FieldValuesDoc = {
          moduleId: string;
          lastModified: string;
          plainValues?: Record<string, unknown>;
          encryptedValues?: { ciphertext: string; iv: string };
        };
        const stored = await dataLayer.getDocument<FieldValuesDoc>(
          `extension_field_values/${userId}/modules`,
          'atlas'
        );
        if (stored) {
          let dirty = false;
          const updated: FieldValuesDoc = { ...stored, lastModified: new Date().toISOString() };

          if (stored.plainValues && fieldId in stored.plainValues) {
            const newPlain = { ...stored.plainValues };
            delete newPlain[fieldId];
            updated.plainValues = newPlain;
            dirty = true;
          }

          if (stored.encryptedValues && encryptionKey) {
            try {
              const decrypted = await decryptWithKey(stored.encryptedValues, encryptionKey);
              const values = JSON.parse(decrypted) as Record<string, unknown>;
              if (fieldId in values) {
                delete values[fieldId];
                const reEncrypted = await encryptWithKey(JSON.stringify(values), encryptionKey);
                updated.encryptedValues = reEncrypted;
                dirty = true;
              }
            } catch (cryptoErr) {
              console.warn('[Atlas] delete_field: Failed to clean encrypted field value:', cryptoErr);
            }
          }

          if (dirty) {
            await dataLayer.setDocument(
              `extension_field_values/${userId}/modules`,
              'atlas',
              updated
            );
          }
        }
      } catch (cleanupErr) {
        console.warn('[Atlas] delete_field: Failed to clean up orphaned field value:', cleanupErr);
      }

      emitSpineEvent(ATLAS_SPINE_EVENTS.FIELD_DELETED, {
        moduleId: 'atlas',
        fieldId,
        fieldName,
        reason: typeof payload.reason === 'string' ? payload.reason : undefined,
      });
    },

    /**
     * suggest_field — LLM proactively suggests a field.
     * This is a no-op action: it renders an inline suggestion card in chat.
     * The card's "Add" button triggers create_field.
     */
    suggest_field: async ({ payload }) => {
      // This action exists purely for action filtering and toast display.
      // The actual rendering is handled by the chat message parser
      // which detects <action type="suggest_field"> and shows an inline card.

    },

    /**
     * update_field_value — Update the value of an extension field.
     */
    update_field_value: async ({ userId, payload, emitSpineEvent }) => {
      if (!userId) {
        console.warn('[Atlas] update_field_value: No userId, skipping');
        return;
      }

      const fieldId = typeof payload.fieldId === 'string' ? payload.fieldId : '';
      if (!fieldId) {
        console.warn('[Atlas] update_field_value: Missing fieldId');
        return;
      }

      // Type validation against the registered field definition
      const extensions = SchemaRegistry.getExtensions('atlas');
      const field = extensions.find(f => f.id === fieldId);
      if (!field) {
        console.warn(`[Atlas] update_field_value: Field ${fieldId} not found`);
        return;
      }

      if (payload.value !== undefined) {
        if (field.type === FieldType.NUMBER && typeof payload.value !== 'number') {
          console.warn(`[Atlas] update_field_value: Field ${fieldId} expects a number, got ${typeof payload.value}`);
          return;
        }
        if (field.type === FieldType.BOOLEAN && typeof payload.value !== 'boolean') {
          console.warn(`[Atlas] update_field_value: Field ${fieldId} expects a boolean, got ${typeof payload.value}`);
          return;
        }
        if (
          field.type === FieldType.DATE &&
          typeof payload.value === 'string' &&
          isNaN(Date.parse(payload.value))
        ) {
          console.warn(`[Atlas] update_field_value: Field ${fieldId} expects a valid date string`);
          return;
        }
      }

      // Value storage is handled by the FieldsTab component via Firestore.
      // This action exists for LLM-initiated value updates and Spine event emission.
      emitSpineEvent(ATLAS_SPINE_EVENTS.FIELD_VALUE_UPDATED, {
        moduleId: 'atlas',
        fieldId,
        previousValue: payload.previousValue ?? null,
        newValue: payload.newValue ?? null,
        source: payload.source || 'ai',
      });
    },
  });
}

// ============================================================================
// Action Scope Filter
// ============================================================================

/**
 * Runtime action filter. Call before executing any action to enforce
 * scope boundaries. Returns true if the action is allowed.
 */
export function isAtlasActionAllowedInScope(
  actionType: string,
  scopeKind: 'general' | 'task-focus' | 'habit-review' | 'goal-planning' | 'field-crud'
): boolean {
  const allowlists: Record<string, string[]> = {
    general: [
      'create_task', 'update_task', 'complete_task', 'move_task', 'prioritize', 'delete_task',
      'create_goal', 'update_goal', 'update_goal_progress', 'set_deadline', 'delete_goal',
      'create_habit', 'update_habit', 'update_habit_streak', 'pause_habit', 'delete_habit',
      'daily_plan', 'weekly_review', 'schedule_block',
      'update_energy_wave', 'create_recovery_window', 'flatten_schedule',
      'sync_vitals', 'request_nsv_calibration',
      'delegate_to_module',
      'suggest_field', 'create_field', 'delete_field', 'update_field_value',
      'update_task_graph',
    ],
    'task-focus': [
      'update_task', 'complete_task', 'move_task', 'prioritize', 'set_deadline',
      'create_task',
    ],
    'habit-review': [
      'update_habit_streak', 'pause_habit', 'create_habit', 'update_habit',
    ],
    'goal-planning': [
      'update_goal_progress', 'set_deadline', 'create_goal', 'update_goal',
      'create_task',
    ],
    'field-crud': [
      'suggest_field', 'create_field', 'delete_field',
    ],
  };

  const allowed = allowlists[scopeKind];
  if (!allowed) return false;
  return allowed.includes(actionType);
}

// ============================================================================
// Inbound Spine Events Atlas Listens To
// ============================================================================

/**
 * Cross-module signals Atlas reads but never writes.
 */
export const ATLAS_INBOUND_SPINE_EVENTS = {
  BURNOUT_WARNING: 'BURNOUT_WARNING',
  BLOCK_HIGH_INTENSITY: 'BLOCK_HIGH_INTENSITY',
  FLATTEN_ENERGY_WAVE: 'FLATTEN_ENERGY_WAVE',
  SLEEP_QUALITY_UPDATED: 'SLEEP_QUALITY_UPDATED',
  RECOVERY_UPDATED: 'RECOVERY_UPDATED',
  EMOTIONAL_STATE_CHANGED: 'EMOTIONAL_STATE_CHANGED',
  STRESS_SPIKE: 'STRESS_SPIKE',
  FINANCIAL_FRICTION_CHANGED: 'FINANCIAL_FRICTION_CHANGED',
} as const;
