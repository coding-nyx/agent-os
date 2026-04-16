import { getAraDataLayer } from '@/lib/data-layer/provider';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { bootstrapAliveEntities, syncAliveEntities } from '@/lib/services/alive-entity-service';
import { createEncryptedProfileService } from '@/lib/services/encrypted-profile-service';
import { LoadContext } from '@/lib/types/encrypted-document';
import type {
  AtlasProfile,
  AtlasGoal,
  AtlasHabit,
  AtlasTask,
  AtlasMilestone,
  AtlasRoutine,
  AtlasTaskNode,
  AtlasProject,
  AtlasPreferences,
  HabitWeekSummary,
  GoalWeekProgress,
  ScheduledTask,
  DailyIntention,
  HabitRecord,
  EnergyWavePoint,
  RecoveryWindow,
  TemporalReview,
  AtlasReviewBlueprint
} from '@/lib/types';

export type {
  AtlasProfile,
  AtlasGoal,
  AtlasHabit,
  AtlasTask,
  AtlasMilestone,
  AtlasRoutine,
  AtlasTaskNode,
  AtlasProject,
  AtlasPreferences,
  HabitWeekSummary,
  GoalWeekProgress,
  ScheduledTask,
  DailyIntention,
  HabitRecord,
  EnergyWavePoint,
  RecoveryWindow,
  TemporalReview,
  AtlasReviewBlueprint
} from '@/lib/types';

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeAtlasProfile(raw: unknown): AtlasProfile {
  const now = new Date().toISOString();
  const base = createEmptyAtlasProfile();
  if (!raw || typeof raw !== 'object') return base;

  const candidate = raw as Record<string, unknown>;

  return {
    ...base,
    onboardingComplete: candidate.onboardingComplete === true,
    energyWave: Array.isArray(candidate.energyWave)
      ? candidate.energyWave.map((entry: Record<string, unknown>, index: number) => ({
          id: typeof entry?.id === 'string' ? entry.id : `wave_${index}`,
          slot: typeof entry?.slot === 'string' ? entry.slot : `Slot ${index + 1}`,
          energy: Math.max(0, Math.min(10, parseNumber(entry?.energy, 5))),
          focus: Math.max(0, Math.min(10, parseNumber(entry?.focus, 5))),
          load: Math.max(0, Math.min(10, parseNumber(entry?.load, 5)))
        }))
      : [],
    recoveryWindows: Array.isArray(candidate.recoveryWindows)
      ? candidate.recoveryWindows.map((entry: Record<string, unknown>, index: number) => ({
          id: typeof entry?.id === 'string' ? entry.id : `recovery_${index}`,
          title: typeof entry?.title === 'string' ? entry.title : 'Recovery Window',
          start: typeof entry?.start === 'string' ? entry.start : now,
          end: typeof entry?.end === 'string' ? entry.end : now,
          reason: typeof entry?.reason === 'string' ? entry.reason : 'Recovery allocation',
          status:
            entry?.status === 'active' || entry?.status === 'completed'
              ? entry.status
              : 'planned'
        }))
      : [],
    taskGraph: Array.isArray(candidate.taskGraph)
      ? candidate.taskGraph.map((entry: Record<string, unknown>, index: number) => ({
          id: typeof entry?.id === 'string' ? entry.id : `task_${index}`,
          title: typeof entry?.title === 'string' ? entry.title : 'Task',
          energyCost: Math.max(0, Math.min(10, parseNumber(entry?.energyCost, 4))),
          status: entry?.status === 'active' || entry?.status === 'done' ? entry.status : 'queued',
          dependencies: Array.isArray(entry?.dependencies)
            ? entry.dependencies.filter((dep: Record<string, unknown>) => typeof dep === 'string')
            : undefined
        }))
      : [],
    flattenedUntil: typeof candidate.flattenedUntil === 'string' ? candidate.flattenedUntil : undefined,
    summary: typeof candidate.summary === 'string' ? candidate.summary : '',
    scheduledTasks: Array.isArray(candidate.scheduledTasks) ? candidate.scheduledTasks : [],
    dailyIntentions: Array.isArray(candidate.dailyIntentions) ? candidate.dailyIntentions : [],
    habitRecords: Array.isArray(candidate.habitRecords) ? candidate.habitRecords : [],
    tasks: Array.isArray(candidate.tasks) ? candidate.tasks : [],
    goals: Array.isArray(candidate.goals) ? candidate.goals : [],
    projects: Array.isArray(candidate.projects) ? candidate.projects : [],
    habits: Array.isArray(candidate.habits) ? candidate.habits : [],
    routine: candidate.routine && typeof candidate.routine === 'object' ? (candidate.routine as AtlasRoutine) : { id: 'routine_default', blocks: [], isActive: true },
    reviews: Array.isArray(candidate.reviews) ? candidate.reviews : (Array.isArray(candidate.weeklyReviews) ? (candidate.weeklyReviews as any[]).map(r => ({...r, scope: 'weekly', periodStart: r.weekOf, periodEnd: r.weekOf, insights: [], reviews: []})) : []),
    preferences: (candidate.preferences as AtlasPreferences) || undefined,
    preferenceMode: candidate.preferenceMode === 'conversational' || candidate.preferenceMode === 'structured'
      ? candidate.preferenceMode
      : undefined,
    dailyCheckIns: Array.isArray(candidate.dailyCheckIns) ? candidate.dailyCheckIns : [],
    fieldValues: candidate.fieldValues && typeof candidate.fieldValues === 'object' && !Array.isArray(candidate.fieldValues)
      ? (candidate.fieldValues as Record<string, unknown>)
      : undefined,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now
  };
}

