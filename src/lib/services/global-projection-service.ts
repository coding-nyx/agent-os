import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebase } from '../firebase';
import { GlobalProjection, CoreUserProfile, NeuralStateVector, NeuralStateVectorPatch } from '../types';
import { createDefaultNSV, normalizeNSV } from './nsv-service';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { readDocOnce } from './firestore-once';

const COLLECTION = 'global_souls';

function buildNSVUpdatePayload(updates: NeuralStateVectorPatch, timestamp: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  const stamp = (key: string, value: unknown) => {
    if (value === undefined) return;
    payload[`crossFunctionalState.${key}`] = value;
    payload[`crossFunctionalState.lastUpdated.${key}`] = timestamp;
  };
  const alias = (key: string, value: unknown) => {
    if (value === undefined) return;
    payload[`crossFunctionalState.${key}`] = value;
  };

  if (updates.biological?.cnsFatigue !== undefined) {
    stamp('biological.cnsFatigue', updates.biological.cnsFatigue);
    alias('cnsFatigue', updates.biological.cnsFatigue);
  }
  if (updates.cnsFatigue !== undefined) {
    stamp('biological.cnsFatigue', updates.cnsFatigue);
    alias('cnsFatigue', updates.cnsFatigue);
    alias('biological.cnsFatigue', updates.cnsFatigue);
  }

  if (updates.biological?.sleepQuality !== undefined) {
    stamp('biological.sleepQuality', updates.biological.sleepQuality);
    alias('sleepQuality', updates.biological.sleepQuality);
  }
  if (updates.sleepQuality !== undefined) {
    stamp('biological.sleepQuality', updates.sleepQuality);
    alias('sleepQuality', updates.sleepQuality);
    alias('biological.sleepQuality', updates.sleepQuality);
  }

  if (updates.biological?.recoveryScore !== undefined) {
    stamp('biological.recoveryScore', updates.biological.recoveryScore);
  }

  if (updates.biological?.hormonalContext !== undefined) {
    stamp('biological.hormonalContext', updates.biological.hormonalContext);
    alias('hormonalContext', updates.biological.hormonalContext);
  }
  if (updates.hormonalContext !== undefined) {
    stamp('biological.hormonalContext', updates.hormonalContext);
    alias('hormonalContext', updates.hormonalContext);
    alias('biological.hormonalContext', updates.hormonalContext);
  }

  if (updates.emotional?.emotionalResilience !== undefined) {
    stamp('emotional.emotionalResilience', updates.emotional.emotionalResilience);
    alias('emotionalResilience', updates.emotional.emotionalResilience);
  }
  if (updates.emotionalResilience !== undefined) {
    stamp('emotional.emotionalResilience', updates.emotionalResilience);
    alias('emotionalResilience', updates.emotionalResilience);
    alias('emotional.emotionalResilience', updates.emotionalResilience);
  }

  if (updates.emotional?.stressLoad !== undefined) {
    stamp('emotional.stressLoad', updates.emotional.stressLoad);
  }
  if (updates.emotional?.moodTrend !== undefined) {
    stamp('emotional.moodTrend', updates.emotional.moodTrend);
  }
  if (updates.emotional?.traumaMarkers !== undefined) {
    stamp('emotional.traumaMarkers', updates.emotional.traumaMarkers);
    alias('traumaMarkers', updates.emotional.traumaMarkers);
  }
  if (updates.traumaMarkers !== undefined) {
    stamp('emotional.traumaMarkers', updates.traumaMarkers);
    alias('traumaMarkers', updates.traumaMarkers);
    alias('emotional.traumaMarkers', updates.traumaMarkers);
  }

  if (updates.cognitive?.energyBudget !== undefined) {
    stamp('cognitive.energyBudget', updates.cognitive.energyBudget);
  }
  if (updates.cognitive?.focusScore !== undefined) {
    stamp('cognitive.focusScore', updates.cognitive.focusScore);
  }
  if (updates.cognitive?.activeLoad !== undefined) {
    stamp('cognitive.activeLoad', updates.cognitive.activeLoad);
  }
  if (updates.cognitive?.researchLoad !== undefined) {
    stamp('cognitive.researchLoad', updates.cognitive.researchLoad);
  }

  if (updates.resource?.financialFriction !== undefined) {
    stamp('resource.financialFriction', updates.resource.financialFriction);
  }
  if (updates.resource?.resonanceROI !== undefined) {
    stamp('resource.resonanceROI', updates.resource.resonanceROI);
  }

  return payload;
}

