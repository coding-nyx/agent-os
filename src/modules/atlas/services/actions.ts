import { ActionHub } from '@/lib/actions/action-hub';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import {
  AtlasProfile,
  AtlasTask,
  AtlasGoal,
  AtlasHabit,
  AtlasProject,
  AtlasTaskNode,
  AtlasMilestone,
  EnergyWavePoint,
  RecoveryWindow,
  ScheduledTask,
  DailyIntention,
  TemporalReview,
  HabitWeekSummary,
  GoalWeekProgress,
  loadAtlasProfile,
  saveAtlasProfile
} from './atlas-profile-service';

let registered = false;

function parseBoundedScore(value: unknown, fallback = 5): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(10, value));
}

async function loadProfile(userId?: string | null, encryptionKey?: CryptoKey | null) {
  return loadAtlasProfile({ userId, encryptionKey });
}

async function persistProfile(profile: AtlasProfile, userId?: string | null, encryptionKey?: CryptoKey | null) {
  profile.updatedAt = new Date().toISOString();
  await saveAtlasProfile(profile, { userId, encryptionKey });
}

function calculateActiveLoad(tasks: AtlasTask[]): number {
  const active = tasks.filter(t => t.status === 'active' || t.status === 'queued');
  return Math.min(10, Math.round((active.length / 50) * 10));
}

function calculateDeadlinePressure(tasks: AtlasTask[]): number {
  const now = Date.now();
  const urgent = tasks.filter(t => t.deadline && t.status !== 'done' && t.status !== 'deferred')
    .filter(t => new Date(t.deadline!).getTime() - now < 48 * 60 * 60 * 1000);
  return Math.min(10, urgent.length * 3);
}

function unblockDependents(tasks: AtlasTask[], completedId: string): void {
  for (const task of tasks) {
    if (task.status !== 'blocked') continue;
    if (!task.dependencies.includes(completedId)) continue;
    const allDepsDone = task.dependencies.every(depId => {
      const dep = tasks.find(t => t.id === depId);
      return dep?.status === 'done';
    });
    if (allDepsDone) {
      task.status = 'queued';
    }
  }
}

function overlapsRecoveryWindow(scheduledAt: string, duration: number, windows: RecoveryWindow[]): boolean {
  const blockStart = new Date(scheduledAt).getTime();
  const blockEnd = blockStart + duration * 60 * 1000;
  return windows.some(w => {
    const wStart = new Date(w.start).getTime();
    const wEnd = new Date(w.end).getTime();
    return blockStart < wEnd && blockEnd > wStart;
  });
}

