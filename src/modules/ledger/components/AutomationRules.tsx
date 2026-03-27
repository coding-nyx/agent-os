/**
 * AutomationRules.tsx
 *
 * Displays the Ledger module's rule-based suggestion engine.
 *
 * DESIGN CONSTRAINT: This is a SUGGESTION-ONLY system. Rules evaluate
 * profile data and surface human-readable prompts — they never execute
 * any action automatically. The user reads the suggestion and acts manually.
 *
 * Architecture:
 *   • Two internal tabs: "Suggestions" (active triggers) and "Rules" (CRUD).
 *   • Suggestions are derived via useMemo over evaluateAutomationRules() so they
 *     are recomputed only when profile changes, not on every render.
 *   • Dismissed suggestions are filtered by ruleId (stored in
 *     profile.dismissedSuggestionIds) so re-trigger prevention is persistent.
 *   • All mutation callbacks are lifted to the parent — this component owns
 *     only local UI state (active tab, modal open/close, form state).
 *
 * Complexity:
 *   • Suggestion evaluation: O(r·t) where r = rules, t = transactions.
 *   • Filtering dismissed: O(r) with a Set lookup for O(1) per check.
 */

import React, { useState, useMemo } from 'react';
import {
  Zap,
  ZapOff,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Lightbulb,
  Settings2,
  ChevronRight,
} from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { EmptyState } from '@/core/components/EmptyState';
import { cn } from '@/lib/utils';
import {
  evaluateAutomationRules,
} from '../services/automation-engine';
import type {
  AutomationRule,
  AutomationSuggestion,
  AutomationTriggerType,
  AutomationSuggestionType,
  LedgerIntakeProfile,
} from '../services/ledger-intake-service';

// ─────────────────────────────────────────────────────────────────────────────
// Public props
// ─────────────────────────────────────────────────────────────────────────────

