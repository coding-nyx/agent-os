import { ActionHub } from '@/lib/actions/action-hub';
import { AtlasTask, AtlasTaskNode, AtlasGoal } from '../atlas-profile-service';
import {
  loadProfile,
  persistProfile,
  calculateActiveLoad,
  calculateDeadlinePressure,
  unblockDependents,
  sanitizeTitle,
  parseBoundedScore
} from './shared';

export const taskActions: Parameters<typeof ActionHub.registerMultiple>[1] = {
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

    const next = {
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

  create_task: async ({ userId, encryptionKey, payload, emitSpineEvent }) => {
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

    emitSpineEvent('ATLAS_TASK_CREATED', {
      taskId: newTask.id,
      title: newTask.title,
      deadline: newTask.deadline,
      priority: newTask.priority,
      status: newTask.status,
      goalId: newTask.goalId,
      projectId: newTask.projectId
    });
  },

  update_task: async ({ userId, encryptionKey, payload, emitSpineEvent }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const taskId = typeof payload?.id === 'string' ? payload.id : null;
    if (!taskId) return;

    const task = profile.tasks.find(t => t.id === taskId);
    if (!task) return;

    const now = new Date().toISOString();
    const previousStatus = task.status;

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

    if (payload?.scheduledSlot === null) {
      task.scheduledSlot = undefined;
    } else if (typeof payload?.scheduledSlot === 'string') {
      task.scheduledSlot = payload.scheduledSlot;
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

    if (previousStatus !== task.status) {
      if (task.status === 'blocked') {
        emitSpineEvent('ATLAS_TASK_BLOCKED', {
          taskId: task.id,
          title: task.title,
          previousStatus
        });
      }
      if (previousStatus === 'blocked' && task.status === 'active') {
        emitSpineEvent('ATLAS_TASK_UNBLOCKED', {
          taskId: task.id,
          title: task.title
        });
      }
      if (task.status === 'done') {
        emitSpineEvent('ATLAS_TASK_COMPLETED', {
          taskId: task.id,
          title: task.title,
          energyCost: task.energyCost,
          actualEnergyCost: task.actualEnergyCost
        });
      }
    }
  },

  uncomplete_task: async ({ userId, encryptionKey, payload, updateGlobalSoul, emitSpineEvent }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const taskId = typeof payload?.id === 'string' ? payload.id : null;
    if (!taskId) return;

    const task = profile.tasks.find(t => t.id === taskId);
    if (!task) return;

    const now = new Date().toISOString();
    task.status = 'queued'; // Or active, based on dependencies, but queued is a safe default

    // Check dependencies to see if it should be active or blocked
    if (task.dependencies && task.dependencies.length > 0) {
      const allDepsDone = task.dependencies.every(depId => {
        const dep = profile.tasks.find(t => t.id === depId);
        return dep?.status === 'done';
      });
      task.status = allDepsDone ? 'active' : 'blocked';
    } else {
      task.status = 'active';
    }

    task.completedAt = undefined;
    task.actualEnergyCost = undefined;
    task.updatedAt = now;

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

    emitSpineEvent('ATLAS_TASK_UNCOMPLETED', {
      taskId: task.id,
      title: task.title
    });
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

    if (task.recurrenceRule) {
      const baseDate = task.scheduledSlot ? new Date(task.scheduledSlot) : new Date();
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

  delete_task: async ({ userId, encryptionKey, payload, updateGlobalSoul }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const taskId = typeof payload?.id === 'string' ? payload.id : null;
    if (!taskId) return;

    profile.tasks = profile.tasks.filter(t => t.id !== taskId);

    for (const project of profile.projects) {
      if (project.taskIds.includes(taskId)) {
        project.taskIds = project.taskIds.filter(id => id !== taskId);
      }
    }

    for (const goal of profile.goals) {
      if (goal.associatedTaskIds.includes(taskId)) {
        goal.associatedTaskIds = goal.associatedTaskIds.filter(id => id !== taskId);
      }
    }

    await persistProfile(profile, userId ?? null, encryptionKey ?? null);
    await updateGlobalSoul({ cognitive: { activeLoad: calculateActiveLoad(profile.tasks) } });
  },

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

  set_deadline: async ({ userId, encryptionKey, payload, updateGlobalSoul, emitSpineEvent }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const targetId = typeof payload?.targetId === 'string' ? payload.targetId : null;
    const targetType = typeof payload?.targetType === 'string' ? payload.targetType : null;
    const deadline = typeof payload?.deadline === 'string' ? payload.deadline : null;
    if (!targetId || !targetType || !deadline) return;

    // Reject past deadlines — a deadline in the past is misleading and can corrupt
    // deadline pressure calculations. Allow a 60-second grace window for clock skew.
    if (isNaN(Date.parse(deadline))) {
      console.warn('[Atlas] set_deadline: Invalid date format:', deadline);
      return;
    }
    const msUntilDeadline = new Date(deadline).getTime() - Date.now();
    if (msUntilDeadline < -60 * 1000) {
      console.warn('[Atlas] set_deadline: Rejecting past deadline:', deadline);
      return;
    }

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
    const msUntil = msUntilDeadline;
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

  delegate_to_module: async ({ emitSpineEvent, payload }) => {
    const targetModule = typeof payload?.targetModule === 'string' ? payload.targetModule : '';
    const task = typeof payload?.task === 'string' ? payload.task : '';
    const context = typeof payload?.context === 'string' ? payload.context : '';
    const priority = typeof payload?.priority === 'string' ? payload.priority : 'info';

    if (!targetModule || !task) return;

    // Build a structured verification request with a correlation ID so the
    // response can be matched back to this delegation call.
    const correlationId = crypto.randomUUID();

    if (targetModule === 'titan') {
      // Request workout verification from Titan for weekly review cross-check
      emitSpineEvent('DELEGATION_REQUEST', {
        correlationId,
        targetModule: 'titan',
        task,
        context,
        priority,
        requestType: 'workout_verification',
        expectedResponseType: 'WORKOUT_COMPLETED',
        timeoutMs: 5000,
      });

      // Also emit the specific Titan query event so Titan's listener can respond
      emitSpineEvent('ATLAS_STATE_CHANGED', {
        reason: 'titan_verification_requested',
        correlationId,
        query: task,
      });
    } else if (targetModule === 'agnes') {
      // Request therapy/session verification from Agnes
      emitSpineEvent('DELEGATION_REQUEST', {
        correlationId,
        targetModule: 'agnes',
        task,
        context,
        priority,
        requestType: 'session_verification',
        expectedResponseType: 'SOMATIC_SESSION_COMPLETE',
        timeoutMs: 5000,
      });

      emitSpineEvent('SOMATIC_SUPPORT_REQUESTED', {
        reason: 'atlas_cross_verification',
        correlationId,
        query: task,
        context,
      });
    } else {
      // Generic delegation for other modules
      emitSpineEvent('DELEGATION_REQUEST', {
        correlationId,
        targetModule,
        task,
        context,
        priority,
        requestType: 'generic',
        timeoutMs: 5000,
      });
    }
  },
};
