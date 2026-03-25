import { ActionHub } from '@/lib/actions/action-hub';
import {
  normalizeBeliefGraph,
} from './belief-graph-service';
import { proposeBeliefGraphCandidate } from './belief-graph-workflow-service';
import { loadAgnesProfile, saveAgnesProfile } from './agnes-profile-service';
import { Spine } from '@/lib/spine/spine-event-bus';

let registered = false;

export function registerAgnesActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerProvider('agnes', {
    capabilities: ['emotional-support', 'recovery-planning'],
    latencyTier: 'balanced',
  });

  ActionHub.register('agnes', 'create_emotional_support_session', ({ moduleId, payload }) => {
    Spine.emit({
      type: 'DRAFT_PROPOSED',
      source: moduleId,
      target: typeof payload?.target === 'string' ? payload.target : moduleId,
      domain: 'system',
      data: payload,
      cascadeDepth: 0,
      priority: 'info'
    });
  });

  ActionHub.register('agnes', 'update_belief_graph', async ({ userId, encryptionKey, payload }) => {
    if (!userId || !encryptionKey) return;
    const graph = normalizeBeliefGraph(payload);
    if (graph.nodes.length === 0) return;
    await proposeBeliefGraphCandidate(
      {
        source: 'agnes_session',
        title: 'Review Agnes belief suggestion',
        summary:
          typeof payload.summary === 'string'
            ? payload.summary
            : 'Agnes identified a candidate belief pattern for your review.',
        confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
        graph,
      },
      { userId, encryptionKey },
    );
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
