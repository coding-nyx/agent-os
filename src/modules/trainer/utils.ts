import { Routine } from '@/lib/types';
import { TrainerProfile } from '@/lib/types';

export function stripActionTags(content: string): string {
  return content.replace(/<action type=".*?">[\s\S]*?<\/action>/gi, '').trim();
}

export function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `routine_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

export function normalizeRoutines(routines: Routine[]): Routine[] {
  const today = getTodayIso();
  return (routines || []).map((routine) => ({
    id: routine.id || createId(),
    name: routine.name || 'Personalized Routine',
    timeframe: routine.timeframe || 'daily',
    status: routine.status || 'active',
    rationale: routine.rationale || 'Generated routine.',
    date: routine.date || today,
    exercises: routine.exercises || []
  }));
}

export function mergeTrainerProfile(base: TrainerProfile, patch: Partial<TrainerProfile>): TrainerProfile {
  const merged: TrainerProfile = {
    ...base,
    ...patch,
    nutrition: { ...base.nutrition, ...patch.nutrition },
    activity: { ...base.activity, ...patch.activity },
    history: { ...base.history, ...patch.history }
  };

  if (patch.routines) {
    merged.routines = normalizeRoutines(patch.routines);
  }

  return merged;
}

