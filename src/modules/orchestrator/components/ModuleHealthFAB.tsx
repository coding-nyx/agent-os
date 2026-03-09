import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hexagon, Lock, LayoutDashboard, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useModuleHealth, type StatusTone } from '../hooks/useModuleHealth';

// ─── Status Colors ──────────────────────────────────────────────────────────
const TONE_RING: Record<StatusTone, string> = {
  good: 'ring-emerald-400/40 shadow-[0_0_8px_rgba(52,211,153,0.25)]',
  warn: 'ring-amber-400/40 shadow-[0_0_8px_rgba(251,191,36,0.25)]',
  bad: 'ring-rose-400/40 shadow-[0_0_8px_rgba(251,113,133,0.25)]',
  neutral: 'ring-white/10',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatLastActive(iso: string | null): string {
  if (!iso) return 'No data';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

// ─── Component ───────────────────────────────────────────────────────────────
export function ModuleHealthFAB() {
  const { modules, isLoading } = useModuleHealth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Derive alert count for badge
  const alertCount = modules.filter(
    (m) => m.hasAlert || m.keyMetricTone === 'bad'
  ).length;
  const warnCount = modules.filter((m) => m.keyMetricTone === 'warn').length;
  const badgeCount = alertCount + warnCount;

  // Close on outside click
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    },
    []
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, handleClickOutside]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const handleModuleClick = (route: string) => {
    setIsOpen(false);
    navigate(route);
  };

  return (
    <div ref={panelRef} className="absolute bottom-20 right-4 z-40">
      {/* ── Expanded Panel ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop scrim — click to close */}
            <motion.div
              key="fab-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[-1]"
              aria-hidden="true"
            />

            {/* Module grid panel */}
            <motion.div
              key="fab-panel"
              initial={{ opacity: 0, scale: 0.85, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 12 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              role="dialog"
              aria-label="Module Health Overview"
              className={cn(
                'absolute bottom-14 right-0',
                'w-[320px] p-3 rounded-[20px]',
                'bg-black/80 backdrop-blur-xl',
                'border border-white/10',
                'shadow-2xl shadow-black/50'
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-white/5">
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-indigo-400">
                  Module Health
                </span>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/5 transition-colors"
                  aria-label="Close module panel"
                >
                  <X className="w-3.5 h-3.5 text-white/40" />
                </button>
              </div>

              {/* Module Grid — 3 columns */}
              <div className="grid grid-cols-3 gap-2">
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-[72px] rounded-[14px] bg-white/[0.02] border border-white/5 animate-pulse"
                      />
                    ))
                  : modules.map((mod, i) => {
                      const Icon = mod.icon;
                      return (
                        <motion.button
                          key={mod.moduleId}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{
                            delay: i * 0.035,
                            type: 'spring',
                            stiffness: 500,
                            damping: 30,
                          }}
                          onClick={() => handleModuleClick(mod.route)}
                          disabled={!mod.isAccessible}
                          className={cn(
                            'flex flex-col items-center justify-center gap-1.5',
                            'h-[72px] rounded-[14px] border px-2 py-2',
                            'transition-all duration-150',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
                            mod.isAccessible
                              ? [
                                  'border-white/8 bg-white/[0.02]',
                                  'hover:border-white/15 hover:bg-white/[0.05]',
                                  'active:scale-95',
                                ]
                              : 'border-white/5 bg-white/[0.01] opacity-40 cursor-not-allowed',
                            mod.hasAlert && 'border-rose-500/25'
                          )}
                          aria-label={`${mod.title}: ${
                            mod.isAccessible
                              ? `Status ${mod.keyMetricTone}, ${formatLastActive(mod.lastActive)}`
                              : 'Locked'
                          }`}
                        >
                          {/* Icon with status ring */}
                          <div
                            className={cn(
                              'w-7 h-7 rounded-full flex items-center justify-center',
                              'ring-2',
                              mod.isAccessible
                                ? TONE_RING[mod.keyMetricTone]
                                : 'ring-white/5'
                            )}
                          >
                            {mod.isAccessible ? (
                              <Icon
                                className="w-3.5 h-3.5"
                                style={{ color: mod.colorHex }}
                              />
                            ) : (
                              <Lock className="w-3 h-3 text-white/25" />
                            )}
                          </div>

                          {/* Label */}
                          <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/70 truncate max-w-full">
                            {mod.title}
                          </span>

                          {/* Timestamp */}
                          {mod.isAccessible && (
                            <span className="text-[8px] text-white/30 -mt-1 truncate">
                              {formatLastActive(mod.lastActive)}
                            </span>
                          )}
                        </motion.button>
                      );
                    })}

                {/* Hub — special tile */}
                {!isLoading && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      delay: modules.length * 0.035,
                      type: 'spring',
                      stiffness: 500,
                      damping: 30,
                    }}
                    onClick={() => handleModuleClick('/hub')}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1.5',
                      'h-[72px] rounded-[14px] border px-2 py-2',
                      'transition-all duration-150',
                      'border-indigo-500/20 bg-indigo-500/[0.04]',
                      'hover:border-indigo-500/35 hover:bg-indigo-500/[0.08]',
                      'active:scale-95',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50'
                    )}
                    aria-label="Open Hub — 3D spatial view and module graph"
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center ring-2 ring-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.2)]">
                      <LayoutDashboard className="w-3.5 h-3.5 text-indigo-400" />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-[0.12em] text-indigo-300/80">
                      Hub
                    </span>
                    <span className="text-[8px] text-indigo-400/40 -mt-1">
                      3D · Graph
                    </span>
                  </motion.button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── FAB Button ──────────────────────────────────────────────────── */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        className={cn(
          'relative w-12 h-12 rounded-[16px]',
          'bg-black/80 backdrop-blur-xl',
          'border border-white/10',
          'flex items-center justify-center',
          'shadow-lg shadow-black/40',
          'transition-colors duration-200',
          'hover:border-indigo-500/30 hover:bg-indigo-500/[0.06]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
          isOpen && 'border-indigo-500/25 bg-indigo-500/[0.08]'
        )}
        aria-label={
          isOpen
            ? 'Close module health panel'
            : `Module health overview${badgeCount > 0 ? `, ${badgeCount} alert${badgeCount !== 1 ? 's' : ''}` : ''}`
        }
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="w-5 h-5 text-white/60" />
            </motion.div>
          ) : (
            <motion.div
              key="hex"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Hexagon className="w-5 h-5 text-indigo-400/70" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Alert badge */}
        {badgeCount > 0 && !isOpen && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={cn(
              'absolute -top-1 -right-1',
              'min-w-[18px] h-[18px] px-1',
              'rounded-full flex items-center justify-center',
              'text-[9px] font-black text-white',
              alertCount > 0
                ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]',
              alertCount > 0 && 'animate-pulse'
            )}
          >
            {badgeCount}
          </motion.span>
        )}
      </motion.button>
    </div>
  );
}
