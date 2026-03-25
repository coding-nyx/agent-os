import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { bootstrapAliveEntities, syncAliveEntities } from '@/lib/services/alive-entity-service';
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

const GUEST_ATLAS_KEY = 'nexus_atlas_profile_guest';
const VAULT_SALT_MARKER = 'vault_salt_used';
type LoadContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
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

export async function loadAtlasProfile({ userId, encryptionKey }: LoadContext): Promise<AtlasProfile | null> {
  if (userId && encryptionKey) {
    const dataLayer = getNexusDataLayer();
    const data = await dataLayer.getDocument<{ encryptedData?: string; iv?: string }>('atlas_profiles', userId);
    if (!data) return null;
    if (!data?.encryptedData || !data?.iv) return null;

    try {
      const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
      return normalizeAtlasProfile(JSON.parse(decrypted));
    } catch (error) {
      console.error('Failed to decrypt atlas profile:', error);
      return null;
    }
  }

  return loadGuestAtlasProfile();
}

export function subscribeAtlasProfile(
  { userId, encryptionKey }: LoadContext,
  onUpdate: (profile: AtlasProfile | null) => void
): () => void {
  if (userId && encryptionKey) {
    const dataLayer = getNexusDataLayer();
    const unsubscribe = dataLayer.subscribeToDocument<{ encryptedData?: string; iv?: string }>(
      'atlas_profiles',
      userId,
      async (data) => {
        if (!data) {
          onUpdate(null);
          return;
        }
        if (!data?.encryptedData || !data?.iv) {
          onUpdate(null);
          return;
        }
        try {
          const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
          onUpdate(normalizeAtlasProfile(JSON.parse(decrypted)));
        } catch (error) {
          console.error('Failed to decrypt atlas profile:', error);
          onUpdate(null);
        }
      }
    );
    return unsubscribe;
  }

  onUpdate(loadGuestAtlasProfile());
  return () => {};
}

// ── Debounced write queue ─────────────────────────────────────────────────
// Batches rapid profile saves within a 500ms window into a single Firestore write.
// Keyed by userId so multiple users in the same session are isolated.
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

  if (userId && encryptionKey) {
    const dataLayer = getNexusDataLayer();
    const encrypted = await encryptWithKey(JSON.stringify(normalized), encryptionKey);
    try {
      await dataLayer.setDocument('atlas_profiles', userId, {
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: VAULT_SALT_MARKER,
        metadata: {
          onboardingComplete: normalized.onboardingComplete,
          lastActive: new Date().toISOString(),
          windows: normalized.recoveryWindows.length
        }
      });
    } catch (error) {
      console.error('[AtlasProfileService] Failed to save atlas profile:', error);
    }
    try {
      await syncAliveEntities(
        dataLayer,
        bootstrapAliveEntities({
          goals: normalized.goals,
          habits: normalized.habits,
        }),
        { uid: userId, pruneMissingWithinIncomingPrefixes: true },
      );
    } catch (error) {
      console.error('[AtlasProfileService] Failed to sync alive entities:', error);
    }
    try {
      await GlobalProjectionService.updateCrossFunctionalState(userId, {
        cognitive: { activeLoad: normalized.taskGraph.length }
      });
    } catch (error) {
      console.error('[AtlasProfileService] Failed to update cross-functional state:', error);
    }
    return;
  }

  saveGuestAtlasProfile(normalized);
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

export async function syncGuestAtlasProfileToUser({ userId, encryptionKey }: LoadContext): Promise<boolean> {
  if (!userId || !encryptionKey) return false;

  const guestProfile = loadGuestAtlasProfile();
  if (!guestProfile) return false;

  const dataLayer = getNexusDataLayer();
  const existing = await dataLayer.getDocument<{ encryptedData?: string }>('atlas_profiles', userId);
  if (existing?.encryptedData) return false;

  await saveAtlasProfile(guestProfile, { userId, encryptionKey });
  clearGuestAtlasProfile();
  return true;
}

export function loadGuestAtlasProfile(): AtlasProfile | null {
  const raw = localStorage.getItem(GUEST_ATLAS_KEY);
  if (!raw) return null;
  try {
    return normalizeAtlasProfile(JSON.parse(raw));
  } catch (error) {
    console.error('Failed to parse guest atlas profile:', error);
    return null;
  }
}

export function saveGuestAtlasProfile(profile: AtlasProfile): void {
  localStorage.setItem(GUEST_ATLAS_KEY, JSON.stringify(normalizeAtlasProfile(profile)));
}

export function clearGuestAtlasProfile(): void {
  localStorage.removeItem(GUEST_ATLAS_KEY);
}
