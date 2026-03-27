/**
 * AgentApprovalLog
 *
 * Scrollable audit trail of every resolved agent-review action.
 * Entries are grouped by date (Today / Yesterday / formatted date string)
 * and rendered as a staggered animated list.
 *
 * Each row shows:
 *   • Left  — coloured action icon
 *   • Center — fieldLabel · action label · agentNote (truncated at 80 chars)
 *   • Right  — relative timestamp ("2 hours ago", "Yesterday" …)
 *
 * Empty state is shown when no entries exist.
 */

import React, { useMemo } from 'react';
import { motion, type Variants } from 'framer-motion';
import { CheckCircle2, XCircle, PencilLine, ClipboardList, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LogEntry {
  /** Unique identifier of the health-data entry that was reviewed */
  entryId: string;
  /** Human-readable field name, e.g. "Heart Rate" */
  fieldLabel: string;
  /** The agent's resolution */
  action: 'approved' | 'rejected' | 'modified';
  /** Optional reasoning note from the agent */
  agentNote?: string;
  /** ISO-8601 timestamp of when the review was completed */
  reviewedAt: string;
}

export interface AgentApprovalLogProps {
  /** Ordered list of resolved review entries (most-recent first preferred) */
  entries: LogEntry[];
  /** CSS max-height for the scroll container.  Defaults to '400px'. */
  maxHeight?: string;
}

// ── Action config ─────────────────────────────────────────────────────────────

interface ActionConfig {
  icon: LucideIcon;
  label: string;
  iconCls: string;
  rowCls: string;
}

const ACTION_CONFIG: Record<LogEntry['action'], ActionConfig> = {
  approved: {
    icon: CheckCircle2,
    label: 'Approved',
    iconCls: 'text-[var(--module-color-400)]',
    rowCls: 'border-l-[var(--module-accent-border)]',
  },
  rejected: {
    icon: XCircle,
    label: 'Flagged',
    iconCls: 'text-red-400',
    rowCls: 'border-l-red-500/40',
  },
  modified: {
    icon: PencilLine,
    label: 'Suggestion',
    iconCls: 'text-blue-400',
    rowCls: 'border-l-blue-500/40',
  },
};

// ── Utilities ─────────────────────────────────────────────────────────────────

const MAX_NOTE_CHARS = 80;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Returns 'Today', 'Yesterday', or a locale date string */
function groupLabel(isoDate: string): string {
  const entryDate  = new Date(isoDate);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(todayStart.getDate() - 1);

  if (entryDate >= todayStart) return 'Today';
  if (entryDate >= yesterdayStart) return 'Yesterday';

  return entryDate.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Formats an ISO-8601 timestamp as a short relative string.
 * Falls back to a locale time string for entries older than 7 days.
 */
function relativeTime(isoDate: string): string {
  const diffMs  = Date.now() - new Date(isoDate).getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60)                      return 'Just now';
  if (diffSec < 3600)                    return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400)                   return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800)                  return 'Yesterday';
  if (diffSec < 604800)                  return `${Math.floor(diffSec / 86400)}d ago`;

  return new Date(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Stagger animation config ──────────────────────────────────────────────────

const ITEM_VARIANTS: Variants = {
  hidden:  { opacity: 0, x: -12 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.06, duration: 0.25, ease: 'easeOut' },
  }),
};

// ── Component ─────────────────────────────────────────────────────────────────

export function AgentApprovalLog({
  entries,
  maxHeight = '400px',
}: AgentApprovalLogProps) {
  /**
   * Group entries by their date label.
   * O(n) pass — builds an ordered array of [label, entries[]] tuples so the
   * original sort order is preserved within each group.
   */
  const groups = useMemo<Array<[string, LogEntry[]]>>(() => {
    const map = new Map<string, LogEntry[]>();

    for (const entry of entries) {
      const label = groupLabel(entry.reviewedAt);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(entry);
    }

    return Array.from(map.entries());
  }, [entries]);

  // ── Empty state ────────────────────────────────────────────────────────────

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
        <div className="w-10 h-10 rounded-full bg-white/[0.045] border border-white/[0.12] flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-white/30" aria-hidden="true" />
        </div>
        <p className="text-sm text-white/40 max-w-xs leading-relaxed">
          No agent reviews yet. Health entries will appear here after agent validation.
        </p>
      </div>
    );
  }

  // ── Log list ───────────────────────────────────────────────────────────────

  let absoluteIndex = 0; // used to offset stagger delays across groups

  return (
    <div
      className="overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
      style={{ maxHeight }}
      role="log"
      aria-label="Agent approval history"
      aria-live="polite"
    >
      {groups.map(([label, groupEntries]) => (
        <section key={label} className="mb-2 last:mb-0">
          {/* Group header / divider */}
          <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-slate-900/85 backdrop-blur-sm">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-white/30">
              {label}
            </span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          {/* Entry rows */}
          <ul className="px-2 py-1 space-y-1" role="list">
            {groupEntries.map(entry => {
              const currentIndex = absoluteIndex++;
              return (
                <LogRow
                  key={entry.entryId}
                  entry={entry}
                  index={currentIndex}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ── Sub-component: LogRow ─────────────────────────────────────────────────────

interface LogRowProps {
  entry: LogEntry;
  index: number;
}

function LogRow({ entry, index }: LogRowProps) {
  const config = ACTION_CONFIG[entry.action];
  const Icon   = config.icon;

  const note = entry.agentNote ? truncate(entry.agentNote, MAX_NOTE_CHARS) : null;

  return (
    <motion.li
      custom={index}
      variants={ITEM_VARIANTS}
      initial="hidden"
      animate="visible"
      className={cn(
        'flex items-start gap-3 rounded-xl px-3 py-2.5',
        'border-l-2 bg-white/[0.045] hover:bg-white/[0.045] transition-colors',
        config.rowCls,
      )}
      role="listitem"
    >
      {/* Action icon */}
      <div className="flex-shrink-0 mt-0.5">
        <Icon
          className={cn('w-4 h-4', config.iconCls)}
          aria-hidden="true"
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-white truncate">
            {entry.fieldLabel}
          </span>
          <span className="text-[11px] text-white/30">·</span>
          <span className={cn('text-[11px] font-medium', config.iconCls)}>
            {config.label}
          </span>
        </div>

        {note && (
          <p className="mt-0.5 text-[11px] text-white/45 leading-snug truncate">
            {note}
          </p>
        )}
      </div>

      {/* Relative timestamp */}
      <time
        dateTime={entry.reviewedAt}
        className="flex-shrink-0 text-[11px] text-white/30 mt-0.5 whitespace-nowrap"
      >
        {relativeTime(entry.reviewedAt)}
      </time>
    </motion.li>
  );
}
