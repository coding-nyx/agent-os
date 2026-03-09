// --- SomaDataService — Cross-Module Health API ---
//
// Public read-heavy API that Atlas, Agnes, Titan, Pulse consume.
// All medical/health data flows through here — never directly via Firestore.
//
// Singleton pattern (see SchemaRegistry for reference).

import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { decryptWithKey } from '@/lib/encryption';
import { Spine } from '@/lib/spine/spine-event-bus';
import {
  loadSomaProfile,
  saveSomaProfile,
  createEmptySomaProfile,
  normalizeSomaProfile,
} from '@/modules/soma/services/soma-profile-service';
import {
  computeReadinessScore,
  SomaSpineEvents,
  emitBiomarkerCommitted,
  emitClearanceChanged,
  emitReadinessUpdated,
} from '@/modules/soma/actions/soma-field-actions';
import type { SomaProfile, SomaHealthSnapshot } from '@/modules/soma/types';
import type { BiomarkerRecord, ClearanceRecord } from '@/lib/types';

const COLLECTION = 'soma_profiles';

/** In-memory cache entry for a user's profile. */
interface ProfileCacheEntry {
  profile: SomaProfile;
  loadedAt: number;
}

/** Maximum age of a cached profile before we consider it stale (ms). */
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Converts a full SomaProfile to a read-only SomaHealthSnapshot
 * by stripping write-only / internal fields.
 */
function toHealthSnapshot(profile: SomaProfile): SomaHealthSnapshot {
  return Object.freeze({
    knownConditions: Object.freeze(structuredClone(profile.knownConditions)),
    medications: Object.freeze(structuredClone(profile.medications)),
    allergies: Object.freeze(structuredClone(profile.allergies)),
    biomarkers: Object.freeze(structuredClone(profile.biomarkers)),
    labSummaries: Object.freeze(structuredClone(profile.labSummaries)),
    clearances: Object.freeze(structuredClone(profile.clearances)),
    medicalImageAnalyses: Object.freeze(structuredClone(profile.medicalImageAnalyses)),
    medicalSummary: profile.medicalSummary,
    medicalOnboardingComplete: profile.medicalOnboardingComplete,
    snapshotAt: profile.updatedAt,
  });
}

// ============================================================================
// SomaDataService
// ============================================================================

class SomaDataServiceImpl {
  private static instance: SomaDataServiceImpl | null = null;

  /** Per-user in-memory cache. */
  private cache = new Map<string, ProfileCacheEntry>();

  /** Deduplicates concurrent loadProfile() calls for the same userId. */
  private inFlightLoads = new Map<string, Promise<SomaProfile>>();

  private constructor() {}

  static getInstance(): SomaDataServiceImpl {
    if (!SomaDataServiceImpl.instance) {
      SomaDataServiceImpl.instance = new SomaDataServiceImpl();
    }
    return SomaDataServiceImpl.instance;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Returns a cached profile if still fresh, otherwise `null`.
   */
  private getCached(userId: string): SomaProfile | null {
    const entry = this.cache.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.loadedAt > CACHE_TTL_MS) {
      this.cache.delete(userId);
      return null;
    }
    return entry.profile;
  }

  /**
   * Stores a profile in the in-memory cache.
   */
  private setCache(userId: string, profile: SomaProfile): void {
    this.cache.set(userId, { profile, loadedAt: Date.now() });
  }

  /**
   * Loads a SomaProfile with cache-first strategy.
   * Returns an empty default profile when the document doesn't exist yet.
   *
   * Concurrent calls for the same userId are deduplicated — only one
   * Firestore round-trip happens; all callers share the same promise.
   */
  private async loadProfile(
    userId: string,
    encryptionKey?: CryptoKey,
  ): Promise<SomaProfile> {
    // Fast path: return from cache
    const cached = this.getCached(userId);
    if (cached) return cached;

    // If there's already an in-flight load for this user, piggy-back on it
    const existing = this.inFlightLoads.get(userId);
    if (existing) return existing;

    // Create and register the in-flight promise
    const loadPromise = (async (): Promise<SomaProfile> => {
      try {
        // Attempt Firestore load (requires encryption key)
        if (encryptionKey) {
          const profile = await loadSomaProfile({ userId, encryptionKey });
          if (profile) {
            this.setCache(userId, profile);
            return profile;
          }
        }

        // Document doesn't exist yet — return safe defaults
        return createEmptySomaProfile(userId);
      } finally {
        this.inFlightLoads.delete(userId);
      }
    })();

    this.inFlightLoads.set(userId, loadPromise);
    return loadPromise;
  }

