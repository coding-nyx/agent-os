import { ActionHub } from '@/lib/actions/action-hub';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import type { JournalEntry } from '@/lib/types';
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

const MAX_TITLE_LENGTH = 500;

function sanitizeTitle(raw: unknown, defaultValue: string): string {
  if (typeof raw !== 'string') return defaultValue;
  const trimmed = raw.trim().slice(0, MAX_TITLE_LENGTH);
  return trimmed.length > 0 ? trimmed : defaultValue;
}

async function loadProfile(userId?: string | null, encryptionKey?: CryptoKey | null) {
  return loadAtlasProfile({ userId, encryptionKey });
}

async function persistProfile(profile: AtlasProfile, userId?: string | null, encryptionKey?: CryptoKey | null) {
  profile.updatedAt = new Date().toISOString();
  await saveAtlasProfile(profile, { userId, encryptionKey });
}

export function calculateActiveLoad(tasks: AtlasTask[]): number {
  const active = tasks.filter(t => t.status === 'active' || t.status === 'queued');
  return Math.min(10, Math.round((active.length / 50) * 10));
}

function calculateDeadlinePressure(tasks: AtlasTask[]): number {
  const now = Date.now();
  const overdue = tasks.filter(
    t => t.deadline &&
      new Date(t.deadline).getTime() < now &&
      t.status !== 'done' &&
      t.status !== 'deferred'
  );
  const upcoming = tasks
    .filter(
      t => t.deadline &&
        new Date(t.deadline).getTime() >= now &&
        t.status !== 'done' &&
        t.status !== 'deferred'
    )
    .filter(t => new Date(t.deadline!).getTime() - now < 48 * 60 * 60 * 1000);
  const overduePenalty = Math.min(overdue.length * 1.5, 4);
  return Math.min(10, upcoming.length * 3 + overduePenalty);
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

// ---------------------------------------------------------------------------
// Journal helpers
// ---------------------------------------------------------------------------

type JournalTone = 'grounding' | 'self-compassion' | 'perspective' | 'ambition' | 'reflective';

/** Derive journaling tone from the NeuralStateVector. First-match wins. */
function deriveNsvTone(nsv: Record<string, unknown> | null | undefined): JournalTone {
  const emotional = nsv?.emotional as Record<string, unknown> | undefined;
  const cognitive  = nsv?.cognitive  as Record<string, unknown> | undefined;
  const biological = nsv?.biological as Record<string, unknown> | undefined;

  // Prefer domain-namespaced fields; fall back to legacy top-level aliases.
  const stressLoad: number =
    typeof emotional?.stressLoad === 'number' ? emotional.stressLoad :
    typeof nsv?.stressLoad       === 'number' ? (nsv.stressLoad as number) : 0;

  const cnsFatigue: number =
    typeof biological?.cnsFatigue === 'number' ? biological.cnsFatigue :
    typeof nsv?.cnsFatigue        === 'number' ? (nsv.cnsFatigue as number) : 0;

  const emotionalResilience: number =
    typeof emotional?.emotionalResilience === 'number' ? emotional.emotionalResilience :
    typeof nsv?.emotionalResilience       === 'number' ? (nsv.emotionalResilience as number) : 5;

  const moodTrendRaw = emotional?.moodTrend ?? nsv?.moodTrend;
  const moodTrend: number =
    typeof moodTrendRaw === 'number' ? moodTrendRaw :
    typeof moodTrendRaw === 'string' ? (parseFloat(moodTrendRaw) || 3) : 3;

  const energyLevel: number =
    typeof cognitive?.energyBudget === 'number' ? cognitive.energyBudget : 5;

  const focusScore: number =
    typeof cognitive?.focusScore === 'number' ? cognitive.focusScore : 5;

  if (stressLoad >= 8 || cnsFatigue >= 0.75)         return 'grounding';
  if (emotionalResilience <= 3)                       return 'self-compassion';
  if (moodTrend <= 2 && stressLoad >= 6)             return 'perspective';
  if (energyLevel >= 7 && focusScore >= 7)           return 'ambition';
  return 'reflective';
}

const JOURNAL_PROMPTS: Record<JournalTone, string> = {
  'grounding':        "Take a breath. What's one thing that felt manageable today, even if small?",
  'self-compassion':  "What's something you'd tell a close friend who had a day like yours?",
  'perspective':      "When you look back at today in a year, what will matter most?",
  'ambition':         "You brought real energy today. What's the one thing you want to build on tomorrow?",
  'reflective':       "What surprised you today — about your work, the world, or yourself?",
};

const JOURNAL_FORWARD: Record<JournalTone, string> = {
  'grounding':       "Tomorrow doesn't need to be big — one small step is enough.",
  'self-compassion': "You showed up today. That always counts for more than you think.",
  'perspective':     "The things that feel urgent today rarely define tomorrow — keep your bigger picture in view.",
  'ambition':        "That energy you brought today? Build on it — you're already in motion.",
  'reflective':      "Reflection like this compounds over time. Keep going.",
};

const MOOD_LABELS = ['', 'rough', 'low', 'okay', 'good', 'great'] as const;

const BLOCKER_STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','it','was','are','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','i','my','me',
  'we','our','you','your','he','his','she','her','they','their','this','that',
  'not','no','so','if','as','up','out','about','just','too','very','still',
]);

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'] as const;

