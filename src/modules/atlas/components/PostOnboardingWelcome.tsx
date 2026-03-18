/**
 * PostOnboardingWelcome
 *
 * A dismissible first-run card shown once after Atlas onboarding completes.
 * Summarises what Atlas captured during intake and surfaces three immediate
 * "first action" prompts so the user knows exactly what to do next.
 *
 * Visibility gate: localStorage key `atlas_welcome_shown_{userId}`.
 * The card auto-disappears after dismiss — never shown again.
 */

import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Zap, Flame, Target, Clock, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AtlasProfile } from '../services/atlas-profile-service';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PostOnboardingWelcomeProps {
  profile: AtlasProfile;
  userId?: string | null;
  onDismiss: () => void;
  onLogEnergy: () => void;
  onAddHabit: () => void;
  onCreateGoal: () => void;
}

// ── Local storage gate ─────────────────────────────────────────────────────────

const WELCOME_KEY = (userId?: string | null) =>
  `atlas_welcome_shown_${userId ?? 'guest'}`;

export function hasSeenWelcome(userId?: string | null): boolean {
  try {
    return !!localStorage.getItem(WELCOME_KEY(userId));
  } catch {
    return false;
  }
}

export function markWelcomeSeen(userId?: string | null): void {
  try {
    localStorage.setItem(WELCOME_KEY(userId), '1');
  } catch {
    // noop — non-critical
  }
}

// ── Action prompt card ─────────────────────────────────────────────────────────

interface ActionPromptProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
  accentClass: string;
  borderClass: string;
}

function ActionPrompt({ icon: Icon, title, description, onClick, accentClass, borderClass }: ActionPromptProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 p-3 rounded-xl border text-left w-full',
        'bg-white/[0.02] hover:bg-white/[0.05] transition-colors',
        borderClass,
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50',
      )}
    >
      <div className={cn('mt-0.5 p-1.5 rounded-lg bg-white/5', accentClass)}>
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-white/80">{title}</p>
        <p className="text-[10px] text-white/40 mt-0.5">{description}</p>
      </div>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PostOnboardingWelcome({
  profile,
  userId,
  onDismiss,
  onLogEnergy,
  onAddHabit,
  onCreateGoal,
}: PostOnboardingWelcomeProps) {
  const handleDismiss = useCallback(() => {
    markWelcomeSeen(userId);
    onDismiss();
  }, [userId, onDismiss]);

  // Derive intake summary from onboarding data
  const energyPeak = profile.energyWave.length > 0
    ? profile.energyWave.slice().sort((a, b) => b.energy - a.energy)[0]
    : null;

  const firstTask = profile.taskGraph.length > 0
    ? profile.taskGraph[0]
    : profile.tasks.length > 0
    ? { title: profile.tasks[0].title }
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'relative rounded-2xl border border-sky-500/25 bg-sky-500/[0.04]',
        'backdrop-blur-md p-4 mb-4',
      )}
      role="region"
      aria-label="Welcome to Atlas"
    >
      {/* Dismiss */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss welcome card"
        className={cn(
          'absolute top-3 right-3',
          'w-6 h-6 rounded-lg flex items-center justify-center',
          'text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50',
        )}
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pr-8">
        <div className="w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center shrink-0">
          <Zap className="w-3 h-3 text-white" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-sky-400">
            Atlas Activated
          </p>
          <p className="text-[10px] text-white/40">Your cognitive baseline is set. Here's what we captured.</p>
        </div>
      </div>

      {/* Intake summary chips */}
      {(energyPeak || firstTask || profile.summary) && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {energyPeak && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-[10px] text-sky-300 font-medium">
              <Clock className="w-2.5 h-2.5" aria-hidden="true" />
              Peak: {energyPeak.slot}
            </span>
          )}
          {firstTask && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-white/50 font-medium max-w-[200px] truncate">
              First task: {firstTask.title}
            </span>
          )}
          {profile.summary && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-white/40 font-medium max-w-xs truncate">
              {profile.summary}
            </span>
          )}
        </div>
      )}

      {/* First action prompts */}
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
        Start Here
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <ActionPrompt
          icon={Zap}
          title="Log your energy"
          description="Set your current energy level to calibrate today's schedule."
          onClick={() => { handleDismiss(); onLogEnergy(); }}
          accentClass="text-sky-400"
          borderClass="border-sky-500/15 hover:border-sky-500/30"
        />
        <ActionPrompt
          icon={Flame}
          title="Add a habit"
          description="Create one recurring habit you want to track daily."
          onClick={() => { handleDismiss(); onAddHabit(); }}
          accentClass="text-orange-400"
          borderClass="border-orange-500/15 hover:border-orange-500/30"
        />
        <ActionPrompt
          icon={Target}
          title="Set a goal"
          description="Define one goal with milestones and a deadline."
          onClick={() => { handleDismiss(); onCreateGoal(); }}
          accentClass="text-emerald-400"
          borderClass="border-emerald-500/15 hover:border-emerald-500/30"
        />
      </div>
    </motion.div>
  );
}