export const GlobalProjectionService = {
  async getProjection(uid: string): Promise<GlobalProjection | null> {
    if (!uid) return null;
    const { db } = getFirebase();
    if (!db) return null;

    const docRef = doc(db, COLLECTION, uid);
    const snap = await readDocOnce(docRef);

    if (snap.exists()) {
      const projection = snap.data() as GlobalProjection;
      return {
        ...projection,
        crossFunctionalState: normalizeNSV(projection.crossFunctionalState)
      };
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
      orchestratorAlias: 'Nexus',
      moduleAliases: {
        therapy: 'Agnes',
        trainer: 'Titan',
        soma: 'Soma',
        ledger: 'Ledger',
        atlas: 'Atlas',
        scout: 'Scout',
        forge: 'Forge',
        pulse: 'Pulse'
      },
      moduleGenderProfiles: {
        orchestrator: 'female',
        therapy: 'female',
        trainer: 'female',
        soma: 'female',
        ledger: 'female',
        atlas: 'female',
        scout: 'female',
        forge: 'female',
        pulse: 'female'
      }
    };

    const manifestDefaults = Object.values(MODULE_MANIFEST).reduce<Record<string, string>>((acc, module) => {
      if (module.hasPage) acc[module.id] = module.alias;
      return acc;
    }, {});

    const displayNames: Record<string, string> = {
      orchestrator: provision.orchestratorAlias,
      ...manifestDefaults,
      ...provision.moduleAliases
    };

    const agentGenders: Record<string, any> = {
      ...provision.moduleGenderProfiles
    };

    // Load existing projection to preserve crossFunctionalState if it exists
    const existing = await this.getProjection(profile.uid);

    const newProjection: GlobalProjection = {
      lastSync: new Date().toISOString(),
      overallWellnessScore: existing?.overallWellnessScore ?? null,
      displayNames,
      agentGenders,
      crossFunctionalState: normalizeNSV(existing?.crossFunctionalState || createDefaultNSV()),
      compactedInsights: existing?.compactedInsights || [],
      ...(existing?.therapeuticBaseline ? { therapeuticBaseline: existing.therapeuticBaseline } : {})
    };

    try {
      await setDoc(doc(db, COLLECTION, profile.uid), newProjection);
    } catch (error) {
      console.error('[GlobalProjectionService] Failed to sync projection from profile:', error);
      throw error;
    }
    return newProjection;
  },

  async updateTherapeuticBaseline(uid: string, baseline: GlobalProjection['therapeuticBaseline']): Promise<void> {
    if (!uid) return;
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, COLLECTION, uid);
    try {
      await updateDoc(docRef, {
        therapeuticBaseline: baseline,
        lastSync: new Date().toISOString()
      });
    } catch (error) {
      console.error('[GlobalProjectionService] Failed to update therapeutic baseline:', error);
    }
  },

  async updateCrossFunctionalState(uid: string, updates: NeuralStateVectorPatch): Promise<void> {
    if (!uid) return;
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, COLLECTION, uid);
    const updatePayload = buildNSVUpdatePayload(updates, new Date().toISOString());
    if (Object.keys(updatePayload).length === 0) return;

    try {
      await updateDoc(docRef, {
        ...updatePayload,
        lastSync: new Date().toISOString()
      });
    } catch (error) {
      console.error('[GlobalProjectionService] Failed to update cross-functional state:', error);
    }
  }
};
