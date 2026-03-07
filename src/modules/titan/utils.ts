import { Routine, Weekday } from '@/lib/types';
import { TitanProfile } from '@/lib/types';

export function stripActionTags(content: string): string {
  return content
    .replace(/<action type=".*?">[\s\S]*?<\/action>/gi, '')
    .replace(/<tool_call_begin>[\s\S]*?<tool_call_end>/gi, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .trim();
}

export function getTodayWeekday(): Weekday {
  const days: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[new Date().getDay()];
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
  return (routines || []).map((routine) => ({
    id: routine.id || createId(),
    name: routine.name || 'Personalized Routine',
    timeframe: routine.timeframe || 'daily',
    status: routine.status || 'active',
    rationale: routine.rationale || 'Generated routine.',
    weekday: routine.weekday?.toLowerCase() as Weekday,
    exercises: routine.exercises || []
  }));
}

export function mergeTitanProfile(base: TitanProfile, patch: Partial<TitanProfile>): TitanProfile {
  const merged: TitanProfile = {
    ...base,
    ...patch,
    nutrition: { ...base.nutrition, ...patch.nutrition },
    activity: { ...base.activity, ...patch.activity },
    history: { ...base.history, ...patch.history }
  };

  if (patch.routines) {
    merged.routines = normalizeRoutines(patch.routines);
  }

  // Preserve medical arrays from patch only if explicitly provided
  if (patch.knownConditions !== undefined) merged.knownConditions = patch.knownConditions;
  if (patch.medications !== undefined) merged.medications = patch.medications;
  if (patch.allergies !== undefined) merged.allergies = patch.allergies;
  if (patch.biomarkers !== undefined) merged.biomarkers = patch.biomarkers;
  if (patch.labSummaries !== undefined) merged.labSummaries = patch.labSummaries;
  if (patch.clearances !== undefined) merged.clearances = patch.clearances;
  if (patch.medicalImageAnalyses !== undefined) merged.medicalImageAnalyses = patch.medicalImageAnalyses;

  return merged;
}
