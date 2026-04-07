// --- Soma Profile Service (Sovereign Data Layer — Path C+ Phase 1) ---
//
// Owns the `soma_profiles` Firestore collection with full E2EE.
// Uses createEncryptedProfileService factory for the encryption/guest boilerplate.

import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { bootstrapAliveEntities, syncAliveEntities } from '@/lib/services/alive-entity-service';
import { createEncryptedProfileService } from '@/lib/services/encrypted-profile-service';
import { LoadContext } from '@/lib/types/encrypted-document';
import type { SomaProfile, VitalReading } from '@/lib/types';
// NOTE: Circular import with soma-data-service (it imports from this file).
// Safe in practice: SomaDataService is only accessed at function call time,
// well after both modules finish initializing.
import { SomaDataService } from './soma-data-service';

const COLLECTION = 'soma_profiles';

/**
 * Returns a blank SomaProfile with safe defaults.
 * `userId` is optional — the factory calls this with zero args; direct callers
 * may still pass a userId to pre-populate the identity fields.
 */
export function createEmptySomaProfile(userId?: string): SomaProfile {
  const id = userId ?? 'unknown';
  const now = new Date().toISOString();
  return {
    id,
    userId: id,
    knownConditions: [],
    medications: [],
    allergies: [],
    biomarkers: [],
    labSummaries: [],
    clearances: [],
    medicalImageAnalyses: [],
    vitalReadings: [],
    medicalSummary: '',
    medicalOnboardingComplete: false,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Normalisation — internal single-arg variant for the factory + exported
// two-arg variant for callers that supply userId explicitly.
// ---------------------------------------------------------------------------

/**
 * Internal single-arg normalizer consumed by the factory.
 * Extracts `userId` from the raw payload (always present in persisted data).
 */
function _normalizeInternal(raw: unknown): SomaProfile {
  if (!raw || typeof raw !== 'object') return createEmptySomaProfile();
  const obj = raw as Record<string, unknown>;
  const userId = typeof obj.userId === 'string' ? obj.userId : 'unknown';
  return _doNormalize(userId, raw);
}

/**
 * Normalises raw (decrypted) JSON into a fully-populated SomaProfile.
 * Ensures every array field is safe and bounded to prevent runaway storage.
 *
 * Exported so `soma-data-service.ts` can call with an explicit userId.
 */
export function normalizeSomaProfile(userId: string, raw: unknown): SomaProfile {
  return _doNormalize(userId, raw);
}

function _doNormalize(userId: string, raw: unknown): SomaProfile {
  const base = createEmptySomaProfile(userId);
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Partial<SomaProfile>;
  const now = new Date().toISOString();

  return {
    id: userId,
    userId,
    knownConditions: Array.isArray(data.knownConditions) ? data.knownConditions.filter((entry): entry is string => typeof entry === 'string') : [],
    medications: Array.isArray(data.medications) ? data.medications.filter((entry): entry is string => typeof entry === 'string') : [],
    allergies: Array.isArray(data.allergies) ? data.allergies.filter((entry): entry is string => typeof entry === 'string') : [],
    biomarkers: Array.isArray(data.biomarkers)
      ? (data.biomarkers as SomaProfile['biomarkers']).slice(0, 200)
      : [],
    labSummaries: Array.isArray(data.labSummaries)
      ? (data.labSummaries as SomaProfile['labSummaries']).slice(0, 50)
      : [],
    clearances: Array.isArray(data.clearances)
      ? (data.clearances as SomaProfile['clearances']).slice(0, 100)
      : [],
    medicalImageAnalyses: Array.isArray(data.medicalImageAnalyses)
      ? (data.medicalImageAnalyses as SomaProfile['medicalImageAnalyses']).slice(0, 100)
      : [],
    vitalReadings: Array.isArray(data.vitalReadings)
      ? (data.vitalReadings as VitalReading[])
          .filter((r): r is VitalReading => r !== null && typeof r === 'object' && typeof r.timestamp === 'number')
          .slice(-500) // keep last 500 readings max
      : [],
    physicalAssessments: Array.isArray(data.physicalAssessments)
      ? (data.physicalAssessments as import('@/lib/types').PhysicalAssessment[])
          .filter((a): a is import('@/lib/types').PhysicalAssessment => a !== null && typeof a === 'object' && typeof a.timestamp === 'number')
          .slice(-200)
      : [],
    medicalSummary: typeof (data as Record<string, unknown>).medicalSummary === 'string'
      ? (data as Record<string, unknown>).medicalSummary as string
      : '',
    medicalOnboardingComplete: data.medicalOnboardingComplete === true,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : base.createdAt,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : now,
  };
}

// ---------------------------------------------------------------------------
// Factory instance — all encryption / decryption / guest logic lives here.
// ---------------------------------------------------------------------------

const _service = createEncryptedProfileService<SomaProfile>({
  collection: COLLECTION,
  guestStorageKey: 'nexus_soma_profile_guest',
  createEmpty: createEmptySomaProfile,
  normalize: _normalizeInternal,
  metadataProjection: (p) => ({
    medicalOnboardingComplete: Boolean(p.medicalOnboardingComplete),
  }),
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const loadSomaProfile: (ctx: LoadContext) => Promise<SomaProfile | null> =
  _service.load.bind(_service);

export const subscribeSomaProfile: (
  ctx: LoadContext,
  onUpdate: (profile: SomaProfile | null) => void,
) => () => void = _service.subscribe.bind(_service);

// Guest helpers — re-exported for callers that reference them directly.
export const loadGuestSomaProfile: () => SomaProfile | null =
  _service.loadGuest.bind(_service);

export const saveGuestSomaProfile: (profile: SomaProfile) => void =
  _service.saveGuest.bind(_service);

export const clearGuestSomaProfile: () => void =
  _service.clearGuest.bind(_service);

// ---------------------------------------------------------------------------
// Custom save — alive entity sync + re-throw on error
// ---------------------------------------------------------------------------

export async function saveSomaProfile(
  profile: SomaProfile,
  ctx: LoadContext,
): Promise<void> {
  const normalized = _normalizeInternal({ ...profile, updatedAt: new Date().toISOString() });

  // Delegate encryption + Firestore write (or guest localStorage) to factory.
  await _service.save(normalized, ctx);

  // Alive entity sync — only for authenticated users.
  if (!ctx.userId) return;

  try {
    await syncAliveEntities(
      getNexusDataLayer(),
      bootstrapAliveEntities({
        vitalReadings: normalized.vitalReadings,
        physicalAssessments: normalized.physicalAssessments,
      }),
      { uid: ctx.userId },
    );
  } catch (error) {
    console.error('[SomaProfileService] Failed to sync alive entities:', error);
  }
}

// ---------------------------------------------------------------------------
// Non-destructive merge helpers (used by syncGuestSomaProfileToUser)
// ---------------------------------------------------------------------------

function deduplicateById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) seen.set(item.id, item);
  return Array.from(seen.values());
}

function deduplicateVitalReadings(readings: VitalReading[]): VitalReading[] {
  const seen = new Map<number, VitalReading>();
  for (const r of readings) seen.set(r.timestamp, r);
  return Array.from(seen.values());
}

function pickString(value: string | undefined | null, fallback: string | undefined | null): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value;
  return fallback ?? undefined;
}

function pickNumber(value: number | undefined | null, fallback: number | undefined | null): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback ?? undefined;
}

