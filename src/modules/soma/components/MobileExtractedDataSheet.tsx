/**
 * MobileExtractedDataSheet
 * 
 * Collapsible bottom sheet showing extracted data summary on mobile.
 * Shows a trigger button with item count badge, expands to show grouped items.
 * Uses CSS transitions for performance, supports swipe-to-dismiss.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo, useReducedMotion } from 'framer-motion';
import {
  ChevronUp,
  ChevronDown,
  FlaskConical,
  FileText,
  Pill,
  AlertTriangle,
  Activity,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExtractedDataItem } from '@/core/diagnosis/types';

// Map extracted item types to icons
const ITEM_TYPE_ICONS: Record<string, typeof FlaskConical> = {
  biomarker: FlaskConical,
  lab_summary: FileText,
  clearance: Activity,
  condition: AlertTriangle,
  medication: Pill,
  allergy: AlertTriangle,
  medical_image_analysis: Activity,
  finding: FileText,
  summary: FileText,
};

interface MobileExtractedDataSheetProps {
  items: ExtractedDataItem[];
  isProcessing?: boolean;
  className?: string;
}

interface GroupedItems {
  type: string;
  label: string;
  items: ExtractedDataItem[];
  icon: typeof FlaskConical;
}

function groupItems(items: ExtractedDataItem[]): GroupedItems[] {
  const groups = new Map<string, ExtractedDataItem[]>();
  
  for (const item of items) {
    const type = item.type || 'other';
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type)!.push(item);
  }

  return Array.from(groups.entries()).map(([type, groupItems]) => ({
    type,
    label: type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    items: groupItems,
    icon: ITEM_TYPE_ICONS[type] || FileText,
  }));
}

export function MobileExtractedDataSheet({
  items,
  isProcessing = false,
  className,
}: MobileExtractedDataSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  const grouped = groupItems(items);
  const totalCount = items.length;

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Handle swipe down to close
  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      // If dragged down more than 100px or with significant velocity, close
      if (info.offset.y > 100 || info.velocity.y > 500) {
        setIsOpen(false);
      }
    },
    []
  );

  // Don't render if no items
  if (totalCount === 0 && !isProcessing) {
    return null;
  }

  return (
    <div className={cn('lg:hidden', className)}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-4 py-3',
          'min-h-[48px]', // WCAG touch target
          'rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md',
          'text-sm font-medium text-white/70 hover:text-white hover:bg-white/[0.05]',
          'transition-colors duration-200',
          'outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]'
        )}
        aria-expanded={isOpen}
        aria-controls="extracted-data-sheet"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] flex items-center justify-center">
            <FlaskConical className="w-4 h-4 text-[var(--module-color-400)]" />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold uppercase tracking-wider text-white/50">
              Extracted Data
            </p>
            <p className="text-sm font-medium text-white/80">
              {isProcessing ? 'Analyzing...' : `${totalCount} item${totalCount !== 1 ? 's' : ''} found`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {totalCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-[var(--module-accent-glow)] border border-[var(--module-accent-border)] text-[var(--module-color-300)] text-xs font-bold">
              {totalCount > 99 ? '99+' : totalCount}
            </span>
          )}
          {isProcessing && (
            <span className="w-4 h-4 border-2 border-t-transparent border-[var(--module-color-400)] rounded-full animate-spin" />
          )}
          <ChevronUp className="w-4 h-4 text-white/40" />
        </div>
      </button>

      {/* Sheet Overlay + Content */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReduced ? 0 : 0.2 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[var(--z-modal)]"
              onClick={() => setIsOpen(false)}
              aria-hidden
            />

            {/* Sheet */}
            <motion.div
              ref={sheetRef}
              id="extracted-data-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Extracted data summary"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={
                prefersReduced
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 400, damping: 40 }
              }
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              className={cn(
                'fixed inset-x-0 bottom-0 z-[var(--z-modal)]',
                'max-h-[70vh] min-h-[200px]',
                'rounded-t-3xl border-t border-white/10 bg-[#0a0a0f]/95 backdrop-blur-xl',
                'flex flex-col overflow-hidden',
                'pb-[env(safe-area-inset-bottom,0px)]'
              )}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <FlaskConical className="w-5 h-5 text-[var(--module-color-400)]" />
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    Extracted Data
                  </h2>
                  <span className="text-sm text-white/40">
                    {totalCount} item{totalCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content - scrollable */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-4">
                {grouped.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-sm text-white/40">
                      {isProcessing ? 'Analyzing document...' : 'No data extracted yet'}
                    </p>
                  </div>
                ) : (
                  grouped.map((group) => (
                    <div key={group.type}>
                      {/* Group header */}
                      <div className="flex items-center gap-2 mb-2">
                        <group.icon className="w-4 h-4 text-white/40" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-white/50">
                          {group.label}
                        </h3>
                        <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded">
                          {group.items.length}
                        </span>
                      </div>

                      {/* Items */}
                      <div className="space-y-1">
                        {group.items.slice(0, 5).map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white/80 truncate">
                                {item.label}
                              </p>
                              {item.data?.value !== undefined && (
                                <p className="text-xs text-white/50 truncate">
                                  {String(item.data.value)}
                                  {typeof item.data.unit === 'string' && ` ${item.data.unit}`}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                        {group.items.length > 5 && (
                          <p className="text-xs text-white/30 pl-3 italic">
                            +{group.items.length - 5} more
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer hint */}
              <div className="px-4 py-3 border-t border-white/5 text-center">
                <p className="text-[11px] text-white/30">
                  Swipe down or tap outside to close
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
