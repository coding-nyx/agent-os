/**
 * TitanProposalCard.tsx — Interactive inline chat proposal card.
 *
 * Renders AI-generated proposals (sleep logs, workout sessions, routines)
 * with confirm/edit/cancel actions. Uses the same visual language as
 * LogConfirmCard but handles the broader proposal format from AI.
 *
 * Design: dark glassmorphism, orange/amber Titan theme, mobile-first.
 */

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Check,
  Clock,
  Dumbbell,
  Edit3,
  Moon,
  RotateCcw,
  X,
  Loader2,
} from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TitanProposalAction {
  label: string;
  handler: string;
  data?: Record<string, unknown>;
  /** Visual variant: 'primary' for confirm, 'secondary' for edit, 'ghost' for cancel */
  variant?: 'primary' | 'secondary' | 'ghost';
}

export interface TitanProposal {
  __isTitanProposal: true;
  type: 'routine_proposal' | 'sleep_log_proposal' | 'workout_log_proposal';
  intent: 'request_routine' | 'log_sleep' | 'log_workout';
  generatedData: Record<string, unknown>;
  message: string;
  actions: TitanProposalAction[];
}

export interface TitanProposalCardProps {
  proposal: TitanProposal;
  onAction: (handler: string, data?: Record<string, unknown>) => Promise<void>;
  onDismiss: () => void;
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProposalIcon(type: TitanProposal['type']) {
  switch (type) {
    case 'sleep_log_proposal':
      return Moon;
    case 'workout_log_proposal':
      return Dumbbell;
    case 'routine_proposal':
      return RotateCcw;
    default:
      return Clock;
  }
}

function getProposalTitle(type: TitanProposal['type']): string {
  switch (type) {
    case 'sleep_log_proposal':
      return 'Sleep Log';
    case 'workout_log_proposal':
      return 'Workout Log';
    case 'routine_proposal':
      return 'New Routine';
    default:
      return 'Proposal';
  }
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (key === 'totalDays') return `${value} day${value !== 1 ? 's' : ''}`;
    if (key.toLowerCase().includes('hours') || key.toLowerCase().includes('duration')) {
      return `${value}h`;
    }
    if (key.toLowerCase().includes('quality') || key.toLowerCase().includes('rpe')) {
      return `${value}/10`;
    }
    return String(value);
  }
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return `${value.length} exercise${value.length !== 1 ? 's' : ''}`;
  return JSON.stringify(value);
}

