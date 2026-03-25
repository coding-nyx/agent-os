import { AnimatePresence, motion } from 'framer-motion';
import { CheckCheck, Trash2 } from 'lucide-react';

import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BulkActionBarProps {
  /** IDs of currently selected notifications. Bar is hidden when size === 0. */
  selectedIds: Set<string>;
  /** Total number of visible (filtered) notifications — used in "Select all N" label. */
  totalVisible: number;
  /** Called when user wants to select all visible notifications. */
  onSelectAll: () => void;
  /** Called when user wants to deselect all notifications. */
  onClearSelection: () => void;
  /** Called when user wants to mark all selected notifications as read. */
  onMarkReadSelected: () => void;
  /** Called when user wants to delete all selected notifications. */
  onDeleteSelected: () => void;
}

// ─── Spring config ────────────────────────────────────────────────────────────

const SLIDE_VARIANTS = {
  hidden: { y: -44, opacity: 0, scale: 0.97 },
  visible: { y: 0, opacity: 1, scale: 1 },
  exit: { y: -44, opacity: 0, scale: 0.97 },
} as const;

const SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const;

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * BulkActionBar
 *
 * Renders a floating glass pill below the page header whenever at least one
 * notification is selected. Animates in/out with a spring slide from the top.
 *
 * Complexity: O(1) — all counts are derived from props, no internal iteration.
 */
export default function BulkActionBar({
  selectedIds,
  totalVisible,
  onSelectAll,
  onClearSelection,
  onMarkReadSelected,
  onDeleteSelected,
}: BulkActionBarProps) {
  const count = selectedIds.size;

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          key="bulk-action-bar"
          variants={SLIDE_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={SPRING}
          className={cn(
            'flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl',
            'bg-white/[0.06] border border-white/10 backdrop-blur-xl',
          )}
          role="toolbar"
          aria-label="Bulk actions"
        >
          {/* ── Left: selection info + selection controls ── */}
          <div className="flex items-center gap-1 min-w-0 flex-shrink">
            <span className="text-sm font-semibold text-white/80 tabular-nums whitespace-nowrap mr-1">
              {count} selected
            </span>

            <NeuralButton
              variant="ghost"
              size="sm"
              onClick={onSelectAll}
              className="text-white/50 hover:text-white/80 whitespace-nowrap"
            >
              Select all {totalVisible}
            </NeuralButton>

            <span className="text-white/20 select-none">·</span>

            <NeuralButton
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              className="text-white/40 hover:text-white/70 whitespace-nowrap"
            >
              Clear
            </NeuralButton>
          </div>

          {/* ── Right: action buttons ── */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <NeuralButton
              variant="ghost"
              size="sm"
              onClick={onMarkReadSelected}
              className={cn(
                'flex items-center gap-1.5',
                'text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10',
              )}
              title={`Mark ${count} notification${count !== 1 ? 's' : ''} as read`}
            >
              <CheckCheck className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Mark read</span>
            </NeuralButton>

            <NeuralButton
              variant="ghost"
              size="sm"
              onClick={onDeleteSelected}
              className={cn(
                'flex items-center gap-1.5',
                'text-rose-400 hover:text-rose-300 hover:bg-rose-400/10',
              )}
              title={`Delete ${count} notification${count !== 1 ? 's' : ''}`}
            >
              <Trash2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Delete</span>
            </NeuralButton>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
