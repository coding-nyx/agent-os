import { ActionHub } from '@/lib/actions/action-hub';
import { AtlasGoal, AtlasMilestone } from '../atlas-profile-service';
import {
  loadProfile,
  persistProfile,
  sanitizeTitle
} from './shared';

export const goalActions: Parameters<typeof ActionHub.registerMultiple>[1] = {
  create_goal: async ({ userId, encryptionKey, payload, emitSpineEvent }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    if (profile.goals.length >= 25) return;

    if (typeof payload?.title !== 'string' || payload.title.trim() === '') return;
    if (payload?.deadline !== undefined && typeof payload.deadline === 'string') {
      if (isNaN(Date.parse(payload.deadline))) return;
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

    const activeGoals = profile.goals.filter(g => g.status === 'active');
    const linkedTaskCount = profile.tasks.filter(t => t.goalId && t.status !== 'done').length;
    const goalAlignment = activeGoals.length > 0
      ? Math.min(1, linkedTaskCount / Math.max(1, activeGoals.length * 2))
      : 0;
    await updateGlobalSoul({ planning: { goalAlignment: Math.round(goalAlignment * 100) / 100 } });
  },

  update_goal: async ({ userId, encryptionKey, payload, emitSpineEvent }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const goalId = typeof payload?.id === 'string' ? payload.id : null;
    if (!goalId) return;

    const goal = profile.goals.find(g => g.id === goalId);
    if (!goal) return;

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

    const completedMilestones = goal.milestones.filter(m => m.completed).length;
    const totalMilestones = goal.milestones.length;
    if (totalMilestones > 0) {
      goal.progressPercent = Math.round((completedMilestones / totalMilestones) * 100);
    } else if (typeof payload?.progressPercent === 'number' && Number.isFinite(payload.progressPercent)) {
      goal.progressPercent = Math.max(0, Math.min(100, Math.round(payload.progressPercent)));
    }

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

    for (const task of profile.tasks) {
      if (task.goalId === goalId) {
        task.goalId = undefined;
      }
    }

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

    const activeGoals = profile.goals.filter(g => g.status === 'active');
    const linkedTaskCount = profile.tasks.filter(t => t.goalId && t.status !== 'done').length;
    const goalAlignment = activeGoals.length > 0
      ? Math.min(1, linkedTaskCount / Math.max(1, activeGoals.length * 2))
      : 0;
    await updateGlobalSoul({ planning: { goalAlignment: Math.round(goalAlignment * 100) / 100 } });
  },
};
