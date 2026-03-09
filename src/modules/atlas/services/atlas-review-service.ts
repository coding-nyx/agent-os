import { AtlasProfile, AtlasHabit, AtlasGoal } from './atlas-profile-service';
import { Spine } from '@/lib/spine/spine-event-bus';

/**
 * Atlas Review Service
 * 
 * Analyzes performance patterns and emits Spine events when user commitments fail.
 * These events trigger reactive support from Agnes (emotional) or Titan (physical).
 */
export const AtlasReviewService = {
  /**
   * Performs a performance audit on habits and goals.
   */
  async performAudit(profile: AtlasProfile) {
    this.checkHabitStreaks(profile.habits);
    this.checkGoalProgress(profile.goals);
  },

  /**
   * Detects broken streaks and alerts the ecosystem.
   */
  checkHabitStreaks(habits: AtlasHabit[]) {
    habits.forEach(habit => {
      // Logic for "Sudden Failure": streak was high, now it's zero
      // Note: action.ts already emits HABIT_STREAK_BROKEN, but here we can add
      // "Stagnation" or "Drift" alerts.
      if (habit.status === 'active' && habit.currentStreak === 0 && habit.bestStreak > 5) {
        // Only alert if not recently alerted (could use a timestamp check if persisted)
        Spine.emit({
          type: 'HABIT_STREAK_BROKEN',
          source: 'atlas',
          domain: 'C',
          data: {
            habitId: habit.id,
            title: habit.title,
            previousBest: habit.bestStreak
          },
          cascadeDepth: 0,
          priority: 'alert'
        });
      }
    });
  },

  /**
   * Detects goals that are stalling despite active tasks.
   */
  checkGoalProgress(goals: AtlasGoal[]) {
    goals.forEach(goal => {
      const deadline = goal.deadline ? new Date(goal.deadline).getTime() : null;
      const now = Date.now();
      
      if (goal.status === 'active' && deadline && deadline < now && goal.progressPercent < 100) {
        Spine.emit({
          type: 'GOAL_MISSING_PROGRESS',
          source: 'atlas',
          domain: 'C',
          data: {
            goalId: goal.id,
            title: goal.title,
            progress: goal.progressPercent,
            deadline: goal.deadline
          },
          cascadeDepth: 0,
          priority: 'alert'
        });
      }
    });
  }
};
