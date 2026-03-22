import { ActionHub } from '@/lib/actions/action-hub';
import { AtlasHabit } from '../atlas-profile-service';
import {
  loadProfile,
  persistProfile,
  sanitizeTitle
} from './shared';

export const habitActions: Parameters<typeof ActionHub.registerMultiple>[1] = {
  create_habit: async ({ userId, encryptionKey, payload }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    if (profile.habits.length >= 30) return;

    const now = new Date().toISOString();
    const validFrequencies: AtlasHabit['frequency'][] = ['daily', 'weekdays', 'weekends', 'weekly', 'monthly', 'custom'];
    const frequency = validFrequencies.includes(payload?.frequency as AtlasHabit['frequency'])
      ? (payload!.frequency as AtlasHabit['frequency'])
      : 'daily';

    const newHabit: AtlasHabit = {
      id: `habit_${crypto.randomUUID()}`,
      title: sanitizeTitle(payload?.title, 'Untitled Habit'),
      frequency,
      targetStreak: typeof payload?.targetStreak === 'number' ? Math.max(1, payload.targetStreak) : 30,
      currentStreak: 0,
      bestStreak: 0,
      energyCost: typeof payload?.energyCost === 'number' ? Math.max(0, Math.min(10, payload.energyCost)) : 2,
      minimumViableVersion: typeof payload?.minimumViableVersion === 'string' ? payload.minimumViableVersion : '',
      status: 'active',
      createdAt: now,
      updatedAt: now
    };

    profile.habits.push(newHabit);
    await persistProfile(profile, userId ?? null, encryptionKey ?? null);
  },

  update_habit_streak: async ({ userId, encryptionKey, payload, updateGlobalSoul, emitSpineEvent }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const habitId = typeof payload?.id === 'string' ? payload.id : null;
    if (!habitId) return;

    const habit = profile.habits.find(h => h.id === habitId);
    if (!habit) return;

    const previousStreak = habit.currentStreak;
    if (typeof payload?.currentStreak === 'number') {
      habit.currentStreak = Math.max(0, payload.currentStreak);
    }
    if (typeof payload?.lastCompleted === 'string') {
      habit.lastCompleted = payload.lastCompleted;
    }

    if (habit.currentStreak > habit.bestStreak) {
      habit.bestStreak = habit.currentStreak;
    }

    if (previousStreak >= 7 && habit.currentStreak === 0) {
      emitSpineEvent('HABIT_STREAK_BROKEN', {
        habitId: habit.id,
        title: habit.title,
        previousStreak
      });
    }

    habit.updatedAt = new Date().toISOString();

    await persistProfile(profile, userId ?? null, encryptionKey ?? null);

    const activeHabits = profile.habits.filter(h => h.status === 'active');
    const totalStreak = activeHabits.reduce((sum, h) => sum + h.currentStreak, 0);
    const streakHealth = activeHabits.length > 0
      ? Math.min(10, Math.round(totalStreak / activeHabits.length))
      : 5;

    const habitsWithStreak = activeHabits.filter(h => h.currentStreak > 0).length;
    const habitMomentum = activeHabits.length > 0
      ? Math.round((habitsWithStreak / activeHabits.length) * 100) / 100
      : 0;

    await updateGlobalSoul({ planning: { streakHealth, habitMomentum } });

    emitSpineEvent('PLANNING_STATE_UPDATED', {
      changedFields: ['planning.streakHealth', 'planning.habitMomentum'],
      streakHealth,
      habitMomentum
    });
  },

  pause_habit: async ({ userId, encryptionKey, payload }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const habitId = typeof payload?.id === 'string' ? payload.id : null;
    if (!habitId) return;

    const habit = profile.habits.find(h => h.id === habitId);
    if (!habit) return;

    const now = new Date().toISOString();
    habit.status = 'paused';
    const ext = habit as unknown as Record<string, unknown>;
    ext.pauseReason = typeof payload?.pauseReason === 'string' ? payload.pauseReason : undefined;
    ext.pausedAt = now;
    ext.resumeDate = typeof payload?.resumeDate === 'string' ? payload.resumeDate : undefined;
    habit.updatedAt = now;

    await persistProfile(profile, userId ?? null, encryptionKey ?? null);
  },

  update_habit: async ({ userId, encryptionKey, payload }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const habitId = typeof payload?.id === 'string' ? payload.id : null;
    if (!habitId) return;

    const habit = profile.habits.find(h => h.id === habitId);
    if (!habit) return;

    const now = new Date().toISOString();

    if (typeof payload?.title === 'string') habit.title = payload.title;
    if (typeof payload?.frequency === 'string') habit.frequency = payload.frequency as AtlasHabit['frequency'];
    if (typeof payload?.energyCost === 'number') {
      habit.energyCost = Math.max(0, Math.min(10, payload.energyCost));
    }
    if (typeof payload?.minimumViableVersion === 'string') {
      habit.minimumViableVersion = payload.minimumViableVersion;
    }
    if (typeof payload?.targetStreak === 'number') {
      habit.targetStreak = Math.max(1, payload.targetStreak);
    }
    if (typeof payload?.status === 'string') {
      habit.status = payload.status as AtlasHabit['status'];
    }

    habit.updatedAt = now;

    await persistProfile(profile, userId ?? null, encryptionKey ?? null);
  },

  delete_habit: async ({ userId, encryptionKey, payload }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const habitId = typeof payload?.id === 'string' ? payload.id : null;
    if (!habitId) return;

    profile.habits = profile.habits.filter(h => h.id !== habitId);

    await persistProfile(profile, userId ?? null, encryptionKey ?? null);
  },

  log_habit_metric: async ({ userId, encryptionKey, payload }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const habitId = typeof payload?.id === 'string' ? payload.id : null;
    const value = payload?.value;
    if (!habitId || value === undefined) return;

    const habit = profile.habits.find(h => h.id === habitId);
    if (!habit) return;

    if (!habit.logs) habit.logs = [];
    
    const now = new Date().toISOString();
    const dateOnly = now.slice(0, 10);
    
    habit.logs.push({
      date: dateOnly,
      value: typeof value === 'number' || typeof value === 'string' ? value : String(value),
      notes: typeof payload?.notes === 'string' ? payload.notes : undefined
    });
    
    if (typeof value === 'number' && typeof habit.metricValue === 'number') {
       if (payload?.operation === 'add') {
           habit.metricValue += value;
       } else if (payload?.operation === 'set') {
           habit.metricValue = value;
       }
    } else if (typeof value === 'number') {
       habit.metricValue = value;
    }

    habit.updatedAt = now;
    await persistProfile(profile, userId ?? null, encryptionKey ?? null);
  },

  complete_habit: async ({ userId, encryptionKey, payload, updateGlobalSoul, emitSpineEvent }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const habitId = typeof payload?.id === 'string' ? payload.id : null;
    if (!habitId) return;

    const habit = profile.habits.find(h => h.id === habitId);
    if (!habit || habit.status !== 'active') return;

    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    if (habit.lastCompleted && habit.lastCompleted.slice(0, 10) === today) return;

    habit.lastCompleted = now;
    habit.currentStreak = (habit.currentStreak ?? 0) + 1;
    if (habit.currentStreak > (habit.bestStreak ?? 0)) {
      habit.bestStreak = habit.currentStreak;
    }
    habit.updatedAt = now;

    await persistProfile(profile, userId ?? null, encryptionKey ?? null);

    const activeHabits = profile.habits.filter(h => h.status === 'active');
    const totalStreak = activeHabits.reduce((sum, h) => sum + (h.currentStreak ?? 0), 0);
    const streakHealth = activeHabits.length > 0
      ? Math.min(10, Math.round(totalStreak / activeHabits.length))
      : 5;
    const habitsWithStreak = activeHabits.filter(h => (h.currentStreak ?? 0) > 0).length;
    const habitMomentum = activeHabits.length > 0
      ? Math.round((habitsWithStreak / activeHabits.length) * 100) / 100
      : 0;

    await updateGlobalSoul({ planning: { streakHealth, habitMomentum } });

    emitSpineEvent('ATLAS_HABIT_LOGGED' as import('@/lib/types').SpineEventType, {
      habitId: habit.id,
      title: habit.title,
      currentStreak: habit.currentStreak,
      bestStreak: habit.bestStreak,
    });
  },
};
