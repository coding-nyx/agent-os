/**
 * ConflictResolutionOverlay — Global shell component
 *
 * Renders a non-blocking slide-up overlay when NexusSynthesisService detects
 * one or more active conflicts that should be surfaced to the user.
 *
 * Placement: src/core/components/ — rendered inside App.tsx so it is visible
 * regardless of which module the user is viewing.
 *
 * Design:
 *  - One conflict shown at a time; others queued
 *  - block-level: pulsing red border
 *  - warn-level:  amber border
 *  - Framer Motion AnimatePresence, slides up from the bottom
 *  - Three CTA buttons: "Proceed Anyway" | "Defer 1 Hour" | "Let Nyx Reroute"
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Brain,
  ClipboardList,
  Code,
  HeartPulse,
  Search,
  Sparkles,
  Zap,
  Bell,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  Clock,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalSoulStore } from '@/lib/global-soul-context';
import { NexusSynthesisService } from '@/cortex-bridge/nexus-synthesis-bridge';
import type { ConflictResult, ConflictSeverity } from '@/cortex-bridge/nexus-synthesis-bridge';
import type { ModuleId } from '@/lib/module-manifest';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 800;

// ---------------------------------------------------------------------------
// Module icon registry — uses the same icons as module-manifest.ts
// ---------------------------------------------------------------------------

const MODULE_ICON_MAP: Record<ModuleId, LucideIcon> = {
  nexus: Sparkles,
  agnes:        Brain,
  titan:        Activity,
  soma:         HeartPulse,
  ledger:       ClipboardList,
  atlas:        Zap,
  scout:        Search,
  forge:        Code,
  bridge:       Bell,
};

const MODULE_COLOUR_MAP: Record<ModuleId, string> = {
  nexus: 'bg-violet-500/20 text-violet-300 ring-violet-500/30',
  agnes:        'bg-indigo-500/20 text-indigo-300 ring-indigo-500/30',
  titan:        'bg-orange-500/20 text-orange-300 ring-orange-500/30',
  soma:         'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30',
  ledger:       'bg-cyan-500/20 text-cyan-300 ring-cyan-500/30',
  atlas:        'bg-lime-500/20 text-lime-300 ring-lime-500/30',
  scout:        'bg-sky-500/20 text-sky-300 ring-sky-500/30',
  forge:        'bg-fuchsia-500/20 text-fuchsia-300 ring-fuchsia-500/30',
  bridge:       'bg-slate-500/20 text-slate-300 ring-slate-500/30',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModuleBadge({ moduleId }: { moduleId: ModuleId }) {
  const Icon = MODULE_ICON_MAP[moduleId] ?? Sparkles;
  const colour = MODULE_COLOUR_MAP[moduleId] ?? MODULE_COLOUR_MAP.nexus;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ring-1',
        colour,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {moduleId}
    </span>
  );
}

interface SeverityBadgeProps {
  severity: ConflictSeverity;
}

function SeverityBadge({ severity }: SeverityBadgeProps) {
  if (severity === 'block') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-rose-300 ring-1 ring-rose-500/40">
        <ShieldAlert className="h-3 w-3" aria-hidden />
        Blocked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-300 ring-1 ring-amber-500/40">
      <AlertTriangle className="h-3 w-3" aria-hidden />
      Warning
    </span>
  );
}

interface ConflictCardProps {
  conflict: ConflictResult;
  queueLength: number;
  onProceed: () => void;
  onDefer: () => void;
  onReroute: () => void;
}

function ConflictCard({
  conflict,
  queueLength,
  onProceed,
  onDefer,
  onReroute,
}: ConflictCardProps) {
  const isBlock = conflict.severity === 'block';

  return (
    <div
      className={cn(
        'relative rounded-2xl border p-4 shadow-2xl backdrop-blur-xl',
        'bg-black/70',
        isBlock
          ? 'border-rose-500/50 animate-[pulse-border_2s_ease-in-out_infinite]'
          : 'border-amber-500/40',
      )}
    >
      {/* Queue indicator */}
      {queueLength > 1 && (
        <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-white/50">
          {queueLength}
        </div>
      )}

      {/* Header row */}
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <SeverityBadge severity={conflict.severity} />
        <span
          className={cn(
            'text-sm font-bold leading-tight',
            isBlock ? 'text-rose-200' : 'text-amber-200',
          )}
        >
          {conflict.title}
        </span>
      </div>

      {/* Affected module badges */}
      {conflict.affectedModules.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {conflict.affectedModules.map((m) => (
            <ModuleBadge key={m} moduleId={m} />
          ))}
        </div>
      )}

      {/* Suggested resolution */}
      <p className="mb-4 text-xs leading-relaxed text-white/65">
        {conflict.suggestedResolution}
      </p>

      {/* CTA buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onProceed}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.045] px-3 py-1.5 text-xs font-semibold text-white/70 transition-all hover:bg-white/10 hover:text-white active:scale-95"
        >
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          Proceed Anyway
        </button>

        <button
          onClick={onDefer}
          className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition-all hover:bg-amber-500/20 active:scale-95"
        >
          <Clock className="h-3.5 w-3.5" aria-hidden />
          Defer 1 Hour
        </button>

        <button
          onClick={onReroute}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all active:scale-95',
            isBlock
              ? 'border border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
              : 'border border-violet-500/40 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25',
          )}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Let Nyx Reroute
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main overlay component
// ---------------------------------------------------------------------------

export function ConflictResolutionOverlay() {
  const globalSoul    = useGlobalSoulStore((s) => s.globalSoul);
  const isLoading     = useGlobalSoulStore((s) => s.isLoading);

  // Queue of conflicts waiting to be displayed
  const [queue, setQueue]       = useState<ConflictResult[]>([]);
  // The conflict currently on-screen (head of the queue)
  const [current, setCurrent]   = useState<ConflictResult | null>(null);
  // Controls AnimatePresence visibility
  const [visible, setVisible]   = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Conflict detection — runs whenever the NSV changes, debounced 800 ms
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (isLoading || !globalSoul?.crossFunctionalState) return;

    const nsv = globalSoul.crossFunctionalState;

    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;

      const detected   = NexusSynthesisService.detectConflicts(nsv);
      const surfaceable = detected.filter((c) => NexusSynthesisService.shouldSurface(c));

      if (surfaceable.length === 0) return;

      // Merge into the queue without duplicating already-queued IDs
      setQueue((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const incoming    = surfaceable.filter((c) => !existingIds.has(c.id));
        return [...prev, ...incoming];
      });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [globalSoul, isLoading]);

  // -------------------------------------------------------------------------
  // Queue → current promotion
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (current !== null || queue.length === 0) return;

    const [head, ...rest] = queue;
    setQueue(rest);
    // Mark surfaced before showing so shouldSurface won't re-fire this one
    NexusSynthesisService.markSurfaced(head);
    setCurrent(head);
    setVisible(true);
  }, [queue, current]);

  // -------------------------------------------------------------------------
  // Resolution handlers
  // -------------------------------------------------------------------------

  const dismiss = useCallback(() => {
    setVisible(false);
    // Allow exit animation to finish before clearing `current`
    window.setTimeout(() => setCurrent(null), 320);
  }, []);

  const handleProceed = useCallback(() => {
    if (!current) return;
    NexusSynthesisService.resolveConflict(current.id, 'proceed');
    dismiss();
  }, [current, dismiss]);

  const handleDefer = useCallback(() => {
    if (!current) return;
    NexusSynthesisService.resolveConflict(current.id, 'defer');
    dismiss();
  }, [current, dismiss]);

  const handleReroute = useCallback(() => {
    if (!current) return;
    NexusSynthesisService.resolveConflict(current.id, 'reroute');
    dismiss();
  }, [current, dismiss]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <AnimatePresence>
      {visible && current && (
        <motion.div
          key={current.id}
          initial={{ y: '120%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '120%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className={cn(
            // Positioned at the bottom of the viewport, above other fixed UI
            'fixed bottom-6 left-1/2 z-[var(--z-toast)] w-full max-w-sm -translate-x-1/2 px-4',
            // On larger screens nudge left so it doesn't overlap the Spine rail
            'lg:right-16 lg:left-auto lg:translate-x-0',
          )}
          // Accessibility
          role="dialog"
          aria-modal="false"
          aria-label={`Conflict: ${current.title}`}
          aria-live="assertive"
        >
          <ConflictCard
            conflict={current}
            queueLength={queue.length + 1}
            onProceed={handleProceed}
            onDefer={handleDefer}
            onReroute={handleReroute}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
