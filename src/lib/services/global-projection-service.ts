import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebase } from '../firebase';
import { GlobalProjection, CoreUserProfile } from '../types';

const COLLECTION = 'global_souls';

export const GlobalProjectionService = {
  async getProjection(uid: string): Promise<GlobalProjection | null> {
    if (!uid) return null;
    const { db } = getFirebase();
    if (!db) return null;

    const docRef = doc(db, COLLECTION, uid);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      return snap.data() as GlobalProjection;
    }
    return null;
  },

  async syncFromProfile(profile: CoreUserProfile): Promise<GlobalProjection | null> {
    const { db } = getFirebase();
    if (!db) throw new Error('Firebase not initialized');
    if (!profile?.uid) {
      console.warn('syncFromProfile called with no profile UID');
      return null;
    }

    // Robustness: Handle partially initialized profiles
    const provision = profile.agentPersonalityProvision || {
      orchestratorAlias: 'Agnes',
      moduleAliases: { therapy: 'Agnes', trainer: 'Titan', ledger: 'Ledger' },
      moduleGenderProfiles: { orchestrator: 'female', therapy: 'female', trainer: 'female', ledger: 'female' }
    };

    const displayNames: Record<string, string> = {
      orchestrator: provision.orchestratorAlias,
      ...provision.moduleAliases
    };

    const agentGenders: Record<string, any> = {
      ...provision.moduleGenderProfiles
    };

    // Load existing projection to preserve crossFunctionalState if it exists
    const existing = await this.getProjection(profile.uid);

    const newProjection: GlobalProjection = {
      lastSync: new Date().toISOString(),
      overallWellnessScore: existing?.overallWellnessScore || 50,
      displayNames,
      agentGenders,
      crossFunctionalState: existing?.crossFunctionalState || {
        cnsFatigue: 5,
        emotionalResilience: 5,
        sleepQuality: 5
      },
      compactedInsights: existing?.compactedInsights || []
    };

    await setDoc(doc(db, COLLECTION, profile.uid), newProjection);
    return newProjection;
  },

  async updateCrossFunctionalState(uid: string, updates: Partial<GlobalProjection['crossFunctionalState']>): Promise<void> {
    if (!uid) return;
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, COLLECTION, uid);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;

    const current = snap.data() as GlobalProjection;
    await updateDoc(docRef, {
      crossFunctionalState: {
        ...current.crossFunctionalState,
        ...updates
      },
      lastSync: new Date().toISOString()
    });
  }
};
