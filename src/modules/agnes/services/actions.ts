import { ActionHub } from '@/lib/actions/action-hub';
import {
  BeliefGraph,
  saveBeliefGraph,
} from './belief-graph-service';
import { loadAgnesProfile, saveAgnesProfile } from './agnes-profile-service';
import { Spine } from '@/lib/spine/spine-event-bus';

let registered = false;

function normalizeGraph(payload: Record<string, unknown>): BeliefGraph {
  const now = new Date().toISOString();
  const nodes = Array.isArray(payload?.nodes)
    ? (payload.nodes as unknown[]).map((_raw, index) => {
        const node = _raw as Record<string, unknown> | null;
        return {
          id: typeof node?.id === 'string' ? node.id as string : `belief_${Date.now()}_${index}`,
          label: typeof node?.label === 'string' ? node.label as string : `Belief ${index + 1}`,
          valence: node?.valence === 'positive' || node?.valence === 'negative' ? node.valence as 'positive' | 'negative' : 'neutral' as const,
          intensity: typeof node?.intensity === 'number' ? Math.max(0, Math.min(10, node.intensity as number)) : 5
        };
      })
    : [];

  const edges = Array.isArray(payload?.edges)
    ? (payload.edges as unknown[]).map((_raw, index) => {
        const edge = _raw as Record<string, unknown> | null;
        return {
          from: typeof edge?.from === 'string' ? edge.from as string : `belief_${index}`,
          to: typeof edge?.to === 'string' ? edge.to as string : `belief_${index}`,
          relation: typeof edge?.relation === 'string' ? edge.relation as string : 'related'
        };
      })
    : [];

  return {
    nodes,
    edges,
    summary: typeof payload?.summary === 'string' ? payload.summary : '',
    createdAt: typeof payload?.createdAt === 'string' ? payload.createdAt : now,
    updatedAt: now
  };
}

export function registerAgnesActions() {
  if (registered) return;
  registered = true;

  ActionHub.register('agnes', 'update_belief_graph', async ({ userId, encryptionKey, payload }) => {
    if (!userId || !encryptionKey) return;
    const next = normalizeGraph(payload);
    await saveBeliefGraph(next, { userId, encryptionKey });
  });

  ActionHub.register('agnes', 'update_agnes_profile', async ({ userId, encryptionKey, payload }) => {
    if (!userId || !encryptionKey) return;
    const current = await loadAgnesProfile({ userId, encryptionKey });
    if (!current) return;
    const next = {
      ...current,
      baseContext: { ...current.baseContext, ...(payload as any) },
      updatedAt: new Date().toISOString()
    };
    await saveAgnesProfile(next, { userId, encryptionKey });
  });

  ActionHub.register('agnes', 'crisis_flag', async ({ payload, emitSpineEvent }) => {
    emitSpineEvent('CRISIS_DETECTED', {
      trigger: (payload as any)?.trigger || 'unknown',
      severity: (payload as any)?.severity || 'high',
      timestamp: new Date().toISOString()
    });
    // Also publish directly so cascade rules fire immediately
    Spine.publish({
      type: 'CRISIS_DETECTED',
      source: 'agnes',
      domain: 'E',
      priority: 'critical',
      data: {
        trigger: (payload as any)?.trigger || 'unknown',
        severity: (payload as any)?.severity || 'high',
        timestamp: new Date().toISOString()
      }
    });
  });

  // Emotional NSV actions — skip NSV writes and spine events for ephemeral (impromptu) sessions
  ActionHub.register('agnes', 'update_emotional_resilience', async ({ payload, persistencePolicy, updateGlobalSoul, emitSpineEvent }) => {
    const score = typeof (payload as any)?.score === 'number' ? (payload as any).score : null;
    if (score === null) return;
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional: { emotionalResilience: score } });
    }
    // Burnout warning if resilience critically low
    if (score <= 3) {
      emitSpineEvent('BURNOUT_WARNING', { cnsFatigue: score / 10, source: 'agnes', trigger: 'low_resilience' });
    }
  });

  ActionHub.register('agnes', 'update_stress_load', async ({ payload, persistencePolicy, updateGlobalSoul, emitSpineEvent }) => {
    const score = typeof (payload as any)?.score === 'number' ? (payload as any).score : null;
    if (score === null) return;
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional: { stressLoad: score } });
    }
    if (score >= 8) {
      emitSpineEvent('COMPOUND_STRESS', { stressLoad: score, source: 'agnes' });
    } else if (score >= 6) {
      emitSpineEvent('VITAL_UPDATED', { stressLoad: score, source: 'agnes', domain: 'E' });
    }
  });

  ActionHub.register('agnes', 'update_mood_trend', async ({ payload, persistencePolicy, updateGlobalSoul, emitSpineEvent }) => {
    const trend = (payload as any)?.trend as string | undefined;
    if (!trend) return;
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional: { moodTrend: trend as any } });
    }
    emitSpineEvent('VITAL_UPDATED', { moodTrend: trend, source: 'agnes', domain: 'E' });
  });

  ActionHub.register('agnes', 'update_trauma_markers', async ({ payload, persistencePolicy, updateGlobalSoul }) => {
    const markers = Array.isArray((payload as any)?.markers) ? (payload as any).markers : [];
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional: { traumaMarkers: markers } });
    }
  });

  ActionHub.register('agnes', 'sync_vitals', async ({ payload, persistencePolicy, updateGlobalSoul, emitSpineEvent }) => {
    const emotional = (payload as any)?.emotional as Record<string, unknown> | undefined;
    if (!emotional) return;
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional: emotional as any });
    }
    const stressLoad = typeof emotional.stressLoad === 'number' ? emotional.stressLoad : null;
    if (stressLoad !== null && stressLoad >= 8) {
      emitSpineEvent('COMPOUND_STRESS', { stressLoad, source: 'agnes' });
    } else {
      emitSpineEvent('VITAL_UPDATED', { ...emotional, source: 'agnes', domain: 'E' });
    }
  });
}
