import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { bootstrapAliveEntities, syncAliveEntities } from '@/lib/services/alive-entity-service';
import { createEncryptedProfileService } from '@/lib/services/encrypted-profile-service';
import { LoadContext } from '@/lib/types/encrypted-document';
import { TitanProfile, CustomField, TitanRecoveryPlan, TitanRecoveryCheckin } from '@/lib/types';
import { normalizeRoutines } from '../utils';

const GUEST_PROFILE_KEY = 'nexus_titan_profile_guest';

export function createEmptyTitanProfile(): TitanProfile {
  const now = new Date().toISOString();
  return {
    onboardingComplete: false,
    privacyLevel: 'basic',
    trackingLevel: 'standard',
    nutrition: { supplements: [] },
    activity: {},
    history: {},
    summary: '',
    routines: [],
    createdAt: now,
    updatedAt: now,
    // Medical fields (absorbed from Soma)
    medicalOnboardingComplete: false,
    knownConditions: [],
    medications: [],
    allergies: [],
    biomarkers: [],
    labSummaries: [],
    clearances: [],
    medicalImageAnalyses: [],
    medicalSummary: '',
    // Exercise identity / workout log fields
    workoutLogs: [],
    exerciseLibrary: [],
    // Data logs (empty by default; components rely on these being arrays)
    workoutSessions: [],
    sleepLog: [],
    cycles: [],
    personalRecords: {},
    bodyWeightLog: [],
    cardioLog: [],
    clearanceOverrides: [],
    systemDebts: [],
  };
}

export function normalizeTitanProfile(raw: unknown): TitanProfile {
  const base = createEmptyTitanProfile();
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Partial<TitanProfile>;
  const now = new Date().toISOString();
  const toStringArray = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []);
  return {
    onboardingComplete: data.onboardingComplete === true,
    privacyLevel: data.privacyLevel === 'complete' ? 'complete' : 'basic',
    trackingLevel: data.trackingLevel === 'indepth' ? 'indepth' : 'standard',
    nutrition: data.nutrition && typeof data.nutrition === 'object' ? (data.nutrition as TitanProfile['nutrition']) : base.nutrition,
    activity: data.activity && typeof data.activity === 'object' ? (data.activity as TitanProfile['activity']) : base.activity,
    history: data.history && typeof data.history === 'object' ? (data.history as TitanProfile['history']) : base.history,
    summary: typeof data.summary === 'string' ? data.summary : '',
    routines: Array.isArray(data.routines) ? normalizeRoutines(data.routines as TitanProfile['routines']) : base.routines,
    sleepLog: Array.isArray(data.sleepLog) ? (data.sleepLog as NonNullable<TitanProfile['sleepLog']>).slice(0, 730) : base.sleepLog,
    cycles: Array.isArray(data.cycles) ? (data.cycles as TitanProfile['cycles']) : base.cycles,
    workoutSessions: Array.isArray(data.workoutSessions) ? (data.workoutSessions as NonNullable<TitanProfile['workoutSessions']>).slice(0, 500) : base.workoutSessions,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : base.createdAt,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : now,
    traits: Array.isArray(data.traits) ? data.traits.filter((entry): entry is string => typeof entry === 'string') : base.traits,
    // Ensure medical arrays are safe and bounded
    knownConditions: toStringArray(data.knownConditions),
    medications: toStringArray(data.medications),
    allergies: toStringArray(data.allergies),
    biomarkers: Array.isArray(data.biomarkers) ? (data.biomarkers as TitanProfile['biomarkers']).slice(0, 200) : base.biomarkers,
    labSummaries: Array.isArray(data.labSummaries) ? (data.labSummaries as TitanProfile['labSummaries']).slice(0, 50) : base.labSummaries,
    clearances: Array.isArray(data.clearances) ? (data.clearances as TitanProfile['clearances']).slice(0, 100) : base.clearances,
    medicalImageAnalyses: Array.isArray(data.medicalImageAnalyses) ? (data.medicalImageAnalyses as TitanProfile['medicalImageAnalyses']).slice(0, 100) : base.medicalImageAnalyses,
    medicalSummary: typeof (data as Record<string, unknown>).medicalSummary === 'string' ? (data as Record<string, unknown>).medicalSummary as string : '',
    medicalOnboardingComplete: data.medicalOnboardingComplete === true,
    personalRecords: data.personalRecords && typeof data.personalRecords === 'object' ? (data.personalRecords as TitanProfile['personalRecords']) : {},
    workoutLogs: Array.isArray(data.workoutLogs) ? (data.workoutLogs as NonNullable<TitanProfile['workoutLogs']>).slice(0, 1000) : base.workoutLogs,
    exerciseLibrary: Array.isArray(data.exerciseLibrary) ? (data.exerciseLibrary as NonNullable<TitanProfile['exerciseLibrary']>) : base.exerciseLibrary,
    directWriteMode: data.directWriteMode === true,
    customFields: Array.isArray(data.customFields) ? (data.customFields as CustomField[]).slice(0, 20) : undefined,
    // Recovery — must survive the normalizer or isRecoveryActive is always false
    recoveryPlan: data.recoveryPlan && typeof data.recoveryPlan === 'object'
      ? (data.recoveryPlan as TitanRecoveryPlan)
      : undefined,
    recoveryCheckins: Array.isArray(data.recoveryCheckins)
      ? (data.recoveryCheckins as TitanRecoveryCheckin[]).slice(0, 180)
      : undefined,
    clearanceOverrides: Array.isArray(data.clearanceOverrides)
      ? (data.clearanceOverrides as NonNullable<TitanProfile['clearanceOverrides']>).slice(0, 100)
      : base.clearanceOverrides,
    systemDebts: Array.isArray(data.systemDebts)
      ? (data.systemDebts as NonNullable<TitanProfile['systemDebts']>).slice(0, 100)
      : base.systemDebts,
    // Body logs — must survive the normalizer or logs are always empty
    bodyWeightLog: Array.isArray(data.bodyWeightLog)
      ? (data.bodyWeightLog as NonNullable<TitanProfile['bodyWeightLog']>).slice(0, 1000)
      : base.bodyWeightLog,
    cardioLog: Array.isArray(data.cardioLog)
      ? (data.cardioLog as NonNullable<TitanProfile['cardioLog']>).slice(0, 1000)
      : base.cardioLog,
  };
}

