import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check, MessageCircle, Pause, Play, RotateCcw, Zap } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/core/components/EmptyState';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { AtlasTask } from '../services/atlas-profile-service';

// ---------------------------------------------------------------------------
// FocusView — Zen mode for deep work with pomodoro timer & energy gauge
// ---------------------------------------------------------------------------

interface FocusViewProps {
  activeTask: AtlasTask | null;
  energyLevel: number; // 0-10
  onComplete: (id: string) => void;
  onDefer: (id: string) => void;
  onOpenChat: () => void;
}

const DEFAULT_FOCUS_MINUTES = 25;
const GAUGE_RADIUS = 40;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

export function FocusView({
  activeTask,
  energyLevel,
  onComplete,
  onDefer,
  onOpenChat,
}: FocusViewProps) {
  const reducedMotion = useReducedMotion();

  // ---- Timer state ----
  const [timerSeconds, setTimerSeconds] = useState(DEFAULT_FOCUS_MINUTES * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;
  const timerProgress = 1 - timerSeconds / (DEFAULT_FOCUS_MINUTES * 60);

  // ---- Energy gauge calculations ----
  const energyPercent = Math.max(0, Math.min(100, (energyLevel / 10) * 100));
  const strokeDashoffset =
    GAUGE_CIRCUMFERENCE * (1 - energyPercent / 100);

  const energyColorClass =
    energyLevel >= 6
      ? 'text-emerald-400'
      : energyLevel >= 3
        ? 'text-amber-400'
        : 'text-rose-400';

  const energyStrokeClass =
    energyLevel >= 6
      ? 'stroke-emerald-400'
      : energyLevel >= 3
        ? 'stroke-amber-400'
        : 'stroke-rose-400';

  // ---- Timer logic ----
  useEffect(() => {
    if (isTimerRunning && timerSeconds > 0) {
      intervalRef.current = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            setIsTimerRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isTimerRunning, timerSeconds]);

  // Reset timer when the active task changes
  useEffect(() => {
    setTimerSeconds(DEFAULT_FOCUS_MINUTES * 60);
    setIsTimerRunning(false);
  }, [activeTask?.id]);

  const toggleTimer = useCallback(() => {
    if (timerSeconds === 0) {
      setTimerSeconds(DEFAULT_FOCUS_MINUTES * 60);
      setIsTimerRunning(true);
    } else {
      setIsTimerRunning((prev) => !prev);
    }
  }, [timerSeconds]);

  const resetTimer = useCallback(() => {
    setIsTimerRunning(false);
    setTimerSeconds(DEFAULT_FOCUS_MINUTES * 60);
  }, []);

  // ---- Empty state ----
  if (!activeTask) {
    return (
      <div className="relative h-full flex flex-col items-center justify-center p-8 bg-zinc-950">
        <EmptyState
          title="No active task"
          description="Select a task to enter focus mode"
        />
      </div>
    );
  }

  return (
    <div
      className="relative min-h-full flex flex-col items-center justify-center p-6 pb-24 md:p-12 md:pb-12 bg-zinc-950 overflow-hidden"
      role="region"
      aria-label={`Focus mode: ${activeTask.title}`}
    >
      {/* Ambient emerald glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(52, 211, 153, 0.06), transparent 55%)',
        }}
      />

      <motion.div
        initial={reducedMotion ? false : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
        }
        className="relative z-10 flex flex-col items-center gap-5 sm:gap-8 max-w-md w-full"
      >
        {/* ── Energy gauge ── */}
        <div
          className="relative"
          role="meter"
          aria-label={`Energy level: ${energyLevel} out of 10`}
          aria-valuenow={energyLevel}
          aria-valuemin={0}
          aria-valuemax={10}
        >
          <svg
            width="100"
            height="100"
            viewBox="0 0 100 100"
            className="-rotate-90"
            aria-hidden="true"
          >
            {/* Track */}
            <circle
              cx="50"
              cy="50"
              r={GAUGE_RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="6"
            />
            {/* Fill arc */}
            <circle
              cx="50"
              cy="50"
              r={GAUGE_RADIUS}
              fill="none"
              className={energyStrokeClass}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={GAUGE_CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              style={
                reducedMotion
                  ? undefined
                  : {
                      transition:
                        'stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
                    }
              }
            />
          </svg>
          {/* Center label */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-1">
              <Zap
                className={cn('w-4 h-4', energyColorClass)}
                aria-hidden="true"
              />
              <span
                className={cn('text-lg font-black tabular-nums', energyColorClass)}
              >
                {energyLevel}
              </span>
            </div>
          </div>
        </div>

        {/* ── Active task card ── */}
        <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 space-y-4">
          <div className="text-center space-y-2">
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-emerald-400/60">
              Now Focusing
            </span>
            <h2 className="text-xl md:text-2xl font-black text-white/90 leading-tight">
              {activeTask.title}
            </h2>
            {activeTask.description && (
              <p className="text-sm text-white/40 leading-relaxed line-clamp-3">
                {activeTask.description}
              </p>
            )}
          </div>

          {/* Energy cost badge */}
          <div className="flex items-center justify-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 text-xs font-bold">
              <Zap className="w-3 h-3" aria-hidden="true" />
              Energy: {activeTask.energyCost}/10
            </span>
          </div>
        </div>

        {/* ── Pomodoro timer ── */}
        <div className="flex flex-col items-center gap-4">
          <div
            className="text-4xl md:text-5xl font-black tabular-nums text-white/80 tracking-tight"
            role="timer"
            aria-label={`${minutes} minutes ${seconds} seconds remaining`}
            aria-live="off"
          >
            {String(minutes).padStart(2, '0')}:
            {String(seconds).padStart(2, '0')}
          </div>

          {/* Timer controls */}
          <div className="flex items-center gap-3">
            <NeuralButton
              onClick={toggleTimer}
              aria-label={
                isTimerRunning
                  ? 'Pause timer'
                  : timerSeconds === 0
                    ? 'Restart timer'
                    : 'Start timer'
              }
              variant="ghost"
              themeColor="emerald"
              className={cn(
                'flex items-center justify-center w-12 h-12 rounded-full border transition-all min-h-[44px]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50',
                isTimerRunning
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
              )}
            >
              {isTimerRunning ? (
                <Pause className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" aria-hidden="true" />
              )}
            </NeuralButton>

            <NeuralButton
              onClick={resetTimer}
              aria-label="Reset timer"
              variant="ghost"
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-full border border-white/10 min-h-[44px]',
                'text-white/30 hover:text-white/50 hover:bg-white/5 transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50'
              )}
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
            </NeuralButton>
          </div>

          {/* Timer progress bar */}
          <div
            className="w-48 h-1 bg-white/5 rounded-full overflow-hidden"
            aria-hidden="true"
          >
            <motion.div
              className="h-full rounded-full bg-emerald-400"
              animate={{ width: `${timerProgress * 100}%` }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.3 }}
            />
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div className="flex items-center gap-3 w-full">
          <NeuralButton
            onClick={() => onComplete(activeTask.id)}
            aria-label={`Complete task: ${activeTask.title}`}
            themeColor="emerald"
            className="flex-1 !h-12 !rounded-xl font-bold"
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            Complete
          </NeuralButton>

          <NeuralButton
            onClick={() => onDefer(activeTask.id)}
            aria-label={`Defer task: ${activeTask.title}`}
            variant="secondary"
            className="flex-1 !h-12 !rounded-xl font-bold border-white/10 text-white/50 hover:text-white/70"
          >
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
            Defer
          </NeuralButton>
        </div>
      </motion.div>

      {/* ── Floating chat button ── */}
      <NeuralButton
        onClick={onOpenChat}
        aria-label="Open Nexus"
        themeColor="indigo"
        className={cn(
          'fixed bottom-6 left-6 z-[var(--z-fab)] !w-12 !h-12 !rounded-full',
          'shadow-lg shadow-indigo-500/10'
        )}
      >
        <MessageCircle className="w-5 h-5" aria-hidden="true" />
      </NeuralButton>
    </div>
  );
}
