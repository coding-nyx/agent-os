/**
 * AgentPendingBadge
 *
 * Tiny inline pill badge that surfaces agent-review status on any health-data
 * entry card.  Returns null when no agentReview is supplied so callers can
 * render it unconditionally without conditional JSX clutter.
 *
 * Status → visual mapping
 *   pending_review → amber clock  + pulsing dot
 *   approved       → emerald check
 *   rejected       → red ×        (optional tooltip via agentNote)
 *   modified       → blue pencil  (optional tooltip via suggestedValue)
 *
 * Animations: scale-in via Framer Motion on mount.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Clock, CheckCircle2, XCircle, PencilLine, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentReview } from '@/lib/types';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AgentPendingBadgeProps {
  /** Agent review payload attached to a health-data entry. */
  agentReview?: AgentReview;
  /**
   * When true the badge gains a native `title` tooltip that surfaces
   * agentNote (for rejected) or suggestedValue (for modified).
   */
  showNote?: boolean;
  /** Visual size tier.  Defaults to 'sm'. */
  size?: 'sm' | 'md';
}

// ── Internal config ───────────────────────────────────────────────────────────

interface StatusConfig {
  icon: LucideIcon;
  label: string;
  containerCls: string;
  textCls: string;
  iconCls: string;
  /** Show an animated dot alongside the icon */
  pulse?: boolean;
}

const STATUS_CONFIG: Record<AgentReview['status'], StatusConfig> = {
  pending_review: {
    icon: Clock,
    label: 'Pending Review',
    containerCls: 'bg-amber-500/15 border-amber-500/30',
    textCls: 'text-amber-300',
    iconCls: 'text-amber-400',
    pulse: true,
  },
  approved: {
    icon: CheckCircle2,
    label: 'Approved',
    containerCls: 'bg-[var(--module-accent-glow)] border-[var(--module-accent-border)]',
    textCls: 'text-[var(--module-color-300)]',
    iconCls: 'text-[var(--module-color-400)]',
  },
  rejected: {
    icon: XCircle,
    label: 'Flagged',
    containerCls: 'bg-red-500/15 border-red-500/30',
    textCls: 'text-red-300',
    iconCls: 'text-red-400',
  },
  modified: {
    icon: PencilLine,
    label: 'Suggestion',
    containerCls: 'bg-blue-500/15 border-blue-500/30',
    textCls: 'text-blue-300',
    iconCls: 'text-blue-400',
  },
};

const SIZE_CLS = {
  sm: { pill: 'px-2 py-0.5 gap-1',    text: 'text-[10px]', icon: 'w-3 h-3', dot: 'w-1.5 h-1.5' },
  md: { pill: 'px-2.5 py-1 gap-1.5',  text: 'text-xs',     icon: 'w-3.5 h-3.5', dot: 'w-2 h-2' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function AgentPendingBadge({
  agentReview,
  showNote = false,
  size = 'sm',
}: AgentPendingBadgeProps) {
  // Nothing to render without a review record
  if (!agentReview) return null;

  const config = STATUS_CONFIG[agentReview.status];
  const dims   = SIZE_CLS[size];
  const Icon   = config.icon;

  // Build tooltip text when showNote is requested
  const tooltipText = (() => {
    if (!showNote) return undefined;
    if (agentReview.status === 'rejected' && agentReview.agentNote) {
      return agentReview.agentNote;
    }
    if (agentReview.status === 'modified' && agentReview.suggestedValue !== undefined) {
      return `Suggested: ${agentReview.suggestedValue}`;
    }
    return agentReview.agentNote;
  })();

  return (
    <motion.span
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1,   opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      title={tooltipText}
      className={cn(
        'inline-flex items-center rounded-full border font-medium select-none',
        config.containerCls,
        dims.pill,
      )}
      role="status"
      aria-label={`Agent review: ${config.label}`}
    >
      {/* Animated pulse dot for pending state */}
      {config.pulse && (
        <span
          className={cn(
            'rounded-full bg-amber-400 animate-pulse flex-shrink-0',
            dims.dot,
          )}
          aria-hidden="true"
        />
      )}

      <Icon
        className={cn('flex-shrink-0', config.iconCls, dims.icon)}
        aria-hidden="true"
      />

      <span className={cn(config.textCls, dims.text)}>
        {config.label}
      </span>
    </motion.span>
  );
}
