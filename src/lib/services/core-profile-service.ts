import { doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { getFirebase } from '../firebase';
import { CoreUserProfile, AgentPersonalityProvision, UserSecurityPreferences } from '../types';
import { buildDefaultVaultLocks, MODULE_MANIFEST } from '@/lib/module-manifest';
import { readDocOnce } from './firestore-once';

const COLLECTION = 'users';

const DEFAULT_PERSONALITY: AgentPersonalityProvision = {
  orchestratorAlias: 'Nexus',
  moduleAliases: {
    therapy: 'Agnes',
    trainer: 'Titan',
    ledger: 'Ledger',
    soma: 'Soma',
    atlas: 'Atlas',
    scout: 'Scout',
    forge: 'Forge',
    pulse: 'Pulse'
  },
  moduleGenderProfiles: {
    orchestrator: 'female',
    therapy: 'female',
    trainer: 'female',
    ledger: 'female',
    soma: 'female',
    atlas: 'female',
    scout: 'female',
    forge: 'female',
    pulse: 'female'
  },
  personaOverlays: {}
};

const normalizeVaultLocks = (locks?: Record<string, boolean>): Record<string, boolean> => {
  const merged = { ...buildDefaultVaultLocks(), ...(locks || {}) };
  Object.values(MODULE_MANIFEST).forEach((module) => {
    if (module.securityPolicy?.mandatory) {
      merged[module.id] = true;
    }
  });
  return merged;
};

const normalizeSecurityPreferences = (prefs?: UserSecurityPreferences): UserSecurityPreferences => {
  return {
    vaultLocks: normalizeVaultLocks(prefs?.vaultLocks)
  };
};

export const CoreProfileService = {
  async getProfile(uid: string): Promise<CoreUserProfile | null> {
    if (!uid) return null;
    const { db } = getFirebase();
    if (!db) return null;
    
    try {
      const docRef = doc(db, COLLECTION, uid);
      const snap = await readDocOnce(docRef);
      
      if (snap.exists()) {
        const raw = { ...snap.data(), uid: snap.id } as CoreUserProfile;
        return {
          ...raw,
          securityPreferences: normalizeSecurityPreferences(raw.securityPreferences)
        };
      }
      return null;
    } catch (e) {
      console.error("Critical Profile Fetch Failure:", e);
      // Throwing so the caller knows this isn't a "missing user" but a "failed read"
      throw e;
    }
  },

  subscribeProfile(uid: string, onUpdate: (profile: CoreUserProfile | null) => void): () => void {
    if (!uid) return () => {};
    const { db } = getFirebase();
    if (!db) return () => {};

    const docRef = doc(db, COLLECTION, uid);
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (!snap.exists()) {
          onUpdate(null);
          return;
        }
        const raw = { ...snap.data(), uid: snap.id } as CoreUserProfile;
        onUpdate({
          ...raw,
          securityPreferences: normalizeSecurityPreferences(raw.securityPreferences)
        });
      },
      (error) => {
        console.error('Profile subscription error:', error);
      }
    );

    return unsubscribe;
  },

  async initializeProfile(uid: string, email: string): Promise<CoreUserProfile> {
    if (!uid || !email) throw new Error('Missing UID or email');
    const { db } = getFirebase();
    if (!db) throw new Error('Firebase not initialized');

    // Security: Check if profile exists before nuking it
    const existing = await readDocOnce(doc(db, COLLECTION, uid));
    if (existing.exists()) {
        console.warn("Attempted to initialize an existing profile. Aborting reset.");
        return { ...existing.data(), uid: existing.id } as CoreUserProfile;
    }

    const newProfile: CoreUserProfile = {
      uid,
      email,
      preferredName: '',
      pronouns: '',
      onboardingComplete: false,
      agentPersonalityProvision: DEFAULT_PERSONALITY,
      securityPreferences: {
        vaultLocks: buildDefaultVaultLocks()
      },
      schemaVersion: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, COLLECTION, uid), newProfile);
    } catch (error) {
      console.error('[CoreProfileService] Failed to initialize profile:', error);
      throw error;
    }
    return newProfile;
  },

  async updateProfile(uid: string, updates: Partial<CoreUserProfile>): Promise<void> {
    if (!uid) return;
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, COLLECTION, uid);
    try {
      await updateDoc(docRef, {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('[CoreProfileService] Failed to update profile:', error);
    }
  },

  async updatePersonality(uid: string, personality: Partial<AgentPersonalityProvision>): Promise<void> {
    if (!uid) return;
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, COLLECTION, uid);
    const updates: Record<string, unknown> = {};

    if (typeof personality.orchestratorAlias === 'string') {
      updates['agentPersonalityProvision.orchestratorAlias'] = personality.orchestratorAlias;
    }

    if (personality.moduleAliases) {
      Object.entries(personality.moduleAliases).forEach(([key, value]) => {
        if (typeof value === 'string') {
          updates[`agentPersonalityProvision.moduleAliases.${key}`] = value;
        }
      });
    }

    if (personality.moduleGenderProfiles) {
      Object.entries(personality.moduleGenderProfiles).forEach(([key, value]) => {
        if (typeof value === 'string') {
          updates[`agentPersonalityProvision.moduleGenderProfiles.${key}`] = value;
        }
      });
    }

    if (personality.personaOverlays) {
      Object.entries(personality.personaOverlays).forEach(([key, value]) => {
        updates[`agentPersonalityProvision.personaOverlays.${key}`] = value;
      });
    }

    if (Object.keys(updates).length === 0) return;

    try {
      await updateDoc(docRef, {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('[CoreProfileService] Failed to update personality:', error);
    }
  },
  async updateSecurityPreferences(uid: string, prefs: Partial<UserSecurityPreferences>): Promise<void> {
    if (!uid) return;
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, COLLECTION, uid);
    const updates: Record<string, unknown> = {};

    if (prefs.vaultLocks) {
      Object.entries(prefs.vaultLocks).forEach(([key, value]) => {
        if (typeof value === 'boolean') {
          updates[`securityPreferences.vaultLocks.${key}`] = value;
        }
      });
    }

    if (Object.keys(updates).length === 0) return;

    try {
      await updateDoc(docRef, {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('[CoreProfileService] Failed to update security preferences:', error);
    }
  }
};
