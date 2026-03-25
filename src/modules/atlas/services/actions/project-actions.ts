import { ActionHub } from '@/lib/actions/action-hub';
import type { AtlasProject } from '../atlas-profile-service';
import {
  loadProfile,
  persistProfile,
  sanitizeTitle
} from './shared';

export const projectActions: Parameters<typeof ActionHub.registerMultiple>[1] = {
  create_project: async ({ userId, encryptionKey, payload, emitSpineEvent }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    if (typeof payload?.title !== 'string' || payload.title.trim() === '') return;
    if (profile.projects.length >= 50) return;

    const now = new Date().toISOString();

    const newProject: AtlasProject = {
      id: `project_${crypto.randomUUID()}`,
      title: sanitizeTitle(payload.title, 'Untitled Project'),
      description: typeof payload?.description === 'string' ? payload.description : undefined,
      status: (payload?.status as AtlasProject['status']) ?? 'active',
      goalId: typeof payload?.goalId === 'string' ? payload.goalId : undefined,
      taskIds: [],
      deadline: typeof payload?.deadline === 'string' ? payload.deadline : undefined,
      notes: typeof payload?.notes === 'string' ? payload.notes : undefined,
      createdAt: now,
      updatedAt: now,
    };

    profile.projects.push(newProject);
    await persistProfile(profile, userId ?? null, encryptionKey ?? null);

    emitSpineEvent('ATLAS_GOAL_UPDATED', {
      goalId: newProject.id,
      title: newProject.title,
      action: 'project_created',
    });
  },

  update_project: async ({ userId, encryptionKey, payload, emitSpineEvent }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const projectId = typeof payload?.id === 'string' ? payload.id : null;
    if (!projectId) return;

    const project = profile.projects.find(p => p.id === projectId);
    if (!project) return;

    const now = new Date().toISOString();

    if (typeof payload?.title === 'string') project.title = payload.title;
    if (typeof payload?.description === 'string') project.description = payload.description;
    if (typeof payload?.status === 'string') project.status = payload.status as AtlasProject['status'];
    if (typeof payload?.goalId === 'string') project.goalId = payload.goalId;
    if (payload?.goalId === null) project.goalId = undefined;
    if (typeof payload?.deadline === 'string') project.deadline = payload.deadline;
    if (payload?.deadline === null) project.deadline = undefined;
    if (typeof payload?.notes === 'string') project.notes = payload.notes;

    project.updatedAt = now;
    await persistProfile(profile, userId ?? null, encryptionKey ?? null);

    emitSpineEvent('ATLAS_GOAL_UPDATED', {
      goalId: project.id,
      title: project.title,
      action: 'project_updated',
    });
  },

  delete_project: async ({ userId, encryptionKey, payload, emitSpineEvent }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const projectId = typeof payload?.id === 'string' ? payload.id : null;
    if (!projectId) return;

    const deletedProject = profile.projects.find(p => p.id === projectId);
    const projectTitle = deletedProject?.title ?? 'Unknown project';

    profile.projects = profile.projects.filter(p => p.id !== projectId);

    // Unlink tasks that belonged to this project
    for (const task of profile.tasks) {
      if (task.projectId === projectId) {
        task.projectId = undefined;
      }
    }

    await persistProfile(profile, userId ?? null, encryptionKey ?? null);

    emitSpineEvent('ATLAS_GOAL_UPDATED', {
      goalId: projectId,
      title: projectTitle,
      action: 'project_deleted',
    });
  },
};
