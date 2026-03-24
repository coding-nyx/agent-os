/**
 * QuickLogBar.tsx — Persistent natural-language workout entry bar.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { buildHistorySuggestion } from '../utils/quick-log-parser';
import type { WorkoutSession } from '@/lib/types';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';

type InlineIconProps = { className?: string; strokeWidth?: number };

function InlineIconBase({ className, strokeWidth = 2, children }: InlineIconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

function IconSparkles({ className, strokeWidth }: InlineIconProps) {
  return (
    <InlineIconBase className={className} strokeWidth={strokeWidth}>
      <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
      <path d="M20 2v4" />
      <path d="M22 4h-4" />
      <circle cx="4" cy="20" r="2" />
    </InlineIconBase>
  );
}

function IconClock({ className, strokeWidth }: InlineIconProps) {
  return (
    <InlineIconBase className={className} strokeWidth={strokeWidth}>
      <path d="M12 6v6l4 2" />
      <circle cx="12" cy="12" r="10" />
    </InlineIconBase>
  );
}

function IconPlus({ className, strokeWidth }: InlineIconProps) {
  return (
    <InlineIconBase className={className} strokeWidth={strokeWidth}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </InlineIconBase>
  );
}

function IconDumbbell({ className, strokeWidth }: InlineIconProps) {
  return (
    <InlineIconBase className={className} strokeWidth={strokeWidth}>
      <path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" />
      <path d="m2.5 21.5 1.4-1.4" />
      <path d="m20.1 3.9 1.4-1.4" />
      <path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" />
      <path d="m9.6 14.4 4.8-4.8" />
    </InlineIconBase>
  );
}

function IconChat({ className, strokeWidth }: InlineIconProps) {
  return (
    <InlineIconBase className={className} strokeWidth={strokeWidth}>
      <path d="M7 10h10" />
      <path d="M7 14h6" />
      <path d="M5 20l1.5-3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H11z" />
    </InlineIconBase>
  );
}

function IconChevronUp({ className, strokeWidth }: InlineIconProps) {
  return (
    <InlineIconBase className={className} strokeWidth={strokeWidth}>
      <path d="m18 15-6-6-6 6" />
    </InlineIconBase>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuickLogBarProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when user submits — parent runs the parser */
  onSubmit: (input: string) => void;
  /** Called when user opens Titan chat */
  onOpenChat?: () => void;
  /** Called when user taps the manual + button */
  onManualLog?: () => void;
  /** Called when user taps the cardio button */
  onCardioLog?: () => void;
  /** Workout sessions ordered newest-first, used for history suggestion */
  recentSessions: WorkoutSession[];
  /** True while LogConfirmCard is open — blurs bar and disables submit */
  disabled?: boolean;
  /** Optional focus change callback for keyboard handling */
  onFocusChange?: (focused: boolean) => void;
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
  onOpenChat,
  onManualLog,
  onCardioLog,
  recentSessions,
  disabled = false,
  onFocusChange,
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
      <div className="w-full relative overflow-hidden">
        {/* History Suggestion Chip (Above the bar) — constrained so it doesn't overflow */}
        <AnimatePresence>
          {isFocused && historySuggestion && !hasInput && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-full left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-10 mb-1 flex justify-center"
            >
              <button
                onClick={handleAcceptHistory}
                className={cn(
                  'inline-flex items-center gap-2 min-h-[44px] px-3 py-2.5 sm:px-4 sm:py-2',
                  'bg-black/60 backdrop-blur-xl border border-white/10 rounded-full',
                  'text-[11px] text-white/50 hover:text-[var(--module-color-400)] hover:border-[var(--module-accent-border)]',
                  'transition-all shadow-xl max-w-[min(280px,calc(100vw-2rem))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]',
                )}
              >
                <IconClock className="w-3.5 h-3.5 shrink-0" />
                <span className="font-bold text-[var(--module-color-400)] uppercase tracking-wider shrink-0">Reuse:</span>
                <span className="truncate min-w-0 text-left">{historySuggestion.text}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className={cn(
            'flex items-center w-full transition-all duration-300 overflow-hidden',
            'bg-white/[0.08] backdrop-blur-2xl border-t border-white/10 shadow-[0_-20px_40px_rgba(0,0,0,0.4)]',
            isFocused && 'border-[var(--module-accent-border)] bg-white/[0.1]',
            isShaking && 'animate-[quicklog-shake_0.4s_ease-in-out]',
          )}
        >
          <div className="flex items-center gap-2 sm:gap-3 w-full py-2.5 px-4 sm:py-3 sm:px-6 md:px-8 min-w-0">
            {onOpenChat && (
              <button
                type="button"
                onClick={onOpenChat}
                title="Open Titan chat"
                aria-label="Open Titan chat"
                className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-2xl bg-black/20 border border-white/10 text-white/50 hover:text-[var(--module-color-400)] hover:bg-[var(--module-accent-muted)] hover:border-[var(--module-accent-border)] transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)] shrink-0"
              >
                <IconChat className="w-4 h-4" />
              </button>
            )}

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
              onFocus={() => {
                setIsFocused(true);
                onFocusChange?.(true);
              }}
              onBlur={() => {
                setIsFocused(false);
                onFocusChange?.(false);
                setTimeout(() => setShowActions(false), 200);
              }}
              placeholder={PLACEHOLDERS[placeholderIdx]}
              className={cn(
                'flex-1 min-w-0 text-sm sm:text-[14px] text-white/90',
                'bg-black/20 border border-white/10 rounded-xl',
                'px-3 sm:px-4 py-3 min-h-[44px] sm:min-h-[48px]',
                'placeholder:text-white/30 placeholder:truncate caret-[var(--module-accent)]',
                'focus:outline-none focus:border-[var(--module-accent)] focus:ring-1 focus:ring-[var(--module-accent-ring)]',
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
                    <button
                      onClick={onCardioLog}
                      title="Log Cardio"
                      aria-label="Log Cardio"
                      className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-2xl bg-black/20 border border-white/10 text-white/50 hover:text-[var(--module-color-400)] hover:bg-[var(--module-accent-muted)] hover:border-[var(--module-accent-border)] transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]"
                    >
                      <IconDumbbell className="w-4 h-4" />
                    </button>
                    <button
                      onClick={onManualLog}
                      title="Manual Log"
                      aria-label="Manual log"
                      className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-2xl bg-black/20 border border-white/10 text-white/50 hover:text-[var(--module-color-400)] hover:bg-[var(--module-accent-muted)] hover:border-[var(--module-accent-border)] transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]"
                    >
                      <IconPlus className="w-5 h-5" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {hasInput ? (
                <button
                  onClick={handleSubmit}
                  aria-label="Submit log"
                  className="inline-flex items-center justify-center min-w-[48px] min-h-[48px] w-12 h-12 rounded-2xl bg-[var(--module-accent)] text-[var(--module-accent-text)] shadow-[0_0_20px_var(--module-accent-glow)] hover:scale-105 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]"
                >
                  <IconChevronUp className="w-6 h-6" strokeWidth={3} />
                </button>
              ) : (
                <button
                  onClick={() => setShowActions(!showActions)}
                  aria-label={showActions ? 'Close actions' : 'Show actions'}
                  className={cn(
                    'inline-flex items-center justify-center min-w-[48px] min-h-[48px] w-12 h-12 rounded-2xl transition-all active:scale-95 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
                    showActions
                      ? 'bg-black/30 border-white/20 text-white'
                      : 'bg-black/20 border-white/10 text-white/40 hover:text-white/80 hover:bg-black/30 hover:border-white/15',
                  )}
                >
                  <IconPlus className={cn('w-5 h-5 transition-transform duration-300', showActions && 'rotate-45')} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
