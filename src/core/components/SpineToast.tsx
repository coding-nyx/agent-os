import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Spine } from '@/lib/spine/spine-event-bus';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { EVENT_DISPLAY_NAMES } from '@/lib/state-display-config';
import type { SpineEvent } from '@/lib/types';

// ---------------------------------------------------------------------------
// SpineToast — Notification toasts for significant spine events
// ---------------------------------------------------------------------------

interface ToastItem {
  id: string;
  event: SpineEvent;
  displayLabel: string;
  createdAt: number;
}

const PRIORITY_STYLES: Record<SpineEvent['priority'], {
  border: string;
  bg: string;
  icon: string;
  duration: number;
}> = {
  info: {
    border: 'border-white/10',
    bg: 'bg-[#05050a]/95',
    icon: 'text-white/50',
    duration: 5000
  },
  alert: {
    border: 'border-amber-500/30',
    bg: 'bg-[#05050a]/95',
    icon: 'text-amber-400',
    duration: 6000
  },
  critical: {
    border: 'border-rose-500/30',
    bg: 'bg-[#05050a]/95',
    icon: 'text-rose-400',
    duration: 8000
  }
};

// Events that should NOT produce toasts
const SUPPRESSED_TYPES = new Set([
  'VITAL_UPDATED',
  'SESSION_STARTED',
  'SESSION_ENDED',
  'DRAFT_PROPOSED',  // These use NeuralDraftPanel
  'DRAFT_APPROVED',
  'DRAFT_DISMISSED',
  'SECURITY_POLICY_UPDATED'
]);

function getEventModuleSource(event: SpineEvent, moduleNames: Record<string, string>): string {
  const raw = event.source.replace(/^cascade:/, '');
  return moduleNames[raw] || raw;
}

export function SpineToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const { globalSoul } = useGlobalSoul();
  const reducedMotion = useReducedMotion();
  const moduleNames = globalSoul?.displayNames ?? {};

  // Subscribe to spine events
  useEffect(() => {
    return Spine.on('*', (event) => {
      if (SUPPRESSED_TYPES.has(event.type)) return;
      if (event.priority === 'info') return; // Only toast alert/critical

      const isCascade = event.source.startsWith('cascade:');
      const sourceName = getEventModuleSource(event, moduleNames);
      const displayLabel = EVENT_DISPLAY_NAMES[event.type] || event.type;

      const toast: ToastItem = {
        id: event.id,
        event,
        displayLabel: isCascade
          ? `${sourceName}: ${displayLabel}`
          : displayLabel,
        createdAt: Date.now()
      };

      setToasts(prev => [toast, ...prev].slice(0, 4));
    });
  }, [moduleNames]);

  // Auto-dismiss toasts
  useEffect(() => {
    if (toasts.length === 0) return;

    const oldestToast = toasts[toasts.length - 1];
    const style = PRIORITY_STYLES[oldestToast.event.priority];
    const timer = window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== oldestToast.id));
    }, style.duration);

    return () => window.clearTimeout(timer);
  }, [toasts]);

  const dismiss = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Keyboard dismiss
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && toasts.length > 0) {
        setToasts(prev => prev.slice(1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toasts.length]);

  return (
    <div
      className="fixed bottom-6 right-6 z-[var(--z-toast)] flex flex-col-reverse gap-2 max-w-[380px] pointer-events-none"
      aria-label="Notifications"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const style = PRIORITY_STYLES[toast.event.priority];
          const isCascade = toast.event.source.startsWith('cascade:');
          const sourceName = getEventModuleSource(toast.event, moduleNames);

          return (
            <motion.div
              key={toast.id}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 100, scale: 0.95 }}
              transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 25 }}
              role={toast.event.priority === 'critical' ? 'alert' : 'status'}
              aria-live={toast.event.priority === 'critical' ? 'assertive' : 'polite'}
              className={cn(
                'pointer-events-auto rounded-2xl border backdrop-blur-xl p-4 shadow-2xl',
                style.border,
                style.bg
              )}
            >
              <div className="flex items-start gap-3">
                <Zap className={cn('w-4 h-4 mt-0.5 shrink-0', style.icon)} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  {isCascade && (
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-400 mb-1">
                      Cascade Event
                    </p>
                  )}
                  <p className="text-xs text-white/80 font-bold leading-snug">
                    {toast.displayLabel}
                  </p>
                  <p className="text-[10px] text-white/40 mt-1 uppercase tracking-wider">
                    {sourceName}
                  </p>
                </div>
                <button
                  onClick={() => dismiss(toast.id)}
                  className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center shrink-0 transition-colors"
                  aria-label="Dismiss notification"
                >
                  <X className="w-3 h-3 text-white/50" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
