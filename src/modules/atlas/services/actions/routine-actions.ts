import { ActionHub } from '@/lib/actions/action-hub';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import {
  AtlasProfile,
  ScheduledTask,
  DailyIntention,
  TemporalReview,
  HabitWeekSummary,
  GoalWeekProgress,
  AtlasTask,
  AtlasReviewBlueprint,
  EnergyWavePoint,
  AtlasRoutine,
} from '../atlas-profile-service';
import {
  loadProfile,
  persistProfile,
  parseBoundedScore,
  overlapsRecoveryWindow
} from './shared';

// ─── Pure helpers ────────────────────────────────────────────────────────────

function sortBlocksByEnergyMatch(
  blocks: any[],
  energyWave: EnergyWavePoint[]
): any[] {
  if (energyWave.length === 0) return blocks;
  const avgEnergy = energyWave.reduce((s, p) => s + p.energy, 0) / energyWave.length;
  return [...blocks].sort((a, b) => {
    const aCost = typeof a.energyLevel === 'number' ? a.energyLevel :
                  typeof a.energyCost === 'number' ? a.energyCost : avgEnergy;
    const bCost = typeof b.energyLevel === 'number' ? b.energyLevel :
                  typeof b.energyCost === 'number' ? b.energyCost : avgEnergy;
    return bCost - aCost; // descending energy cost
  });
}

function overlapsRoutineBlock(
  scheduledAt: string,
  durationMin: number,
  routine: AtlasRoutine | undefined
): { overlaps: boolean; blockTitle?: string } {
  if (!routine?.isActive || !routine.blocks?.length) return { overlaps: false };

  const startMs = new Date(scheduledAt).getTime();
  const endMs = startMs + durationMin * 60 * 1000;
  const dayOfWeek = new Date(scheduledAt).getDay();

  for (const block of routine.blocks) {
    if (!block.daysOfWeek.includes(dayOfWeek)) continue;

    const datePart = scheduledAt.slice(0, 10);
    const blockStart = new Date(`${datePart}T${block.startTime}:00`).getTime();
    const blockEnd = new Date(`${datePart}T${block.endTime}:00`).getTime();

    if (startMs < blockEnd && endMs > blockStart) {
      return { overlaps: true, blockTitle: block.title };
    }
  }
  return { overlaps: false };
}

