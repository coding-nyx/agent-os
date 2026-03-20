/**
 * QuickLogBar.tsx — Persistent natural-language workout entry bar.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp, Clock, Plus, Dumbbell, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildHistorySuggestion } from '../utils/quick-log-parser';
import type { WorkoutSession } from '@/lib/types';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuickLogBarProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when user submits — parent runs the parser */
  onSubmit: (input: string) => void;
  /** Called when user taps the manual + button */
  onManualLog?: () => void;
  /** Called when user taps the cardio button */
  onCardioLog?: () => void;
  /** Workout sessions ordered newest-first, used for history suggestion */
  recentSessions: WorkoutSession[];
  /** True while LogConfirmCard is open — blurs bar and disables submit */
  disabled?: boolean;
  className?: string;
}

// ─── Placeholder rotation ─────────────────────────────────────────────────────

const PLACEHOLDERS = [
  '3x5 squat @100kg, 3x8 bench @80kg…',
  'bench 3x8 80kg · ohp 3x10 60kg…',
  'Format: SETSxREPS exercise @WEIGHT',
];

// ─── Relative date helper ─────────────────────────────────────────────────────

function relativeDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffDays = Math.round((now.getTime() - date.getTime()) / 86_400_000);
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return 'last week';
    return `${Math.round(diffDays / 7)} weeks ago`;
  } catch {
    return '';
  }
}

// ─── QuickLogBar ──────────────────────────────────────────────────────────────

