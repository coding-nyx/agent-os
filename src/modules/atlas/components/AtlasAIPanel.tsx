/**
 * AtlasAIPanel Component
 * Collapsible AI panel for energy optimization, task prioritization, and recovery recommendations
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Sparkles,
  Zap,
  Calendar,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Target,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { AtlasTask, AtlasGoal, AtlasHabit, AtlasProfile } from '../services/atlas-profile-service';
import { SurfaceCard } from '@/core/components/SurfaceCard';

interface AtlasAIPanelProps {
  profile: AtlasProfile | null;
  tasks: AtlasTask[];
  goals: AtlasGoal[];
  habits: AtlasHabit[];
  energyBudget: number;
  focusScore: number;
  activeLoad: number;
  onSendMessage?: (message: string) => void;
}

interface PlanningIntent {
  pattern: RegExp;
  label: string;
  prompt: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PLANNING_INTENTS: PlanningIntent[] = [
  {
    pattern: /plan\s+(my\s+)?(day|today)/i,
    label: 'Plan my day',
    prompt: 'Plan my day using my energy wave and top-priority tasks',
    icon: Calendar,
  },
  {
    pattern: /what.*(tackle|work on|do)\s*(first|next|today)/i,
    label: 'What should I tackle first?',
    prompt: 'Given my current energy and priorities, what should I tackle first?',
    icon: Target,
  },
  {
    pattern: /move.*(non.critical|low.priority).*(week|out)/i,
    label: 'Defer non-critical tasks',
    prompt: 'Move all non-critical (priority 3-5) tasks out of this week',
    icon: Clock,
  },
  {
    pattern: /realistically.*(get done|complete|finish)/i,
    label: "Realistic today's list",
    prompt: 'What can I realistically get done today given my energy budget?',
    icon: TrendingUp,
  },
];

interface Suggestion {
  type: 'optimization' | 'prioritization' | 'recovery' | 'insight';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  icon: React.ComponentType<{ className?: string }>;
}

export function AtlasAIPanel({
  profile,
  tasks,
  goals,
  habits,
  energyBudget,
  focusScore,
  activeLoad,
  onSendMessage,
}: AtlasAIPanelProps) {
  const reducedMotion = useReducedMotion();
  const [isExpanded, setIsExpanded] = useState(false);

  // ── Generate AI suggestions based on current state ──
  const suggestions = useMemo((): Suggestion[] => {
    const suggestions: Suggestion[] = [];

    // Energy optimization suggestions
    if (energyBudget < 4) {
      suggestions.push({
        type: 'optimization',
        title: 'Energy Budget Low',
        description: `Your energy budget is at ${energyBudget}/10. Consider deferring non-critical tasks and scheduling a recovery window within the next 2 hours.`,
        impact: 'high',
        icon: Zap,
      });
    }

    if (energyBudget >= 7 && tasks.filter((t) => t.status === 'active').length < 2) {
      suggestions.push({
        type: 'optimization',
        title: 'High Energy Available',
        description: `You have ${energyBudget}/10 energy. This is a great time to tackle high-priority or energy-intensive tasks.`,
        impact: 'medium',
        icon: TrendingUp,
      });
    }

    // Focus score insights
    if (focusScore < 4) {
      suggestions.push({
        type: 'recovery',
        title: 'Low Focus Detected',
        description: `Focus score is ${focusScore}/10. Avoid deep work right now. Consider a 10-minute break, light movement, or switching to admin tasks.`,
        impact: 'high',
        icon: AlertTriangle,
      });
    }

    // Active load management
    if (activeLoad > 7) {
      suggestions.push({
        type: 'prioritization',
        title: 'Task Overload Detected',
        description: `You have ${tasks.filter((t) => t.status === 'active' || t.status === 'queued').length} active/queued tasks. Consider deferring low-priority items or breaking tasks into smaller chunks.`,
        impact: 'high',
        icon: AlertTriangle,
      });
    }

    // Task prioritization suggestions
    const urgentTasks = tasks.filter((t) => {
      if (!t.deadline || t.status === 'done') return false;
      const hoursUntilDeadline =
        (new Date(t.deadline).getTime() - Date.now()) / (1000 * 60 * 60);
      return hoursUntilDeadline > 0 && hoursUntilDeadline < 24;
    });

    if (urgentTasks.length > 0) {
      suggestions.push({
        type: 'prioritization',
        title: 'Urgent Deadlines Approaching',
        description: `${urgentTasks.length} task${urgentTasks.length > 1 ? 's' : ''} due within 24 hours: ${urgentTasks.slice(0, 2).map((t) => t.title).join(', ')}${urgentTasks.length > 2 ? '...' : ''}`,
        impact: 'high',
        icon: Clock,
      });
    }

    // Blocked tasks
    const blockedTasks = tasks.filter((t) => t.status === 'blocked');
    if (blockedTasks.length > 0) {
      suggestions.push({
        type: 'insight',
        title: 'Blocked Tasks',
        description: `${blockedTasks.length} task${blockedTasks.length > 1 ? 's are' : ' is'} blocked by dependencies. Complete prerequisite tasks to unblock.`,
        impact: 'medium',
        icon: Target,
      });
    }

    // Habit streak at risk
    const atRiskHabits = habits.filter((h) => {
      if (!h.lastCompleted || h.status !== 'active') return false;
      const hoursElapsed =
        (Date.now() - new Date(h.lastCompleted).getTime()) / (1000 * 60 * 60);
      return hoursElapsed > 20 && hoursElapsed < 24;
    });

    if (atRiskHabits.length > 0) {
      suggestions.push({
        type: 'recovery',
        title: 'Habit Streak at Risk',
        description: `${atRiskHabits.length} habit${atRiskHabits.length > 1 ? 's' : ''} at risk: ${atRiskHabits.slice(0, 2).map((h) => h.title).join(', ')}. Complete before end of day to maintain streak.`,
        impact: 'medium',
        icon: Lightbulb,
      });
    }

    // Goal progress insights
    const stagnantGoals = goals.filter(
      (g) => g.status === 'active' && g.progressPercent < 20
    );

    if (stagnantGoals.length > 0) {
      suggestions.push({
        type: 'insight',
        title: 'Goals Need Attention',
        description: `${stagnantGoals.length} active goal${stagnantGoals.length > 1 ? 's are' : ' is'} below 20% progress. Link tasks to goals or break down milestones.`,
        impact: 'medium',
        icon: Target,
      });
    }

    // Energy wave insights
    if (profile?.energyWave && profile.energyWave.length > 0) {
      const upcomingLowEnergy = profile.energyWave
        .slice(0, 5)
        .some((p) => p.energy < 4);

      if (upcomingLowEnergy) {
        suggestions.push({
          type: 'optimization',
          title: 'Energy Dip Forecasted',
          description: `Energy wave shows low energy in the next few time slots. Schedule critical tasks now or defer to higher-energy periods.`,
          impact: 'medium',
          icon: Zap,
        });
      }
    }

    // Scheduling suggestion
    if (energyBudget >= 6 && focusScore >= 6 && activeLoad < 6) {
      const highPriorityQueued = tasks.filter(
        (t) => t.status === 'queued' && t.priority <= 2
      );

      if (highPriorityQueued.length > 0) {
        suggestions.push({
          type: 'prioritization',
          title: 'Optimal Conditions for Deep Work',
          description: `Energy: ${energyBudget}/10, Focus: ${focusScore}/10. Perfect time to tackle: ${highPriorityQueued[0].title}`,
          impact: 'high',
          icon: Calendar,
        });
      }
    }

    // Recovery window recommendation
    if (energyBudget < 5 && focusScore < 5) {
      const hasActiveRecovery = profile?.recoveryWindows?.some(
        (w) => w.status === 'active'
      );

      if (!hasActiveRecovery) {
        suggestions.push({
          type: 'recovery',
          title: 'Recovery Window Recommended',
          description: `Both energy (${energyBudget}/10) and focus (${focusScore}/10) are low. Schedule a 30-60 minute recovery window.`,
          impact: 'high',
          icon: Zap,
        });
      }
    }

    // Sort by impact
    return suggestions.sort((a, b) => {
      const impactOrder = { high: 0, medium: 1, low: 2 };
      return impactOrder[a.impact] - impactOrder[b.impact];
    });
  }, [tasks, goals, habits, energyBudget, focusScore, activeLoad, profile]);

  const impactColors: Record<string, string> = {
    high: 'border-rose-500/20 bg-rose-500/5',
    medium: 'border-amber-500/20 bg-amber-500/5',
    low: 'border-[var(--module-accent-border)] bg-[var(--module-accent-faint)]',
  };

  const impactTextColors: Record<string, string> = {
    high: 'text-rose-400',
    medium: 'text-amber-400',
    low: 'text-[var(--module-color-400)]',
  };

  return (
    <SurfaceCard className="overflow-hidden">
      {/* ── Collapsible Header ── */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.045] transition-colors rounded-t-[inherit]"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400/70" />
          <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-widest font-display">
            AI Insights
          </h3>
          {suggestions.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/20 text-violet-300/80 text-[11px] font-bold">
              {suggestions.length}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-white/30 transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* ── Expandable Content ── */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-4">
              {suggestions.length === 0 ? (                <div className="text-center py-8">
                  <Sparkles className="w-8 h-8 text-white/10 mx-auto mb-2" />
                  <p className="text-xs text-white/40 italic">
                    All systems optimal. Keep up the great work!
                  </p>
                </div>
              ) : (
                suggestions.map((suggestion, index) => {
                  const Icon = suggestion.icon;
                  return (
                    <motion.div
                      key={index}
                      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: reducedMotion ? 0 : 0.2,
                        delay: reducedMotion ? 0 : index * 0.05,
                      }}
                      className={cn(
                        'rounded-xl border p-3 transition-colors',
                        impactColors[suggestion.impact]
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Icon
                          className={cn(
                            'w-4 h-4 shrink-0 mt-0.5',
                            impactTextColors[suggestion.impact]
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <h4
                            className={cn(
                              'text-sm font-bold mb-1',
                              impactTextColors[suggestion.impact]
                            )}
                          >
                            {suggestion.title}
                          </h4>
                          <p className="text-xs text-white/60 leading-relaxed">
                            {suggestion.description}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'text-[11px] font-bold uppercase tracking-wider shrink-0 px-1.5 py-0.5 rounded',
                            suggestion.impact === 'high' &&
                              'bg-rose-500/20 text-rose-400',
                            suggestion.impact === 'medium' &&
                              'bg-amber-500/20 text-amber-400',
                            suggestion.impact === 'low' &&
                              'bg-[var(--module-accent-glow)] text-[var(--module-color-400)]'
                          )}
                        >
                          {suggestion.impact}
                        </span>
                      </div>
                    </motion.div>
                  );
                })
              )}

              {/* ── Quick Planning Prompts ── */}
              <div className="pt-2 border-t border-white/10">
                <p className="text-[11px] text-white/30 uppercase tracking-widest mb-2">Quick Planning</p>
                <div className="space-y-1.5">
                  {PLANNING_INTENTS.map((intent) => {
                    const Icon = intent.icon;
                    return (
                      <button
                        key={intent.label}
                        type="button"
                        onClick={() => onSendMessage?.(intent.prompt)}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.045] hover:bg-white/10 transition-colors text-left group"
                      >
                        <Icon className="w-3 h-3 text-[var(--module-color-400)] shrink-0" />
                        <span className="text-xs text-white/60 group-hover:text-white/80 transition-colors truncate">
                          {intent.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SurfaceCard>
  );
}
