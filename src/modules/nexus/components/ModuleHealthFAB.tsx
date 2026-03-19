import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Grid3X3, Lock, LayoutDashboard, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useModuleHealth, type StatusTone } from '../hooks/useModuleHealth';
import { UnifiedAuthModal, type AuthMode } from '@/core/components/UnifiedAuthModal';
import type { ModuleId } from '@/lib/module-manifest';

const TONE_DOT: Record<StatusTone, string> = {
  good: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]',
  warn: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]',
  bad: 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.5)]',
  neutral: 'bg-white/20',
};

const TONE_LABEL: Record<StatusTone, string> = {
  good: 'healthy',
  warn: 'warning',
  bad: 'critical',
  neutral: 'unknown',
};

function formatLastActive(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return `${Math.floor(diffHr / 24)}d`;
}

export function ModuleHealthFAB() {
  const { modules, isLoading } = useModuleHealth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('global');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const shouldReduceMotion = useReducedMotion();

  const totalTiles = modules.length;

  const alertCount = modules.filter(
    (m) => m.hasAlert || m.keyMetricTone === 'bad'
  ).length;
  const warnCount = modules.filter((m) => m.keyMetricTone === 'warn').length;
  const badgeCount = alertCount + warnCount;

  const close = useCallback(() => {
    setIsOpen(false);
    fabRef.current?.focus();
  }, []);

  // Outside click dismiss
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      close();
    }
  }, [close]);

  useEffect(() => {
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, handleClickOutside]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isOpen, close]);

  // Focus first accessible tile when popover opens
  useEffect(() => {
    if (!isOpen || isLoading) return;
    const firstAccessible = tileRefs.current.find((el) => el && !el.disabled);
    firstAccessible?.focus();
  }, [isOpen, isLoading]);

  // Arrow key navigation within grid (3 columns)
  const handleGridKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    const cols = 3;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = index + 1 < totalTiles ? index + 1 : null;
    if (e.key === 'ArrowLeft')  next = index - 1 >= 0 ? index - 1 : null;
    if (e.key === 'ArrowDown')  next = index + cols < totalTiles ? index + cols : null;
    if (e.key === 'ArrowUp')    next = index - cols >= 0 ? index - cols : null;
    if (next !== null) {
      e.preventDefault();
      tileRefs.current[next]?.focus();
    }
  }, [totalTiles]);

  const go = useCallback((route: string) => {
    setIsOpen(false);
    navigate(route);
  }, [navigate]);

  const openAuth = useCallback((moduleId: ModuleId) => {
    setIsOpen(false);
    setAuthMode(moduleId);
    setIsAuthOpen(true);
  }, []);

  const springTransition = shouldReduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 500, damping: 32 };

  const tileTransition = (i: number) =>
    shouldReduceMotion ? { duration: 0 } : { delay: i * 0.025, duration: 0.2 };

  return (
    <div
      ref={containerRef}
      className={cn(
        // Lifted until layout has space on left (lg+). At middle widths chat is still full-width.
        'absolute left-4 z-[var(--z-fab)] bottom-28 lg:bottom-4'
      )}
    >
      {/* ── Popover Grid ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="fab-panel"
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 6 }}
            transition={springTransition}
            role="menu"
            aria-label="Module navigator"
            className={cn(
              'absolute bottom-16 left-0',
              'w-[280px] max-w-[calc(100vw-2rem)] p-2.5 rounded-2xl',
              'bg-black/70 backdrop-blur-2xl',
              'border border-white/[0.08]',
              'shadow-xl shadow-black/60'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-1.5 pb-1.5 mb-1 border-b border-white/[0.04]">
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/30">
                Modules
              </span>
              <button
                onClick={close}
                className="p-0.5 rounded-md hover:bg-white/5 transition-colors"
                aria-label="Close module navigator"
                tabIndex={-1}
              >
                <X className="w-3 h-3 text-white/25" />
              </button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-3 gap-1.5">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-[56px] rounded-xl bg-white/[0.02] animate-pulse" />
                  ))
                : modules.map((mod, i) => {
                    const Icon = mod.icon;
                    return (
                      <motion.button
                        key={mod.moduleId}
                        ref={(el) => { tileRefs.current[i] = el; }}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={tileTransition(i)}
                        role="menuitem"
                        aria-label={`${mod.alias || mod.title}${mod.isAccessible ? `, status: ${TONE_LABEL[mod.keyMetricTone]}, last active: ${formatLastActive(mod.lastActive)}` : ', locked — click to unlock'}`}
                        onClick={() => mod.isAccessible ? go(mod.route) : openAuth(mod.moduleId as ModuleId)}
                        onKeyDown={(e) => handleGridKeyDown(e, i)}
                        className={cn(
                          'group flex flex-col items-center justify-center gap-1',
                          'h-[56px] rounded-xl px-1',
                          'transition-all duration-150',
                          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30',
                          mod.isAccessible
                            ? 'hover:bg-white/[0.04] active:scale-95 cursor-pointer'
                            : 'hover:bg-white/[0.03] active:scale-95 cursor-pointer opacity-50 hover:opacity-80'
                        )}
                      >
                        <div className="relative">
                          <Icon
                            className="w-4 h-4 transition-colors"
                            style={mod.isAccessible ? { color: mod.colorHex } : undefined}
                          />
                          {mod.isAccessible ? (
                            <>
                              <div className={cn(
                                'absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full',
                                TONE_DOT[mod.keyMetricTone]
                              )} aria-hidden="true" />
                              <span className="sr-only">{TONE_LABEL[mod.keyMetricTone]}</span>
                            </>
                          ) : (
                            <Lock className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 text-white/40" />
                          )}
                        </div>
                        <span className="text-[8px] font-semibold text-white/40 group-hover:text-white/60 truncate max-w-full transition-colors">
                          {mod.title}
                        </span>
                      </motion.button>
                    );
                  })}

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FAB Trigger ── */}
      <motion.button
        ref={fabRef}
        onClick={() => setIsOpen(!isOpen)}
        whileHover={shouldReduceMotion ? undefined : { scale: 1.06 }}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
        className={cn(
          'relative w-[60px] h-[60px] rounded-2xl',
          'bg-white/[0.04] backdrop-blur-xl',
          'border border-white/[0.08]',
          'flex items-center justify-center',
          'transition-all duration-200',
          'hover:bg-white/[0.07] hover:border-white/[0.12]',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/40',
          isOpen && 'bg-white/[0.08] border-white/[0.15]'
        )}
        aria-label={isOpen ? 'Close module navigator' : `Open module navigator${badgeCount > 0 ? ` (${badgeCount} alerts)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={shouldReduceMotion ? undefined : { rotate: -90, opacity: 0 }}
              animate={shouldReduceMotion ? undefined : { rotate: 0, opacity: 1 }}
              exit={shouldReduceMotion ? undefined : { rotate: 90, opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <X className="w-5 h-5 text-white/40" />
            </motion.div>
          ) : (
            <motion.div
              key="grid"
              initial={shouldReduceMotion ? undefined : { rotate: 90, opacity: 0 }}
              animate={shouldReduceMotion ? undefined : { rotate: 0, opacity: 1 }}
              exit={shouldReduceMotion ? undefined : { rotate: -90, opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <Grid3X3 className="w-5 h-5 text-white/35" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Alert badge */}
        {badgeCount > 0 && !isOpen && (
          <span
            className={cn(
              'absolute -top-1 -right-1',
              'min-w-[14px] h-[14px] px-0.5',
              'rounded-full flex items-center justify-center',
              badgeCount >= 10 ? 'text-[6px]' : 'text-[7px]',
              'font-bold text-white',
              alertCount > 0
                ? 'bg-rose-500/90 shadow-[0_0_6px_rgba(244,63,94,0.4)]'
                : 'bg-amber-500/90 shadow-[0_0_6px_rgba(245,158,11,0.3)]'
            )}
            aria-hidden="true"
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </motion.button>
      <UnifiedAuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        mode={authMode}
      />
    </div>
  );
}
