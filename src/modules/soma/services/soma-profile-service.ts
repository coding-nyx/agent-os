// --- Soma Profile Service (Sovereign Data Layer — Path C+ Phase 1) ---
//
// Owns the `soma_profiles` Firestore collection with full E2EE.
// Mirrors the patterns established in titan-profile-service.ts.

import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { bootstrapAliveEntities, syncAliveEntities } from '@/lib/services/alive-entity-service';
import type { SomaProfile, VitalReading } from '@/lib/types';

const COLLECTION = 'soma_profiles';
const VAULT_SALT_MARKER = 'vault_salt_used';
const GUEST_SOMA_KEY = 'nexus_soma_profile_guest';

type SomaLoadContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

/**
 * Returns a blank SomaProfile with safe defaults.
 */
export function createEmptySomaProfile(userId: string): SomaProfile {
  const now = new Date().toISOString();
  return {
    id: userId,
    userId,
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

/**
 * Normalises raw (decrypted) JSON into a fully-populated SomaProfile.
 * Ensures every array field is safe and bounded to prevent runaway storage.
 */
export function normalizeSomaProfile(userId: string, raw: unknown): SomaProfile {
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
// Guest localStorage helpers
// ---------------------------------------------------------------------------

/**
 * Reads the guest SomaProfile from localStorage.
 * Returns `null` when no guest data exists or parsing fails.
 */
export function loadGuestSomaProfile(): SomaProfile | null {
  const raw = localStorage.getItem(GUEST_SOMA_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeSomaProfile('guest', parsed);
  } catch (e) {
    console.error('[SomaProfileService] Failed to parse guest soma profile:', e);
    return null;
  }
}

/**
 * Persists a SomaProfile to localStorage for guest sessions.
 */
export function saveGuestSomaProfile(profile: SomaProfile): void {
  const normalized = normalizeSomaProfile(profile.userId ?? 'guest', profile);
  localStorage.setItem(GUEST_SOMA_KEY, JSON.stringify(normalized));
}

/**
 * Removes the guest SomaProfile from localStorage.
 */
export function clearGuestSomaProfile(): void {
  localStorage.removeItem(GUEST_SOMA_KEY);
}

// ---------------------------------------------------------------------------
// Non-destructive merge helpers
// ---------------------------------------------------------------------------

/**
 * Deduplicates an array of objects by a string key field, favouring items
 * that appear later in the array (existing data is appended last, so
 * existing wins on collision).
 *
 * Time complexity: O(n) where n = combined array length.
 */
function deduplicateById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) seen.set(item.id, item);
  return Array.from(seen.values());
}

/**
 * Deduplicates VitalReadings by timestamp, favouring existing readings
 * on collision (existing items appended last).
 *
 * Time complexity: O(n).
 */
function deduplicateVitalReadings(readings: VitalReading[]): VitalReading[] {
  const seen = new Map<number, VitalReading>();
  for (const r of readings) seen.set(r.timestamp, r);
  return Array.from(seen.values());
}

/**
 * Returns `value` when it is a non-empty string, otherwise `fallback`.
 */
function pickString(value: string | undefined | null, fallback: string | undefined | null): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value;
  return fallback ?? undefined;
}

/**
 * Returns `value` when it is a finite number, otherwise `fallback`.
 */
function pickNumber(value: number | undefined | null, fallback: number | undefined | null): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback ?? undefined;
}

/**
 * Merges `guest` data into `existing` using non-destructive semantics:
 * - Scalars: existing value wins; guest fills in only when existing is absent.
 * - String arrays (knownConditions, medications, allergies): union, deduped.
 * - Object arrays (biomarkers, labSummaries, clearances, medicalImageAnalyses):
 *   guest entries prepended, existing entries appended; dedup by `id`; existing wins.
 * - vitalReadings: guest prepended, existing appended; dedup by `timestamp`; capped at 500.
 * - medicalOnboardingComplete: existing wins; guest fills only when existing is falsy.
 * - createdAt: earliest timestamp wins.
 *
 * Time complexity: O(n) where n = total items across all arrays.
 */