export function createEmptyAtlasProfile(): AtlasProfile {
  const now = new Date().toISOString();
  return {
    onboardingComplete: false,
    energyWave: [],
    recoveryWindows: [],
    taskGraph: [],
    scheduledTasks: [],
    dailyIntentions: [],
    habitRecords: [],
    tasks: [],
    goals: [],
    projects: [],
    habits: [],
    routine: { id: 'routine_default', blocks: [], isActive: true },
    reviews: [],
    summary: '',
    createdAt: now,
    updatedAt: now
  };
}

// ---------------------------------------------------------------------------
// Factory instance — all encryption / decryption / guest logic lives here.
// ---------------------------------------------------------------------------

const _service = createEncryptedProfileService<AtlasProfile>({
  collection: 'atlas_profiles',
  guestStorageKey: 'ara_atlas_profile_guest',
  createEmpty: createEmptyAtlasProfile,
  normalize: normalizeAtlasProfile,
  metadataProjection: (p) => ({
    onboardingComplete: p.onboardingComplete,
    windows: p.recoveryWindows.length,
  }),
});

// ---------------------------------------------------------------------------
// Public API — load / subscribe / guest / sync use factory directly.
// ---------------------------------------------------------------------------

export const loadAtlasProfile: (ctx: LoadContext) => Promise<AtlasProfile | null> =
  _service.load.bind(_service);

export const subscribeAtlasProfile: (
  ctx: LoadContext,
  onUpdate: (profile: AtlasProfile | null) => void,
  onError?: (error: unknown) => void,
) => () => void = _service.subscribe.bind(_service);

export const syncGuestAtlasProfileToUser: (ctx: LoadContext) => Promise<boolean> =
  _service.syncGuestToUser.bind(_service);

// ---------------------------------------------------------------------------
// Debounced write queue (Atlas-specific)
// Batches rapid profile saves within a 500ms window into a single Firestore write.
// Keyed by userId so multiple users in the same session are isolated.
// ---------------------------------------------------------------------------

const _pendingWrites = new Map<string, {
  profile: AtlasProfile;
  context: { userId: string; encryptionKey: CryptoKey | null };
  resolve: (v: void) => void;
  reject: (e: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

async function flushWrite(userId: string): Promise<void> {
  const pending = _pendingWrites.get(userId);
  if (!pending) return;
  _pendingWrites.delete(userId);
  clearTimeout(pending.timer);
  try {
    await _doSaveAtlasProfile(pending.profile, pending.context);
    pending.resolve();
  } catch (e) {
    pending.reject(e);
  }
}

async function _doSaveAtlasProfile(profile: AtlasProfile, { userId, encryptionKey }: { userId: string | null; encryptionKey: CryptoKey | null }): Promise<void> {
  const normalized = normalizeAtlasProfile(profile);

  // Delegate encryption + Firestore write (or guest localStorage) to the factory.
  await _service.save(normalized, { userId, encryptionKey });

  // Side effects — only for authenticated users.
  if (!userId) return;

  // Side effects are independent (different Firestore collections) — run in parallel.
  const results = await Promise.allSettled([
    syncAliveEntities(
      getAraDataLayer(),
      bootstrapAliveEntities({
        goals: normalized.goals,
        habits: normalized.habits,
      }),
      { uid: userId, pruneMissingWithinIncomingPrefixes: true },
    ),
    GlobalProjectionService.updateCrossFunctionalState(userId, {
      cognitive: { activeLoad: normalized.taskGraph.length },
    }),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[AtlasProfileService] Side-effect failed:', result.reason);
    }
  }
}

export async function saveAtlasProfile(
  profile: AtlasProfile,
  context: { userId?: string | null; encryptionKey?: CryptoKey | null }
): Promise<void> {
  const userId = context.userId;
  if (!userId) {
    // Guest mode — write immediately (localStorage, no batching needed)
    return _doSaveAtlasProfile(profile, { userId: null, encryptionKey: context.encryptionKey ?? null });
  }

  return new Promise<void>((resolve, reject) => {
    const existing = _pendingWrites.get(userId);
    if (existing) {
      clearTimeout(existing.timer);
      existing.resolve(); // resolve the previous caller immediately (they'll get the next flush)
    }

    const timer = setTimeout(() => flushWrite(userId), 500);
    _pendingWrites.set(userId, {
      profile,
      context: { userId, encryptionKey: context.encryptionKey ?? null },
      resolve,
      reject,
      timer,
    });
  });
}