  // --------------------------------------------------------------------------
  // Core reads (cross-module consumption)
  // --------------------------------------------------------------------------

  /**
   * Returns a read-only health snapshot for cross-module consumption.
   * If the profile hasn't been created yet, returns `null`.
   */
  async getHealthSnapshot(
    userId: string,
    encryptionKey?: CryptoKey,
  ): Promise<SomaHealthSnapshot | null> {
    if (!userId) return null;

    const profile = await this.loadProfile(userId, encryptionKey);
    // If we only have the default empty profile and no key was given,
    // don't pretend we have real data.
    if (!encryptionKey && !this.getCached(userId)) return null;

    return toHealthSnapshot(profile);
  }

  /**
   * Computes a readiness score from the user's current profile state.
   * Uses `computeReadinessScore` from soma-field-actions.
   */
  async getReadinessScore(
    userId: string,
    encryptionKey?: CryptoKey,
  ): Promise<{ score: number; level: string; breakdown: Record<string, number> }> {
    const profile = await this.loadProfile(userId, encryptionKey);

    // Build a minimal payload from the profile's biomarkers.
    // We look for well-known biomarker names to populate the algorithm inputs.
    const findBiomarkerValue = (name: string): number | undefined => {
      const record = profile.biomarkers.find(
        (b) => b.name.toLowerCase() === name.toLowerCase(),
      );
      return record && typeof record.value === 'number' ? record.value : undefined;
    };

    const result = computeReadinessScore({
      restingHeartRate: findBiomarkerValue('resting heart rate') ?? findBiomarkerValue('restingHeartRate'),
      sleepQuality: findBiomarkerValue('sleep quality') ?? findBiomarkerValue('sleepQuality'),
      energyLevel: findBiomarkerValue('energy level') ?? findBiomarkerValue('energyLevel'),
      stressPhysical: findBiomarkerValue('physical stress') ?? findBiomarkerValue('stressPhysical'),
    });

    return {
      score: result.score,
      level: result.level,
      breakdown: result.breakdown,
    };
  }

  /**
   * Returns the biomarker records for a user.
   */
  async getBiomarkers(
    userId: string,
    encryptionKey?: CryptoKey,
  ): Promise<BiomarkerRecord[]> {
    const profile = await this.loadProfile(userId, encryptionKey);
    return [...profile.biomarkers];
  }

  /**
   * Returns the clearance status — whether the user is cleared for activity
   * and any active conditions.
   */
  async getClearanceStatus(
    userId: string,
    encryptionKey?: CryptoKey,
  ): Promise<{ cleared: boolean; conditions: string[] }> {
    const profile = await this.loadProfile(userId, encryptionKey);

    const hasDenied = profile.clearances.some((c) => c.status === 'denied');
    const conditions = [...profile.knownConditions];

    return {
      cleared: !hasDenied && conditions.length === 0,
      conditions,
    };
  }

  /**
   * Returns the user's medication list.
   */
  async getMedications(
    userId: string,
    encryptionKey?: CryptoKey,
  ): Promise<string[]> {
    const profile = await this.loadProfile(userId, encryptionKey);
    return [...profile.medications];
  }

  // --------------------------------------------------------------------------
  // Subscription (real-time dashboard updates)
  // --------------------------------------------------------------------------

  /**
   * Subscribes to real-time health snapshot updates via Firestore `onSnapshot`.
   * Automatically decrypts incoming data and emits snapshots through the callback.
   *
   * Returns an unsubscribe function.
   */
  subscribeToHealth(
    userId: string,
    encryptionKey: CryptoKey,
    callback: (snapshot: SomaHealthSnapshot) => void,
  ): () => void {
    const { db } = getFirebase();
    if (!db || !userId) {
      console.warn('[SomaDataService] Cannot subscribe: missing db or userId');
      return () => {};
    }

    const docRef = doc(db, COLLECTION, userId);

    const unsubscribe = onSnapshot(
      docRef,
      async (snap) => {
        if (!snap.exists()) return;

        const data = snap.data();
        if (!data?.encryptedData || !data?.iv) return;

        try {
          const decrypted = await decryptWithKey(
            { ciphertext: data.encryptedData as string, iv: data.iv as string },
            encryptionKey,
          );
          const profile = normalizeSomaProfile(userId, JSON.parse(decrypted));
          this.setCache(userId, profile);
          callback(toHealthSnapshot(profile));
        } catch (e) {
          console.error('[SomaDataService] Failed to decrypt snapshot update:', e);
        }
      },
      (error) => {
        console.warn('[SomaDataService] Subscription error:', error);
      },
    );

    return unsubscribe;
  }