function mergeGuestIntoExisting(guest: SomaProfile, existing: SomaProfile): SomaProfile {
  // String arrays — union, existing wins on duplicate
  const mergeStringArray = (g: string[], e: string[]): string[] =>
    Array.from(new Set([...g, ...e]));

  // Object arrays with id — guest first so existing items overwrite on same id
  const mergedBiomarkers = deduplicateById([
    ...guest.biomarkers,
    ...existing.biomarkers,
  ]).slice(0, 200);

  const mergedLabSummaries = deduplicateById([
    ...guest.labSummaries,
    ...existing.labSummaries,
  ]).slice(0, 50);

  const mergedClearances = deduplicateById([
    ...guest.clearances,
    ...existing.clearances,
  ]).slice(0, 100);

  const mergedImageAnalyses = deduplicateById([
    ...guest.medicalImageAnalyses,
    ...existing.medicalImageAnalyses,
  ]).slice(0, 100);

  // VitalReadings — dedup by timestamp, existing wins on collision, capped at 500
  const mergedVitals = deduplicateVitalReadings([
    ...(guest.vitalReadings ?? []),
    ...(existing.vitalReadings ?? []),
  ]).slice(-500);

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
    // Scalars: existing wins; guest fills gaps
    medicalSummary: pickString(existing.medicalSummary, guest.medicalSummary) ?? '',
    medicalOnboardingComplete: existing.medicalOnboardingComplete || guest.medicalOnboardingComplete,
    // Flat vital scalars — existing wins
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
    // Timestamps
    createdAt: existing.createdAt < guest.createdAt ? existing.createdAt : guest.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Guest sync
// ---------------------------------------------------------------------------

/**
 * Syncs guest localStorage data into the authenticated user's Firestore profile.
 *
 * Merge strategy (non-destructive):
 * - When no Firestore document exists: guest profile is written as-is.
 * - When a Firestore document already exists: guest data fills in gaps only.
 *   Existing scalar values are preserved; arrays are union-merged and capped.
 *
 * @returns `true` on a successful sync, `false` when no guest data is found or on error.
 */
export async function syncGuestSomaProfileToUser({
  userId,
  encryptionKey,
}: {
  userId: string;
  encryptionKey: CryptoKey;
}): Promise<boolean> {
  if (!userId || !encryptionKey) return false;

  try {
    const guestProfile = loadGuestSomaProfile();
    if (!guestProfile) return false;

    const dataLayer = getNexusDataLayer();
    const rawDoc = await dataLayer.getDocument<{ encryptedData?: string; iv?: string }>(
      COLLECTION,
      userId,
    );

    let profileToSave: SomaProfile;

    if (rawDoc?.encryptedData && rawDoc?.iv) {
      // Existing Firestore data: decrypt and do a non-destructive merge.
      try {
        const decrypted = await decryptWithKey(
          { ciphertext: rawDoc.encryptedData, iv: rawDoc.iv },
          encryptionKey,
        );
        const existing = normalizeSomaProfile(userId, JSON.parse(decrypted));
        profileToSave = mergeGuestIntoExisting(guestProfile, existing);
      } catch (decryptErr) {
        console.error('[SomaProfileService] syncGuestSomaProfileToUser: failed to decrypt existing profile, skipping merge:', decryptErr);
        return false;
      }
    } else {
      // No existing Firestore document: promote guest profile directly.
      profileToSave = normalizeSomaProfile(userId, { ...guestProfile, id: userId, userId });
    }

    await saveSomaProfile(profileToSave, { userId, encryptionKey });
    clearGuestSomaProfile();
    return true;
  } catch (e) {
    console.error('[SomaProfileService] syncGuestSomaProfileToUser failed:', e);
    return false;
  }
}

/**
 * Loads and decrypts a SomaProfile from Firestore.
 * Falls back to localStorage guest data when no authenticated user is present.
 * Returns `null` when the document doesn't exist or decryption fails.
 */
export async function loadSomaProfile(
  { userId, encryptionKey }: SomaLoadContext,
): Promise<SomaProfile | null> {
  if (!userId || !encryptionKey) return loadGuestSomaProfile();

  const dataLayer = getNexusDataLayer();
  const data = await dataLayer.getDocument<{ encryptedData?: string; iv?: string }>(COLLECTION, userId);
  if (!data) return null;
  if (!data?.encryptedData || !data?.iv) return null;

  try {
    const decrypted = await decryptWithKey(
      { ciphertext: data.encryptedData as string, iv: data.iv as string },
      encryptionKey,
    );
    return normalizeSomaProfile(userId, JSON.parse(decrypted));
  } catch (e) {
    console.error('[SomaProfileService] Failed to decrypt soma profile:', e);
    return null;
  }
}

/**
 * Encrypts and persists a SomaProfile to Firestore.
 * Falls back to localStorage guest storage when no authenticated user is present.
 * Uses merge semantics so metadata can coexist with the encrypted blob.
 */
export async function saveSomaProfile(
  profile: SomaProfile,
  { userId, encryptionKey }: SomaLoadContext,
): Promise<void> {
  if (!userId || !encryptionKey) {
    saveGuestSomaProfile(profile);
    return;
  }

  const dataLayer = getNexusDataLayer();
  const normalized = normalizeSomaProfile(userId, { ...profile, updatedAt: new Date().toISOString() });

  const serialised = JSON.stringify(normalized);

  const encrypted = await encryptWithKey(serialised, encryptionKey);

  try {
    await dataLayer.setDocument(COLLECTION, userId, {
      encryptedData: encrypted.ciphertext,
      iv: encrypted.iv,
      salt: VAULT_SALT_MARKER,
      metadata: {
        medicalOnboardingComplete: Boolean(profile.medicalOnboardingComplete),
        lastActive: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[SomaProfileService] Failed to save soma profile:', error);
    throw error; // Re-throw so callers know the save failed
  }

  try {
    await syncAliveEntities(
      dataLayer,
      bootstrapAliveEntities({
        vitalReadings: normalized.vitalReadings,
        physicalAssessments: normalized.physicalAssessments,
      }),
      { uid: userId },
    );
  } catch (error) {
    console.error('[SomaProfileService] Failed to sync alive entities:', error);
  }
}

/**
 * Subscribes to real-time SomaProfile updates (mirrors subscribeTitanProfile pattern).
 * Falls back to a one-shot guest localStorage read when no authenticated user is present.
 * Returns an unsubscribe function.
 */
export function subscribeSomaProfile(
  { userId, encryptionKey }: SomaLoadContext,
  onUpdate: (profile: SomaProfile | null) => void,
): () => void {
  if (!userId || !encryptionKey) {
    onUpdate(loadGuestSomaProfile());
    return () => {};
  }

  const dataLayer = getNexusDataLayer();
  return dataLayer.subscribeToDocument<{ encryptedData?: string; iv?: string }>(
    COLLECTION,
    userId,
    async (data) => {
      if (!data) { onUpdate(null); return; }
      if (!data?.encryptedData || !data?.iv) { onUpdate(null); return; }
      try {
        const decrypted = await decryptWithKey(
          { ciphertext: data.encryptedData as string, iv: data.iv as string },
          encryptionKey,
        );
        onUpdate(normalizeSomaProfile(userId, JSON.parse(decrypted)));
      } catch (e) {
        console.error('[SomaProfileService] Failed to decrypt soma profile:', e);
        onUpdate(null);
      }
    }
  );
}

/**
 * Appends a new VitalReading to the user's SomaProfile.
 * Loads the current profile, merges the new reading, and persists (E2EE).
 *
 * Time complexity: O(n) where n = existing readings (capped at 500).
 *
 * @param userId        - Authenticated user ID
 * @param fields        - Vital metric fields to record (timestamp is auto-set)
 * @param encryptionKey - Vault key for E2EE encrypt/decrypt
 */
export async function addVitalReading(
  userId: string,
  fields: Omit<VitalReading, 'timestamp'>,
  encryptionKey: CryptoKey,
): Promise<void> {
  if (!userId || !encryptionKey) return;

  const current = await loadSomaProfile({ userId, encryptionKey });
  const base = current ?? createEmptySomaProfile(userId);

  const newReading: VitalReading = { timestamp: Date.now(), ...fields };

  const MAX_READINGS = 500;
  const updatedReadings = [...(base.vitalReadings ?? []), newReading].slice(-MAX_READINGS);

  await saveSomaProfile(
    { ...base, vitalReadings: updatedReadings },
    { userId, encryptionKey },
  );
}

/**
 * Appends a new PhysicalAssessment to the user's SomaProfile.
 * Loads the current profile, merges the new assessment, and persists (E2EE).
 *
 * @param userId        - Authenticated user ID
 * @param fields        - Assessment metric fields to record (timestamp is auto-set)
 * @param encryptionKey - Vault key for E2EE encrypt/decrypt
 */
export async function addPhysicalAssessment(
  userId: string,
  fields: Omit<import('@/lib/types').PhysicalAssessment, 'timestamp'>,
  encryptionKey: CryptoKey,
): Promise<void> {
  if (!userId || !encryptionKey) return;

  const current = await loadSomaProfile({ userId, encryptionKey });
  const base = current ?? createEmptySomaProfile(userId);

  const newAssessment: import('@/lib/types').PhysicalAssessment = { timestamp: Date.now(), ...fields };

  const MAX_ASSESSMENTS = 200;
  const updatedAssessments = [...(base.physicalAssessments ?? []), newAssessment].slice(-MAX_ASSESSMENTS);

  await saveSomaProfile(
    { ...base, physicalAssessments: updatedAssessments },
    { userId, encryptionKey },
  );
}
