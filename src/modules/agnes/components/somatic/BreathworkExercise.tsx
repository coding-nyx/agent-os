import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useAnimationControls, AnimatePresence } from 'framer-motion';
import { X, Wind, CheckCircle } from 'lucide-react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BreathExercise = '4-7-8' | 'box';
type Phase = 'inhale' | 'hold' | 'exhale' | 'hold2';

interface Props {
  exercise?: BreathExercise;
  onComplete: () => void;
  onExit: () => void;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const PHASE_CONFIG: Record<BreathExercise, { phases: Phase[]; durations: Record<Phase, number>; label: string }> = {
  '4-7-8': {
    phases: ['inhale', 'hold', 'exhale'],
    durations: { inhale: 4, hold: 7, exhale: 8, hold2: 0 },
    label: '4-7-8 Breathing',
  },
  box: {
    phases: ['inhale', 'hold', 'exhale', 'hold2'],
    durations: { inhale: 4, hold: 4, exhale: 4, hold2: 4 },
    label: 'Box Breathing',
  },
};

const PHASE_LABELS: Record<Phase, string> = {
  inhale: 'Inhale',
  hold: 'Hold',
  exhale: 'Exhale',
  hold2: 'Hold',
};

const PHASE_COLORS: Record<Phase, string> = {
  inhale: 'text-violet-300',
  hold: 'text-violet-200/70',
  exhale: 'text-indigo-300',
  hold2: 'text-indigo-200/70',
};

const INHALE_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];
const EXHALE_EASE: [number, number, number, number] = [0.4, 0, 0.6, 1];
const TOTAL_CYCLES = 4;

// ─── Component ────────────────────────────────────────────────────────────────