// ---------------------------------------------------------------------------
// Factory instance — all encryption / decryption / guest logic lives here.
// ---------------------------------------------------------------------------

const _service = createEncryptedProfileService<TitanProfile>({
  collection: 'titan_profiles',
  guestStorageKey: GUEST_PROFILE_KEY,
  createEmpty: createEmptyTitanProfile,
  normalize: normalizeTitanProfile,
  metadataProjection: (p) => ({
    onboardingComplete: p.onboardingComplete,
    privacyLevel: p.privacyLevel,
  }),
});

// ---------------------------------------------------------------------------
// Public API — identical names to the original; zero callers need to change.
// ---------------------------------------------------------------------------

export const loadTitanProfile: (ctx: LoadContext) => Promise<TitanProfile | null> =
  _service.load.bind(_service);

export async function saveTitanProfile(profile: TitanProfile, ctx: LoadContext): Promise<void> {
  const normalized = normalizeTitanProfile(profile);
  await _service.save(normalized, ctx);

  if (!ctx.userId) return;

  try {
    await syncAliveEntities(
      getNexusDataLayer(),
      bootstrapAliveEntities({
        titanWorkoutSessions: normalized.workoutSessions,
        titanSleepEntries: normalized.sleepLog,
      }),
      { uid: ctx.userId },
    );
  } catch (error) {
    console.error('[TitanProfileService] Failed to sync alive entities:', error);
  }
}

export const subscribeTitanProfile: (
  ctx: LoadContext,
  onUpdate: (profile: TitanProfile | null) => void,
) => () => void = _service.subscribe.bind(_service);

export const syncGuestTitanProfileToUser: (ctx: LoadContext) => Promise<boolean> =
  _service.syncGuestToUser.bind(_service);

export const loadGuestTitanProfile: () => TitanProfile | null =
  _service.loadGuest.bind(_service);

export const saveGuestTitanProfile: (profile: TitanProfile) => void =
  _service.saveGuest.bind(_service);

export const clearGuestTitanProfile: () => void =
  _service.clearGuest.bind(_service);
