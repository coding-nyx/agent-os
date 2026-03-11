/**
 * QuickLogBar.tsx — Persistent natural-language workout entry bar.
 *
 * Lives at the bottom of the Training tab. The user types:
 *   "3x5 squat @100kg, 3x8 bench @80kg, 3x10 lat pulldown @55"
 * and the bar parses it instantly into a structured workout log.
 *
 * Design: dark glassmorphism, orange/amber Titan theme, thumb-reachable.
 * Position: static footer at bottom of left content panel (not fixed to viewport).
 *
 * Interaction contract:
 *  - onSubmit fires with the raw input string; caller owns parsing.
 *  - disabled=true when the LogConfirmCard is open (prevents double-submit).
 *  - onAcceptHistory accepts a pre-formed string from the history suggestion.
 *
 * Accessibility:
 *  - Input has explicit aria-label.
 *  - History suggestion is a real <button> (not a div).
 *  - Submit button has aria-label.
 *  - Shake animation is triggered via CSS class, does not affect focus.
 *  - Ghost text overlay is aria-hidden.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildHistorySuggestion } from '../utils/quick-log-parser';
import type { WorkoutSession } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuickLogBarProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when user submits — parent runs the parser */
  onSubmit: (input: string) => void;
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
  recentSessions,
  disabled = false,
  className,
}: QuickLogBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

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
      // Shake animation to signal "empty is not valid"
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

  // ── Accept history suggestion ───────────────────────────────────────────
  const handleAcceptHistory = useCallback(() => {
    if (!historySuggestion) return;
    onChange(historySuggestion.text);
    inputRef.current?.focus();
  }, [historySuggestion, onChange]);

  const hasInput = value.trim().length > 0;

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        // Anchored to bottom of its flex-column parent (not fixed to viewport)
        'w-full shrink-0',
        'pb-[env(safe-area-inset-bottom,0px)]',
        // Glass treatment
        'bg-[#0c0c10]/90 backdrop-blur-2xl',
        'border-t border-orange-500/15',
        'shadow-[0_-8px_40px_rgba(0,0,0,0.5)]',
        // Disabled state: dim when confirm card is open
        disabled && 'opacity-60 pointer-events-none',
        // Focus ring on the whole bar
        isFocused && 'border-t-orange-500/30 shadow-[0_-8px_40px_rgba(249,115,22,0.08)]',
        'transition-all duration-200',
        className,
      )}
      role="search"
      aria-label="Quick workout log"
    >
      <div className="px-4 pt-3 pb-3 flex flex-col gap-1.5">
        {/* ── Input row ── */}
        <div
          className={cn(
            'flex items-center gap-2',
            isShaking && 'animate-[quicklog-shake_0.4s_ease-in-out]',
          )}
        >
          {/* Leading icon */}
          <div
            aria-hidden="true"
            className={cn(
              'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors duration-200',
              hasInput
                ? 'bg-orange-500/25 border border-orange-500/35'
                : 'bg-orange-500/15 border border-orange-500/20',
            )}
          >
            <Zap className="w-3.5 h-3.5 text-orange-400" />
          </div>

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            aria-label="Log exercises — type 3x5 squat @100kg, 3x8 bench @80kg"
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
            onBlur={() => setIsFocused(false)}
            placeholder={PLACEHOLDERS[placeholderIdx]}
            disabled={disabled}
            className={cn(
              'flex-1 bg-transparent text-sm text-white/90',
              'placeholder:text-white/25 caret-orange-400',
              'focus:outline-none min-h-[44px] py-0',
              'transition-colors duration-150',
            )}
          />

          {/* Submit button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled}
            aria-label="Preview workout log"
            className={cn(
              'shrink-0 w-9 h-9 rounded-xl flex items-center justify-center',
              'transition-all duration-150 active:scale-95',
              'focus-visible:ring-2 focus-visible:ring-orange-500/60 focus-visible:outline-none',
              hasInput
                ? 'bg-orange-500/30 border border-orange-500/40 text-orange-300 shadow-[0_0_12px_rgba(249,115,22,0.2)]'
                : 'bg-orange-500/15 border border-orange-500/20 text-orange-400/60',
            )}
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>

        {/* ── History suggestion chip ── */}
        <AnimatePresence>
          {isFocused && historySuggestion && !hasInput && (
            <motion.div
              key="history-chip"
              initial={{ opacity: 0, y: 4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: 4, height: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2 px-1 overflow-hidden"
            >
              <Clock
                aria-hidden="true"
                className="w-3 h-3 text-white/25 shrink-0"
              />
              <span className="text-[11px] text-white/30 shrink-0">
                Last session:
              </span>
              <button
                type="button"
                onClick={handleAcceptHistory}
                title={historySuggestion.text}
                aria-label={`Pre-fill with last session from ${relativeDate(historySuggestion.date)}: ${historySuggestion.text}`}
                className={cn(
                  'text-[11px] text-orange-400/60 hover:text-orange-400',
                  'font-semibold truncate max-w-[200px]',
                  'underline decoration-dotted underline-offset-2',
                  'transition-colors duration-150',
                )}
              >
                {historySuggestion.text}
              </button>
              <span
                aria-hidden="true"
                className="text-[10px] text-white/20 shrink-0 ml-auto"
              >
                {relativeDate(historySuggestion.date)}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
