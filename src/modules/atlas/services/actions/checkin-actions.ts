import { ActionHub } from '@/lib/actions/action-hub';
import { AtlasProfile } from '../atlas-profile-service';
import {
  createEmptyJournalEntry,
  loadJournalEntry,
  mergeCheckInData,
  saveJournalEntry
} from '../journal-service';
import {
  loadProfile,
  persistProfile
} from './shared';

export const checkinActions: Parameters<typeof ActionHub.registerMultiple>[1] = {

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
    const moodRating = clamp15(payload?.moodRating);

    const checkInEntry = {
      id: `checkin_${crypto.randomUUID()}`,
      date: dateOnly,
      type,
      energyRating,
      moodRating,
      intention: typeof payload?.intention === 'string' ? payload.intention.slice(0, 500) : undefined,
      reflection: typeof payload?.reflection === 'string' ? payload.reflection.slice(0, 500) : undefined,
      loggedAt: now
    };

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

    // Dynamic priority recalculation: run after morning check-in
    if (type === 'morning') {
      const nowMs = Date.now();
      let dirty = false;

      for (const task of profile.tasks) {
        if (task.status === 'done' || task.status === 'deferred') continue;
        let newPriority: number = task.priority;

        // Elevate to P1 if deadline within 48 hours
        if (task.deadline) {
          const hoursLeft = (new Date(task.deadline).getTime() - nowMs) / (1000 * 60 * 60);
          if (hoursLeft >= 0 && hoursLeft < 48 && newPriority > 1) {
            newPriority = 1;
          }
        }

        // Elevate by 1 if task is blocked and all blocking deps are resolved
        if (task.status === 'blocked' && Array.isArray(task.dependencies)) {
          const allDepsResolved = task.dependencies.every(depId => {
            const dep = profile.tasks.find(t => t.id === depId);
            return dep?.status === 'done';
          });
          if (allDepsResolved && newPriority > 1) {
            newPriority = Math.max(1, newPriority - 1);
            task.status = 'queued';
          }
        }

        if (newPriority !== task.priority) {
          task.priority = newPriority as 1 | 2 | 3 | 4 | 5;
          task.updatedAt = now;
          dirty = true;
        }
      }

      if (dirty) {
        await persistProfile(profile, userId ?? null, encryptionKey ?? null);
      }
    }

    // Emit adaptive suggestion based on reported energy vs. wave baseline
    if (type === 'morning' && energyRating !== undefined) {
      const waveAvg = profile.energyWave && profile.energyWave.length > 0
        ? profile.energyWave.reduce((s, p) => s + p.energy, 0) / profile.energyWave.length
        : 5;
      const reportedEnergy = (energyRating / 5) * 10; // scale 1-5 → 0-10

      if (reportedEnergy < waveAvg - 2) {
        const highestEnergyTask = profile.tasks
          .filter(t => t.status === 'active' || t.status === 'queued')
          .sort((a, b) => b.energyCost - a.energyCost)[0];

        emitSpineEvent('ATLAS_ADAPTIVE_SUGGESTION', {
          suggestionType: 'defer_high_energy',
          reason: 'morning_energy_below_baseline',
          taskId: highestEnergyTask?.id ?? null,
          taskTitle: highestEnergyTask?.title ?? null,
          reportedEnergy,
          waveBaseline: waveAvg,
        });
      } else if (reportedEnergy > waveAvg + 2) {
        const stretchTask = profile.tasks
          .filter(t => t.status === 'queued' && t.priority <= 2)
          .sort((a, b) => b.energyCost - a.energyCost)[0];

        if (stretchTask) {
          emitSpineEvent('ATLAS_ADAPTIVE_SUGGESTION', {
            suggestionType: 'stretch_task',
            reason: 'morning_energy_above_baseline',
            taskId: stretchTask.id,
            taskTitle: stretchTask.title,
            reportedEnergy,
            waveBaseline: waveAvg,
          });
        }
      }
    }

    // Evening: suggest rescheduling for tasks that were scheduled today but remain incomplete
    if (type === 'evening') {
      const todayScheduled = profile.scheduledTasks?.filter(st =>
        st.scheduledAt.startsWith(dateOnly) && st.status === 'scheduled'
      ) ?? [];

      const missedTaskIds = todayScheduled
        .flatMap(st => st.dependencies ?? [])
        .filter(taskId => {
          const task = profile.tasks.find(t => t.id === taskId);
          return task && task.status !== 'done' && task.status !== 'deferred';
        });

      if (missedTaskIds.length > 0) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().slice(0, 10);

        emitSpineEvent('ATLAS_RESCHEDULE_SUGGESTED', {
          date: dateOnly,
          missedTaskIds,
          suggestedDate: tomorrowStr,
          missedCount: missedTaskIds.length,
        });
      }
    }

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

    try {
      if (userId && encryptionKey) {
        const existing = await loadJournalEntry(dateOnly, { userId, encryptionKey });
        const base = existing ?? createEmptyJournalEntry(dateOnly);

        const patch: Parameters<typeof mergeCheckInData>[1] = {};

        if (energyRating !== undefined) patch.energyLevel = energyRating;
        if (moodRating !== undefined) patch.mood = moodRating;

        if (type === 'morning' && typeof checkInEntry.intention === 'string') {
          patch.morningIntent = checkInEntry.intention;
        }
        if (type === 'evening' && typeof checkInEntry.reflection === 'string') {
          patch.eveningReflection = checkInEntry.reflection;
        }

        const updated = mergeCheckInData(base, patch);

        const sourceTag = type === 'morning' ? 'checkin-morning' : 'checkin-evening';
        updated.tags = Array.from(new Set([...(updated.tags ?? []), sourceTag]));

        await saveJournalEntry(updated, { userId, encryptionKey });
      }
    } catch (err) {
      console.error('[Atlas] Failed to persist journal from check-in:', err);
    }
  },
};
