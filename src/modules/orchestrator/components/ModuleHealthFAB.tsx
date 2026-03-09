import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Grid3X3, Lock, LayoutDashboard, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useModuleHealth, type StatusTone } from '../hooks/useModuleHealth';

const TONE_DOT: Record<StatusTone, string> = {
  good: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]',
  warn: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]',
  bad: 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.5)]',
  neutral: 'bg-white/20',
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
  const containerRef = useRef<HTMLDivElement>(null);

  const alertCount = modules.filter(
    (m) => m.hasAlert || m.keyMetricTone === 'bad'
  ).length;
  const warnCount = modules.filter((m) => m.keyMetricTone === 'warn').length;
  const badgeCount = alertCount + warnCount;

  // Outside click dismiss
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, handleClickOutside]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isOpen]);

  const go = (route: string) => { setIsOpen(false); navigate(route); };

  return (
    <div ref={containerRef} className="absolute bottom-4 right-4 z-40">
      {/* ── Popover Grid ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="fab-panel"
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 6 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            role="dialog"
            aria-label="Module Navigator"
            className={cn(
              'absolute bottom-11 right-0',
              'w-[280px] p-2.5 rounded-2xl',
              'bg-black/70 backdrop-blur-2xl',
              'border border-white/[0.08]',
              'shadow-xl shadow-black/60'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-1.5 pb-1.5 mb-1 border-b border-white/[0.04]">
              <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/30">
                Modules
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="p-0.5 rounded-md hover:bg-white/5 transition-colors"
                aria-label="Close"
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
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.025, duration: 0.2 }}
                        onClick={() => go(mod.route)}
                        disabled={!mod.isAccessible}
                        className={cn(
                          'group flex flex-col items-center justify-center gap-1',
                          'h-[56px] rounded-xl px-1',
                          'transition-all duration-150',
                          mod.isAccessible
                            ? 'hover:bg-white/[0.04] active:scale-95 cursor-pointer'
                            : 'opacity-30 cursor-not-allowed'
                        )}
                        aria-label={`${mod.title}${mod.isAccessible ? '' : ' (locked)'}`}
                      >
                        <div className="relative">
                          {mod.isAccessible ? (
                            <Icon className="w-4 h-4 transition-colors" style={{ color: mod.colorHex }} />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-white/20" />
                          )}
                          {/* Status dot */}
                          {mod.isAccessible && (
                            <div className={cn(
                              'absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full',
                              TONE_DOT[mod.keyMetricTone]
                            )} />
                          )}
                        </div>
                        <span className="text-[8px] font-semibold text-white/50 group-hover:text-white/70 truncate max-w-full transition-colors">
                          {mod.title}
                        </span>
                      </motion.button>
                    );
                  })}

              {/* Hub tile */}
              {!isLoading && (
                <motion.button
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: modules.length * 0.025, duration: 0.2 }}
                  onClick={() => go('/hub')}
                  className={cn(
                    'group flex flex-col items-center justify-center gap-1',
                    'h-[56px] rounded-xl px-1',
                    'transition-all duration-150',
                    'hover:bg-indigo-500/[0.06] active:scale-95 cursor-pointer'
                  )}
                  aria-label="Hub — 3D module graph"
                >
                  <LayoutDashboard className="w-4 h-4 text-indigo-400/60 group-hover:text-indigo-400 transition-colors" />
                  <span className="text-[8px] font-semibold text-indigo-300/40 group-hover:text-indigo-300/70 transition-colors">
                    Hub
                  </span>
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FAB Trigger ── */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className={cn(
          'relative w-[42px] h-[42px] rounded-xl',
          'bg-white/[0.04] backdrop-blur-xl',
          'border border-white/[0.08]',
          'flex items-center justify-center',
          'transition-all duration-200',
          'hover:bg-white/[0.07] hover:border-white/[0.12]',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/40',
          isOpen && 'bg-white/[0.08] border-white/[0.15]'
        )}
        aria-label={isOpen ? 'Close modules' : `Module navigator${badgeCount > 0 ? ` (${badgeCount} alerts)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.12 }}>
              <X className="w-[18px] h-[18px] text-white/40" />
            </motion.div>
          ) : (
            <motion.div key="grid" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.12 }}>
              <Grid3X3 className="w-[18px] h-[18px] text-white/35" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Alert badge */}
        {badgeCount > 0 && !isOpen && (
          <span className={cn(
            'absolute -top-1 -right-1',
            'w-[14px] h-[14px]',
            'rounded-full flex items-center justify-center',
            'text-[7px] font-bold text-white',
            alertCount > 0
              ? 'bg-rose-500/90 shadow-[0_0_6px_rgba(244,63,94,0.4)]'
              : 'bg-amber-500/90 shadow-[0_0_6px_rgba(245,158,11,0.3)]'
          )}>
            {badgeCount}
          </span>
        )}
      </motion.button>
    </div>
  );
}
