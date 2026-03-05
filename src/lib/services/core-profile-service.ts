import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebase } from '../firebase';
import { CoreUserProfile, AgentPersonalityProvision } from '../types';

const COLLECTION = 'users';

const DEFAULT_PERSONALITY: AgentPersonalityProvision = {
  orchestratorAlias: 'Nyx',
  moduleAliases: {
    therapy: 'Agnes',
    trainer: 'Titan',
    ledger: 'Ledger'
  },
  moduleGenderProfiles: {
    orchestrator: 'female',
    therapy: 'female',
    trainer: 'female',
    ledger: 'female'
  },
  personaOverlays: {}
};

export const CoreProfileService = {
  async getProfile(uid: string): Promise<CoreUserProfile | null> {
    if (!uid) return null;
    const { db } = getFirebase();
    if (!db) return null;
    
    try {
      const docRef = doc(db, COLLECTION, uid);
      const snap = await getDoc(docRef);
      
      if (snap.exists()) {
        return { ...snap.data(), uid: snap.id } as CoreUserProfile;
      }
      return null;
    } catch (e) {
      console.error("Critical Profile Fetch Failure:", e);
      // Throwing so the caller knows this isn't a "missing user" but a "failed read"
      throw e;
    }
  },

  async initializeProfile(uid: string, email: string): Promise<CoreUserProfile> {
    if (!uid || !email) throw new Error('Missing UID or email');
    const { db } = getFirebase();
    if (!db) throw new Error('Firebase not initialized');

    // Security: Check if profile exists before nuking it
    const existing = await getDoc(doc(db, COLLECTION, uid));
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
      schemaVersion: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, COLLECTION, uid), newProfile);
    return newProfile;
  },

  async updateProfile(uid: string, updates: Partial<CoreUserProfile>): Promise<void> {
    if (!uid) return;
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, COLLECTION, uid);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: new Date().toISOString()
    });
  },

  async updatePersonality(uid: string, personality: Partial<AgentPersonalityProvision>): Promise<void> {
    if (!uid) return;
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, COLLECTION, uid);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;

    const currentProfile = snap.data() as CoreUserProfile;
    const updatedPersonality = {
      ...currentProfile.agentPersonalityProvision,
      ...personality
    };

    await updateDoc(docRef, {
      agentPersonalityProvision: updatedPersonality,
      updatedAt: new Date().toISOString()
    });
  }
};
