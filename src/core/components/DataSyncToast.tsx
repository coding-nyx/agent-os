/**
 * DataSyncToast — S10-008
 *
 * Floating confirmation card shown when a cross-module contextual hint has
 * been detected and verified as discrepant from the stored profile value.
 *
 * Design:
 *  - Glassmorphism card matching the Ara dark UI aesthetic.
 *  - Framer Motion enter/exit animations.
 *  - 10-second auto-dismiss with a shrinking progress bar.
 *  - Three actions: Update (confirm), Ignore (dismiss), Ask [Module] (handoff).
 */

import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import type { HintVerificationResult } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DataSyncToastProps {
  hint: HintVerificationResult;
  onConfirm: () => void;
  onDismiss: () => void;
  onAskModule: () => void;
}

// ---------------------------------------------------------------------------
// Module accent colours
// ---------------------------------------------------------------------------

const MODULE_COLORS: Record<string, string> = {
  titan: 'bg-orange-400',
  soma: 'bg-blue-400',
  ledger: 'bg-emerald-400',
  atlas: 'bg-violet-400',
  agnes: 'bg-pink-400',
  scout: 'bg-sky-400',
  forge: 'bg-lime-400',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a floating, auto-dismissing confirmation toast for a detected
 * cross-module data hint.
 *
 * Positioned above the chat input bar so it never obscures the conversation.
 * Uses `AnimatePresence` from the parent for clean mount/unmount transitions.
 */
export function DataSyncToast({
  hint,
  onConfirm,
  onDismiss,
  onAskModule,
}: DataSyncToastProps) {
  const { hint: dataHint, displayLabel } = hint;
  const { targetModule, rawQuote, inferredValue } = dataHint;

  const moduleName =
    targetModule.charAt(0).toUpperCase() + targetModule.slice(1);
  const accentColor = MODULE_COLORS[targetModule] ?? 'bg-white/40';

  // Auto-dismiss after 10 seconds.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 10_000);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

  // Cancel the auto-dismiss timer if the user interacts.
  const cancelTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      className="fixed bottom-40 left-1/2 -translate-x-1/2 z-[var(--z-toast)]"
      onPointerEnter={cancelTimer}
      role="alertdialog"
      aria-live="polite"
      aria-label={`Data sync suggestion for ${moduleName}`}
    >
      <div className="bg-slate-900/90 border border-white/[0.12] backdrop-blur-xl rounded-xl p-4 w-96 max-w-[90vw] shadow-2xl shadow-black/50">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${accentColor}`}
            aria-hidden
          />
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/40">
            {moduleName} · Data Sync
          </span>
        </div>

        {/* Body */}
        <div className="space-y-1 mb-4">
          <p className="text-xs text-white/60 leading-relaxed">
            You mentioned{' '}
            <span className="text-white/90 font-medium">
              &ldquo;{rawQuote}&rdquo;
            </span>
          </p>
          {displayLabel && (
            <p className="text-xs text-white/40">{displayLabel}</p>
          )}
          <p className="text-sm font-semibold text-white leading-snug">
            Update to{' '}
            <span className={`${accentColor.replace('bg-', 'text-')}`}>
              {String(inferredValue)}
            </span>
            ?
          </p>
        </div>

        {/* Action row */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 text-xs font-semibold rounded-lg bg-white/10 border border-white/15 text-white hover:bg-white/20 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            Update
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 text-xs font-medium rounded-lg text-white/50 hover:text-white/80 hover:bg-white/[0.06] active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            Ignore
          </button>
          <button
            type="button"
            onClick={onAskModule}
            className="ml-auto flex items-center gap-1 px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 text-xs font-medium rounded-lg text-white/50 hover:text-white/80 hover:bg-white/[0.06] active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            Ask {moduleName}
            <ChevronRight className="w-3 h-3" aria-hidden />
          </button>
        </div>

        {/* 10-second shrinking progress bar */}
        <div className="mt-3 h-px bg-white/[0.09] rounded-full overflow-hidden">
          <motion.div
            className={`h-full ${accentColor} opacity-50`}
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: 10, ease: 'linear' }}
          />
        </div>
      </div>
    </motion.div>
  );
}