export function BreathworkExercise({ exercise = '4-7-8', onComplete, onExit }: Props) {
  const reducedMotion = useReducedMotion();
  const config = PHASE_CONFIG[exercise];

  // State for UI display
  const [displayPhase, setDisplayPhase] = useState<Phase>(config.phases[0]);
  const [countdown, setCountdown] = useState(config.durations[config.phases[0]]);
  const [completedCycles, setCompletedCycles] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  // Animation controls for the 3 orb rings
  const outerCtrl = useAnimationControls();
  const midCtrl = useAnimationControls();
  const coreCtrl = useAnimationControls();

  // Mutable refs to avoid stale closures in intervals
  const phaseIdxRef = useRef(0);
  const cycleRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCompleteRef = useRef(false);

  // ── Haptics ──────────────────────────────────────────────────────────────

  const triggerHaptic = useCallback(() => {
    try {
      if ('vibrate' in navigator) navigator.vibrate(50);
    } catch {
      // graceful degrade — vibrate not available
    }
  }, []);

  // ── Orb animation trigger ─────────────────────────────────────────────────

  const animateOrb = useCallback(
    (phase: Phase, duration: number) => {
      if (reducedMotion) {
        // Reduced motion: opacity-only transitions
        const opacity = phase === 'exhale' || phase === 'hold2' ? 0.35 : 0.85;
        outerCtrl.start({ opacity, transition: { duration } });
        midCtrl.start({ opacity, transition: { duration } });
        coreCtrl.start({ opacity, transition: { duration } });
        return;
      }

      if (phase === 'inhale') {
        outerCtrl.start({ scale: 1.4, opacity: 0.9, transition: { duration, ease: INHALE_EASE } });
        midCtrl.start({ scale: 1.3, opacity: 0.85, transition: { duration, ease: INHALE_EASE, delay: 0.2 } });
        coreCtrl.start({ scale: 1.2, opacity: 0.95, transition: { duration, ease: INHALE_EASE, delay: 0.4 } });
      } else if (phase === 'exhale') {
        outerCtrl.start({ scale: 1.0, opacity: 0.45, transition: { duration, ease: EXHALE_EASE } });
        midCtrl.start({ scale: 1.0, opacity: 0.5, transition: { duration, ease: EXHALE_EASE, delay: 0.2 } });
        coreCtrl.start({ scale: 1.0, opacity: 0.6, transition: { duration, ease: EXHALE_EASE, delay: 0.4 } });
      }
      // hold phases: maintain current scale — no animation needed
    },
    [reducedMotion, outerCtrl, midCtrl, coreCtrl],
  );

  // ── Phase advancement logic ───────────────────────────────────────────────

  const startPhase = useCallback(
    (phaseIdx: number) => {
      if (isCompleteRef.current) return;

      const phases = config.phases;
      const phase = phases[phaseIdx];
      const duration = config.durations[phase];

      setDisplayPhase(phase);
      setCountdown(duration);
      triggerHaptic();
      animateOrb(phase, duration);

      let remaining = duration;
      if (timerRef.current) clearInterval(timerRef.current);

      timerRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(timerRef.current!);
          timerRef.current = null;

          // Advance to next phase
          const nextIdx = (phaseIdxRef.current + 1) % phases.length;
          const isNewCycle = nextIdx === 0;

          if (isNewCycle) {
            const newCycleCount = cycleRef.current + 1;
            cycleRef.current = newCycleCount;
            setCompletedCycles(newCycleCount);

            if (newCycleCount >= TOTAL_CYCLES) {
              isCompleteRef.current = true;
              setIsComplete(true);
              return;
            }
          }

          phaseIdxRef.current = nextIdx;
          startPhase(nextIdx);
        } else {
          setCountdown(remaining);
        }
      }, 1000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, animateOrb, triggerHaptic],
  );

  // ── Kick off on mount ─────────────────────────────────────────────────────

  useEffect(() => {
    phaseIdxRef.current = 0;
    cycleRef.current = 0;
    isCompleteRef.current = false;
    startPhase(0);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // startPhase is stable — this fires once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center justify-center min-h-full w-full px-6 py-12 relative select-none">
      {/* Exit button */}
      <button
        onClick={onExit}
        className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10 transition-all"
        aria-label="Exit breathwork"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header */}
      <div className="mb-12 text-center space-y-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20">
          <Wind className="w-3 h-3 text-violet-400" />
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-violet-400/80">
            {config.label}
          </span>
        </div>
        {/* Cycle counter */}
        <div className="flex items-center justify-center gap-1 pt-2">
          {Array.from({ length: TOTAL_CYCLES }).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
                i < completedCycles
                  ? 'bg-violet-400 scale-100'
                  : 'bg-white/10 scale-75'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Orb */}
      <div className="relative flex items-center justify-center w-56 h-56 mb-12">
        {/* Outer ring */}
        <motion.div
          animate={outerCtrl}
          initial={{ scale: 1.0, opacity: 0.45 }}
          className="absolute inset-0 rounded-full border border-violet-500/25"
          style={{ filter: 'blur(2px)' }}
        />
        {/* Mid ring */}
        <motion.div
          animate={midCtrl}
          initial={{ scale: 1.0, opacity: 0.55 }}
          className="absolute inset-6 rounded-full border border-violet-400/35 bg-violet-500/5"
          style={{ filter: 'blur(1px)' }}
        />
        {/* Core */}
        <motion.div
          animate={coreCtrl}
          initial={{ scale: 1.0, opacity: 0.7 }}
          className="absolute inset-14 rounded-full bg-gradient-to-br from-violet-500/40 to-indigo-500/30 border border-violet-400/40"
          style={{ filter: 'blur(0.5px)', boxShadow: '0 0 40px 8px rgba(139,92,246,0.15)' }}
        />
        {/* Glow pulse */}
        {!reducedMotion && (
          <motion.div
            className="absolute inset-0 rounded-full"
            animate={
              displayPhase === 'inhale'
                ? { boxShadow: '0 0 80px 20px rgba(139,92,246,0.18)', opacity: 1 }
                : { boxShadow: '0 0 20px 4px rgba(139,92,246,0.05)', opacity: 0.4 }
            }
            transition={{ duration: config.durations[displayPhase], ease: INHALE_EASE }}
          />
        )}
      </div>

      {/* Phase label + countdown */}
      <AnimatePresence mode="wait">
        {!isComplete ? (
          <motion.div
            key={displayPhase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-3"
          >
            <span className={`text-2xl font-black uppercase tracking-[0.25em] ${PHASE_COLORS[displayPhase]}`}>
              {PHASE_LABELS[displayPhase]}
            </span>
            <span className="text-6xl font-black text-white/80 tabular-nums leading-none">
              {countdown}
            </span>
            <span className="text-[10px] font-medium text-white/20 uppercase tracking-widest">
              seconds
            </span>
          </motion.div>
        ) : (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: INHALE_EASE }}
            className="flex flex-col items-center gap-6"
          >
            <CheckCircle className="w-12 h-12 text-violet-400" />
            <div className="text-center space-y-2">
              <p className="text-xl font-black text-white/90 uppercase tracking-wide">Session Complete</p>
              <p className="text-sm text-white/40 font-medium">
                {TOTAL_CYCLES} cycles completed · Well done
              </p>
            </div>
            <button
              onClick={onComplete}
              className="mt-2 px-8 py-3 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-300 text-xs font-black uppercase tracking-[0.2em] hover:bg-violet-500/30 transition-all"
            >
              Continue
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