function dateToWeekday(dateStr: string): string {
  // Use midday to avoid DST / UTC-offset shifts.
  return DAY_NAMES[new Date(`${dateStr}T12:00:00`).getDay()];
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
        title: sanitizeTitle(payload?.title, 'Untitled Task'),
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
      // Deferred so React 18 batches this with the Firestore subscription echo
      // and produces a single render cycle instead of two.
      setTimeout(() => updateGlobalSoul({ cognitive: { activeLoad: calculateActiveLoad(profile.tasks) } }), 0);
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
      setTimeout(() => updateGlobalSoul({ cognitive: { activeLoad: calculateActiveLoad(profile.tasks) } }), 0);
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

      emitSpineEvent('ATLAS_TASK_COMPLETED', {
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

    create_goal: async ({ userId, encryptionKey, payload, emitSpineEvent }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      if (profile.goals.length >= 25) return;

      // Validation
      if (typeof payload?.title !== 'string' || payload.title.trim() === '') return;
      if (payload?.deadline !== undefined && typeof payload.deadline === 'string') {
        if (isNaN(Date.parse(payload.deadline))) return; // reject invalid dates
      }

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
        title: sanitizeTitle(payload?.title, 'Untitled Goal'),
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

      emitSpineEvent('ATLAS_GOAL_UPDATED', {
        goalId: newGoal.id,
        title: newGoal.title,
        action: 'created',
        progressPercent: 0,
        status: 'active'
      });
    },

    update_goal_progress: async ({ userId, encryptionKey, payload, emitSpineEvent, updateGlobalSoul }) => {
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
      // For milestone-less goals, accept an explicit progressPercent from the payload.
      if (total > 0) {
        goal.progressPercent = Math.round((completed / total) * 100);
      } else if (typeof payload?.progressPercent === 'number' && Number.isFinite(payload.progressPercent)) {
        goal.progressPercent = Math.max(0, Math.min(100, Math.round(payload.progressPercent)));
      }

      if (goal.progressPercent >= 100) {
        goal.status = 'completed';
      }

      goal.updatedAt = now;
      await persistProfile(profile, userId ?? null, encryptionKey ?? null);

      emitSpineEvent('ATLAS_GOAL_UPDATED', {
        goalId: goal.id,
        title: goal.title,
        action: 'progress_updated',
        progressPercent: goal.progressPercent,
        status: goal.status
      });

      if (goal.progressPercent >= 100) {
        emitSpineEvent('ATLAS_GOAL_COMPLETED', {
          goalId: goal.id,
          title: goal.title,
          completedAt: now
        });
      }

      // Update goal alignment
      const activeGoals = profile.goals.filter(g => g.status === 'active');
      const linkedTaskCount = profile.tasks.filter(t => t.goalId && t.status !== 'done').length;
      const goalAlignment = activeGoals.length > 0
        ? Math.min(1, linkedTaskCount / Math.max(1, activeGoals.length * 2))
        : 0;
      await updateGlobalSoul({ planning: { goalAlignment: Math.round(goalAlignment * 100) / 100 } });
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
      const newDeadlinePressure = calculateDeadlinePressure(profile.tasks);
      await updateGlobalSoul({
        planning: { deadlinePressure: newDeadlinePressure }
      });

      emitSpineEvent('DEADLINE_PRESSURE_CHANGED', {
        deadlinePressure: newDeadlinePressure,
        targetId,
        targetType,
        deadline
      });

      emitSpineEvent('PLANNING_STATE_UPDATED', {
        changedFields: ['planning.deadlinePressure'],
        deadlinePressure: newDeadlinePressure
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

      // Habit momentum: ratio of habits with streak > 0 to all active habits (0-1)
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

      // Remove existing blocks for this date before appending (deduplication).
      profile.scheduledTasks = [
        ...profile.scheduledTasks.filter(t => !t.scheduledAt.startsWith(date)),
        ...newScheduled,
      ];

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

    update_goal: async ({ userId, encryptionKey, payload, emitSpineEvent }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const goalId = typeof payload?.id === 'string' ? payload.id : null;
      if (!goalId) return;

      const goal = profile.goals.find(g => g.id === goalId);
      if (!goal) return;

      // Validate deadline if provided
      if (payload?.deadline !== undefined && typeof payload.deadline === 'string') {
        if (isNaN(Date.parse(payload.deadline))) return;
      }

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

      emitSpineEvent('ATLAS_GOAL_UPDATED', {
        goalId: goal.id,
        title: goal.title,
        action: 'updated',
        progressPercent: goal.progressPercent,
        status: goal.status
      });
    },

    delete_goal: async ({ userId, encryptionKey, payload, emitSpineEvent }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const goalId = typeof payload?.id === 'string' ? payload.id : null;
      if (!goalId) return;

      const deletedGoal = profile.goals.find(g => g.id === goalId);
      const goalTitle = deletedGoal?.title ?? 'Unknown goal';

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

      emitSpineEvent('ATLAS_GOAL_UPDATED', {
        goalId,
        title: goalTitle,
        action: 'deleted'
      });
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

    // === New Required Actions ===

    /**
     * complete_goal
     * Mark a goal as completed or abandoned. Updates progress to 100% on completion.
     * Payload: { id: string; status?: 'completed' | 'abandoned'; notes?: string }
     */
    complete_goal: async ({ userId, encryptionKey, payload, emitSpineEvent, updateGlobalSoul }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const goalId = typeof payload?.id === 'string' ? payload.id : null;
      if (!goalId) return;

      const goal = profile.goals.find(g => g.id === goalId);
      if (!goal) return;

      const validStatuses: AtlasGoal['status'][] = ['completed', 'abandoned'];
      const newStatus: AtlasGoal['status'] = validStatuses.includes(payload?.status as AtlasGoal['status'])
        ? (payload!.status as AtlasGoal['status'])
        : 'completed';

      const now = new Date().toISOString();
      goal.status = newStatus;
      if (newStatus === 'completed') {
        goal.progressPercent = 100;
        for (const ms of goal.milestones) {
          if (!ms.completed) {
            ms.completed = true;
            ms.completedAt = now;
          }
        }
      }
      if (typeof payload?.notes === 'string') goal.notes = payload.notes;
      goal.updatedAt = now;

      await persistProfile(profile, userId ?? null, encryptionKey ?? null);

      emitSpineEvent('ATLAS_GOAL_UPDATED', {
        goalId: goal.id,
        title: goal.title,
        action: newStatus,
        progressPercent: goal.progressPercent,
        status: newStatus
      });

      if (newStatus === 'completed') {
        emitSpineEvent('ATLAS_GOAL_COMPLETED', {
          goalId: goal.id,
          title: goal.title,
          completedAt: now
        });
      }

      // Recompute goal alignment
      const activeGoals = profile.goals.filter(g => g.status === 'active');
      const linkedTaskCount = profile.tasks.filter(t => t.goalId && t.status !== 'done').length;
      const goalAlignment = activeGoals.length > 0
        ? Math.min(1, linkedTaskCount / Math.max(1, activeGoals.length * 2))
        : 0;
      await updateGlobalSoul({ planning: { goalAlignment: Math.round(goalAlignment * 100) / 100 } });
    },

    /**
     * update_nsv_planning
     * Directly write Atlas-owned planning.* NSV fields.
     * Payload: {
     *   goalAlignment?: number;        // 0-1
     *   executionConsistency?: number; // 0-1
     *   adaptability?: number;         // 0-1
     *   habitMomentum?: number;        // 0-1
     *   streakHealth?: number;         // 0-10
     *   deadlinePressure?: number;     // 0-10
     * }
     */
    update_nsv_planning: async ({ payload, updateGlobalSoul, emitSpineEvent }) => {
      const clamp01 = (v: unknown): number | undefined => {
        if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
        return Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
      };
      const clamp010 = (v: unknown): number | undefined => {
        if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
        return Math.round(Math.max(0, Math.min(10, v)) * 10) / 10;
      };

      const goalAlignment        = clamp01(payload?.goalAlignment);
      const executionConsistency = clamp01(payload?.executionConsistency);
      const adaptability         = clamp01(payload?.adaptability);
      const habitMomentum        = clamp01(payload?.habitMomentum);
      const streakHealth         = clamp010(payload?.streakHealth);
      const deadlinePressure     = clamp010(payload?.deadlinePressure);

      const planningUpdates: Record<string, number> = {};
      if (goalAlignment        !== undefined) planningUpdates.goalAlignment        = goalAlignment;
      if (executionConsistency !== undefined) planningUpdates.executionConsistency = executionConsistency;
      if (adaptability         !== undefined) planningUpdates.adaptability         = adaptability;
      if (habitMomentum        !== undefined) planningUpdates.habitMomentum        = habitMomentum;
      if (streakHealth         !== undefined) planningUpdates.streakHealth         = streakHealth;
      if (deadlinePressure     !== undefined) planningUpdates.deadlinePressure     = deadlinePressure;

      if (Object.keys(planningUpdates).length === 0) return;

      await updateGlobalSoul({ planning: planningUpdates });

      emitSpineEvent('PLANNING_STATE_UPDATED', {
        changedFields: Object.keys(planningUpdates).map(k => `planning.${k}`),
        ...planningUpdates
      });
    },

    /**
     * complete_check_in
     * Record a morning or evening check-in.
     * Payload: {
     *   type: 'morning' | 'evening';
     *   energyRating?: number;   // 1-5
     *   moodRating?: number;     // 1-5
     *   intention?: string;
     *   reflection?: string;
     * }
     */
    complete_check_in: async ({ userId, encryptionKey, payload, emitSpineEvent, updateGlobalSoul }) => {
      const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!raw) return;
      const profile = raw;

      const type = payload?.type === 'morning' || payload?.type === 'evening' ? payload.type : null;
      if (!type) return;

      const now = new Date().toISOString();
      const dateOnly = now.slice(0, 10);

      const clamp15 = (v: unknown): number | undefined => {
        if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
        return Math.max(1, Math.min(5, Math.round(v)));
      };

      const energyRating = clamp15(payload?.energyRating);
      const moodRating   = clamp15(payload?.moodRating);

      const checkInEntry = {
        id: `checkin_${crypto.randomUUID()}`,
        date: dateOnly,
        type,
        energyRating,
        moodRating,
        intention:  typeof payload?.intention  === 'string' ? payload.intention.slice(0, 500)  : undefined,
        reflection: typeof payload?.reflection === 'string' ? payload.reflection.slice(0, 500) : undefined,
        loggedAt: now
      };

      // Persist to profile check-in history (capped at 60) using a type-safe extension field
      const extProfile = profile as AtlasProfile & { checkIns?: typeof checkInEntry[] };
      if (!Array.isArray(extProfile.checkIns)) extProfile.checkIns = [];
      const existingIdx = extProfile.checkIns.findIndex(
        (c: typeof checkInEntry) => c.date === dateOnly && c.type === type
      );
      if (existingIdx >= 0) {
        extProfile.checkIns[existingIdx] = checkInEntry;
      } else {
        extProfile.checkIns.unshift(checkInEntry);
        if (extProfile.checkIns.length > 60) extProfile.checkIns.splice(60);
      }

      await persistProfile(profile, userId ?? null, encryptionKey ?? null);

      // Update localStorage markers used by cascade rules
      try {
        if (type === 'morning') {
          localStorage.setItem('atlas_last_morning_brief', now);
        } else {
          localStorage.setItem('atlas_last_evening_checkin', now);
        }
      } catch { /* SSR / non-browser environments */ }

      emitSpineEvent('ATLAS_STATE_CHANGED', {
        reason: `${type}_check_in_completed`,
        date: dateOnly
      });

      if (energyRating !== undefined) {
        const energyBudget = Math.round((energyRating / 5) * 10);
        await updateGlobalSoul({ cognitive: { energyBudget } });
      }
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

    generate_daily_schedule: async ({ userId, encryptionKey, payload, emitSpineEvent, pushAssistantMessage }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const targetDate = typeof payload?.targetDate === 'string' ? payload.targetDate : todayStr;

      // Resolve energy budget: payload → NSV → safe default
      let energyBudget = 8;
      if (typeof payload?.energyBudget === 'number' && Number.isFinite(payload.energyBudget)) {
        energyBudget = payload.energyBudget;
      } else if (userId) {
        const projection = await GlobalProjectionService.getProjection(userId).catch(() => null);
        const budgetVal = projection?.crossFunctionalState?.cognitive?.energyBudget;
        if (typeof budgetVal === 'number' && Number.isFinite(budgetVal)) {
          energyBudget = budgetVal;
        }
      }

      const isLowEnergy = energyBudget < 5;
      // "morning" = before noon on the target date (use today's wall-clock hour when
      // scheduling today; treat other dates as if scheduling from start-of-day).
      const isMorning = targetDate === todayStr ? today.getHours() < 12 : true;

      // ── Step 1: Filter eligible tasks ───────────────────────────────────────
      // Include queued/active tasks that are unscheduled, scheduled for today,
      // overdue, or whose deadline falls on or before the target date.
      const eligible = profile.tasks.filter(task => {
        if (task.status !== 'queued' && task.status !== 'active') return false;
        if (!task.scheduledSlot && !task.deadline) return true;
        if (task.scheduledSlot && task.scheduledSlot <= targetDate) return true;
        if (task.deadline && task.deadline.slice(0, 10) <= targetDate) return true;
        return false;
      });

      // ── Step 2: Sort ─────────────────────────────────────────────────────────
      // Overdue first → priority descending (5 = highest) →
      // energyCost: descending when morning+budget OK (front-load heavy tasks),
      //             ascending when low-energy (protect capacity).
      const taskIsOverdue = (t: AtlasTask): boolean => {
        if (t.deadline && t.deadline.slice(0, 10) < targetDate) return true;
        if (t.scheduledSlot && t.scheduledSlot < targetDate) return true;
        return false;
      };

      const sorted = [...eligible].sort((a, b) => {
        const aDue = taskIsOverdue(a) ? 1 : 0;
        const bDue = taskIsOverdue(b) ? 1 : 0;
        if (aDue !== bDue) return bDue - aDue;                       // overdue first

        const priorityDiff = b.priority - a.priority;                 // high priority first
        if (priorityDiff !== 0) return priorityDiff;

        // Front-load heavy tasks in the morning when energy is available;
        // use ascending order when budget is low to protect remaining capacity.
        return (!isLowEnergy && isMorning)
          ? b.energyCost - a.energyCost   // heavy first
          : a.energyCost - b.energyCost;  // light first
      });

      // ── Step 3: Build ScheduledTask blocks ───────────────────────────────────
      const MAX_DAILY_TASKS = 8;
      const capped = sorted.slice(0, MAX_DAILY_TASKS);

      const deriveCategory = (cost: number): ScheduledTask['category'] => {
        if (cost >= 8) return 'deep_work';
        if (cost >= 5) return 'admin';
        return 'other';
      };

      const now = new Date().toISOString();
      const BREAK_MINUTES = 5;
      let slotMinutes = 9 * 60; // scheduling starts at 09:00

      const newBlocks: ScheduledTask[] = capped.map(task => {
        // Duration proportional to energy cost: min 15 min, ~12 min per energy point
        const duration = Math.max(15, Math.round(task.energyCost * 12));
        const h = Math.floor(slotMinutes / 60);
        const m = slotMinutes % 60;
        const startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        slotMinutes += duration + BREAK_MINUTES;

        return {
          id: `sched_${crypto.randomUUID()}`,
          title: task.title,
          energyCost: task.energyCost,
          focusCost: Math.max(1, Math.round(task.energyCost * 0.8)),
          scheduledAt: `${targetDate}T${startTime}`,
          duration,
          category: deriveCategory(task.energyCost),
          status: 'scheduled' as const,
          dependencies: [task.id],
          blockedBy: null,
          createdAt: now
        };
      });

      // ── Step 4: Persist — replace existing blocks for this date ──────────────
      profile.scheduledTasks = [
        ...profile.scheduledTasks.filter(t => !t.scheduledAt.startsWith(targetDate)),
        ...newBlocks
      ];

      await persistProfile(profile, userId ?? null, encryptionKey ?? null);

      // ── Step 5: Emit Spine events ─────────────────────────────────────────────
      emitSpineEvent('ROUTINE_UPDATED', {
        date: targetDate,
        blockCount: newBlocks.length,
        source: 'generate_daily_schedule'
      });

      emitSpineEvent('ATLAS_STATE_CHANGED', {
        reason: 'daily_schedule_generated',
        taskCount: newBlocks.length,
        date: targetDate
      });

      // ── Step 6: Push summary message ─────────────────────────────────────────
      if (pushAssistantMessage && newBlocks.length > 0) {
        const overdueCount = capped.filter(taskIsOverdue).length;
        const overdueNote = overdueCount > 0 ? ` (${overdueCount} overdue)` : '';
        const topPreviews = capped.slice(0, 3).map(t => `• ${t.title}`).join('\n');
        const budgetNote = isLowEnergy ? ' Light tasks are front-loaded to protect your energy.' : '';
        pushAssistantMessage(
          `Your day is scheduled. ${newBlocks.length} task${newBlocks.length !== 1 ? 's' : ''}${overdueNote} queued for ${targetDate}.${budgetNote}\n\nTop priorities:\n${topPreviews}`
        );
      } else if (pushAssistantMessage && newBlocks.length === 0) {
        pushAssistantMessage(`No active or queued tasks found for ${targetDate}. Your schedule is clear.`);
      }
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
    },

    // === Journal Action Handlers ===

    /**
     * atlas_journal_generate_prompt
     * Generate and push a reflective journaling prompt tuned to the user's
     * current neural-state vector (or an explicitly supplied tone).
     * Payload: { tone?: string; date?: string }
     */
    atlas_journal_generate_prompt: async ({ userId, pushAssistantMessage, payload }) => {
      const VALID_TONES = new Set<JournalTone>([
        'grounding', 'self-compassion', 'perspective', 'ambition', 'reflective',
      ]);

      let tone: JournalTone = 'reflective';

      if (typeof payload?.tone === 'string' && VALID_TONES.has(payload.tone as JournalTone)) {
        tone = payload.tone as JournalTone;
      } else if (userId) {
        const projection = await GlobalProjectionService.getProjection(userId).catch(() => null);
        tone = deriveNsvTone(
          projection?.crossFunctionalState as unknown as Record<string, unknown> | null
        );
      }

      const prompt = JOURNAL_PROMPTS[tone];
      if (pushAssistantMessage) pushAssistantMessage(prompt);
    },

    /**
     * atlas_journal_synthesize_response
     * Compose a warm, deterministic 2-3 sentence synthesis from the saved
     * entry fields and push it as an assistant message.
     * Payload: { entry: Partial<JournalEntry>; tone?: string }
     */
    atlas_journal_synthesize_response: async ({ userId, pushAssistantMessage, emitSpineEvent, payload }) => {
      const VALID_TONES = new Set<JournalTone>([
        'grounding', 'self-compassion', 'perspective', 'ambition', 'reflective',
      ]);

      const entry = (payload?.entry ?? {}) as Partial<JournalEntry>;

      // Resolve tone
      let tone: JournalTone = 'reflective';
      if (typeof payload?.tone === 'string' && VALID_TONES.has(payload.tone as JournalTone)) {
        tone = payload.tone as JournalTone;
      } else if (userId) {
        const projection = await GlobalProjectionService.getProjection(userId).catch(() => null);
        tone = deriveNsvTone(
          projection?.crossFunctionalState as unknown as Record<string, unknown> | null
        );
      }

      // — Sentence 1: Acknowledge mood/energy ——————————————————————————————
      const moodIdx = typeof entry.mood === 'number'
        ? Math.max(1, Math.min(5, Math.round(entry.mood))) : 3;
      const moodLabel = MOOD_LABELS[moodIdx];

      let sentence1: string;
      if (moodLabel !== 'okay') {
        sentence1 = `A ${moodLabel} day — that's honest, and honesty here matters.`;
      } else {
        sentence1 = `A steady day — sometimes holding the line is the win.`;
      }

      // — Sentence 2: Reference freeform writing if present —————————————————
      let sentence2 = '';
      if (typeof entry.freeform === 'string' && entry.freeform.trim().length > 0) {
        const snippet = entry.freeform.trim().slice(0, 60);
        const ellipsis = entry.freeform.trim().length > 60 ? '...' : '';
        sentence2 = ` You wrote: "${snippet}${ellipsis}" — there's real self-awareness in that.`;
      } else if (typeof entry.morningIntent === 'string' && entry.morningIntent.trim().length > 0) {
        sentence2 = ` You set out to: "${entry.morningIntent.trim().slice(0, 60)}" — that intention shaped the day.`;
      }

      // — Sentence 3: Forward-looking affirmation ————————————————————————————
      const sentence3 = ` ${JOURNAL_FORWARD[tone]}`;

      const response = `${sentence1}${sentence2}${sentence3}`;

      if (pushAssistantMessage) pushAssistantMessage(response);

      emitSpineEvent('JOURNAL_ENTRY_UPDATED', {
        priority: 'info',
        domain: 'C',
        date: typeof entry.date === 'string' ? entry.date : new Date().toISOString().slice(0, 10),
      });
    },

    /**
     * atlas_journal_extract_insights
     * Analyse pre-decrypted entries from the last 7 days and push a markdown
     * week-in-review summary.
     * Payload: { entries: Array<{ date: string; mood: number; energyLevel: number; blockers: string }> }
     */
    atlas_journal_extract_insights: async ({ pushAssistantMessage, emitSpineEvent, payload }) => {
      type InsightEntry = { date: string; mood: number; energyLevel: number; blockers: string };

      const rawEntries: unknown[] = Array.isArray(payload?.entries) ? payload.entries : [];

      const entries: InsightEntry[] = rawEntries
        .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
        .map(e => ({
          date:         typeof e.date         === 'string' ? e.date         : '',
          mood:         typeof e.mood         === 'number' ? Math.max(1, Math.min(5, e.mood))         : 3,
          energyLevel:  typeof e.energyLevel  === 'number' ? Math.max(1, Math.min(5, e.energyLevel))  : 3,
          blockers:     typeof e.blockers     === 'string' ? e.blockers     : '',
        }))
        .filter(e => e.date.length > 0);

      if (entries.length === 0) {
        if (pushAssistantMessage) {
          pushAssistantMessage("No journal entries found to analyse for this week.");
        }
        return;
      }

      // — Average mood & energy ——————————————————————————————————————————————
      const avgMood   = entries.reduce((s, e) => s + e.mood,        0) / entries.length;
      const avgEnergy = entries.reduce((s, e) => s + e.energyLevel, 0) / entries.length;

      // — Mood trend: first-half vs second-half average —————————————————————
      const mid        = Math.ceil(entries.length / 2);
      const firstHalf  = entries.slice(0, mid);
      const secondHalf = entries.slice(mid);
      const firstAvg  = firstHalf.reduce( (s, e) => s + e.mood, 0) / (firstHalf.length  || 1);
      const secondAvg = secondHalf.reduce((s, e) => s + e.mood, 0) / (secondHalf.length || 1);
      const trendDelta = secondAvg - firstAvg;
      const trendLabel = trendDelta > 0.3 ? '📈 (trending up)'
                       : trendDelta < -0.3 ? '📉 (trending down)'
                       : '➡️ (stable)';

      // — Best day (highest combined mood + energy score) ————————————————————
      const bestEntry = entries.reduce((best, e) =>
        (e.mood + e.energyLevel) > (best.mood + best.energyLevel) ? e : best
      );
      const bestDay = dateToWeekday(bestEntry.date);

      // — Blocker word frequency (skip stop words, min 3 chars) —————————————
      const wordFreq = new Map<string, number>();
      for (const entry of entries) {
        if (!entry.blockers.trim()) continue;
        const words = entry.blockers
          .toLowerCase()
          .replace(/[^a-z0-9\s'-]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length >= 3 && !BLOCKER_STOP_WORDS.has(w));
        for (const word of words) {
          wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
        }
      }

      const topBlockers = [...wordFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([word]) => `"${word}"`);

      const blockersLine = topBlockers.length > 0
        ? `- Recurring blockers: ${topBlockers.join(', ')}`
        : '- No recurring blockers identified';

      // — Build markdown summary ——————————————————————————————————————————————
      const summary = [
        '**Your week in review:**',
        `- Avg mood: ${avgMood.toFixed(1)}/5 ${trendLabel}`,
        `- Avg energy: ${avgEnergy.toFixed(1)}/5`,
        blockersLine,
        `- Best day: ${bestDay} (mood ${bestEntry.mood}, energy ${bestEntry.energyLevel})`,
      ].join('\n');

      if (pushAssistantMessage) pushAssistantMessage(summary);

      emitSpineEvent('JOURNAL_ENTRY_UPDATED', {
        priority: 'info',
        domain:   'C',
        date:     new Date().toISOString().slice(0, 10),
        source:   'atlas_journal_extract_insights',
      });
    },
  });
}
