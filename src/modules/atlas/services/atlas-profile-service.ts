import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { readDocOnce } from '@/lib/services/firestore-once';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';

const GUEST_ATLAS_KEY = 'nexus_atlas_profile_guest';
const VAULT_SALT_MARKER = 'vault_salt_used';

export interface EnergyWavePoint {
  id: string;
  slot: string;
  energy: number;
  focus: number;
  load: number;
}

export interface RecoveryWindow {
  id: string;
  title: string;
  start: string;
  end: string;
  reason: string;
  status: 'planned' | 'active' | 'completed';
}

export interface AtlasTaskNode {
  id: string;
  title: string;
  energyCost: number;
  status: 'queued' | 'active' | 'done';
  dependencies?: string[];
}

export interface ScheduledTask {
  id: string;
  title: string;
  energyCost: number;        // 0-10
  focusCost: number;         // 0-10
  scheduledAt: string;       // ISO datetime
  duration: number;          // minutes
  category: 'deep_work' | 'admin' | 'social' | 'physical' | 'creative' | 'other';
  status: 'scheduled' | 'done' | 'deferred' | 'skipped';
  dependencies?: string[];
  blockedBy?: 'low_energy' | 'low_focus' | 'recovery' | null;
  deferredFrom?: string;     // ISO datetime if deferred
  createdAt: string;
}

export interface DailyIntention {
  id: string;
  date: string;              // ISO date (YYYY-MM-DD)
  theme: string;
  focusDomain: string;
  energyTarget: number;      // 0-10
  createdAt: string;
}

export interface HabitRecord {
  id: string;
  habitId: string;
  name: string;
  completed: boolean;
  streak: number;
  loggedAt: string;
}

// ---------------------------------------------------------------------------
// Planner-mode domain types
// ---------------------------------------------------------------------------

export interface AtlasTask {
  id: string;
  title: string;
  description?: string;
  deadline?: string;
  priority: 1 | 2 | 3 | 4 | 5;
  energyCost: number;
  status: 'queued' | 'active' | 'blocked' | 'done' | 'deferred';
  dependencies: string[];
  projectId?: string;
  goalId?: string;
  notes?: string;
  completedAt?: string;
  actualEnergyCost?: number;
  tags?: string[];
  recurrenceRule?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AtlasMilestone {
  id: string;
  title: string;
  dueDate?: string;
  completed: boolean;
  completedAt?: string;
}

export interface AtlasGoal {
  id: string;
  title: string;
  description?: string;
  deadline?: string;
  milestones: AtlasMilestone[];
  associatedTaskIds: string[];
  successCriteria: string;
  progressPercent: number;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AtlasHabit {
  id: string;
  title: string;
  frequency: 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'custom';
  customDays?: number[];
  targetStreak: number;
  currentStreak: number;
  bestStreak: number;
  lastCompleted?: string;
  energyCost: number;
  minimumViableVersion: string;
  status: 'active' | 'paused' | 'archived';
  pauseReason?: string;
  pausedAt?: string;
  resumeDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AtlasProject {
  id: string;
  title: string;
  description?: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  goalId?: string;
  taskIds: string[];
  deadline?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HabitWeekSummary {
  habitId: string;
  habitTitle: string;
  streak: number;
  completions: number;
  status: 'active' | 'paused';
}

export interface GoalWeekProgress {
  goalId: string;
  goalTitle: string;
  progressPercent: number;
  milestonesCompleted: number;
  milestonesTotal: number;
}

export interface WeeklyReviewSnapshot {
  id: string;
  weekOf: string;
  completionRate: number;
  totalScheduled: number;
  totalCompleted: number;
  habitSummary: HabitWeekSummary[];
  goalProgress: GoalWeekProgress[];
  nsvTrend: {
    energyBudgetAvg: number;
    resilienceTrend: 'improving' | 'stable' | 'declining';
    focusScoreAvg: number;
  };
  nextWeekFocus: string;
  notes?: string;
  createdAt: string;
}

export interface AtlasPreferences {
  timezone: string;
  wakeTime: string;
  sleepTime: string;
  peakEnergyStart: string;
  peakEnergyEnd: string;
  workStyle: 'deep_blocks' | 'pomodoro' | 'flexible';
  planningHorizon: 'day' | 'week' | 'month';
  recoveryPreference: 'aggressive' | 'moderate' | 'minimal';
}

export interface AtlasProfile {
  onboardingComplete: boolean;
  energyWave: EnergyWavePoint[];
  recoveryWindows: RecoveryWindow[];
  taskGraph: AtlasTaskNode[];
  flattenedUntil?: string;
  summary: string;
  /** Planner-mode: explicitly scheduled tasks with energy/focus costs and time slots */
  scheduledTasks: ScheduledTask[];
  /** Planner-mode: daily intention/theme entries */
  dailyIntentions: DailyIntention[];
  /** Planner-mode: habit completion records */
  habitRecords: HabitRecord[];
  tasks: AtlasTask[];
  goals: AtlasGoal[];
  projects: AtlasProject[];
  habits: AtlasHabit[];
  weeklyReviews: WeeklyReviewSnapshot[];
  preferences?: AtlasPreferences;
  createdAt: string;
  updatedAt: string;
}

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
    weeklyReviews: Array.isArray(candidate.weeklyReviews) ? candidate.weeklyReviews : [],
    preferences: (candidate.preferences as AtlasPreferences) || undefined,
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
    weeklyReviews: [],
    summary: '',
    createdAt: now,
    updatedAt: now
  };
}

export async function loadAtlasProfile({ userId, encryptionKey }: LoadContext): Promise<AtlasProfile | null> {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return null;

    const snap = await readDocOnce(doc(db, 'atlas_profiles', userId));
    if (!snap.exists()) return null;

    const data = snap.data();
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
    const { db } = getFirebase();
    if (!db) return () => {};

    const ref = doc(db, 'atlas_profiles', userId);
    const unsubscribe = onSnapshot(
      ref,
      async (snap) => {
        if (!snap.exists()) {
          onUpdate(null);
          return;
        }
        const data = snap.data();
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
      },
      (error) => {
        console.error('Atlas profile subscription error:', error);
      }
    );
    return unsubscribe;
  }

  onUpdate(loadGuestAtlasProfile());
  return () => {};
}

export async function saveAtlasProfile(profile: AtlasProfile, { userId, encryptionKey }: LoadContext): Promise<void> {
  const normalized = normalizeAtlasProfile(profile);

  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return;

    const encrypted = await encryptWithKey(JSON.stringify(normalized), encryptionKey);
    try {
      await setDoc(
        doc(db, 'atlas_profiles', userId),
        {
          encryptedData: encrypted.ciphertext,
          iv: encrypted.iv,
          salt: VAULT_SALT_MARKER,
          metadata: {
            onboardingComplete: normalized.onboardingComplete,
            lastActive: new Date().toISOString(),
            windows: normalized.recoveryWindows.length
          }
        },
        { merge: true }
      );
    } catch (error) {
      console.error('[AtlasProfileService] Failed to save atlas profile:', error);
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

export async function syncGuestAtlasProfileToUser({ userId, encryptionKey }: LoadContext): Promise<boolean> {
  if (!userId || !encryptionKey) return false;

  const guestProfile = loadGuestAtlasProfile();
  if (!guestProfile) return false;

  const { db } = getFirebase();
  if (!db) return false;
  const snap = await readDocOnce(doc(db, 'atlas_profiles', userId));
  if (snap.exists() && snap.data()?.encryptedData) return false;

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
