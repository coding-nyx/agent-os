/**
 * DiagnosisProgressCard
 *
 * Glass card showing a 3-step diagnosis pipeline: Uploading → Extracting → Analysing.
 * Active steps pulse; completed steps show a checkmark.
 * Renders a retry/cancel CTA on error state.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  AlertCircle,
  X,
  RotateCcw,
  FileText,
} from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AnalysisPhase = 'uploading' | 'extracting' | 'analysing' | 'complete' | 'error';

export interface DiagnosisProgressCardProps {
  phase: AnalysisPhase;
  fileName?: string;
  /** 0-100, only meaningful during 'uploading' phase */
  progress?: number;
  errorMessage?: string;
  onCancel?: () => void;
  onRetry?: () => void;
}

// ── Step config ───────────────────────────────────────────────────────────────

interface Step {
  id: 'uploading' | 'extracting' | 'analysing';
  label: string;
  description: string;
}

const STEPS: Step[] = [
  { id: 'uploading',  label: 'Uploading',        description: 'Securing and transferring your document' },
  { id: 'extracting', label: 'Extracting Text',   description: 'Reading pages, OCR where needed'        },
  { id: 'analysing',  label: 'Analysing with AI', description: 'Structuring biomarkers and drafting clinical summary' },
];

const PHASE_ORDER: Record<AnalysisPhase, number> = {
  uploading:  0,
  extracting: 1,
  analysing:  2,
  complete:   3,
  error:     -1,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({
  step,
  status,
}: {
  step: Step;
  status: 'pending' | 'active' | 'complete' | 'error';
}) {
  return (
    <div className="flex items-center gap-3">
      {/* Dot */}
      <div className="relative flex-shrink-0 w-8 h-8 flex items-center justify-center">
        {status === 'complete' && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 12, stiffness: 300 }}
          >
            <CheckCircle2 className="w-7 h-7 text-[var(--module-color-400)]" />
          </motion.div>
        )}
        {status === 'active' && (
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [1, 0.7, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            className="w-7 h-7 rounded-full bg-[var(--module-accent-glow)] border-2 border-[var(--module-accent-border)] flex items-center justify-center"
          >
            <Loader2 className="w-3.5 h-3.5 text-[var(--module-color-400)] animate-spin" />
          </motion.div>
        )}
        {status === 'pending' && (
          <Circle className="w-7 h-7 text-white/20" />
        )}
        {status === 'error' && (
          <AlertCircle className="w-7 h-7 text-red-400" />
        )}
      </div>

      {/* Label */}
      <div className="min-w-0">
        <p className={cn(
          'text-sm font-semibold leading-tight',
          status === 'complete' ? 'text-[var(--module-color-400)]'
          : status === 'active'   ? 'text-white'
          : status === 'error'    ? 'text-red-400'
          : 'text-white/30',
        )}>
          {step.label}
        </p>
        <p className={cn(
          'text-xs mt-0.5',
          status === 'active' ? 'text-white/50' : 'text-white/25',
        )}>
          {step.description}
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DiagnosisProgressCard({
  phase,
  fileName,
  progress = 0,
  errorMessage,
  onCancel,
  onRetry,
}: DiagnosisProgressCardProps) {
  const phaseIndex = PHASE_ORDER[phase];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      className="bg-slate-900/50 backdrop-blur border border-white/[0.12] rounded-2xl p-6 space-y-5"
      role="status"
      aria-live="polite"
    >
      {/* File name header */}
      {fileName && (
        <div className="flex items-center gap-2.5 pb-1">
          <div className="w-8 h-8 rounded-lg bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-[var(--module-color-400)]" />
          </div>
          <p className="text-sm font-medium text-white/70 truncate" title={fileName}>
            {fileName}
          </p>
        </div>
      )}

      {/* Phase-specific content */}
      <AnimatePresence mode="wait">
        {phase === 'error' ? (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3"
          >
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-300">Analysis failed</p>
              {errorMessage && (
                <p className="text-xs text-red-400/70 mt-0.5 break-words">{errorMessage}</p>
              )}
            </div>
          </motion.div>
        ) : phase === 'analysing' ? (
          <motion.div
            key="analysing-banner"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-[var(--module-accent-border)] bg-[var(--module-accent-faint)] px-4 py-3"
          >
            <motion.div
              animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Sparkles className="w-5 h-5 text-[var(--module-color-400)]" />
            </motion.div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[var(--module-color-300)]">Analysing with AI…</p>
              <p className="text-xs text-[var(--module-color-300)] opacity-60">
                Running OCR → extracting fields → generating clinical summary
              </p>
            </div>
          </motion.div>
        ) : phase === 'uploading' ? (
          <motion.div key="upload-bar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex justify-between mb-1.5">
              <span className="text-xs text-white/50">Upload progress</span>
              <span className="text-xs font-semibold text-[var(--module-color-400)]">{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--module-accent)] rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* 3-step stepper */}
      <div className="space-y-3">
        {STEPS.map((step) => {
          let status: 'pending' | 'active' | 'complete' | 'error';

          if (phase === 'error') {
            // For error, show all steps as pending except surface that something failed.
            // We can't tell exactly which step failed reliably, so show all as pending.
            status = 'pending';
          } else {
            const stepIndex = PHASE_ORDER[step.id as AnalysisPhase];
            if (phaseIndex > stepIndex) status = 'complete';
            else if (phaseIndex === stepIndex) status = 'active';
            else status = 'pending';
          }

          return (
            <StepIndicator key={step.id} step={step} status={status} />
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 pt-1">
        {phase === 'error' && onRetry && (
          <NeuralButton
            variant="secondary"
            size="sm"
            onClick={onRetry}
            themeColor="module"
            className="min-h-[44px]"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Retry
          </NeuralButton>
        )}
        {phase !== 'error' && <div />}

        {phase !== 'complete' && onCancel && (
          <NeuralButton
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-white/40 hover:text-white/70 min-h-[44px]"
          >
            <X className="w-3.5 h-3.5 mr-1.5" />
            Cancel
          </NeuralButton>
        )}
      </div>
    </motion.div>
  );
}
