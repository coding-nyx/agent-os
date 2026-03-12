/**
 * DiagnosisActiveBanner
 *
 * Slim emerald banner (≈48 px) that mounts at the top of the page when a
 * diagnosis session is active.  Animates in from the top via Framer Motion.
 *
 * - uploading/parsing → spinner + "Analysing…"
 * - reviewed         → item count + Review + End buttons
 * - error            → "Analysis failed" + End button
 */

import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Loader2, X } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DiagnosisActiveBannerProps {
  sessionId: string;
  fileName?: string;
  itemCount?: number;
  phase: 'uploading' | 'parsing' | 'reviewed' | 'error';
  onReview: () => void;
  onEnd: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DiagnosisActiveBanner({
  sessionId: _sessionId,
  fileName,
  itemCount,
  phase,
  onReview,
  onEnd,
}: DiagnosisActiveBannerProps) {
  const isProcessing = phase === 'uploading' || phase === 'parsing';
  const isError      = phase === 'error';

  return (
    <motion.div
      key="diagnosis-active-banner"
      initial={{ y: -56, opacity: 0 }}
      animate={{ y: 0,   opacity: 1 }}
      exit={{   y: -56, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className={cn(
        'w-full flex items-center gap-2 px-4 min-h-[48px] z-50',
        isError
          ? 'bg-red-500/20 border-b border-red-500/30'
          : 'bg-emerald-500/15 border-b border-emerald-500/25',
      )}
      role="status"
      aria-live="polite"
      aria-label="Diagnosis session status"
    >
      {/* Icon */}
      <div className="flex-shrink-0">
        {isProcessing ? (
          <Loader2
            className="w-4 h-4 text-emerald-400 animate-spin"
            aria-hidden="true"
          />
        ) : (
          <FileText
            className={cn(
              'w-4 h-4 flex-shrink-0',
              isError ? 'text-red-400' : 'text-emerald-400',
            )}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Text */}
      <p className={cn(
        'flex-1 min-w-0 text-xs font-medium truncate',
        isError ? 'text-red-300' : 'text-emerald-200',
      )}>
        {isError ? (
          'Analysis failed'
        ) : isProcessing ? (
          <>
            <span className="font-semibold text-white">
              {fileName ?? 'Medical Document'}
            </span>
            {' · '}Analysing…
          </>
        ) : (
          <>
            <span className="font-semibold text-white">
              {fileName ?? 'Medical Document'}
            </span>
            {typeof itemCount === 'number' && itemCount > 0 && (
              <> · <span className="text-emerald-300">{itemCount} items extracted</span></>
            )}
          </>
        )}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {phase === 'reviewed' && (
          <NeuralButton
            size="sm"
            onClick={onReview}
            themeColor="emerald"
            variant="secondary"
            className="h-8 px-3 text-xs font-semibold min-w-[44px]"
          >
            Review
          </NeuralButton>
        )}

        <button
          type="button"
          onClick={onEnd}
          className={cn(
            'h-9 min-w-[44px] w-9 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors',
            isError
              ? 'text-red-400 hover:bg-red-500/20'
              : 'text-white/50 hover:text-white/80 hover:bg-white/10',
          )}
          aria-label="End diagnosis session"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