function formatFieldLabel(key: string): string {
  // Convert camelCase to Title Case
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

// ─── Data Preview ─────────────────────────────────────────────────────────────

interface DataPreviewProps {
  data: Record<string, unknown>;
  type: TitanProposal['type'];
}

function DataPreview({ data, type }: DataPreviewProps) {
  // For routine proposals the generatedData is { routines: Routine[] }.
  // Flatten to the first routine entry so we can display meaningful fields.
  const flatData: Record<string, unknown> = (() => {
    if (type === 'routine_proposal' && Array.isArray(data.routines) && data.routines.length > 0) {
      const first = data.routines[0] as Record<string, unknown>;
      return {
        ...first,
        totalDays: data.routines.length,
      };
    }
    return data;
  })();

  // Select relevant fields based on proposal type
  const relevantFields: string[] = (() => {
    switch (type) {
      case 'sleep_log_proposal':
        return ['date', 'durationHours', 'quality', 'bedtime', 'wakeTime', 'notes'];
      case 'workout_log_proposal':
        return ['routineName', 'date', 'exercises', 'rpe', 'totalVolume', 'notes'];
      case 'routine_proposal':
        return ['totalDays', 'weekday', 'rationale', 'exercises'];
      default:
        return Object.keys(flatData);
    }
  })();

  const displayFields = relevantFields.filter((key) => flatData[key] !== undefined);

  return (
    <div className="space-y-2">
      {displayFields.map((key) => (
        <div key={key} className="flex justify-between items-baseline gap-4 text-sm min-w-0 overflow-hidden">
          <span className="text-white/50 shrink-0">{formatFieldLabel(key)}</span>
          <span className="text-white/85 font-medium truncate text-right min-w-0">
            {formatValue(key, flatData[key])}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TitanProposalCard({
  proposal,
  onAction,
  onDismiss,
  className,
}: TitanProposalCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeHandler, setActiveHandler] = useState<string | null>(null);

  const Icon = getProposalIcon(proposal.type);
  const title = getProposalTitle(proposal.type);

  const handleAction = useCallback(
    async (action: TitanProposalAction) => {
      // Handle dismiss/cancel/edit actions immediately — no async call needed
      if (action.handler === 'dismissProposal' || action.handler === 'cancel' || action.handler === 'editProposal') {
        onDismiss();
        return;
      }

      setIsLoading(true);
      setActiveHandler(action.handler);
      setError(null);

      try {
        await onAction(action.handler, action.data ?? proposal.generatedData);
        // Success — the parent will typically remove this card
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed. Please try again.');
      } finally {
        setIsLoading(false);
        setActiveHandler(null);
      }
    },
    [onAction, onDismiss, proposal.generatedData]
  );

  // Determine button variants based on handler name
  const getButtonVariant = (action: TitanProposalAction): 'primary' | 'secondary' | 'ghost' => {
    if (action.variant) return action.variant;
    const h = action.handler.toLowerCase();
    if (h.includes('confirm') || h.includes('save') || h.includes('create') || h.includes('log') || h.includes('commit')) {
      return 'primary';
    }
    if (h.includes('edit')) return 'secondary';
    return 'ghost';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'rounded-xl border border-white/[0.08] bg-black/40 backdrop-blur-xl overflow-hidden',
        'shadow-lg shadow-black/20',
        className
      )}
      role="region"
      aria-label={`${title} proposal`}
    >
      {/* ── Top loading bar — visible while commit is in flight ── */}
      {isLoading && (
        <div className="h-0.5 w-full bg-[var(--module-color-500)]/20 overflow-hidden">
          <motion.div
            className="h-full bg-[var(--module-color-400)]"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
          />
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="p-1.5 rounded-lg bg-[var(--module-color-500)]/20">
          <Icon className="w-4 h-4 text-[var(--module-color-400)]" />
        </div>
        <span className="flex-1 text-sm font-semibold text-white/90">{title}</span>
        <button
          type="button"
          onClick={onDismiss}
          disabled={isLoading}
          className="p-1.5 -mr-1 rounded-lg hover:bg-white/[0.06] transition-colors disabled:opacity-40"
          aria-label="Dismiss proposal"
        >
          <X className="w-4 h-4 text-white/40" />
        </button>
      </div>

      {/* ── Message ── */}
      <div className="px-4 py-3 text-sm text-white/70 leading-relaxed">
        {proposal.message}
      </div>

      {/* ── Data Preview (with saving overlay) ── */}
      <div className="relative px-4 py-3 border-t border-white/[0.04] bg-black/20">
        <DataPreview data={proposal.generatedData} type={proposal.type} />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 backdrop-blur-[2px] rounded-none">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--module-color-400)]" />
            <span className="text-xs font-semibold text-white/70 uppercase tracking-widest">Saving…</span>
          </div>
        )}
      </div>

      {/* ── Error State ── */}
      {error && (
        <div
          role="alert"
          className="mx-4 mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-white/[0.06] bg-white/[0.02]">
        {proposal.actions.map((action) => {
          const variant = getButtonVariant(action);
          const isActive = activeHandler === action.handler;

          return (
            <NeuralButton
              key={action.handler}
              variant={variant === 'primary' ? 'module' : variant}
              size="sm"
              onClick={() => handleAction(action)}
              disabled={isLoading}
              loading={isActive}
              className={cn(
                'flex-1',
                variant === 'ghost' && 'text-white/60'
              )}
            >
              {variant === 'primary' && !isActive && (
                <Check className="w-3.5 h-3.5 mr-1.5" />
              )}
              {variant === 'secondary' && (
                <Edit3 className="w-3.5 h-3.5 mr-1.5" />
              )}
              {action.label}
            </NeuralButton>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Proposal Skeleton ────────────────────────────────────────────────────────

/**
 * Shown while the AI is streaming the proposal JSON — gives the user an early
 * visual cue that a confirm card is on its way.
 */
export function TitanProposalSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-white/[0.08] bg-black/40 backdrop-blur-xl overflow-hidden shadow-lg shadow-black/20"
      aria-busy="true"
      aria-label="Proposal generating…"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="p-1.5 rounded-lg bg-white/[0.06] animate-pulse">
          <div className="w-4 h-4 rounded bg-white/10" />
        </div>
        <div className="flex-1 h-3.5 rounded-full bg-white/[0.08] animate-pulse max-w-[120px]" />
        <div className="w-6 h-6 rounded-lg bg-white/[0.04] animate-pulse" />
      </div>

      {/* Message line */}
      <div className="px-4 py-3">
        <div className="h-3 rounded-full bg-white/[0.07] animate-pulse max-w-[85%]" />
      </div>

      {/* Data preview skeleton */}
      <div className="px-4 py-3 border-t border-white/[0.04] bg-black/20 space-y-2.5">
        {[80, 60, 70].map((w, i) => (
          <div key={i} className="flex justify-between items-center gap-4">
            <div className={`h-2.5 rounded-full bg-white/[0.06] animate-pulse`} style={{ width: `${w * 0.45}%` }} />
            <div className={`h-2.5 rounded-full bg-white/[0.09] animate-pulse`} style={{ width: `${w * 0.35}%` }} />
          </div>
        ))}
      </div>

      {/* Action button skeletons */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-white/[0.06] bg-white/[0.02]">
        <div className="flex-1 h-8 rounded-lg bg-[var(--module-color-500)]/20 animate-pulse" />
        <div className="flex-1 h-8 rounded-lg bg-white/[0.05] animate-pulse" />
      </div>
    </motion.div>
  );
}

// ─── Type Guard ───────────────────────────────────────────────────────────────

export function isTitanProposal(obj: unknown): obj is TitanProposal {
  if (!obj || typeof obj !== 'object') return false;
  const p = obj as Record<string, unknown>;
  return (
    p.__isTitanProposal === true &&
    typeof p.type === 'string' &&
    typeof p.intent === 'string' &&
    typeof p.generatedData === 'object' &&
    typeof p.message === 'string' &&
    Array.isArray(p.actions)
  );
}

/**
 * Attempts to parse a message content string for an embedded TitanProposal.
 * Returns the proposal if found, null otherwise.
 */
export function extractProposalFromMessage(content: string): TitanProposal | null {
  // Look for JSON object in the message
  const jsonMatch = content.match(/\{[\s\S]*"__isTitanProposal"\s*:\s*true[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (isTitanProposal(parsed)) {
      return parsed;
    }
  } catch {
    // Invalid JSON
  }

  return null;
}