  // --------------------------------------------------------------------------
  // Write operations (go through Soma, NOT Titan)
  // --------------------------------------------------------------------------

  /**
   * Adds or updates a biomarker record, encrypts, persists, and emits Spine events.
   */
  async updateBiomarker(
    userId: string,
    biomarker: BiomarkerRecord,
    encryptionKey?: CryptoKey,
  ): Promise<void> {
    if (!userId || !encryptionKey) {
      console.error('[SomaDataService] updateBiomarker requires userId and encryptionKey');
      return;
    }

    const profile = await this.loadProfile(userId, encryptionKey);

    // Upsert: replace existing record with same id, or append
    const existingIdx = profile.biomarkers.findIndex((b) => b.id === biomarker.id);
    const previousValue = existingIdx >= 0 ? profile.biomarkers[existingIdx] : undefined;

    const updatedBiomarkers = [...profile.biomarkers];
    if (existingIdx >= 0) {
      updatedBiomarkers[existingIdx] = biomarker;
    } else {
      updatedBiomarkers.push(biomarker);
    }

    const updatedProfile: SomaProfile = {
      ...profile,
      biomarkers: updatedBiomarkers.slice(0, 200), // Enforce max bound
      updatedAt: new Date().toISOString(),
    };

    await saveSomaProfile(updatedProfile, { userId, encryptionKey });
    this.setCache(userId, updatedProfile);

    // Emit Spine events
    emitBiomarkerCommitted(biomarker.id, biomarker.value, previousValue?.value);

    // Recompute and emit readiness update from the freshly saved profile
    const findVal = (name: string): number | undefined => {
      const r = updatedProfile.biomarkers.find(
        (b) => b.name.toLowerCase() === name.toLowerCase(),
      );
      return r && typeof r.value === 'number' ? r.value : undefined;
    };
    const readinessResult = computeReadinessScore({
      restingHeartRate: findVal('resting heart rate') ?? findVal('restingHeartRate'),
      sleepQuality: findVal('sleep quality') ?? findVal('sleepQuality'),
      energyLevel: findVal('energy level') ?? findVal('energyLevel'),
      stressPhysical: findVal('physical stress') ?? findVal('stressPhysical'),
    });
    emitReadinessUpdated(readinessResult);

    Spine.emit({
      type: SomaSpineEvents.PROFILE_UPDATED,
      source: 'soma',
      domain: 'B',
      data: {
        moduleId: 'soma',
        userId,
        changedField: 'biomarkers',
        timestamp: Date.now(),
      },
      cascadeDepth: 0,
      priority: 'info',
    });
  }

  /**
   * Adds a clearance record, encrypts, persists, and emits Spine events.
   */
  async addClearance(
    userId: string,
    clearance: ClearanceRecord,
    encryptionKey?: CryptoKey,
  ): Promise<void> {
    if (!userId || !encryptionKey) {
      console.error('[SomaDataService] addClearance requires userId and encryptionKey');
      return;
    }

    const profile = await this.loadProfile(userId, encryptionKey);

    const updatedClearances = [...profile.clearances, clearance].slice(0, 100);

    const updatedProfile: SomaProfile = {
      ...profile,
      clearances: updatedClearances,
      updatedAt: new Date().toISOString(),
    };

    await saveSomaProfile(updatedProfile, { userId, encryptionKey });
    this.setCache(userId, updatedProfile);

    // Emit Spine events
    const action = clearance.status === 'denied' ? 'revoked' as const : 'issued' as const;
    emitClearanceChanged(clearance.id, action, clearance.activity);

    Spine.emit({
      type: SomaSpineEvents.PROFILE_UPDATED,
      source: 'soma',
      domain: 'B',
      data: {
        moduleId: 'soma',
        userId,
        changedField: 'clearances',
        timestamp: Date.now(),
      },
      cascadeDepth: 0,
      priority: 'info',
    });
  }

  // --------------------------------------------------------------------------
  // Cache management
  // --------------------------------------------------------------------------

  /**
   * Invalidates the in-memory cache for a user.
   * Useful when external code knows the profile has been updated.
   */
  invalidateCache(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * Clears all cached profiles.
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/** Singleton export matching the SchemaRegistry pattern. */
export const SomaDataService = SomaDataServiceImpl.getInstance();