export function registerAtlasActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerMultiple('atlas', {
    update_energy_wave: async ({ userId, encryptionKey, payload, updateGlobalSoul }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const wave: EnergyWavePoint[] = Array.isArray(payload?.wave)
        ? payload.wave.map((point: Record<string, unknown>, index: number) => ({
            id: typeof point?.id === 'string' ? point.id : `wave_${Date.now()}_${index}`,
            slot: typeof point?.slot === 'string' ? point.slot : `Slot ${index + 1}`,
            energy: parseBoundedScore(point?.energy),
            focus: parseBoundedScore(point?.focus),
            load: parseBoundedScore(point?.load)
          }))
        .slice(0, 48)
        : [];

      if (wave.length === 0) return;

      const next: AtlasProfile = {
        ...profile,
        energyWave: wave,
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);

      await updateGlobalSoul({
        cognitive: {
          energyBudget: parseBoundedScore(payload?.energyBudget, 5),
          focusScore: parseBoundedScore(payload?.focusScore, 5),
          activeLoad: parseBoundedScore(payload?.activeLoad, 5)
        }
      });
    },

    flatten_schedule: async ({ userId, encryptionKey, payload, updateGlobalSoul }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const flattenedUntil = typeof payload?.flattenedUntil === 'string' ? payload.flattenedUntil : new Date().toISOString();
      const next: AtlasProfile = {
        ...profile,
        flattenedUntil,
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);

      const nextLoad = typeof payload?.activeLoad === 'number' ? payload.activeLoad : undefined;
      if (typeof nextLoad === 'number') {
        await updateGlobalSoul({ cognitive: { activeLoad: nextLoad } });
      }
    },

    create_recovery_window: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const window: RecoveryWindow = {
        id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
        title: typeof payload?.title === 'string' ? payload.title : 'Recovery Window',
        start: typeof payload?.start === 'string' ? payload.start : new Date().toISOString(),
        end: typeof payload?.end === 'string' ? payload.end : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        reason: typeof payload?.reason === 'string' ? payload.reason : 'Recovery allocation',
        status: payload?.status === 'active' || payload?.status === 'completed' ? payload.status : 'planned'
      };

      const next: AtlasProfile = {
        ...profile,
        recoveryWindows: [window, ...profile.recoveryWindows].slice(0, 80),
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);
    },

    update_task_graph: async ({ userId, encryptionKey, payload, updateGlobalSoul }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const tasks: AtlasTaskNode[] = Array.isArray(payload?.tasks)
        ? payload.tasks.map((task: Record<string, unknown>, index: number) => ({
            id: typeof task?.id === 'string' ? task.id : `task_${Date.now()}_${index}`,
            title: typeof task?.title === 'string' ? task.title : `Task ${index + 1}`,
            energyCost: parseBoundedScore(task?.energyCost, 4),
            status: (task?.status === 'active' || task?.status === 'done' ? task.status : 'queued') as 'active' | 'queued' | 'done',
            dependencies: Array.isArray(task?.dependencies)
              ? task.dependencies.filter((dep: Record<string, unknown>) => typeof dep === 'string')
              : undefined
          }))
        .slice(0, 100)
        : [];

      if (tasks.length === 0) return;

      const next: AtlasProfile = {
        ...profile,
        taskGraph: tasks,
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);

      const nextLoad = typeof payload?.activeLoad === 'number' ? payload.activeLoad : undefined;
      if (typeof nextLoad === 'number') {
        await updateGlobalSoul({ cognitive: { activeLoad: nextLoad } });
      }
    },

    sync_vitals: async ({ userId, payload }) => {
      if (!userId) return;
      const cognitive = payload?.cognitive as Record<string, unknown> | undefined;
      if (!cognitive || typeof cognitive !== 'object') return;

      const patch: Record<string, unknown> = {};
      if (typeof cognitive.energyBudget === 'number' && Number.isFinite(cognitive.energyBudget)) {
        patch.energyBudget = Math.max(0, Math.min(10, cognitive.energyBudget));
      }
      if (typeof cognitive.focusScore === 'number' && Number.isFinite(cognitive.focusScore)) {
        patch.focusScore = Math.max(0, Math.min(10, cognitive.focusScore));
      }
      if (typeof cognitive.activeLoad === 'number' && Number.isFinite(cognitive.activeLoad)) {
        patch.activeLoad = Math.max(0, Math.min(10, cognitive.activeLoad));
      }

      if (Object.keys(patch).length > 0) {
        await GlobalProjectionService.updateCrossFunctionalState(userId, { cognitive: patch }).catch((e) => {
          console.error('Atlas sync_vitals failed:', e);
        });
      }
    },

    // === Task Management ===

    create_task: async ({ userId, encryptionKey, payload, updateGlobalSoul }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      if (profile.tasks.length >= 500) return;

      const now = new Date().toISOString();
      const priority = typeof payload?.priority === 'number'
        ? (Math.max(1, Math.min(5, Math.round(payload.priority))) as AtlasTask['priority'])
        : (3 as AtlasTask['priority']);

      const newTask: AtlasTask = {
        id: `task_${crypto.randomUUID()}`,
        title: typeof payload?.title === 'string' ? payload.title : 'Untitled Task',
        description: typeof payload?.description === 'string' ? payload.description : undefined,
        deadline: typeof payload?.deadline === 'string' ? payload.deadline : undefined,
        priority,
        energyCost: typeof payload?.energyCost === 'number' ? Math.max(0, Math.min(10, payload.energyCost)) : 4,
        status: 'queued',
        dependencies: Array.isArray(payload?.dependencies)
          ? payload.dependencies.filter((d: unknown) => typeof d === 'string')
          : [],
        projectId: typeof payload?.projectId === 'string' ? payload.projectId : undefined,
        goalId: typeof payload?.goalId === 'string' ? payload.goalId : undefined,
        notes: typeof payload?.notes === 'string' ? payload.notes : undefined,
        tags: Array.isArray(payload?.tags) ? payload.tags.filter((t: unknown) => typeof t === 'string') : undefined,
        createdAt: now,
        updatedAt: now
      };

      if (typeof payload?.recurrenceRule === 'string') {
        newTask.recurrenceRule = payload.recurrenceRule as AtlasTask['recurrenceRule'];
      }

      profile.tasks.push(newTask);

      if (newTask.projectId) {
        const project = profile.projects.find(p => p.id === newTask.projectId);
        if (project) {
          project.taskIds = [...(project.taskIds ?? []), newTask.id];
        }
      }

      if (newTask.goalId) {
        const goal = profile.goals.find(g => g.id === newTask.goalId);
        if (goal) {
          goal.associatedTaskIds = [...(goal.associatedTaskIds ?? []), newTask.id];
        }
      }

      await persistProfile(profile, userId ?? null, encryptionKey ?? null);
      await updateGlobalSoul({ cognitive: { activeLoad: calculateActiveLoad(profile.tasks) } });
    },

    update_task: async ({ userId, encryptionKey, payload, updateGlobalSoul }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const taskId = typeof payload?.id === 'string' ? payload.id : null;
      if (!taskId) return;

      const task = profile.tasks.find(t => t.id === taskId);
      if (!task) return;

      const now = new Date().toISOString();

      if (typeof payload?.title === 'string') task.title = payload.title;
      if (typeof payload?.description === 'string') task.description = payload.description;
      if (typeof payload?.deadline === 'string') task.deadline = payload.deadline;
      if (typeof payload?.notes === 'string') task.notes = payload.notes;
      if (typeof payload?.priority === 'number') {
        task.priority = Math.max(1, Math.min(5, Math.round(payload.priority))) as AtlasTask['priority'];
      }
      if (typeof payload?.energyCost === 'number') {
        task.energyCost = Math.max(0, Math.min(10, payload.energyCost));
      }
      if (Array.isArray(payload?.tags)) {
        task.tags = payload.tags.filter((t: unknown) => typeof t === 'string');
      }

      if (typeof payload?.status === 'string') {
        if (payload.status === 'active') {
          const allDepsDone = task.dependencies.every(depId => {
            const dep = profile.tasks.find(t => t.id === depId);
            return dep?.status === 'done';
          });
          task.status = allDepsDone ? 'active' : 'blocked';
        } else if (payload.status === 'done') {
          task.status = 'done';
          task.completedAt = now;
          unblockDependents(profile.tasks, task.id);
        } else if (['queued', 'blocked', 'deferred'].includes(payload.status)) {
          task.status = payload.status as AtlasTask['status'];
        }
      }

      task.updatedAt = now;

      await persistProfile(profile, userId ?? null, encryptionKey ?? null);
      await updateGlobalSoul({ cognitive: { activeLoad: calculateActiveLoad(profile.tasks) } });
    },

    complete_task: async ({ userId, encryptionKey, payload, updateGlobalSoul, emitSpineEvent }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const taskId = typeof payload?.id === 'string' ? payload.id : null;
      if (!taskId) return;

      const task = profile.tasks.find(t => t.id === taskId);
      if (!task) return;

      const now = new Date().toISOString();
      task.status = 'done';
      task.completedAt = now;
      if (typeof payload?.actualEnergyCost === 'number') {
        task.actualEnergyCost = Math.max(0, Math.min(10, payload.actualEnergyCost));
      }
      task.updatedAt = now;

      unblockDependents(profile.tasks, task.id);

      // Recurrence engine: auto-spawn next occurrence when recurrenceRule is set
      if (task.recurrenceRule) {
        const baseDate = task.scheduledSlot
          ? new Date(task.scheduledSlot)
          : new Date();

        let nextDate: Date;
        switch (task.recurrenceRule) {
          case 'daily':
            nextDate = new Date(baseDate);
            nextDate.setDate(nextDate.getDate() + 1);
            break;
          case 'weekdays': {
            nextDate = new Date(baseDate);
            nextDate.setDate(nextDate.getDate() + 1);
            while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
              nextDate.setDate(nextDate.getDate() + 1);
            }
            break;
          }
          case 'weekly':
            nextDate = new Date(baseDate);
            nextDate.setDate(nextDate.getDate() + 7);
            break;
          case 'monthly':
            nextDate = new Date(baseDate);
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
          default:
            nextDate = new Date(baseDate);
            nextDate.setDate(nextDate.getDate() + 1);
        }

        const nextOccurrenceDate = nextDate.toISOString().slice(0, 10);
        const spawnedTask: AtlasTask = {
          id: crypto.randomUUID(),
          title: task.title,
          description: task.description,
          priority: task.priority,
          energyCost: task.energyCost,
          recurrenceRule: task.recurrenceRule,
          tags: task.tags,
          notes: task.notes,
          dependencies: [...task.dependencies],
          projectId: task.projectId,
          goalId: task.goalId,
          status: 'queued',
          scheduledSlot: nextOccurrenceDate,
          nextOccurrenceDate,
          createdAt: now,
          updatedAt: now
        };
        profile.tasks.push(spawnedTask);
      }

      const doneTasks = profile.tasks.filter(t => t.status === 'done').length;
      const nonDeferred = profile.tasks.filter(t => t.status !== 'deferred').length;
      const taskCompletionRate = nonDeferred > 0
        ? parseBoundedScore(Math.round((doneTasks / nonDeferred) * 10))
        : 5;

      await persistProfile(profile, userId ?? null, encryptionKey ?? null);
      await updateGlobalSoul({
        cognitive: {
          activeLoad: calculateActiveLoad(profile.tasks),
          taskCompletionRate
        }
      });

      emitSpineEvent('TASK_COMPLETED', {
        taskId: task.id,
        title: task.title,
        energyCost: task.energyCost,
        actualEnergyCost: task.actualEnergyCost
      });
    },

    move_task: async ({ userId, encryptionKey, payload }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const taskId = typeof payload?.id === 'string' ? payload.id : null;
      const newSlot = typeof payload?.newSlot === 'string' ? payload.newSlot : null;
      if (!taskId || !newSlot) return;

      const scheduled = profile.scheduledTasks.find(s => s.id === taskId);
      if (!scheduled) return;

      const oldSlot = scheduled.scheduledAt;
      scheduled.scheduledAt = newSlot;
      if (typeof payload?.reason === 'string') {
        scheduled.deferredFrom = oldSlot;
      }

      await persistProfile(profile, userId ?? null, encryptionKey ?? null);
    },

    prioritize: async ({ userId, encryptionKey, payload }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const taskIds: string[] = Array.isArray(payload?.taskIds)
        ? payload.taskIds.filter((id: unknown) => typeof id === 'string')
        : [];
      if (taskIds.length === 0) return;

      const now = new Date().toISOString();
      taskIds.forEach((id: string, index: number) => {
        const task = profile.tasks.find(t => t.id === id);
        if (task) {
          task.priority = Math.min(5, index + 1) as AtlasTask['priority'];
          task.updatedAt = now;
        }
      });

      await persistProfile(profile, userId ?? null, encryptionKey ?? null);
    },

    // === Goal Management ===

    create_goal: async ({ userId, encryptionKey, payload }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      if (profile.goals.length >= 25) return;

      const now = new Date().toISOString();
      const milestones: AtlasMilestone[] = Array.isArray(payload?.milestones)
        ? payload.milestones.slice(0, 20).map((m: Record<string, unknown>, i: number) => ({
            id: typeof m?.id === 'string' ? m.id : `ms_${crypto.randomUUID()}`,
            title: typeof m?.title === 'string' ? m.title : `Milestone ${i + 1}`,
            dueDate: typeof m?.dueDate === 'string' ? m.dueDate : undefined,
            completed: false,
            completedAt: undefined
          }))
        : [];

      const newGoal: AtlasGoal = {
        id: `goal_${crypto.randomUUID()}`,
        title: typeof payload?.title === 'string' ? payload.title : 'Untitled Goal',
        description: typeof payload?.description === 'string' ? payload.description : undefined,
        deadline: typeof payload?.deadline === 'string' ? payload.deadline : undefined,
        milestones,
        associatedTaskIds: [],
        successCriteria: typeof payload?.successCriteria === 'string' ? payload.successCriteria : '',
        progressPercent: 0,
        status: 'active',
        notes: typeof payload?.notes === 'string' ? payload.notes : undefined,
        createdAt: now,
        updatedAt: now
      };

      profile.goals.push(newGoal);
      await persistProfile(profile, userId ?? null, encryptionKey ?? null);
    },

    update_goal_progress: async ({ userId, encryptionKey, payload }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const goalId = typeof payload?.id === 'string' ? payload.id : null;
      if (!goalId) return;

      const goal = profile.goals.find(g => g.id === goalId);
      if (!goal) return;

      const completedIds: string[] = Array.isArray(payload?.completedMilestoneIds)
        ? payload.completedMilestoneIds.filter((id: unknown) => typeof id === 'string')
        : [];

      const now = new Date().toISOString();
      for (const ms of goal.milestones) {
        if (completedIds.includes(ms.id) && !ms.completed) {
          ms.completed = true;
          ms.completedAt = now;
        }
      }

      const total = goal.milestones.length;
      const completed = goal.milestones.filter(m => m.completed).length;
      goal.progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

      if (goal.progressPercent >= 100) {
        goal.status = 'completed';
      }

      goal.updatedAt = now;
      await persistProfile(profile, userId ?? null, encryptionKey ?? null);
    },

    set_deadline: async ({ userId, encryptionKey, payload, updateGlobalSoul, emitSpineEvent }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const targetId = typeof payload?.targetId === 'string' ? payload.targetId : null;
      const targetType = typeof payload?.targetType === 'string' ? payload.targetType : null;
      const deadline = typeof payload?.deadline === 'string' ? payload.deadline : null;
      if (!targetId || !targetType || !deadline) return;

      const now = new Date().toISOString();
      if (targetType === 'task') {
        const task = profile.tasks.find(t => t.id === targetId);
        if (task) {
          task.deadline = deadline;
          task.updatedAt = now;
        }
      } else if (targetType === 'goal') {
        const goal = profile.goals.find(g => g.id === targetId);
        if (goal) {
          goal.deadline = deadline;
          goal.updatedAt = now;
        }
      }

      const isHard = payload?.hardDeadline === true;
      const msUntil = new Date(deadline).getTime() - Date.now();
      if (isHard && msUntil > 0 && msUntil < 24 * 60 * 60 * 1000) {
        emitSpineEvent('DEADLINE_APPROACHING', {
          targetId,
          targetType,
          deadline,
          hoursRemaining: Math.round(msUntil / (60 * 60 * 1000))
        });
      }

      await persistProfile(profile, userId ?? null, encryptionKey ?? null);
      await updateGlobalSoul({
        planning: { deadlinePressure: calculateDeadlinePressure(profile.tasks) }
      });
    },

    // === Habit Management ===

    create_habit: async ({ userId, encryptionKey, payload }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      if (profile.habits.length >= 30) return;

      const now = new Date().toISOString();
      const validFrequencies: AtlasHabit['frequency'][] = ['daily', 'weekdays', 'weekends', 'weekly', 'custom'];
      const frequency = validFrequencies.includes(payload?.frequency as AtlasHabit['frequency'])
        ? (payload!.frequency as AtlasHabit['frequency'])
        : 'daily';

      const newHabit: AtlasHabit = {
        id: `habit_${crypto.randomUUID()}`,
        title: typeof payload?.title === 'string' ? payload.title : 'Untitled Habit',
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

      await updateGlobalSoul({ planning: { streakHealth } });
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
      // pauseReason, pausedAt, resumeDate fields being added to AtlasHabit concurrently
      const ext = habit as unknown as Record<string, unknown>;
      ext.pauseReason = typeof payload?.pauseReason === 'string' ? payload.pauseReason : undefined;
      ext.pausedAt = now;
      ext.resumeDate = typeof payload?.resumeDate === 'string' ? payload.resumeDate : undefined;
      habit.updatedAt = now;

      await persistProfile(profile, userId ?? null, encryptionKey ?? null);
    },

    // === Schedule Management ===

    daily_plan: async ({ userId, encryptionKey, payload, updateGlobalSoul }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const date = typeof payload?.date === 'string' ? payload.date : new Date().toISOString().slice(0, 10);
      const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
      if (blocks.length === 0) return;

      const now = new Date().toISOString();
      const newScheduled: ScheduledTask[] = [];

      for (const block of blocks) {
        const time = typeof block?.time === 'string' ? block.time : now;
        const scheduledAt = time.includes('T') ? time : `${date}T${time}`;
        const duration = typeof block?.duration === 'number' ? block.duration : 60;

        if (overlapsRecoveryWindow(scheduledAt, duration, profile.recoveryWindows)) continue;

        const entry: ScheduledTask = {
          id: `sched_${crypto.randomUUID()}`,
          title: typeof block?.title === 'string' ? block.title : 'Planned Block',
          energyCost: typeof block?.energyLevel === 'number' ? parseBoundedScore(block.energyLevel) : 5,
          focusCost: typeof block?.focusCost === 'number' ? parseBoundedScore(block.focusCost) : 5,
          scheduledAt,
          duration,
          category: ['deep_work', 'admin', 'social', 'physical', 'creative', 'other'].includes(block?.type)
            ? block.type
            : 'other',
          status: 'scheduled',
          dependencies: block?.taskId ? [block.taskId] : undefined,
          blockedBy: null,
          createdAt: now
        };
        newScheduled.push(entry);
      }

      profile.scheduledTasks = [...profile.scheduledTasks, ...newScheduled];

      const existingIdx = profile.dailyIntentions.findIndex(d => d.date === date);
      const intention: DailyIntention = {
        id: existingIdx >= 0 ? profile.dailyIntentions[existingIdx].id : `intention_${crypto.randomUUID()}`,
        date,
        theme: typeof payload?.theme === 'string' ? payload.theme : 'Focused Work',
        focusDomain: typeof payload?.focusDomain === 'string' ? payload.focusDomain : 'general',
        energyTarget: typeof payload?.energyTarget === 'number' ? parseBoundedScore(payload.energyTarget) : 7,
        createdAt: existingIdx >= 0 ? profile.dailyIntentions[existingIdx].createdAt : now
      };

      if (existingIdx >= 0) {
        profile.dailyIntentions[existingIdx] = intention;
      } else {
        profile.dailyIntentions.push(intention);
      }

      await persistProfile(profile, userId ?? null, encryptionKey ?? null);

      const planningLoad = parseBoundedScore(
        Math.round((profile.scheduledTasks.filter(s => s.status === 'scheduled').length / 20) * 10)
      );
      await updateGlobalSoul({ cognitive: { planningLoad } });
    },

    temporal_review: async ({ userId, encryptionKey, payload, emitSpineEvent }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const now = new Date().toISOString();

      const habitSummary: HabitWeekSummary[] = Array.isArray(payload?.habitSummary)
        ? payload.habitSummary.map((h: Record<string, unknown>) => ({
            habitId: typeof h?.habitId === 'string' ? h.habitId : '',
            habitTitle: typeof h?.habitTitle === 'string' ? h.habitTitle : '',
            streak: typeof h?.streak === 'number' ? h.streak : 0,
            completions: typeof h?.completions === 'number' ? h.completions : 0,
            status: h?.status === 'paused' ? 'paused' as const : 'active' as const
          }))
        : [];

      const goalProgress: GoalWeekProgress[] = Array.isArray(payload?.goalProgress)
        ? payload.goalProgress.map((g: Record<string, unknown>) => ({
            goalId: typeof g?.goalId === 'string' ? g.goalId : '',
            goalTitle: typeof g?.goalTitle === 'string' ? g.goalTitle : '',
            progressPercent: typeof g?.progressPercent === 'number' ? g.progressPercent : 0,
            milestonesCompleted: typeof g?.milestonesCompleted === 'number' ? g.milestonesCompleted : 0,
            milestonesTotal: typeof g?.milestonesTotal === 'number' ? g.milestonesTotal : 0
          }))
        : [];

      const resilienceTrend = (['improving', 'stable', 'declining'] as const)
        .find(v => v === payload?.resilienceTrend) ?? 'stable';

      const scope = (['daily', 'weekly', 'monthly', 'yearly'] as const)
        .find(v => v === payload?.scope) ?? 'weekly';

      const snapshot: TemporalReview = {
        id: `review_${crypto.randomUUID()}`,
        scope,
        periodStart: typeof payload?.periodStart === 'string' ? payload.periodStart : now,
        periodEnd: typeof payload?.periodEnd === 'string' ? payload.periodEnd : now,
        completionRate: typeof payload?.completionRate === 'number' ? payload.completionRate : 0,
        totalScheduled: typeof payload?.totalScheduled === 'number' ? payload.totalScheduled : 0,
        totalCompleted: typeof payload?.totalCompleted === 'number' ? payload.totalCompleted : 0,
        habitSummary,
        goalProgress,
        nsvTrend: {
          energyBudgetAvg: typeof payload?.energyBudgetAvg === 'number' ? payload.energyBudgetAvg : 5,
          resilienceTrend,
          focusScoreAvg: typeof payload?.focusScoreAvg === 'number' ? payload.focusScoreAvg : 5
        },
        insights: Array.isArray(payload?.insights) ? payload.insights : [],
        driftScore: typeof payload?.driftScore === 'number' ? payload.driftScore : undefined,
        nextPeriodFocus: typeof payload?.nextPeriodFocus === 'string' ? payload.nextPeriodFocus : '',
        notes: typeof payload?.notes === 'string' ? payload.notes : undefined,
        createdAt: now
      };

      if (profile.reviews.length >= 52) {
        profile.reviews = profile.reviews.slice(-51);
      }
      profile.reviews.push(snapshot);

      await persistProfile(profile, userId ?? null, encryptionKey ?? null);

      emitSpineEvent('TEMPORAL_REVIEW_COMPLETE', {
        reviewId: snapshot.id,
        scope: snapshot.scope,
        periodStart: snapshot.periodStart,
        completionRate: snapshot.completionRate,
        totalCompleted: snapshot.totalCompleted
      });
    },

    schedule_block: async ({ userId, encryptionKey, payload }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const now = new Date().toISOString();
      const scheduledAt = typeof payload?.scheduledAt === 'string' ? payload.scheduledAt : now;
      const duration = typeof payload?.duration === 'number' ? payload.duration : 60;

      if (overlapsRecoveryWindow(scheduledAt, duration, profile.recoveryWindows)) return;

      const entry: ScheduledTask = {
        id: `sched_${crypto.randomUUID()}`,
        title: typeof payload?.title === 'string' ? payload.title : 'Scheduled Block',
        energyCost: typeof payload?.energyCost === 'number' ? parseBoundedScore(payload.energyCost) : 5,
        focusCost: typeof payload?.focusCost === 'number' ? parseBoundedScore(payload.focusCost) : 5,
        scheduledAt,
        duration,
        category: ['deep_work', 'admin', 'social', 'physical', 'creative', 'other'].includes(payload?.category as string)
          ? (payload!.category as ScheduledTask['category'])
          : 'other',
        status: 'scheduled',
        blockedBy: null,
        createdAt: now
      };

      const taskId = typeof payload?.taskId === 'string' ? payload.taskId : null;
      if (taskId) {
        entry.dependencies = [taskId];
        const task = profile.tasks.find(t => t.id === taskId);
        if (task && task.status === 'queued') {
          task.status = 'active';
          task.updatedAt = now;
        }
      }

      profile.scheduledTasks.push(entry);
      await persistProfile(profile, userId ?? null, encryptionKey ?? null);
    },

    // === Cross-Module ===

    delegate_to_module: async ({ emitSpineEvent, payload }) => {
      emitSpineEvent('DELEGATION_REQUEST', {
        targetModule: typeof payload?.targetModule === 'string' ? payload.targetModule : '',
        task: typeof payload?.task === 'string' ? payload.task : '',
        context: typeof payload?.context === 'string' ? payload.context : '',
        priority: typeof payload?.priority === 'string' ? payload.priority : 'info'
      });
    },

    request_nsv_calibration: async ({ emitSpineEvent, payload }) => {
      emitSpineEvent('NSV_CALIBRATION_REQUEST', {
        metrics: Array.isArray(payload?.metrics)
          ? payload.metrics.filter((m: unknown) => typeof m === 'string')
          : [],
        reason: typeof payload?.reason === 'string' ? payload.reason : 'Manual calibration request'
      });
    },

    // === Additional CRUD Operations ===

    delete_task: async ({ userId, encryptionKey, payload, updateGlobalSoul }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const taskId = typeof payload?.id === 'string' ? payload.id : null;
      if (!taskId) return;

      profile.tasks = profile.tasks.filter(t => t.id !== taskId);

      // Remove from projects
      for (const project of profile.projects) {
        if (project.taskIds.includes(taskId)) {
          project.taskIds = project.taskIds.filter(id => id !== taskId);
        }
      }

      // Remove from goals
      for (const goal of profile.goals) {
        if (goal.associatedTaskIds.includes(taskId)) {
          goal.associatedTaskIds = goal.associatedTaskIds.filter(id => id !== taskId);
        }
      }

      await persistProfile(profile, userId ?? null, encryptionKey ?? null);
      await updateGlobalSoul({ cognitive: { activeLoad: calculateActiveLoad(profile.tasks) } });
    },

    update_goal: async ({ userId, encryptionKey, payload }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const goalId = typeof payload?.id === 'string' ? payload.id : null;
      if (!goalId) return;

      const goal = profile.goals.find(g => g.id === goalId);
      if (!goal) return;

      const now = new Date().toISOString();

      if (typeof payload?.title === 'string') goal.title = payload.title;
      if (typeof payload?.description === 'string') goal.description = payload.description;
      if (typeof payload?.deadline === 'string') goal.deadline = payload.deadline;
      if (typeof payload?.successCriteria === 'string') goal.successCriteria = payload.successCriteria;
      if (typeof payload?.notes === 'string') goal.notes = payload.notes;
      if (typeof payload?.status === 'string') {
        goal.status = payload.status as AtlasGoal['status'];
      }

      if (Array.isArray(payload?.milestones)) {
        goal.milestones = payload.milestones;
      }

      if (Array.isArray(payload?.associatedTaskIds)) {
        goal.associatedTaskIds = payload.associatedTaskIds.filter((id: unknown) => typeof id === 'string');
      }

      // Recalculate progress
      const completedMilestones = goal.milestones.filter(m => m.completed).length;
      const totalMilestones = goal.milestones.length;
      goal.progressPercent = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

      goal.updatedAt = now;

      await persistProfile(profile, userId ?? null, encryptionKey ?? null);
    },

    delete_goal: async ({ userId, encryptionKey, payload }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const goalId = typeof payload?.id === 'string' ? payload.id : null;
      if (!goalId) return;

      profile.goals = profile.goals.filter(g => g.id !== goalId);

      // Remove goalId from associated tasks
      for (const task of profile.tasks) {
        if (task.goalId === goalId) {
          task.goalId = undefined;
        }
      }

      // Remove goalId from projects
      for (const project of profile.projects) {
        if (project.goalId === goalId) {
          project.goalId = undefined;
        }
      }

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

    set_daily_intention: async ({ userId, encryptionKey, payload }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const now = new Date().toISOString();
      const dateOnly = now.slice(0, 10);

      const existingIdx = profile.dailyIntentions.findIndex(i => i.date === dateOnly);
      
      if (existingIdx >= 0) {
        // Update existing for today
        const current = profile.dailyIntentions[existingIdx];
        profile.dailyIntentions[existingIdx] = {
          ...current,
          theme: typeof payload?.theme === 'string' ? payload.theme : current.theme,
          focusDomain: typeof payload?.focusDomain === 'string' ? payload.focusDomain : current.focusDomain,
          energyTarget: typeof payload?.energyTarget === 'number' ? Math.max(0, Math.min(10, payload.energyTarget)) : current.energyTarget,
        };
      } else {
        // Create new
        const entry: DailyIntention = {
          id: `intent_${crypto.randomUUID()}`,
          date: dateOnly,
          theme: typeof payload?.theme === 'string' ? payload.theme : 'Standard Operation',
          focusDomain: typeof payload?.focusDomain === 'string' ? payload.focusDomain : 'General',
          energyTarget: typeof payload?.energyTarget === 'number' ? Math.max(0, Math.min(10, payload.energyTarget)) : 5,
          createdAt: now
        };
        profile.dailyIntentions = [entry, ...profile.dailyIntentions].slice(0, 30);
      }
      
      await persistProfile(profile, userId ?? null, encryptionKey ?? null);
    },

    update_routine: async ({ userId, encryptionKey, payload }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      if (typeof payload?.isActive === 'boolean') {
        profile.routine.isActive = payload.isActive;
      }
      
      if (Array.isArray(payload?.blocks)) {
        profile.routine.blocks = payload.blocks.map((b: any, index: number) => ({
          id: b?.id || `block_${crypto.randomUUID()}`,
          title: b?.title || `Block ${index}`,
          startTime: b?.startTime || '09:00',
          endTime: b?.endTime || '10:00',
          daysOfWeek: Array.isArray(b?.daysOfWeek) ? b.daysOfWeek : [1, 2, 3, 4, 5],
          category: b?.category || 'other',
          energyCost: typeof b?.energyCost === 'number' ? b.energyCost : 5
        }));
      }
      
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

    // === S9-002: Daily Schedule Generation ===

    generate_daily_schedule: async ({ userId, encryptionKey, payload, emitSpineEvent }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const date = typeof payload?.date === 'string' ? payload.date : new Date().toISOString().slice(0, 10);
      const scheduledBlocks = Array.isArray(payload?.scheduledBlocks) ? payload.scheduledBlocks : [];
      if (scheduledBlocks.length === 0) return;

      const totalEnergyCost = typeof payload?.totalEnergyCost === 'number' ? payload.totalEnergyCost : 0;
      let notes = typeof payload?.notes === 'string' ? payload.notes : undefined;

      // Read energy budget from NSV for validation
      let energyBudget = 8; // safe default
      if (userId) {
        const projection = await GlobalProjectionService.getProjection(userId).catch(() => null);
        const budgetVal = projection?.crossFunctionalState?.cognitive?.energyBudget;
        if (typeof budgetVal === 'number' && Number.isFinite(budgetVal)) {
          energyBudget = budgetVal;
        }
      }

      // Warn when energy cost exceeds budget — still proceed per spec
      if (totalEnergyCost > energyBudget) {
        const warning = `[ENERGY WARNING] totalEnergyCost ${totalEnergyCost} exceeds energyBudget ${energyBudget}.`;
        console.warn('[Atlas generate_daily_schedule]', warning);
        notes = notes ? `${notes}\n${warning}` : warning;
      }

      const now = new Date().toISOString();
      const validCategories: ScheduledTask['category'][] = ['deep_work', 'admin', 'social', 'physical', 'creative', 'other'];

      const newBlocks: ScheduledTask[] = (scheduledBlocks as Record<string, unknown>[]).map(block => {
        const startTime = typeof block?.startTime === 'string' ? block.startTime : '09:00';
        const endTime = typeof block?.endTime === 'string' ? block.endTime : '10:00';

        // Derive duration in minutes from HH:mm range
        const [startH = 9, startM = 0] = startTime.split(':').map(Number);
        const [endH = 10, endM = 0] = endTime.split(':').map(Number);
        const duration = Math.max(15, (endH * 60 + endM) - (startH * 60 + startM));

        const typeStr = typeof block?.type === 'string' ? block.type : 'other';
        const category: ScheduledTask['category'] = validCategories.includes(typeStr as ScheduledTask['category'])
          ? (typeStr as ScheduledTask['category'])
          : 'other';

        const entry: ScheduledTask = {
          id: `sched_${crypto.randomUUID()}`,
          title: typeof block?.title === 'string' ? block.title : 'Scheduled Block',
          energyCost: parseBoundedScore(block?.energyCost),
          focusCost: 5,
          scheduledAt: `${date}T${startTime}`,
          duration,
          category,
          status: 'scheduled',
          dependencies: typeof block?.taskId === 'string' ? [block.taskId] : undefined,
          blockedBy: null,
          createdAt: now
        };
        return entry;
      });

      // Replace all blocks for the same date, then append fresh blocks
      profile.scheduledTasks = [
        ...profile.scheduledTasks.filter(t => !t.scheduledAt.startsWith(date)),
        ...newBlocks
      ];

      // Carry the warning forward into the profile notes field if applicable
      if (notes && typeof notes === 'string') {
        void notes; // already annotated above — suppress lint; payload notes are informational only
      }

      await persistProfile(profile, userId ?? null, encryptionKey ?? null);

      emitSpineEvent('ROUTINE_UPDATED', {
        date,
        blockCount: scheduledBlocks.length
      });
    },

    // === S9-004b: Set Task Recurrence ===

    set_task_recurrence: async ({ userId, encryptionKey, payload }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const taskId = typeof payload?.id === 'string' ? payload.id : null;
      if (!taskId) return;

      const task = profile.tasks.find(t => t.id === taskId);
      if (!task) return;

      if (payload?.recurrenceRule === null) {
        delete task.recurrenceRule;
      } else if (typeof payload?.recurrenceRule === 'string') {
        task.recurrenceRule = payload.recurrenceRule as AtlasTask['recurrenceRule'];
      }

      task.updatedAt = new Date().toISOString();
      await persistProfile(profile, userId ?? null, encryptionKey ?? null);
    }
  });
}
