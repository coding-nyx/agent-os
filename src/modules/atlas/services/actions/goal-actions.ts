import { ActionHub } from '@/lib/actions/action-hub';
import { AtlasGoal, AtlasMilestone } from '../atlas-profile-service';
import {
  loadProfile,
  persistProfile,
  sanitizeTitle
} from './shared';

export const goalActions: Parameters<typeof ActionHub.registerMultiple>[1] = {
  create_goal: async ({ userId, encryptionKey, payload, emitSpineEvent, markProfileDirty }) => {
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
    markProfileDirty?.();

    emitSpineEvent('ATLAS_GOAL_UPDATED', {
      goalId: newGoal.id,
      title: newGoal.title,
      action: 'created',
      progressPercent: 0,
      status: 'active'
    });
  },

  update_goal_progress: async ({ userId, encryptionKey, payload, emitSpineEvent, updateGlobalSoul, markProfileDirty }) => {
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
    const newlyCompleted: string[] = [];
    for (const ms of goal.milestones) {
      if (completedIds.includes(ms.id) && !ms.completed) {
        ms.completed = true;
        ms.completedAt = now;
        newlyCompleted.push(ms.id);
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
    markProfileDirty?.();

    emitSpineEvent('ATLAS_GOAL_UPDATED', {
      goalId: goal.id,
      title: goal.title,
      action: 'progress_updated',
      progressPercent: goal.progressPercent,
      status: goal.status
    });

    if (newlyCompleted.length > 0) {
      emitSpineEvent('ATLAS_GOAL_MILESTONE', {
        goalId: goal.id,
        title: goal.title,
        milestoneIds: newlyCompleted,
        completedAt: now
      });
    }

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
    await updateGlobalSoul({ planning: { goalAlignment: Math.round(goalAlignment * 100) / 100 } }).catch((e: unknown) => {
      console.error('[Atlas] NSV write failed (goalAlignment):', e);
    });
  },

  update_goal: async ({ userId, encryptionKey, payload, emitSpineEvent, markProfileDirty }) => {
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
    markProfileDirty?.();

    emitSpineEvent('ATLAS_GOAL_UPDATED', {
      goalId: goal.id,
      title: goal.title,
      action: 'updated',
      progressPercent: goal.progressPercent,
      status: goal.status
    });
  },

  delete_goal: async ({ userId, encryptionKey, payload, emitSpineEvent, markProfileDirty }) => {
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
    markProfileDirty?.();

    emitSpineEvent('ATLAS_GOAL_UPDATED', {
      goalId,
      title: goalTitle,
      action: 'deleted'
    });
  },

  atlas_add_goal_milestone: async ({ userId, encryptionKey, payload, emitSpineEvent, pushAssistantMessage, markProfileDirty }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const goalId = typeof payload?.goalId === 'string' ? payload.goalId : null;
    if (!goalId) return;

    const goal = profile.goals.find(g => g.id === goalId);
    if (!goal) return;

    const milestoneInput = payload?.milestone as Record<string, unknown> | undefined;
    if (!milestoneInput) return;

    const title = typeof milestoneInput.title === 'string' ? milestoneInput.title.trim() : '';
    if (!title) return;

    const dueDate = typeof milestoneInput.dueDate === 'string' ? milestoneInput.dueDate : undefined;
    if (dueDate !== undefined && isNaN(Date.parse(dueDate))) return;

    const newMilestone: AtlasMilestone = {
      id: `milestone_${crypto.randomUUID()}`,
      title,
      dueDate,
      completed: false,
      completedAt: undefined,
    };

    goal.milestones.push(newMilestone);
    goal.updatedAt = new Date().toISOString();

    await persistProfile(profile, userId ?? null, encryptionKey ?? null);
    markProfileDirty?.();

    emitSpineEvent('ATLAS_GOAL_UPDATED', {
      goalId,
      action: 'milestone_added',
    });

    if (pushAssistantMessage) pushAssistantMessage('Milestone added to goal.');
  },

  atlas_update_goal_milestone: async ({ userId, encryptionKey, payload, emitSpineEvent, pushAssistantMessage, markProfileDirty }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const goalId = typeof payload?.goalId === 'string' ? payload.goalId : null;
    const milestoneId = typeof payload?.milestoneId === 'string' ? payload.milestoneId : null;
    if (!goalId || !milestoneId) return;

    const goal = profile.goals.find(g => g.id === goalId);
    if (!goal) return;

    const milestone = goal.milestones.find(m => m.id === milestoneId);
    if (!milestone) return;

    const patch = (payload?.patch ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();

    if (typeof patch.title === 'string' && patch.title.trim()) {
      milestone.title = patch.title.trim();
    }
    if (typeof patch.dueDate === 'string') {
      if (!isNaN(Date.parse(patch.dueDate))) {
        milestone.dueDate = patch.dueDate;
      }
    }
    if (typeof patch.completed === 'boolean') {
      milestone.completed = patch.completed;
      if (patch.completed && !milestone.completedAt) {
        milestone.completedAt = now;
      } else if (!patch.completed) {
        milestone.completedAt = undefined;
      }
    }

    goal.updatedAt = now;
    await persistProfile(profile, userId ?? null, encryptionKey ?? null);
    markProfileDirty?.();

    emitSpineEvent('ATLAS_GOAL_UPDATED', {
      goalId,
      milestoneId,
      action: 'milestone_updated',
    });

    if (pushAssistantMessage) pushAssistantMessage('Milestone updated.');
  },

  atlas_delete_goal_milestone: async ({ userId, encryptionKey, payload, emitSpineEvent, pushAssistantMessage, markProfileDirty }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const goalId = typeof payload?.goalId === 'string' ? payload.goalId : null;
    const milestoneId = typeof payload?.milestoneId === 'string' ? payload.milestoneId : null;
    if (!goalId || !milestoneId) return;

    const goal = profile.goals.find(g => g.id === goalId);
    if (!goal) return;

    const originalCount = goal.milestones.length;
    goal.milestones = goal.milestones.filter(m => m.id !== milestoneId);

    // No-op if milestone wasn't found — avoids a spurious persist
    if (goal.milestones.length === originalCount) return;

    goal.updatedAt = new Date().toISOString();
    await persistProfile(profile, userId ?? null, encryptionKey ?? null);
    markProfileDirty?.();

    emitSpineEvent('ATLAS_GOAL_UPDATED', {
      goalId,
      milestoneId,
      action: 'milestone_deleted',
    });

    if (pushAssistantMessage) pushAssistantMessage('Milestone removed.');
  },

  complete_goal: async ({ userId, encryptionKey, payload, emitSpineEvent, updateGlobalSoul, markProfileDirty }) => {
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
    markProfileDirty?.();

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
    await updateGlobalSoul({ planning: { goalAlignment: Math.round(goalAlignment * 100) / 100 } }).catch((e: unknown) => {
      console.error('[Atlas] NSV write failed (goalAlignment):', e);
    });
  },
};