function mergeGuestIntoExisting(guest: SomaProfile, existing: SomaProfile): SomaProfile {
  const mergeStringArray = (g: string[], e: string[]): string[] =>
    Array.from(new Set([...g, ...e]));

  const mergedBiomarkers = deduplicateById([...guest.biomarkers, ...existing.biomarkers]).slice(0, 200);
  const mergedLabSummaries = deduplicateById([...guest.labSummaries, ...existing.labSummaries]).slice(0, 50);
  const mergedClearances = deduplicateById([...guest.clearances, ...existing.clearances]).slice(0, 100);
  const mergedImageAnalyses = deduplicateById([...guest.medicalImageAnalyses, ...existing.medicalImageAnalyses]).slice(0, 100);
  const mergedVitals = deduplicateVitalReadings([...(guest.vitalReadings ?? []), ...(existing.vitalReadings ?? [])]).slice(-500);

  return {
    id: existing.id,
    userId: existing.userId,
    knownConditions: mergeStringArray(guest.knownConditions, existing.knownConditions),
    medications: mergeStringArray(guest.medications, existing.medications),
    allergies: mergeStringArray(guest.allergies, existing.allergies),
    biomarkers: mergedBiomarkers,
    labSummaries: mergedLabSummaries,
    clearances: mergedClearances,
    medicalImageAnalyses: mergedImageAnalyses,
    vitalReadings: mergedVitals,
    medicalSummary: pickString(existing.medicalSummary, guest.medicalSummary) ?? '',
    medicalOnboardingComplete: existing.medicalOnboardingComplete || guest.medicalOnboardingComplete,
    restingHeartRate: pickNumber(existing.restingHeartRate, guest.restingHeartRate),
    bloodPressure: pickString(existing.bloodPressure, guest.bloodPressure),
    temperature: pickNumber(existing.temperature, guest.temperature),
    spo2: pickNumber(existing.spo2, guest.spo2),
    weight: pickNumber(existing.weight, guest.weight),
    height: pickNumber(existing.height, guest.height),
    bmi: pickNumber(existing.bmi, guest.bmi),
    bodyFatPercentage: pickNumber(existing.bodyFatPercentage, guest.bodyFatPercentage),
    muscleMass: pickNumber(existing.muscleMass, guest.muscleMass),
    vo2Max: pickNumber(existing.vo2Max, guest.vo2Max),
    strength: pickNumber(existing.strength, guest.strength),
    flexibility: pickNumber(existing.flexibility, guest.flexibility),
    endurance: pickNumber(existing.endurance, guest.endurance),
    dailySteps: pickNumber(existing.dailySteps, guest.dailySteps),
    activeMinutes: pickNumber(existing.activeMinutes, guest.activeMinutes),
    sleepHours: pickNumber(existing.sleepHours, guest.sleepHours),
    sleepQuality: pickNumber(existing.sleepQuality, guest.sleepQuality),
    hydrationLevel: pickNumber(existing.hydrationLevel, guest.hydrationLevel),
    energyLevel: pickNumber(existing.energyLevel, guest.energyLevel),
    stressPhysical: pickNumber(existing.stressPhysical, guest.stressPhysical),
    lastCheckup: pickString(existing.lastCheckup, guest.lastCheckup),
    nextCheckup: pickString(existing.nextCheckup, guest.nextCheckup),
    clearanceStatus: existing.clearanceStatus ?? guest.clearanceStatus,
    readinessScore: pickNumber(existing.readinessScore, guest.readinessScore),
    createdAt: existing.createdAt < guest.createdAt ? existing.createdAt : guest.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Custom guest sync — non-destructive merge (differs from factory's simple
// overwrite).
// ---------------------------------------------------------------------------

export async function syncGuestSomaProfileToUser({
  userId,
  encryptionKey,
}: {
  userId: string;
  encryptionKey: CryptoKey;
}): Promise<boolean> {
  if (!userId || !encryptionKey) return false;

  try {
    const guestProfile = _service.loadGuest();
    if (!guestProfile) return false;

    // Attempt to load existing profile via factory.
    const existing = await _service.load({ userId, encryptionKey });

    let profileToSave: SomaProfile;

    if (existing) {
      // Non-destructive merge: guest fills gaps, existing wins on collision.
      profileToSave = mergeGuestIntoExisting(guestProfile, existing);
    } else {
      // No existing profile: promote guest directly.
      profileToSave = _normalizeInternal({ ...guestProfile, id: userId, userId });
    }

    await saveSomaProfile(profileToSave, { userId, encryptionKey });
    SomaDataService.invalidateCache(userId);
    _service.clearGuest();
    return true;
  } catch (e) {
    console.error('[SomaProfileService] syncGuestSomaProfileToUser failed:', e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Convenience functions
// ---------------------------------------------------------------------------

export async function addVitalReading(
  userId: string,
  fields: Omit<VitalReading, 'timestamp'>,
  encryptionKey: CryptoKey,
): Promise<void> {
  if (!userId || !encryptionKey) return;

  const current = await _service.load({ userId, encryptionKey });
  const base = current ?? createEmptySomaProfile(userId);

  const newReading: VitalReading = { timestamp: Date.now(), ...fields };

  const MAX_READINGS = 500;
  const updatedReadings = [...(base.vitalReadings ?? []), newReading].slice(-MAX_READINGS);

  await saveSomaProfile(
    { ...base, vitalReadings: updatedReadings },
    { userId, encryptionKey },
  );
  SomaDataService.invalidateCache(userId);
}

export async function addPhysicalAssessment(
  userId: string,
  fields: Omit<import('@/lib/types').PhysicalAssessment, 'timestamp'>,
  encryptionKey: CryptoKey,
): Promise<void> {
  if (!userId || !encryptionKey) return;

  const current = await _service.load({ userId, encryptionKey });
  const base = current ?? createEmptySomaProfile(userId);

  const newAssessment: import('@/lib/types').PhysicalAssessment = { timestamp: Date.now(), ...fields };

  const MAX_ASSESSMENTS = 200;
  const updatedAssessments = [...(base.physicalAssessments ?? []), newAssessment].slice(-MAX_ASSESSMENTS);

  await saveSomaProfile(
    { ...base, physicalAssessments: updatedAssessments },
    { userId, encryptionKey },
  );
  SomaDataService.invalidateCache(userId);
}
