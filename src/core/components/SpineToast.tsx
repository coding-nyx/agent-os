import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Bell, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalSoulStore } from '@/lib/global-soul-context';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useNotifications, type NotificationToast } from '@/lib/notifications/NotificationContext';
import type { NotificationPriority } from '@/lib/notifications/types';

// ---------------------------------------------------------------------------
// SpineToast — Notification toasts driven by NotificationContext
// ---------------------------------------------------------------------------

const PRIORITY_CONFIG: Record<NotificationPriority, {
  border: string;
  bg: string;
  icon: any;
  iconColor: string;
  duration: number;
}> = {
  info: {
    border: 'border-white/[0.12]',
    bg: 'bg-[#05050a]/95',
    icon: Bell,
    iconColor: 'text-white/50',
    duration: 5000
  },
  alert: {
    border: 'border-amber-500/30',
    bg: 'bg-[#05050a]/95',
    icon: Zap,
    iconColor: 'text-amber-400',
    duration: 6000
  },
  critical: {
    border: 'border-rose-500/30',
    bg: 'bg-[#05050a]/95',
    icon: AlertCircle,
    iconColor: 'text-rose-400',
    duration: 8000
  }
};

export function SpineToastProvider() {
  const { toasts, dismissToast, performAction } = useNotifications();
  const globalSoul = useGlobalSoulStore(s => s.globalSoul);
  const reducedMotion = useReducedMotion();
  const moduleNames = globalSoul?.displayNames ?? {};

  // Auto-dismiss: track per-toast timers so that adding/removing a toast does
  // not reset the countdown for unrelated toasts.
  const activeTimers = useRef(new Map<string, number>());
  useEffect(() => {
    const timers = activeTimers.current;
    // Create timers for new toasts that don't already have one.
    for (const toast of toasts) {
      if (timers.has(toast.id)) continue;
      const config = PRIORITY_CONFIG[toast.priority] || PRIORITY_CONFIG.info;
      const timer = window.setTimeout(() => {
        timers.delete(toast.id);
        dismissToast(toast.id);
      }, config.duration);
      timers.set(toast.id, timer);
    }
    // Clean up timers for toasts that have been removed externally.
    const currentIds = new Set(toasts.map((t) => t.id));
    for (const [id, timer] of timers) {
      if (!currentIds.has(id)) {
        window.clearTimeout(timer);
        timers.delete(id);
      }
    }
  }, [toasts, dismissToast]);

  // Clear all timers on unmount.
  useEffect(() => {
    const timers = activeTimers.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-20 right-4 z-[var(--z-toast)] flex flex-col-reverse gap-2 max-w-[min(380px,calc(100vw-3rem))] pb-[env(safe-area-inset-bottom,0px)] pointer-events-none"
      aria-label="Notifications"
    >
      <AnimatePresence>
        {toasts.map((toast, index) => {
          const config = PRIORITY_CONFIG[toast.priority] || PRIORITY_CONFIG.info;
          const Icon = config.icon;
          const isCascade = toast.source.startsWith('cascade:');
          const sourceName = moduleNames[toast.source.replace(/^cascade:/, '')] || toast.source;

          return (
            <motion.div
              key={toast.id}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 100, scale: 0.95 }}
              transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 25 }}
              role={toast.priority === 'critical' ? 'alert' : 'status'}
              aria-live={toast.priority === 'critical' ? 'assertive' : 'polite'}
              onClick={() => {
                if (toast.action) performAction(toast.action, toast.id);
              }}
              className={cn(
                'pointer-events-auto cursor-pointer group rounded-2xl border backdrop-blur-xl p-4 shadow-2xl transition-all hover:translate-y-[-2px] hover:shadow-white/5 active:scale-[0.98]',
                config.border,
                config.bg,
                index >= 2 && 'hidden sm:block'
              )}
            >
              <div className="flex items-start gap-3">
                <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', config.iconColor)} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  {isCascade && (
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-400 mb-1">
                      Cascade Event
                    </p>
                  )}
                  <p className="text-xs text-white/80 font-bold leading-snug">
                    {toast.title}
                  </p>
                  <p className="text-[11px] text-white/40 mt-1 uppercase tracking-wider">
                    {toast.note?.trim() || (sourceName !== toast.source ? sourceName : null)}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissToast(toast.id);
                    }}
                    className="w-6 h-6 rounded-lg bg-white/[0.045] hover:bg-white/10 flex items-center justify-center shrink-0 transition-colors"
                    aria-label="Dismiss notification"
                  >
                    <X className="w-3 h-3 text-white/50" />
                  </button>
                  {toast.action && (
                    <div className="w-6 h-6 flex items-center justify-center">
                      <Zap className="w-2.5 h-2.5 text-white/20 animate-pulse" />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