export function QuickLogBar({
  value,
  onChange,
  onSubmit,
  onManualLog,
  onCardioLog,
  recentSessions,
  disabled = false,
  className,
}: QuickLogBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [showActions, setShowActions] = useState(false);

  // ── Placeholder rotation ────────────────────────────────────────────────
  useEffect(() => {
    if (isFocused || value) return;
    const id = setInterval(() => {
      setPlaceholderIdx(i => (i + 1) % PLACEHOLDERS.length);
    }, 3500);
    return () => clearInterval(id);
  }, [isFocused, value]);

  // ── History suggestion ──────────────────────────────────────────────────
  const historySuggestion = buildHistorySuggestion(recentSessions);

  // ── Submit logic ────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (disabled) return;
    if (!value.trim()) {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }
    onSubmit(value.trim());
  }, [disabled, value, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleNexusClick = () => {
    window.dispatchEvent(new Event('open-nexus'));
  };

  const handleAcceptHistory = useCallback(() => {
    if (!historySuggestion) return;
    onChange(historySuggestion.text);
    inputRef.current?.focus();
  }, [historySuggestion, onChange]);

  const hasInput = value.trim().length > 0;

  return (
    <div
      className={cn(
        'w-full shrink-0 z-[var(--z-fab)] mt-auto',
        'pb-0 sm:pb-[env(safe-area-inset-bottom,0px)]',
        disabled && 'opacity-0 pointer-events-none translate-y-4',
        'transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]',
        className,
      )}
    >
      <div className="w-full relative px-2 md:px-0 overflow-hidden">
        {/* History Suggestion Chip (Above the bar) — constrained so it doesn't overflow */}
        <AnimatePresence>
          {isFocused && historySuggestion && !hasInput && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-full left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-10 mb-1 flex justify-center"
            >
              <NeuralButton
                onClick={handleAcceptHistory}
                variant="secondary"
                size="sm"
                className={cn(
                  'gap-2 min-h-[44px] px-3 py-2.5 sm:px-4 sm:py-2',
                  'bg-black/60 backdrop-blur-xl border border-white/10 rounded-full',
                  'text-[11px] text-white/50 hover:text-orange-400 hover:border-orange-500/30',
                  'transition-all shadow-xl max-w-[min(280px,calc(100vw-2rem))]',
                )}
              >
                <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden />
                <span className="font-bold text-orange-500/60 uppercase tracking-wider shrink-0">Reuse:</span>
                <span className="truncate min-w-0 text-left">{historySuggestion.text}</span>
              </NeuralButton>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className={cn(
            'flex items-center w-full transition-all duration-300 overflow-hidden',
            'bg-white/[0.08] backdrop-blur-2xl border-t border-white/10 shadow-[0_-20px_40px_rgba(0,0,0,0.4)]',
            isFocused && 'border-orange-500/40 bg-white/[0.1]',
            isShaking && 'animate-[quicklog-shake_0.4s_ease-in-out]',
          )}
        >
          <div className="flex items-center gap-2 sm:gap-3 w-full py-2.5 px-2 sm:py-3 sm:px-4 min-w-0">
            {/* Nexus Anchor — hidden on very narrow to prioritize input */}
            <NeuralButton
              onClick={handleNexusClick}
              title="Consult Nexus"
              aria-label="Consult Nexus"
              themeColor="indigo"
              variant="secondary"
              className={cn(
                'shrink-0 min-w-[48px] min-h-[48px] w-12 h-12 rounded-2xl',
                'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400',
                'hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-all active:scale-95',
                'max-[380px]:hidden',
              )}
            >
              <Sparkles className="w-5 h-5 drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]" aria-hidden />
            </NeuralButton>

            {/* Intelligence Input — visible boundary, min-w-0 so flex doesn't overflow */}
            <NeuralInput
              ref={inputRef}
              type="text"
              aria-label="Unified entry — log workout or ask Nexus"
              enterKeyHint="go"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                setIsFocused(false);
                setTimeout(() => setShowActions(false), 200);
              }}
              placeholder={PLACEHOLDERS[placeholderIdx]}
              className={cn(
                'flex-1 min-w-0 text-sm sm:text-[14px] text-white/90',
                'bg-black/20 border border-white/10 rounded-xl',
                'px-3 sm:px-4 py-3 min-h-[44px] sm:min-h-[48px]',
                'placeholder:text-white/30 placeholder:truncate caret-orange-500',
                'focus:outline-none focus:border-orange-500/30 focus:ring-1 focus:ring-orange-500/20',
              )}
            />

            {/* Dynamic Actions + Submit/Plus */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <AnimatePresence>
                {showActions && !hasInput && (
                  <motion.div
                    initial={{ width: 0, opacity: 0, x: 20 }}
                    animate={{ width: 'auto', opacity: 1, x: 0 }}
                    exit={{ width: 0, opacity: 0, x: 20 }}
                    className="flex items-center gap-1.5 sm:gap-2 overflow-hidden"
                  >
                    <NeuralButton
                      onClick={onCardioLog}
                      title="Log Cardio"
                      aria-label="Log Cardio"
                      variant="secondary"
                      className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-2xl bg-black/20 border border-white/10 text-white/50 hover:text-orange-400 hover:bg-orange-500/10 hover:border-orange-500/20 transition-all active:scale-95"
                    >
                      <Dumbbell className="w-4 h-4" aria-hidden />
                    </NeuralButton>
                    <NeuralButton
                      onClick={onManualLog}
                      title="Manual Log"
                      aria-label="Manual log"
                      variant="secondary"
                      className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-2xl bg-black/20 border border-white/10 text-white/50 hover:text-orange-400 hover:bg-orange-500/10 hover:border-orange-500/20 transition-all active:scale-95"
                    >
                      <Plus className="w-5 h-5" aria-hidden />
                    </NeuralButton>
                  </motion.div>
                )}
              </AnimatePresence>

              {hasInput ? (
                <NeuralButton
                  onClick={handleSubmit}
                  aria-label="Submit log"
                  themeColor="orange"
                  className="min-w-[48px] min-h-[48px] w-12 h-12 rounded-2xl bg-orange-500 text-black shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:scale-105 active:scale-95 transition-all"
                >
                  <ChevronUp className="w-6 h-6 stroke-[3px]" aria-hidden />
                </NeuralButton>
              ) : (
                <NeuralButton
                  onClick={() => setShowActions(!showActions)}
                  aria-label={showActions ? 'Close actions' : 'Show actions'}
                  variant="secondary"
                  className={cn(
                    'min-w-[48px] min-h-[48px] w-12 h-12 rounded-2xl transition-all active:scale-95 border',
                    showActions
                      ? 'bg-black/30 border-white/20 text-white'
                      : 'bg-black/20 border-white/10 text-white/40 hover:text-white/80 hover:bg-black/30 hover:border-white/15',
                  )}
                >
                  <Plus className={cn('w-5 h-5 transition-transform duration-300', showActions && 'rotate-45')} aria-hidden />
                </NeuralButton>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
