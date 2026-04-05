import {
  AtlasProfile,
  AtlasTask,
  RecoveryWindow,
  loadAtlasProfile,
  saveAtlasProfile
} from '../atlas-profile-service';
import { AtlasComputeUtilsJs } from '@cortex-logic';

const _atlas = new AtlasComputeUtilsJs();

export const MAX_TITLE_LENGTH = 500;

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export const MOOD_LABELS = ['', 'rough', 'low', 'okay', 'good', 'great'] as const;

export const BLOCKER_STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'is', 'it', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'i', 'my', 'me',
  'we', 'our', 'you', 'your', 'he', 'his', 'she', 'her', 'they', 'their', 'this', 'that',
  'not', 'no', 'so', 'if', 'as', 'up', 'out', 'about', 'just', 'too', 'very', 'still',
]);

export type JournalTone = 'grounding' | 'self-compassion' | 'perspective' | 'ambition' | 'reflective';

export const JOURNAL_PROMPTS: Record<JournalTone, string> = {
  'grounding': _atlas.getJournalPrompt('grounding'),
  'self-compassion': _atlas.getJournalPrompt('self-compassion'),
  'perspective': _atlas.getJournalPrompt('perspective'),
  'ambition': _atlas.getJournalPrompt('ambition'),
  'reflective': _atlas.getJournalPrompt('reflective'),
};

export const JOURNAL_FORWARD: Record<JournalTone, string> = {
  'grounding': _atlas.getJournalForward('grounding'),
  'self-compassion': _atlas.getJournalForward('self-compassion'),
  'perspective': _atlas.getJournalForward('perspective'),
  'ambition': _atlas.getJournalForward('ambition'),
  'reflective': _atlas.getJournalForward('reflective'),
};

export function parseBoundedScore(value: unknown, fallback = 5): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return _atlas.parseBoundedScore(value, fallback);
}

export function sanitizeTitle(raw: unknown, defaultValue: string): string {
  if (typeof raw !== 'string') return defaultValue;
  return _atlas.sanitizeTitle(raw, defaultValue, MAX_TITLE_LENGTH);
}

export async function loadProfile(userId?: string | null, encryptionKey?: CryptoKey | null) {
  return loadAtlasProfile({ userId, encryptionKey });
}

export async function persistProfile(profile: AtlasProfile, userId?: string | null, encryptionKey?: CryptoKey | null) {
  profile.updatedAt = new Date().toISOString();
  await saveAtlasProfile(profile, { userId, encryptionKey });
}

export function calculateActiveLoad(tasks: AtlasTask[]): number {
  const slim = tasks.map(t => ({ status: t.status }));
  return _atlas.calculateActiveLoad(JSON.stringify(slim));
}

export function calculateDeadlinePressure(tasks: AtlasTask[]): number {
  const slim = tasks.map(t => ({ status: t.status, deadline: t.deadline ?? null }));
  return _atlas.calculateDeadlinePressure(JSON.stringify(slim), Date.now());
}

export function unblockDependents(tasks: AtlasTask[], completedId: string, _visited = new Set<string>()): void {
  if (_visited.has(completedId)) return; // cycle guard
  _visited.add(completedId);

  for (const task of tasks) {
    if (task.status !== 'blocked') continue;
    if (!task.dependencies.includes(completedId)) continue;
    const allDepsDone = task.dependencies.every(depId => {
      const dep = tasks.find(t => t.id === depId);
      return dep?.status === 'done';
    });
    if (allDepsDone) {
      task.status = 'queued';
      // Recursively unblock tasks that depend on this newly-queued task
      unblockDependents(tasks, task.id, _visited);
    }
  }
}

export function overlapsRecoveryWindow(scheduledAt: string, duration: number, windows: RecoveryWindow[]): boolean {
  const blockStart = new Date(scheduledAt).getTime();
  const blockEnd = blockStart + duration * 60 * 1000;
  return windows.some(w => {
    const wStart = new Date(w.start).getTime();
    const wEnd = new Date(w.end).getTime();
    return blockStart < wEnd && blockEnd > wStart;
  });
}

/** Derive journaling tone from the NeuralStateVector. First-match wins. */
export function deriveNsvTone(nsv: Record<string, unknown> | null | undefined): JournalTone {
  const emotional = nsv?.emotional as Record<string, unknown> | undefined;
  const cognitive = nsv?.cognitive as Record<string, unknown> | undefined;
  const biological = nsv?.biological as Record<string, unknown> | undefined;

  const stressLoad: number =
    typeof emotional?.stressLoad === 'number' ? emotional.stressLoad :
      typeof nsv?.stressLoad === 'number' ? (nsv.stressLoad as number) : 0;

  const cnsFatigue: number =
    typeof biological?.cnsFatigue === 'number' ? biological.cnsFatigue :
      typeof nsv?.cnsFatigue === 'number' ? (nsv.cnsFatigue as number) : 0;

  const emotionalResilience: number =
    typeof emotional?.emotionalResilience === 'number' ? emotional.emotionalResilience :
      typeof nsv?.emotionalResilience === 'number' ? (nsv.emotionalResilience as number) : 5;

  const moodTrendRaw = emotional?.moodTrend ?? nsv?.moodTrend;
  const moodTrend: number =
    typeof moodTrendRaw === 'number' ? moodTrendRaw :
      typeof moodTrendRaw === 'string' ? (parseFloat(moodTrendRaw) || 3) : 3;

  const energyLevel: number =
    typeof cognitive?.energyBudget === 'number' ? cognitive.energyBudget : 5;

  const focusScore: number =
    typeof cognitive?.focusScore === 'number' ? cognitive.focusScore : 5;

  return _atlas.deriveNsvTone(stressLoad, cnsFatigue, emotionalResilience, moodTrend, energyLevel, focusScore) as JournalTone;
}

export function dateToWeekday(dateStr: string): string {
  return DAY_NAMES[new Date(`${dateStr}T12:00:00`).getDay()];
}
