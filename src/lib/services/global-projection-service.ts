import { GlobalProjection, CoreUserProfile, NeuralStateVector, NeuralStateVectorPatch } from '../types';
import { createDefaultNSV, normalizeNSV } from './nsv-service';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { getNexusDataLayer } from '../data-layer/provider';
import { NexusDataLayer } from '../data-layer';

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
  if (updates.cognitive?.planningLoad !== undefined) {
    stamp('cognitive.planningLoad', updates.cognitive.planningLoad);
  }
  if (updates.cognitive?.taskCompletionRate !== undefined) {
    stamp('cognitive.taskCompletionRate', updates.cognitive.taskCompletionRate);
  }
  if (updates.cognitive?.interestDiversity !== undefined) {
    stamp('cognitive.interestDiversity', updates.cognitive.interestDiversity);
  }

  if (updates.planning?.streakHealth !== undefined) {
    stamp('planning.streakHealth', updates.planning.streakHealth);
  }
  if (updates.planning?.deadlinePressure !== undefined) {
    stamp('planning.deadlinePressure', updates.planning.deadlinePressure);
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
  async getProjection(
    uid: string,
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<GlobalProjection | null> {
    if (!uid) return null;
    const projection = await dataLayer.getDocument<GlobalProjection>(COLLECTION, uid);
    if (!projection) return null;
    const { id: _discard, ...rest } = projection;
    return {
      ...(rest as GlobalProjection),
      crossFunctionalState: normalizeNSV((rest as GlobalProjection).crossFunctionalState),
    };
  },

  async syncFromProfile(
    profile: CoreUserProfile,
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<GlobalProjection | null> {
    if (!profile?.uid) {
      console.warn('syncFromProfile called with no profile UID');
      return null;
    }

    // Robustness: Handle partially initialized profiles
    const provision = profile.agentPersonalityProvision || {
      orchestratorAlias: 'Nexus',
      moduleAliases: {
        agnes: 'Agnes',
        titan: 'Titan',
        ledger: 'Ledger',
        atlas: 'Atlas',
        scout: 'Scout',
        forge: 'Forge',
        pulse: 'Pulse'
      },
      agentGenders: {
        orchestrator: 'female',
        agnes: 'female',
        titan: 'non-binary',
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
      ...provision.agentGenders
    };

    // Load existing projection to preserve crossFunctionalState if it exists
    const existing = await this.getProjection(profile.uid, dataLayer);

    // Skip write if the profile-derived fields haven't changed.
    // This prevents the onSnapshot → syncFromProfile → setDoc feedback that
    // fires 2+ unnecessary writes on every page load.
    if (existing) {
      const namesMatch = JSON.stringify(existing.displayNames) === JSON.stringify(displayNames);
      const gendersMatch = JSON.stringify(existing.agentGenders) === JSON.stringify(agentGenders);
      if (namesMatch && gendersMatch) {
        return existing;
      }
    }

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
      await dataLayer.setDocument(COLLECTION, profile.uid, newProjection);
    } catch (error) {
      console.error('[GlobalProjectionService] Failed to sync projection from profile:', error);
      throw error;
    }
    return newProjection;
  },

  async updateTherapeuticBaseline(
    uid: string,
    baseline: GlobalProjection['therapeuticBaseline'],
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<void> {
    if (!uid) return;
    try {
      await dataLayer.updateDocument<GlobalProjection>(COLLECTION, uid, {
        therapeuticBaseline: baseline,
        lastSync: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[GlobalProjectionService] Failed to update therapeutic baseline:', error);
    }
  },

  async updateCrossFunctionalState(
    uid: string,
    updates: NeuralStateVectorPatch,
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<void> {
    if (!uid) return;
    const existing = await dataLayer.getDocument<GlobalProjection>(COLLECTION, uid);
    if (!existing) return;

    const updatePayload = buildNSVUpdatePayload(updates, new Date().toISOString());
    if (Object.keys(updatePayload).length === 0) return;

    const next: GlobalProjection = { ...existing };
    Object.entries(updatePayload).forEach(([path, value]) => {
      applyPathValue(next, path, value);
    });
    next.lastSync = new Date().toISOString();
    next.crossFunctionalState = normalizeNSV(next.crossFunctionalState);

    try {
      await dataLayer.setDocument(COLLECTION, uid, next);
    } catch (error) {
      console.error('[GlobalProjectionService] Failed to update cross-functional state:', error);
    }
  }
};

function applyPathValue(target: any, path: string, value: unknown) {
  const segments = path.split('.');
  if (segments.length === 1) {
    target[path] = value;
    return;
  }
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    const existing = cursor[key];
    if (typeof existing !== 'object' || existing === null) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}
