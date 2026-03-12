/**
 * DiagnosisCloseModal
 *
 * Glass modal dialog that lets the user either merge extracted fields into
 * their Soma health profile or permanently discard them.
 *
 * - Shows merge count vs total
 * - Async buttons with individual loading state
 * - Brief success confirmation before calling the parent close handler
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Merge,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DiagnosisCloseModalProps {
  isOpen: boolean;
  sessionId: string;
  selectedItemCount: number;
  totalItemCount: number;
  onMerge: () => Promise<void>;
  onDiscard: () => Promise<void>;
  onCancel: () => void;
  isProcessing?: boolean;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionState = 'idle' | 'merging' | 'discarding' | 'success-merge' | 'success-discard';

// ── Component ─────────────────────────────────────────────────────────────────

export function DiagnosisCloseModal({
  isOpen,
  sessionId: _sessionId,
  selectedItemCount,
  totalItemCount,
  onMerge,
  onDiscard,
  onCancel,
  isProcessing = false,
}: DiagnosisCloseModalProps) {
  const [actionState, setActionState] = useState<ActionState>('idle');

  const isBusy = isProcessing || actionState === 'merging' || actionState === 'discarding';

  const handleMerge = useCallback(async () => {
    if (isBusy) return;
    setActionState('merging');
    try {
      await onMerge();
      setActionState('success-merge');
    } catch {
      // Surface error back to idle so user can retry
      setActionState('idle');
    }
  }, [isBusy, onMerge]);

  const handleDiscard = useCallback(async () => {
    if (isBusy) return;
    setActionState('discarding');
    try {
      await onDiscard();
      setActionState('success-discard');
    } catch {
      setActionState('idle');
    }
  }, [isBusy, onDiscard]);

  const isSuccess =
    actionState === 'success-merge' || actionState === 'success-discard';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={!isBusy ? onCancel : undefined}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{   opacity: 0, scale: 0.95, y: 16  }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={cn(
              'fixed inset-x-4 bottom-safe-bottom top-1/2 -translate-y-1/2',
              'max-w-md mx-auto z-50',
              'bg-[#0d1117]/95 backdrop-blur-xl',
              'border border-white/10 rounded-2xl shadow-2xl',
              'p-6 flex flex-col gap-5',
              'max-h-[90vh]',
            )}
            role="dialog"
            aria-modal="true"
            aria-labelledby="diagnosis-close-modal-title"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="diagnosis-close-modal-title"
                  className="text-base font-bold text-white tracking-tight"
                >
                  Close Diagnosis Session
                </h2>
                {!isSuccess && (
                  <p className="text-xs text-white/40 mt-0.5">
                    Choose what to do with the extracted data
                  </p>
                )}
              </div>
              {!isBusy && !isSuccess && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors flex-shrink-0"
                  aria-label="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Body */}
            <AnimatePresence mode="wait">
              {isSuccess ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-3 py-6 text-center"
                >
                  <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                  </div>
                  <p className="text-sm font-semibold text-white">
                    {actionState === 'success-merge'
                      ? `${selectedItemCount} field${selectedItemCount !== 1 ? 's' : ''} merged into your health profile`
                      : 'Diagnosis session discarded'}
                  </p>
                  <p className="text-xs text-white/40">
                    All diagnosis data has been cleaned up.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="options"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  {/* Description */}
                  {selectedItemCount > 0 ? (
                    <p className="text-sm text-white/70 leading-relaxed">
                      Merge{' '}
                      <span className="font-semibold text-emerald-300">
                        {selectedItemCount}
                      </span>{' '}
                      of{' '}
                      <span className="font-semibold text-white">
                        {totalItemCount}
                      </span>{' '}
                      extracted fields into your health profile?
                    </p>
                  ) : (
                    <p className="text-sm text-white/70 leading-relaxed">
                      No fields are currently selected. You can discard the session
                      or cancel to go back and review.
                    </p>
                  )}

                  {/* Warning */}
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-200/80 leading-relaxed">
                      All diagnosis data will be permanently deleted after this action.
                    </p>
                  </div>

                  {/* Merge button */}
                  {selectedItemCount > 0 && (
                    <NeuralButton
                      onClick={handleMerge}
                      disabled={isBusy}
                      themeColor="emerald"
                      variant="secondary"
                      className="w-full min-h-[48px] font-semibold"
                    >
                      {actionState === 'merging' ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Merging…
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Merge className="w-4 h-4" />
                          Merge {selectedItemCount} Field{selectedItemCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </NeuralButton>
                  )}

                  {/* Discard button */}
                  <NeuralButton
                    onClick={handleDiscard}
                    disabled={isBusy}
                    themeColor="rose"
                    variant="danger"
                    className="w-full min-h-[48px] font-semibold"
                  >
                    {actionState === 'discarding' ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Discarding…
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Trash2 className="w-4 h-4" />
                        Discard All
                      </span>
                    )}
                  </NeuralButton>

                  {/* Cancel link */}
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={onCancel}
                      disabled={isBusy}
                      className="text-xs text-white/35 hover:text-white/55 transition-colors underline underline-offset-2 disabled:pointer-events-none"
                    >
                      Keep reviewing
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
