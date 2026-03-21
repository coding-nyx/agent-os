import {
  AtlasProfile,
  AtlasTask,
  RecoveryWindow,
  loadAtlasProfile,
  saveAtlasProfile
} from '../atlas-profile-service';

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
  'grounding': "Take a breath. What's one thing that felt manageable today, even if small?",
  'self-compassion': "What's something you'd tell a close friend who had a day like yours?",
  'perspective': "When you look back at today in a year, what will matter most?",
  'ambition': "You brought real energy today. What's the one thing you want to build on tomorrow?",
  'reflective': "What surprised you today — about your work, the world, or yourself?",
};

export const JOURNAL_FORWARD: Record<JournalTone, string> = {
  'grounding': "Tomorrow doesn't need to be big — one small step is enough.",
  'self-compassion': "You showed up today. That always counts for more than you think.",
  'perspective': "The things that feel urgent today rarely define tomorrow — keep your bigger picture in view.",
  'ambition': "That energy you brought today? Build on it — you're already in motion.",
  'reflective': "Reflection like this compounds over time. Keep going.",
};

export function parseBoundedScore(value: unknown, fallback = 5): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(10, value));
}

export function sanitizeTitle(raw: unknown, defaultValue: string): string {
  if (typeof raw !== 'string') return defaultValue;
  const trimmed = raw.trim().slice(0, MAX_TITLE_LENGTH);
  return trimmed.length > 0 ? trimmed : defaultValue;
}

export async function loadProfile(userId?: string | null, encryptionKey?: CryptoKey | null) {
  return loadAtlasProfile({ userId, encryptionKey });
}

export async function persistProfile(profile: AtlasProfile, userId?: string | null, encryptionKey?: CryptoKey | null) {
  profile.updatedAt = new Date().toISOString();
  await saveAtlasProfile(profile, { userId, encryptionKey });
}

export function calculateActiveLoad(tasks: AtlasTask[]): number {
  const active = tasks.filter(t => t.status === 'active' || t.status === 'queued');
  return Math.min(10, Math.round((active.length / 50) * 10));
}

export function calculateDeadlinePressure(tasks: AtlasTask[]): number {
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

export function unblockDependents(tasks: AtlasTask[], completedId: string): void {
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

  if (stressLoad >= 8 || cnsFatigue >= 0.75) return 'grounding';
  if (emotionalResilience <= 3) return 'self-compassion';
  if (moodTrend <= 2 && stressLoad >= 6) return 'perspective';
  if (energyLevel >= 7 && focusScore >= 7) return 'ambition';
  return 'reflective';
}

export function dateToWeekday(dateStr: string): string {
  return DAY_NAMES[new Date(`${dateStr}T12:00:00`).getDay()];
}