export interface AutomationRulesProps {
  profile: LedgerIntakeProfile;
  onCreateRule: (data: Partial<AutomationRule>) => void;
  onUpdateRule: (ruleId: string, data: Partial<AutomationRule>) => void;
  onDeleteRule: (ruleId: string) => void;
  onToggleRule: (ruleId: string, enabled: boolean) => void;
  /** Receives the suggestion's ruleId so the parent can persist it to
   *  dismissedSuggestionIds, which is what the filter checks against. */
  onDismissSuggestion: (suggestionId: string) => void;
  onAddDefaultRules: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

type ActiveTab = 'Suggestions' | 'Rules';

/** Flat form state used by the CRUD modal. Threshold is kept as a string so
 *  it binds cleanly to NeuralInput without controlled/uncontrolled conflicts. */
interface RuleFormState {
  name: string;
  triggerType: AutomationTriggerType;
  /** Empty string means "not set" — parsed to number only on save. */
  triggerThreshold: string;
  triggerCategory: string;
  suggestionType: AutomationSuggestionType;
  suggestionMessage: string;
  isEnabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static option tables
// ─────────────────────────────────────────────────────────────────────────────

const TRIGGER_TYPE_OPTIONS: Array<{ label: string; value: AutomationTriggerType }> = [
  { label: 'Spending Exceeds',      value: 'spending_exceeds'      },
  { label: 'Balance Below',         value: 'balance_below'         },
  { label: 'Goal Progress Below',   value: 'goal_progress_below'   },
  { label: 'Subscription Unused',   value: 'subscription_unused'   },
  { label: 'Net Worth Drops',       value: 'net_worth_drops'       },
  { label: 'Bill Overdue',          value: 'bill_overdue'          },
  { label: 'Month End',             value: 'month_end'             },
];

const SUGGESTION_TYPE_OPTIONS: Array<{ label: string; value: AutomationSuggestionType }> = [
  { label: 'Cancel Subscription',  value: 'cancel_subscription'  },
  { label: 'Increase Savings',     value: 'increase_savings'     },
  { label: 'Pay Extra Debt',       value: 'pay_extra_debt'       },
  { label: 'Review Budget',        value: 'review_budget'        },
  { label: 'Record Snapshot',      value: 'record_snapshot'      },
  { label: 'Transfer to Savings',  value: 'transfer_to_savings'  },
  { label: 'Custom Message',       value: 'custom_message'       },
];

/** Trigger types that accept a numeric threshold in the form. */
const THRESHOLD_TRIGGER_TYPES = new Set<AutomationTriggerType>([
  'spending_exceeds',
  'balance_below',
  'goal_progress_below',
  'net_worth_drops',
]);

const TRIGGER_TYPE_LABELS: Readonly<Record<AutomationTriggerType, string>> = {
  spending_exceeds:     'Spending Exceeds',
  balance_below:        'Balance Below',
  goal_progress_below:  'Goal Progress Below',
  subscription_unused:  'Subscription Unused',
  net_worth_drops:      'Net Worth Drops',
  bill_overdue:         'Bill Overdue',
  month_end:            'Month End',
};

const SUGGESTION_TYPE_LABELS: Readonly<Record<AutomationSuggestionType, string>> = {
  cancel_subscription: 'Cancel Subscription',
  increase_savings:    'Increase Savings',
  pay_extra_debt:      'Pay Extra Debt',
  review_budget:       'Review Budget',
  record_snapshot:     'Record Snapshot',
  transfer_to_savings: 'Transfer to Savings',
  custom_message:      'Custom Message',
};

// ─────────────────────────────────────────────────────────────────────────────
// Form helpers
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_FORM: RuleFormState = {
  name:              '',
  triggerType:       'spending_exceeds',
  triggerThreshold:  '',
  triggerCategory:   '',
  suggestionType:    'review_budget',
  suggestionMessage: '',
  isEnabled:         true,
};

function ruleToForm(rule: AutomationRule): RuleFormState {
  return {
    name:              rule.name,
    triggerType:       rule.triggerType,
    triggerThreshold:  rule.triggerThreshold !== undefined ? String(rule.triggerThreshold) : '',
    triggerCategory:   rule.triggerCategory ?? '',
    suggestionType:    rule.suggestionType,
    suggestionMessage: rule.suggestionMessage,
    isEnabled:         rule.isEnabled,
  };
}

/** Converts validated form state into a Partial<AutomationRule> for the
 *  parent callback. Only includes optional fields when they are set. */
function formToPartialRule(form: RuleFormState): Partial<AutomationRule> {
  const patch: Partial<AutomationRule> = {
    name:              form.name.trim(),
    triggerType:       form.triggerType,
    suggestionType:    form.suggestionType,
    suggestionMessage: form.suggestionMessage.trim(),
    isEnabled:         form.isEnabled,
  };

  if (THRESHOLD_TRIGGER_TYPES.has(form.triggerType) && form.triggerThreshold.trim() !== '') {
    const parsed = parseFloat(form.triggerThreshold);
    if (!isNaN(parsed)) {
      patch.triggerThreshold = parsed;
    }
  }

  if (form.triggerType === 'spending_exceeds' && form.triggerCategory.trim() !== '') {
    patch.triggerCategory = form.triggerCategory.trim();
  }

  return patch;
}

function isFormValid(form: RuleFormState): boolean {
  return form.name.trim() !== '' && form.suggestionMessage.trim() !== '';
}

// ─────────────────────────────────────────────────────────────────────────────
// SuggestionCard
// ─────────────────────────────────────────────────────────────────────────────

interface SuggestionCardProps {
  suggestion: AutomationSuggestion;
  /** Receives ruleId — the parent stores it in dismissedSuggestionIds. */
  onDismiss: (ruleId: string) => void;
}

function SuggestionCard({ suggestion, onDismiss }: SuggestionCardProps) {
  return (
    <article
      aria-label={`Suggestion: ${suggestion.ruleName}`}
      className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="mt-0.5 flex-shrink-0 rounded-lg bg-amber-500/15 p-2">
          <Lightbulb className="h-4 w-4 text-amber-400" aria-hidden="true" />
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-sm font-medium text-white/90 leading-relaxed">
            {suggestion.message}
          </p>
          <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">
            {suggestion.ruleName}
          </span>
        </div>

        {/* Dismiss */}
        <NeuralButton
          variant="ghost"
          size="sm"
          aria-label={`Dismiss suggestion from rule "${suggestion.ruleName}"`}
          onClick={() => onDismiss(suggestion.ruleId)}
          className="flex-shrink-0 text-white/40 hover:text-white/70"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </NeuralButton>
      </div>

      {/* Clarification note */}
      <p className="ml-11 text-xs text-white/35 italic">
        This is a suggestion — no action has been taken automatically.
      </p>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RuleRow
// ─────────────────────────────────────────────────────────────────────────────

interface RuleRowProps {
  rule: AutomationRule;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (rule: AutomationRule) => void;
  onDelete: (id: string) => void;
}

function RuleRow({ rule, onToggle, onEdit, onDelete }: RuleRowProps) {
  const hasThreshold  = rule.triggerThreshold !== undefined;
  const hasCategory   = Boolean(rule.triggerCategory);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.09] bg-white/[0.045] p-4 hover:bg-white/[0.05] transition-colors">
      {/* Enable / disable toggle */}
      <button
        type="button"
        onClick={() => onToggle(rule.id, !rule.isEnabled)}
        aria-label={rule.isEnabled ? `Disable rule "${rule.name}"` : `Enable rule "${rule.name}"`}
        aria-pressed={rule.isEnabled}
        className={cn(
          'flex-shrink-0 rounded-lg p-2 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors',
          rule.isEnabled
            ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
            : 'bg-white/[0.09] text-white/30 hover:bg-white/[0.12]',
        )}
      >
        {rule.isEnabled
          ? <Zap    className="h-4 w-4" aria-hidden="true" />
          : <ZapOff className="h-4 w-4" aria-hidden="true" />}
      </button>

      {/* Info section */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Name + type badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-white/90 truncate">
            {rule.name}
          </span>
          <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300">
            {TRIGGER_TYPE_LABELS[rule.triggerType]}
          </span>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
            {SUGGESTION_TYPE_LABELS[rule.suggestionType]}
          </span>
        </div>

        {/* Optional threshold / category hints */}
        {(hasThreshold || hasCategory) && (
          <div className="flex flex-wrap gap-3 text-xs text-white/40">
            {hasThreshold && (
              <span>Threshold: <span className="text-white/60">{rule.triggerThreshold}</span></span>
            )}
            {hasCategory && (
              <span>Category: <span className="text-white/60">{rule.triggerCategory}</span></span>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <NeuralButton
          variant="ghost"
          size="sm"
          aria-label={`Edit rule "${rule.name}"`}
          onClick={() => onEdit(rule)}
          className="text-white/40 hover:text-white/70"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </NeuralButton>
        <NeuralButton
          variant="ghost"
          size="sm"
          aria-label={`Delete rule "${rule.name}"`}
          onClick={() => onDelete(rule.id)}
          className="text-white/40 hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </NeuralButton>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RuleModal — CRUD form
// ─────────────────────────────────────────────────────────────────────────────

interface RuleModalProps {
  isOpen:      boolean;
  editingRule: AutomationRule | null;
  onClose:     () => void;
  onSave:      (form: RuleFormState) => void;
}

function RuleModal({ isOpen, editingRule, onClose, onSave }: RuleModalProps) {
  const isEditing = editingRule !== null;
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);

  // Sync form when the editing target or open state changes.
  React.useEffect(() => {
    setForm(editingRule ? ruleToForm(editingRule) : EMPTY_FORM);
  }, [editingRule, isOpen]);

  /** Partial update helper — keeps all unchanged fields intact. */
  function patch(update: Partial<RuleFormState>): void {
    setForm(prev => ({ ...prev, ...update }));
  }

  const showThreshold = THRESHOLD_TRIGGER_TYPES.has(form.triggerType);
  const showCategory  = form.triggerType === 'spending_exceeds';
  const valid         = isFormValid(form);

  function handleSave(): void {
    if (!valid) return;
    onSave(form);
  }

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Automation Rule' : 'New Automation Rule'}
      subtitle="Rules surface suggestion messages when their trigger conditions are met — they never execute actions automatically."
      themeColor="amber"
      maxWidth="lg"
    >
      <div className="space-y-4 pt-1">
        {/* ── Name ──────────────────────────────────────────────────────────── */}
        <NeuralInput
          label="Rule Name"
          value={form.name}
          onChange={e => patch({ name: e.target.value })}
          placeholder="e.g. High Dining Spend"
        />

        {/* ── Trigger Type ──────────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-white/50 uppercase tracking-wide">
            Trigger Type
          </label>
          <NeuralSelectMenu<AutomationTriggerType>
            value={form.triggerType}
            options={TRIGGER_TYPE_OPTIONS}
            onChange={value => patch({ triggerType: value, triggerThreshold: '', triggerCategory: '' })}
            ariaLabel="Select trigger type"
          />
        </div>

        {/* ── Threshold (conditional) ───────────────────────────────────────── */}
        {showThreshold && (
          <NeuralInput
            label="Threshold"
            type="number"
            value={form.triggerThreshold}
            onChange={e => patch({ triggerThreshold: e.target.value })}
            placeholder="e.g. 500"
          />
        )}

        {/* ── Category (spending_exceeds only) ──────────────────────────────── */}
        {showCategory && (
          <NeuralInput
            label="Category (optional)"
            value={form.triggerCategory}
            onChange={e => patch({ triggerCategory: e.target.value })}
            placeholder="e.g. Food"
          />
        )}

        {/* ── Suggestion Type ───────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-white/50 uppercase tracking-wide">
            Suggestion Type
          </label>
          <NeuralSelectMenu<AutomationSuggestionType>
            value={form.suggestionType}
            options={SUGGESTION_TYPE_OPTIONS}
            onChange={value => patch({ suggestionType: value })}
            ariaLabel="Select suggestion type"
          />
        </div>

        {/* ── Suggestion Message ────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-white/50 uppercase tracking-wide">
            Suggestion Message <span className="text-red-400" aria-hidden="true">*</span>
          </label>
          <textarea
            value={form.suggestionMessage}
            onChange={e => patch({ suggestionMessage: e.target.value })}
            placeholder="The message shown to you when this rule triggers…"
            rows={3}
            aria-label="Suggestion message"
            className={cn(
              'w-full rounded-lg border bg-white/[0.045] px-3 py-2 text-sm text-white placeholder-white/25',
              'outline-none resize-none transition',
              'focus:ring-1',
              form.suggestionMessage.trim()
                ? 'border-white/[0.12] focus:border-amber-500/40 focus:ring-amber-500/20'
                : 'border-white/[0.12] focus:border-amber-500/40 focus:ring-amber-500/20',
            )}
          />
        </div>

        {/* ── Enabled Toggle ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between rounded-lg border border-white/[0.09] bg-white/[0.045] px-3 py-2.5">
          <span className="text-sm text-white/70">Enable rule immediately</span>
          <button
            type="button"
            role="switch"
            aria-checked={form.isEnabled}
            onClick={() => patch({ isEnabled: !form.isEnabled })}
            className={cn(
              'relative flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500',
              form.isEnabled ? 'bg-amber-500' : 'bg-white/15',
            )}
          >
            <span
              className={cn(
                'absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
                form.isEnabled && 'translate-x-5',
              )}
            />
            <span className="sr-only">{form.isEnabled ? 'Enabled' : 'Disabled'}</span>
          </button>
        </div>

        {/* ── Footer actions ────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.09]">
          <NeuralButton variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </NeuralButton>
          <NeuralButton
            variant="amber"
            size="sm"
            disabled={!valid}
            onClick={handleSave}
          >
            <Check className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            {isEditing ? 'Save Changes' : 'Create Rule'}
          </NeuralButton>
        </div>
      </div>
    </NeuralModal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AutomationRules — main component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Two-tab panel for the Ledger automation rule engine.
 *
 * • **Suggestions** tab — surfaces current rule triggers as read-only prompts.
 * • **Rules** tab — full CRUD over automation rules.
 *
 * No action is ever executed automatically; every suggestion requires the user
 * to decide what (if anything) to do.
 */
export default function AutomationRules({
  profile,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
  onToggleRule,
  onDismissSuggestion,
  onAddDefaultRules,
}: AutomationRulesProps) {
  // ── Local UI state ──────────────────────────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState<ActiveTab>('Suggestions');
  const [isModalOpen,  setIsModalOpen]  = useState(false);
  const [editingRule,  setEditingRule]  = useState<AutomationRule | null>(null);

  // ── Derived data ────────────────────────────────────────────────────────────

  /**
   * Build a Set of dismissed ruleIds for O(1) lookup.
   * We key on ruleId (not suggestion.id) so that once a rule's suggestion is
   * dismissed it won't re-appear even when a fresh suggestion id is generated.
   */
  const dismissedRuleIds = useMemo<ReadonlySet<string>>(
    () => new Set(profile.dismissedSuggestionIds ?? []),
    [profile.dismissedSuggestionIds],
  );

  /**
   * Run evaluation and filter dismissed suggestions.
   * Re-computed only when profile changes — not on modal or tab state changes.
   * O(r·t + r) where r = rules, t = transactions.
   */
  const activeSuggestions = useMemo<AutomationSuggestion[]>(
    () => evaluateAutomationRules(profile).filter(s => !dismissedRuleIds.has(s.ruleId)),
    [profile, dismissedRuleIds],
  );

  const rules: AutomationRule[] = profile.automationRules ?? [];

  // ── Modal handlers ──────────────────────────────────────────────────────────

  function openCreateModal(): void {
    setEditingRule(null);
    setIsModalOpen(true);
  }

  function openEditModal(rule: AutomationRule): void {
    setEditingRule(rule);
    setIsModalOpen(true);
  }

  function closeModal(): void {
    setIsModalOpen(false);
    setEditingRule(null);
  }

  function handleModalSave(form: RuleFormState): void {
    const data = formToPartialRule(form);
    if (editingRule) {
      onUpdateRule(editingRule.id, data);
    } else {
      onCreateRule(data);
    }
    closeModal();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-amber-500/15 p-2">
            <Settings2 className="h-4 w-4 text-amber-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white/90">Automation Rules</h2>
            <p className="text-xs text-white/40">Suggestion-only engine — no auto-execution</p>
          </div>
        </div>

        {/* "Add Rule" shortcut visible when on the Rules tab */}
        {activeTab === 'Rules' && (
          <NeuralButton variant="amber" size="sm" onClick={openCreateModal}>
            <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            Add Rule
          </NeuralButton>
        )}
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Automation panels"
        className="flex gap-1 rounded-xl border border-white/[0.09] bg-white/[0.045] p-1"
      >
        {(['Suggestions', 'Rules'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 min-h-[44px] text-sm font-medium transition-colors',
              activeTab === tab
                ? 'bg-amber-500/20 text-amber-300'
                : 'text-white/40 hover:text-white/60 hover:bg-white/[0.045]',
            )}
          >
            {tab === 'Suggestions'
              ? <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
              : <Zap       className="h-3.5 w-3.5" aria-hidden="true" />}

            {tab}

            {/* Badge showing pending suggestion count */}
            {tab === 'Suggestions' && activeSuggestions.length > 0 && (
              <span
                aria-label={`${activeSuggestions.length} active suggestions`}
                className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-semibold text-black leading-none"
              >
                {activeSuggestions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Suggestions Panel ────────────────────────────────────────────────── */}
      {activeTab === 'Suggestions' && (
        <section aria-label="Active suggestions" className="space-y-3">
          {activeSuggestions.length === 0 ? (
            <EmptyState
              icon={Lightbulb}
              title="All caught up!"
              description="No suggestions right now — your finances look on track!"
            />
          ) : (
            activeSuggestions.map(suggestion => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onDismiss={onDismissSuggestion}
              />
            ))
          )}
        </section>
      )}

      {/* ── Rules Panel ──────────────────────────────────────────────────────── */}
      {activeTab === 'Rules' && (
        <section aria-label="Automation rules" className="space-y-3">
          {rules.length === 0 ? (
            <EmptyState
              icon={Zap}
              title="No automation rules yet"
              description="Add your first rule or load a set of sensible defaults to get started."
              action={
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                  <NeuralButton variant="amber" size="sm" onClick={openCreateModal}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                    Add Rule
                  </NeuralButton>
                  <NeuralButton variant="ghost" size="sm" onClick={onAddDefaultRules}>
                    <ChevronRight className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                    Add Default Rules
                  </NeuralButton>
                </div>
              }
            />
          ) : (
            rules.map(rule => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onToggle={onToggleRule}
                onEdit={openEditModal}
                onDelete={onDeleteRule}
              />
            ))
          )}
        </section>
      )}

      {/* ── CRUD Modal ───────────────────────────────────────────────────────── */}
      <RuleModal
        isOpen={isModalOpen}
        editingRule={editingRule}
        onClose={closeModal}
        onSave={handleModalSave}
      />
    </div>
  );
}
