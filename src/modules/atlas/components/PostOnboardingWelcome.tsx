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
import { NeuralButton } from '@/core/components/NeuralButton';
import type { AtlasProfile } from '../services/atlas-profile-service';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PostOnboardingWelcomeProps {
  profile: AtlasProfile;
  userId?: string | null;
  onDismiss: () => void;
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
    <NeuralButton
      onClick={onClick}
      variant="secondary"
      className={cn(
        'flex !flex-col !items-start !justify-start !gap-3 !p-3 !rounded-xl !border !text-left !w-full !h-auto group',
        'bg-white/[0.02] hover:bg-white/[0.05]',
        borderClass
      )}
    >
      <div className={cn('p-1.5 rounded-lg bg-white/5 transition-colors group-hover:bg-white/10', accentClass)}>
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-white/80">{title}</p>
        <p className="text-[10px] text-white/40 mt-0.5 whitespace-normal">{description}</p>
      </div>
    </NeuralButton>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PostOnboardingWelcome({
  profile,
  userId,
  onDismiss,
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      className={cn(
        'relative rounded-2xl border border-[var(--module-accent-border)] bg-[var(--module-accent-faint)]',
        'backdrop-blur-md p-4 mb-4',
      )}
      role="region"
      aria-label="Welcome to Atlas"
    >
      {/* Dismiss */}
      <NeuralButton
        onClick={handleDismiss}
        aria-label="Dismiss welcome card"
        variant="ghost"
        size="sm"
        className="absolute top-3 right-3 !w-6 !h-6 !p-0 !min-h-0 rounded-lg text-white/30 hover:text-white/60"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </NeuralButton>

      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pr-8">
        <div className="w-5 h-5 rounded-full bg-[var(--module-color-500)] flex items-center justify-center shrink-0">
          <Zap className="w-3 h-3 text-white" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-[var(--module-color-400)]">
            Atlas Activated
          </p>
          <p className="text-[10px] text-white/40">Your cognitive baseline is set. Here's what we captured.</p>
        </div>
      </div>

      {/* Intake summary chips */}
      {(energyPeak || firstTask || profile.summary) && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {energyPeak && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] text-[10px] text-[var(--module-color-300)] font-medium">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
