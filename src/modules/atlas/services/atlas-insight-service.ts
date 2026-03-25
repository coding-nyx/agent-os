/**
 * AtlasInsightService
 *
 * Proactive behavioral insight engine — detects recurring patterns across
 * multiple weekly reviews and surfaces ranked behavioral insights.
 */

import type { AtlasHabit, AtlasTask, TemporalReview } from '@/lib/types';

export interface BehavioralInsight {
  id: string;
  category: 'completion' | 'energy' | 'habit' | 'deadline' | 'balance';
  title: string;
  description: string;
  confidence: number;    // 0-1
  severity: 'info' | 'warning' | 'critical';
  actionHint?: string;   // Optional suggestion
}

export class AtlasInsightService {
  /**
   * Generate behavioral insights from the last N weekly reviews.
   * Requires at least 2 reviews to detect patterns.
   */
  static generateInsights(
    reviews: TemporalReview[],
    tasks: AtlasTask[],
    habits: AtlasHabit[]
  ): BehavioralInsight[] {
    if (reviews.length < 2) return [];

    const weeklyReviews = reviews
      .filter(r => r.scope === 'weekly')
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart));

    if (weeklyReviews.length < 2) return [];

    const insights: BehavioralInsight[] = [
      ...AtlasInsightService._detectCompletionPatterns(weeklyReviews),
      ...AtlasInsightService._detectHabitPatterns(weeklyReviews, habits),
      ...AtlasInsightService._detectDeadlinePatterns(weeklyReviews, tasks),
      ...AtlasInsightService._detectEnergyPatterns(weeklyReviews),
      ...AtlasInsightService._detectBalancePatterns(weeklyReviews),
    ];

    // Sort by severity then confidence descending
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return insights.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.confidence - a.confidence;
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private static _detectCompletionPatterns(reviews: TemporalReview[]): BehavioralInsight[] {
    const insights: BehavioralInsight[] = [];
    if (reviews.length < 2) return insights;

    const rates = reviews.map(r => r.completionRate ?? 0);
    const recent = rates.slice(-3);

    // Detect declining trend over last 3 reviews
    const isDeclining = recent.length >= 2 && recent.every((r, i) =>
      i === 0 || r <= recent[i - 1]
    );

    const avgRate = recent.reduce((s, r) => s + r, 0) / recent.length;
    const latestRate = rates[rates.length - 1];

    if (isDeclining && avgRate < 0.65) {
      insights.push({
        id: 'completion-declining-trend',
        category: 'completion',
        title: 'Task completion is trending down',
        description: `Your completion rate has declined across the last ${recent.length} reviews (current: ${Math.round(latestRate * 100)}%). Overcommitment or scope creep may be the cause.`,
        confidence: Math.min(0.9, 0.5 + (reviews.length / 10)),
        severity: avgRate < 0.4 ? 'critical' : 'warning',
        actionHint: 'Try cutting your weekly task count by 20% and protecting one deep-work block per day.',
      });
    } else if (latestRate < 0.5 && reviews.length >= 3) {
      insights.push({
        id: 'completion-consistently-low',
        category: 'completion',
        title: 'Completion rate consistently below 50%',
        description: `You are completing fewer than half of scheduled tasks (${Math.round(latestRate * 100)}% this week). This suggests planned demand is out of sync with available capacity.`,
        confidence: 0.75,
        severity: 'warning',
        actionHint: 'Run a capacity blueprint before planning next week.',
      });
    }

    return insights;
  }

  private static _detectHabitPatterns(
    reviews: TemporalReview[],
    habits: AtlasHabit[]
  ): BehavioralInsight[] {
    const insights: BehavioralInsight[] = [];

    // Find habits with recurring streak breaks across reviews
    const habitBreakCounts: Record<string, number> = {};

    for (const review of reviews) {
      if (!review.habitSummary) continue;
      for (const h of review.habitSummary) {
        if (h.streak === 0) {
          habitBreakCounts[h.habitId] = (habitBreakCounts[h.habitId] ?? 0) + 1;
        }
      }
    }

    for (const [habitId, breakCount] of Object.entries(habitBreakCounts)) {
      if (breakCount < 2) continue;

      const habit = habits.find(h => h.id === habitId);
      const title = habit?.title ?? habitId;
      const frequency = breakCount / reviews.length;

      insights.push({
        id: `habit-recurring-break-${habitId}`,
        category: 'habit',
        title: `"${title}" streak breaks repeatedly`,
        description: `This habit has broken ${breakCount} out of ${reviews.length} tracked weeks. The minimum viable version may need adjusting.`,
        confidence: Math.min(0.95, 0.4 + frequency * 0.55),
        severity: frequency >= 0.6 ? 'warning' : 'info',
        actionHint: habit?.minimumViableVersion
          ? `MVV: "${habit.minimumViableVersion}" — revert to this on high-load days.`
          : 'Define a minimum viable version to protect the habit chain during hard weeks.',
      });
    }

    return insights;
  }

  private static _detectDeadlinePatterns(
    reviews: TemporalReview[],
    tasks: AtlasTask[]
  ): BehavioralInsight[] {
    const insights: BehavioralInsight[] = [];

    // Count tasks with deadlines that were not completed on time
    const overdueTasks = tasks.filter(t =>
      t.deadline &&
      t.status !== 'done' &&
      new Date(t.deadline).getTime() < Date.now()
    );

    // Use drift scores from reviews to detect chronic deadline drift
    const driftScores = reviews
      .map(r => r.driftScore)
      .filter((d): d is number => typeof d === 'number');

    const avgDrift = driftScores.length > 0
      ? driftScores.reduce((s, d) => s + d, 0) / driftScores.length
      : null;

    if (overdueTasks.length >= 3) {
      insights.push({
        id: 'deadline-chronic-overdue',
        category: 'deadline',
        title: 'Chronic deadline drift detected',
        description: `${overdueTasks.length} tasks are past their deadlines without completion. This indicates systematic under-estimation of task duration or effort.`,
        confidence: Math.min(0.95, 0.5 + overdueTasks.length * 0.05),
        severity: overdueTasks.length >= 6 ? 'critical' : 'warning',
        actionHint: 'Add 30% buffer to deadline estimates. Consider a weekly deadline audit.',
      });
    } else if (avgDrift !== null && avgDrift > 6) {
      insights.push({
        id: 'deadline-high-drift-score',
        category: 'deadline',
        title: 'High planning drift across reviews',
        description: `Average drift score of ${avgDrift.toFixed(1)}/10 across ${driftScores.length} reviews suggests goals and tasks are drifting from original commitments.`,
        confidence: Math.min(0.85, 0.4 + driftScores.length * 0.1),
        severity: 'warning',
        actionHint: 'Anchor weekly plans to your top 3 goals before adding new tasks.',
      });
    }

    return insights;
  }

  private static _detectEnergyPatterns(reviews: TemporalReview[]): BehavioralInsight[] {
    const insights: BehavioralInsight[] = [];

    const energyAvgs = reviews
      .map(r => r.nsvTrend?.energyBudgetAvg)
      .filter((e): e is number => typeof e === 'number');

    if (energyAvgs.length < 2) return insights;

    const recentAvg = energyAvgs.slice(-3).reduce((s, e) => s + e, 0) / Math.min(3, energyAvgs.length);
    const overallAvg = energyAvgs.reduce((s, e) => s + e, 0) / energyAvgs.length;

    // Consistent overload state
    const lowEnergyWeeks = energyAvgs.filter(e => e < 4).length;
    const lowEnergyRatio = lowEnergyWeeks / energyAvgs.length;

    if (lowEnergyRatio >= 0.6) {
      insights.push({
        id: 'energy-consistent-overload',
        category: 'energy',
        title: 'Persistent low energy detected',
        description: `Energy budget has been below 4/10 in ${lowEnergyWeeks} of ${energyAvgs.length} reviewed weeks. This pattern suggests chronic under-recovery.`,
        confidence: Math.min(0.9, 0.5 + lowEnergyRatio * 0.4),
        severity: lowEnergyRatio >= 0.8 ? 'critical' : 'warning',
        actionHint: 'Schedule at least one full recovery day per week. Reduce active task count by 30%.',
      });
    } else if (recentAvg < overallAvg - 1.5) {
      insights.push({
        id: 'energy-declining-recent',
        category: 'energy',
        title: 'Energy trend declining recently',
        description: `Recent energy average (${recentAvg.toFixed(1)}/10) is significantly lower than your baseline (${overallAvg.toFixed(1)}/10). Watch for early burnout signals.`,
        confidence: 0.65,
        severity: 'info',
        actionHint: 'Protect sleep and avoid new commitments until energy recovers.',
      });
    }

    // Check resilience trend from most recent review
    const latestReview = reviews[reviews.length - 1];
    if (latestReview.nsvTrend?.resilienceTrend === 'declining' && energyAvgs.length >= 2) {
      insights.push({
        id: 'energy-resilience-declining',
        category: 'energy',
        title: 'Resilience trend is declining',
        description: 'Your emotional and recovery resilience has been trending downward. Planning should account for reduced capacity to handle disruptions.',
        confidence: 0.7,
        severity: 'warning',
        actionHint: 'Introduce one restorative activity per week. Reduce planning ambition for the next 2 weeks.',
      });
    }

    return insights;
  }

  private static _detectBalancePatterns(reviews: TemporalReview[]): BehavioralInsight[] {
    const insights: BehavioralInsight[] = [];

    // Detect domain imbalance via goal progress across reviews
    const goalProgressMaps = reviews
      .filter(r => r.goalProgress && r.goalProgress.length > 0)
      .map(r => r.goalProgress);

    if (goalProgressMaps.length < 2) return insights;

    // Find goals that have shown zero progress across multiple reviews
    const allGoalIds = new Set(goalProgressMaps.flat().map(g => g.goalId));
    const stalledGoals: string[] = [];

    for (const goalId of allGoalIds) {
      const progressEntries = goalProgressMaps
        .map(gp => gp.find(g => g.goalId === goalId))
        .filter((g): g is NonNullable<typeof g> => g !== undefined);

      if (progressEntries.length < 2) continue;

      const firstPct = progressEntries[0].progressPercent;
      const lastPct = progressEntries[progressEntries.length - 1].progressPercent;

      if (lastPct - firstPct < 5 && lastPct < 80) {
        stalledGoals.push(progressEntries[0].goalTitle);
      }
    }

    if (stalledGoals.length >= 2) {
      insights.push({
        id: 'balance-goals-stalled',
        category: 'balance',
        title: 'Multiple goals showing no progress',
        description: `${stalledGoals.length} goals (e.g., "${stalledGoals[0]}") have made little or no progress across recent reviews. Energy may be spread too thin or these goals lack linked tasks.`,
        confidence: Math.min(0.85, 0.5 + stalledGoals.length * 0.08),
        severity: stalledGoals.length >= 3 ? 'warning' : 'info',
        actionHint: 'Pick one goal to advance each week. Pause or archive goals with no near-term action.',
      });
    }

    // Detect habit vs. task imbalance — weeks with high task load but low habit completions
    const imbalancedWeeks = reviews.filter(r => {
      const habitCompletions = r.habitSummary?.reduce((s, h) => s + h.completions, 0) ?? 0;
      const totalScheduled = r.totalScheduled ?? 0;
      return totalScheduled > 10 && habitCompletions === 0;
    }).length;

    if (imbalancedWeeks >= 2) {
      insights.push({
        id: 'balance-habit-task-imbalance',
        category: 'balance',
        title: 'Habits dropped during high-task weeks',
        description: `Habits were abandoned in ${imbalancedWeeks} high-load weeks. Task execution is crowding out foundational habits.`,
        confidence: Math.min(0.8, 0.4 + imbalancedWeeks * 0.1),
        severity: 'warning',
        actionHint: 'Block 30 minutes each morning for non-negotiable habits before task work begins.',
      });
    }

    return insights;
  }
}