export const routineActions: Parameters<typeof ActionHub.registerMultiple>[1] = {
  flatten_schedule: async ({ userId, encryptionKey, payload, updateGlobalSoul, emitSpineEvent }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const flattenedUntil = typeof payload?.flattenedUntil === 'string' ? payload.flattenedUntil : new Date().toISOString();
    const next: AtlasProfile = {
      ...profile,
      flattenedUntil,
      updatedAt: new Date().toISOString()
    };

    await persistProfile(next, userId ?? null, encryptionKey ?? null);

    emitSpineEvent('FLATTEN_ENERGY_WAVE', { flattenedUntil, reason: typeof payload?.reason === 'string' ? payload.reason : 'schedule_flattened' }, { domain: 'C', priority: 'alert' });
    emitSpineEvent('ATLAS_RECOVERY_SCHEDULED', {
      flattenedUntil,
      reason: typeof payload?.reason === 'string' ? payload.reason : 'schedule_flattened'
    });
    emitSpineEvent('ATLAS_STATE_CHANGED', {
      changedFields: ['flattenedUntil'],
      flattenedUntil
    });

    const nextLoad = typeof payload?.activeLoad === 'number' ? payload.activeLoad : undefined;
    if (typeof nextLoad === 'number') {
      await updateGlobalSoul({ cognitive: { activeLoad: nextLoad } });
    }
  },

  daily_plan: async ({ userId, encryptionKey, payload, updateGlobalSoul }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const date = typeof payload?.date === 'string' ? payload.date : new Date().toISOString().slice(0, 10);
    const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
    if (blocks.length === 0) return;

    const sortedBlocks = sortBlocksByEnergyMatch(blocks, profile.energyWave ?? []);

    const now = new Date().toISOString();
    const newScheduled: ScheduledTask[] = [];

    for (const block of sortedBlocks) {
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
      blueprint: payload?.blueprint as AtlasReviewBlueprint | undefined,
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

  schedule_block: async ({ userId, encryptionKey, payload, emitSpineEvent }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const now = new Date().toISOString();
    const scheduledAt = typeof payload?.scheduledAt === 'string' ? payload.scheduledAt : now;
    const duration = typeof payload?.duration === 'number' ? payload.duration : 60;

    if (overlapsRecoveryWindow(scheduledAt, duration, profile.recoveryWindows)) return;

    // Reject if the new block's time window overlaps an existing scheduled task.
    const newStart = new Date(scheduledAt).getTime();
    const newEnd = newStart + duration * 60 * 1000;
    const hasSlotOverlap = profile.scheduledTasks.some(existing => {
      const existStart = new Date(existing.scheduledAt).getTime();
      const existEnd = existStart + existing.duration * 60 * 1000;
      return newStart < existEnd && newEnd > existStart;
    });
    if (hasSlotOverlap) {
      console.warn('[Atlas] schedule_block: Slot overlap detected — block not scheduled:', scheduledAt);
      return;
    }

    const routineCheck = overlapsRoutineBlock(scheduledAt, duration, profile.routine);
    if (routineCheck.overlaps) {
      emitSpineEvent('ATLAS_ROUTINE_CONFLICT', {
        scheduledAt,
        duration,
        routineBlockTitle: routineCheck.blockTitle,
        note: 'Task time overlaps an active routine block. User should confirm.',
      });
    }

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

    emitSpineEvent('ATLAS_TASK_CREATED', {
      taskId: entry.id,
      title: entry.title,
      scheduledAt: entry.scheduledAt,
      duration: entry.duration,
      category: entry.category,
      status: entry.status,
      source: 'schedule_block'
    });
  },

  update_nsv_planning: async ({ payload, updateGlobalSoul, emitSpineEvent }) => {
    const clamp01 = (v: unknown): number | undefined => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
      return Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
    };
    const clamp010 = (v: unknown): number | undefined => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
      return Math.round(Math.max(0, Math.min(10, v)) * 10) / 10;
    };

    const goalAlignment = clamp01(payload?.goalAlignment);
    const executionConsistency = clamp01(payload?.executionConsistency);
    const adaptability = clamp01(payload?.adaptability);
    const habitMomentum = clamp01(payload?.habitMomentum);
    const streakHealth = clamp010(payload?.streakHealth);
    const deadlinePressure = clamp010(payload?.deadlinePressure);

    const planningUpdates: Record<string, number> = {};
    if (goalAlignment !== undefined) planningUpdates.goalAlignment = goalAlignment;
    if (executionConsistency !== undefined) planningUpdates.executionConsistency = executionConsistency;
    if (adaptability !== undefined) planningUpdates.adaptability = adaptability;
    if (habitMomentum !== undefined) planningUpdates.habitMomentum = habitMomentum;
    if (streakHealth !== undefined) planningUpdates.streakHealth = streakHealth;
    if (deadlinePressure !== undefined) planningUpdates.deadlinePressure = deadlinePressure;

    if (Object.keys(planningUpdates).length === 0) return;

    await updateGlobalSoul({ planning: planningUpdates });

    emitSpineEvent('PLANNING_STATE_UPDATED', {
      changedFields: Object.keys(planningUpdates).map(k => `planning.${k}`),
      ...planningUpdates
    });
  },

  set_daily_intention: async ({ userId, encryptionKey, payload }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const now = new Date().toISOString();
    const dateOnly = now.slice(0, 10);

    const existingIdx = profile.dailyIntentions.findIndex(i => i.date === dateOnly);
    
    if (existingIdx >= 0) {
      const current = profile.dailyIntentions[existingIdx];
      profile.dailyIntentions[existingIdx] = {
        ...current,
        theme: typeof payload?.theme === 'string' ? payload.theme : current.theme,
        focusDomain: typeof payload?.focusDomain === 'string' ? payload.focusDomain : current.focusDomain,
        energyTarget: typeof payload?.energyTarget === 'number' ? Math.max(0, Math.min(10, payload.energyTarget)) : current.energyTarget,
      };
    } else {
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

  generate_daily_schedule: async ({ userId, encryptionKey, payload, emitSpineEvent, pushAssistantMessage }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const targetDate = typeof payload?.targetDate === 'string' ? payload.targetDate : todayStr;

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
    const isMorning = targetDate === todayStr ? today.getHours() < 12 : true;

    const eligible = profile.tasks.filter(task => {
      if (task.status !== 'queued' && task.status !== 'active') return false;
      if (!task.scheduledSlot && !task.deadline) return true;
      if (task.scheduledSlot && task.scheduledSlot <= targetDate) return true;
      if (task.deadline && task.deadline.slice(0, 10) <= targetDate) return true;
      return false;
    });

    const taskIsOverdue = (t: AtlasTask): boolean => {
      if (t.deadline && t.deadline.slice(0, 10) < targetDate) return true;
      if (t.scheduledSlot && t.scheduledSlot < targetDate) return true;
      return false;
    };

    const sorted = [...eligible].sort((a, b) => {
      const aDue = taskIsOverdue(a) ? 1 : 0;
      const bDue = taskIsOverdue(b) ? 1 : 0;
      if (aDue !== bDue) return bDue - aDue;

      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) return priorityDiff;

      return (!isLowEnergy && isMorning)
        ? b.energyCost - a.energyCost
        : a.energyCost - b.energyCost;
    });

    const MAX_DAILY_TASKS = 8;
    const capped = sorted.slice(0, MAX_DAILY_TASKS);

    const deriveCategory = (cost: number): ScheduledTask['category'] => {
      if (cost >= 8) return 'deep_work';
      if (cost >= 5) return 'admin';
      return 'other';
    };

    const now = new Date().toISOString();
    const BREAK_MINUTES = 5;
    let slotMinutes = 9 * 60;

    const newBlocks: ScheduledTask[] = capped.map(task => {
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

    profile.scheduledTasks = [
      ...profile.scheduledTasks.filter(t => !t.scheduledAt.startsWith(targetDate)),
      ...newBlocks
    ];

    await persistProfile(profile, userId ?? null, encryptionKey ?? null);

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
};
