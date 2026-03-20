/**
 * AgentOverridePanel
 *
 * Animated bottom-sheet that presents the agent's reasoning for a health-data
 * entry and gives the user four resolution paths:
 *   1. Accept Suggestion  – apply the agent's proposed value
 *   2. Keep Original      – dismiss the suggestion, keep the user's entry
 *   3. Edit Manually      – inline free-text edit field
 *   4. Dismiss            – close without taking any action
 *
 * Animation: slides up from the bottom via Framer Motion AnimatePresence.
 * Backdrop: semi-transparent blur overlay; click-outside triggers onDismiss.
 */

import React, { useState, useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, ShieldOff, PencilLine, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import type { AgentReview } from '@/lib/types';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AgentOverridePanelProps {
  /** Controls mount/unmount via AnimatePresence */
  isOpen: boolean;
  /** Identifier for the health-data entry being reviewed */
  entryId: string;
  /** Human-readable field name shown in the header, e.g. "Heart Rate" */
  fieldLabel: string;
  /** The value the user originally entered */
  currentValue: string | number;
  /** Agent review payload; drives the note/suggestion display */
  agentReview: AgentReview;
  /** Called with entryId when the user accepts the agent's suggestion */
  onAccept: (entryId: string) => Promise<void>;
  /** Called with entryId when the user wants to keep their original value */
  onKeep: (entryId: string) => Promise<void>;
  /** Called with entryId + new free-text value when the user manually edits */
  onEdit: (entryId: string, newValue: string) => void;
  /** Called when the panel closes without any meaningful action */
  onDismiss: () => void;
}

// ── Animations ────────────────────────────────────────────────────────────────

const SHEET_VARIANTS = {
  hidden:  { y: '100%', opacity: 0 },
  visible: { y: 0,      opacity: 1 },
  exit:    { y: '100%', opacity: 0 },
};

const BACKDROP_VARIANTS = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1 },
  exit:    { opacity: 0 },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function AgentOverridePanel({
  isOpen,
  entryId,
  fieldLabel,
  currentValue,
  agentReview,
  onAccept,
  onKeep,
  onEdit,
  onDismiss,
}: AgentOverridePanelProps) {
  const inputId = useId();

  // Per-button loading flags — isolated so only the tapped button shows a spinner
  const [loadingAccept, setLoadingAccept] = useState(false);
  const [loadingKeep,   setLoadingKeep]   = useState(false);

  // Inline manual-edit state
  const [showEdit,   setShowEdit]   = useState(false);
  const [editValue,  setEditValue]  = useState(String(currentValue));

  const hasModification = agentReview.status === 'modified' &&
                          agentReview.suggestedValue !== undefined;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAccept = useCallback(async () => {
    setLoadingAccept(true);
    try {
      await onAccept(entryId);
    } finally {
      setLoadingAccept(false);
    }
  }, [onAccept, entryId]);

  const handleKeep = useCallback(async () => {
    setLoadingKeep(true);
    try {
      await onKeep(entryId);
    } finally {
      setLoadingKeep(false);
    }
  }, [onKeep, entryId]);

  const handleEdit = useCallback(() => {
    onEdit(entryId, editValue);
  }, [onEdit, entryId, editValue]);

  const toggleEditPanel = useCallback(() => {
    setShowEdit(prev => {
      // Reset value to currentValue each time the panel opens
      if (!prev) setEditValue(String(currentValue));
      return !prev;
    });
  }, [currentValue]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="agent-override-backdrop"
            variants={BACKDROP_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
            onClick={onDismiss}
          />

          {/* Bottom sheet */}
          <motion.div
            key="agent-override-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`Agent review for ${fieldLabel}`}
            variants={SHEET_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ type: 'spring', stiffness: 340, damping: 36 }}
            className={cn(
              'fixed bottom-0 left-0 right-0 z-50',
              'bg-black/80 backdrop-blur-xl border-t border-white/10',
              'rounded-t-2xl px-5 pb-8 pt-4',
              'max-h-[85dvh] overflow-y-auto',
            )}
          >
            {/* Drag handle */}
            <div className="flex justify-center mb-3" aria-hidden="true">
              <span className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header row */}
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">
                  Agent Review
                </p>
                <h2 className="text-base font-semibold text-white">
                  {fieldLabel}
                </h2>
              </div>
              <NeuralButton
                type="button"
                variant="ghost"
                onClick={onDismiss}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
                aria-label="Close panel"
              >
                <X className="w-4 h-4" />
              </NeuralButton>
            </div>

            {/* Agent note */}
            {agentReview.agentNote && (
              <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3.5">
                <p className="text-xs font-medium text-white/50 mb-1">Agent note</p>
                <p className="text-sm italic text-white/80 leading-relaxed">
                  "{agentReview.agentNote}"
                </p>
              </div>
            )}

            {/* Value comparison — only for modified entries */}
            {hasModification && (
              <div className="mb-5 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
                    Your entry
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {currentValue}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--module-accent-border)] bg-[var(--module-accent-muted)] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--module-color-400)] opacity-70 mb-1">
                    Agent suggests
                  </p>
                  <p className="text-sm font-semibold text-[var(--module-color-300)]">
                    {agentReview.suggestedValue}
                  </p>
                </div>
              </div>
            )}

            {/* Inline edit field (toggled) */}
            <AnimatePresence>
              {showEdit && (
                <motion.div
                  key="inline-edit"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mb-4">
                    <label
                      id={`${inputId}-label`}
                      htmlFor={inputId}
                      className="block text-xs text-white/50 mb-1.5"
                    >
                      Manual override value
                    </label>
                    <div className="flex gap-2">
                      <NeuralInput
                        id={inputId}
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        placeholder={String(currentValue)}
                        aria-describedby={`${inputId}-label`}
                        className="flex-1"
                      />
                      <NeuralButton
                        type="button"
                        onClick={handleEdit}
                        disabled={!editValue.trim()}
                        themeColor="module"
                        variant="outline"
                        className="min-h-[44px]"
                      >
                        Apply
                      </NeuralButton>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action buttons — 2 × 2 grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Accept Suggestion — only when there is a suggestedValue */}
              {hasModification && (
                <ActionButton
                  onClick={handleAccept}
                  loading={loadingAccept}
                  disabled={loadingKeep}
                  icon={<CheckCircle2 className="w-4 h-4" />}
                  className="bg-[var(--module-accent-glow)] border-[var(--module-accent-border)] text-[var(--module-color-300)] hover:bg-[var(--module-accent-glow)]"
                >
                  Accept Suggestion
                </ActionButton>
              )}

              {/* Keep Original */}
              <ActionButton
                onClick={handleKeep}
                loading={loadingKeep}
                disabled={loadingAccept}
                icon={<ShieldOff className="w-4 h-4" />}
                className={cn(
                  'bg-white/5 border-white/15 text-white/70 hover:bg-white/10',
                  // Span full width when Accept is hidden (no suggestion)
                  !hasModification && 'col-span-2',
                )}
              >
                Keep Original
              </ActionButton>

              {/* Edit Manually */}
              <ActionButton
                onClick={toggleEditPanel}
                icon={
                  showEdit
                    ? <ChevronDown className="w-4 h-4" />
                    : <PencilLine className="w-4 h-4" />
                }
                className="bg-white/5 border-white/15 text-white/70 hover:bg-white/10"
              >
                {showEdit ? 'Hide Editor' : 'Edit Manually'}
              </ActionButton>

              {/* Dismiss */}
              <ActionButton
                onClick={onDismiss}
                icon={<X className="w-4 h-4" />}
                className="bg-white/5 border-white/15 text-white/50 hover:bg-white/10"
              >
                Dismiss
              </ActionButton>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Sub-component: ActionButton ───────────────────────────────────────────────

interface ActionButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

function ActionButton({
  onClick,
  children,
  icon,
  loading = false,
  disabled = false,
  className,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'flex items-center justify-center gap-2',
        'rounded-xl border px-3 py-3',
        'text-xs font-semibold transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'min-h-[44px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]',
        className,
      )}
    >
      {loading
        ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        : icon}
      {children}
    </button>
  );
}
