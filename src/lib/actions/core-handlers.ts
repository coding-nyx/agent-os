import { ActionHub } from './action-hub';
import { Spine } from '../spine/spine-event-bus';
import { SpineEventType, NeuralStateVectorPatch } from '../types';
import { CoreProfileService } from '../services/core-profile-service';
import { NexusRoutingService } from '../services/nexus-routing-service';
import { EpisodicMemoryService } from '../services/episodic-memory-service';
import { SemanticMemoryService } from '../services/semantic-memory-service';
import type { ModuleId } from '../module-manifest';

function safeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return value;
}

function safeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function safeStringArray(value: unknown): string[] | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  const filtered = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  return filtered;
}

export function registerCoreActions() {
  // Global / Orchestrator Actions
  ActionHub.registerMultiple('orchestrator', {
    propose_draft: ({ moduleId, payload }) => {
      Spine.emit({
        type: 'DRAFT_PROPOSED',
        source: moduleId,
        target: typeof payload.target === 'string' ? payload.target : undefined,
        domain: 'system',
        data: payload,
        cascadeDepth: 0,
        priority: 'info'
      });
    },

    delegate_to_module: ({ moduleId, payload, delegateToModule, navigateTo }) => {
      if (typeof payload?.moduleId === 'string') {
        const content =
          typeof payload?.instruction === 'string'
            ? payload.instruction
            : typeof payload?.context === 'string'
            ? payload.context
            : typeof payload?.content === 'string'
            ? payload.content
            : '';
        const reason = typeof payload?.reason === 'string' ? payload.reason : 'delegation';
        delegateToModule(payload.moduleId, reason, content);
        if (navigateTo) {
          const route = NexusRoutingService.getRoute(payload.moduleId as ModuleId);
          if (route) navigateTo(route);
        }
      }
    },

    broadcast_spine_event: ({ moduleId, payload }) => {
      const VALID_SPINE_EVENT_TYPES = new Set<string>([
        'VITAL_UPDATED', 'REDUCE_TRAINING_LOAD', 'BLOCK_HIGH_INTENSITY', 'FLATTEN_ENERGY_WAVE',
        'RECOVERY_AVAILABLE', 'BURNOUT_WARNING', 'CLEARANCE_DENIED', 'CLEARANCE_GRANTED',
        'COGNITIVE_OVERLOAD', 'SECURITY_POLICY_UPDATED', 'FINANCIAL_STRESS', 'MEDICAL_ALERT',
        'DRAFT_PROPOSED', 'DRAFT_APPROVED', 'DRAFT_DISMISSED', 'SESSION_STARTED', 'SESSION_ENDED',
        'MODULE_DELEGATED'
      ]);
      const rawType = typeof payload.type === 'string' ? payload.type : 'VITAL_UPDATED';
      if (!VALID_SPINE_EVENT_TYPES.has(rawType)) {
        console.warn(`[broadcast_spine_event] Blocked invalid event type: "${rawType}"`);
        return;
      }
      const eventType = rawType as SpineEventType;
      Spine.emit({
        type: eventType,
        source: moduleId,
        domain: (payload.domain as 'B' | 'E' | 'C' | 'R' | 'system') || 'system',
        data: (payload.data as Record<string, unknown>) || payload,
        cascadeDepth: 0,
        priority: (payload.priority as 'info' | 'alert' | 'critical') || 'info'
      });
    },
    
    query_module: async ({ payload, sendMessage, pushAssistantMessage }) => {
      if (typeof payload?.moduleId !== 'string') return;

      const question =
        typeof payload?.question === 'string'
          ? payload.question
          : typeof payload?.query === 'string'
          ? payload.query
          : typeof payload?.content === 'string'
          ? payload.content
          : '';
      if (!question.trim()) return;

      const targetModule = payload.moduleId;
      const manifest = (await import('../module-manifest')).MODULE_MANIFEST;
      const moduleEntry = manifest[targetModule as keyof typeof manifest];
      const moduleName = moduleEntry?.alias || targetModule;

      if (!sendMessage) {
        pushAssistantMessage?.(`[Module query to ${moduleName} unavailable — no LLM connection]`);
        return;
      }

      try {
        const consultPrompt = `You are ${moduleName}, a specialist agent in the Nexus system. ` +
          `Your domain is: ${moduleEntry?.description || targetModule}. ` +
          `Answer the following consultation query concisely and precisely from your domain expertise. ` +
          `Do not use action tags. Respond in 2-4 sentences.`;

        const { response } = await sendMessage(question, {
          systemPrompt: consultPrompt,
          history: [],
          memoryContext: [],
          summary: `Internal consultation from Nexus to ${moduleName}`
        });

        const attribution = `**${moduleName}** reports: ${response.publicText.trim()}`;
        pushAssistantMessage?.(attribution);
      } catch (err) {
        console.error(`[query_module] Failed to consult ${moduleName}:`, err);
        pushAssistantMessage?.(`[Module consultation with ${moduleName} failed — try again or delegate directly]`);
      }
    }
  });

  ActionHub.registerMultiple('orchestrator', {
    update_global_identity: async ({ userId, payload }) => {
      if (!userId || !payload || typeof payload !== 'object') return;
      const patch: Record<string, unknown> = {};
      if (typeof payload.preferredName === 'string') patch.preferredName = payload.preferredName.trim();
      if (typeof payload.pronouns === 'string') patch.pronouns = payload.pronouns.trim();
      if (typeof payload.genderIdentity === 'string') patch.genderIdentity = payload.genderIdentity.trim();
      if (typeof payload.occupation === 'string') patch.occupation = payload.occupation.trim();
      if (typeof payload.age === 'number' && Number.isFinite(payload.age)) patch.age = Math.round(payload.age as number);
      if (payload.assignedSexAtBirth === 'female' || payload.assignedSexAtBirth === 'male') {
        patch.assignedSexAtBirth = payload.assignedSexAtBirth;
      }
      if (typeof payload.typicalSleepHours === 'number' && Number.isFinite(payload.typicalSleepHours)) {
        patch.typicalSleepHours = payload.typicalSleepHours;
      }
      if (Object.keys(patch).length === 0) return;
      await CoreProfileService.updateProfile(userId, patch);
    },

    sync_personality_provision: async ({ userId, payload }) => {
      if (!userId || !payload || typeof payload !== 'object') return;
      const patch: Record<string, unknown> = {};
      if (typeof payload.orchestratorAlias === 'string') patch.orchestratorAlias = payload.orchestratorAlias.trim();
      if (payload.moduleAliases && typeof payload.moduleAliases === 'object') patch.moduleAliases = payload.moduleAliases;
      if (payload.moduleGenderProfiles && typeof payload.moduleGenderProfiles === 'object') {
        patch.moduleGenderProfiles = payload.moduleGenderProfiles;
      }
      if (payload.personaOverlays && typeof payload.personaOverlays === 'object') {
        patch.personaOverlays = payload.personaOverlays;
      }
      if (Object.keys(patch).length === 0) return;
      await CoreProfileService.updatePersonality(userId, patch);
    },

    search_memory: async ({ userId, payload, pushAssistantMessage }) => {
      if (!userId || !payload) return;
      const query =
        typeof payload?.query === 'string'
          ? payload.query
          : typeof payload?.content === 'string'
          ? payload.content
          : typeof payload?.question === 'string'
          ? payload.question
          : '';
      if (!query.trim()) return;

      const moduleIds = Array.isArray(payload?.moduleIds)
        ? payload.moduleIds.filter((id: unknown) => typeof id === 'string')
        : ['orchestrator'];
      const topK = typeof payload?.topK === 'number' ? Math.max(1, Math.min(10, payload.topK)) : 5;
      const recencyWeight =
        typeof payload?.recencyWeight === 'number' ? Math.max(0, Math.min(1, payload.recencyWeight)) : 0.3;

      const [sessions, facts] = await Promise.all([
        EpisodicMemoryService.retrieveRelevant(userId, query, {
          moduleIds,
          topK,
          recencyWeight
        }),
        SemanticMemoryService.getFacts(userId, moduleIds)
      ]);

      const sessionLines = sessions.map((session) => {
        const date = new Date(session.sessionDate).toLocaleDateString();
        return `• [${session.moduleId}] ${date}: ${session.summary}`;
      });
      const factLines = facts.slice(0, 5).map((fact) => `• ${fact.fact} (${fact.confidence.toFixed(2)})`);

      const response = [
        'Memory scan complete.',
        sessionLines.length ? `Recent sessions:\\n${sessionLines.join('\\n')}` : 'Recent sessions: none found.',
        factLines.length ? `Stable facts:\\n${factLines.join('\\n')}` : 'Stable facts: none found.'
      ].join('\\n\\n');

      pushAssistantMessage?.(response);
    }
  });

  // Domain Actions that update NSV
  ActionHub.register('therapy', 'update_soul_resilience', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score);
    if (typeof score === 'number') {
      await updateGlobalSoul({
        emotionalResilience: score,
        emotional: { emotionalResilience: score }
      });
    }
  });

  ActionHub.register('therapy', 'update_emotional_resilience', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.emotionalResilience);
    if (typeof score === 'number') {
      await updateGlobalSoul({
        emotionalResilience: score,
        emotional: { emotionalResilience: score }
      });
    }
  });

  ActionHub.register('therapy', 'update_stress_load', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.stressLoad);
    if (typeof score === 'number') {
      await updateGlobalSoul({ emotional: { stressLoad: score } });
    }
  });

  ActionHub.register('therapy', 'update_mood_trend', async ({ payload, updateGlobalSoul }) => {
    const trend = safeString(payload.trend ?? payload.moodTrend);
    if (trend !== undefined) {
      await updateGlobalSoul({ emotional: { moodTrend: trend } });
    }
  });

  ActionHub.register('therapy', 'update_trauma_markers', async ({ payload, updateGlobalSoul }) => {
    const markers = safeStringArray(payload.markers ?? payload.traumaMarkers);
    if (markers !== undefined) {
      await updateGlobalSoul({ emotional: { traumaMarkers: markers }, traumaMarkers: markers });
    }
  });

  ActionHub.register('trainer', 'update_cns_fatigue', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score);
    if (typeof score === 'number') {
      await updateGlobalSoul({
        cnsFatigue: score,
        biological: { cnsFatigue: score }
      });
    }
  });

  ActionHub.register('trainer', 'update_sleep_quality', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score);
    if (typeof score === 'number') {
      await updateGlobalSoul({
        sleepQuality: score,
        biological: { sleepQuality: score }
      });
    }
  });

  ActionHub.register('trainer', 'request_soma_clearance', ({ moduleId, payload, delegateToModule }) => {
    const activity = typeof payload?.activity === 'string' ? payload.activity : 'training';
    const reason = typeof payload?.reason === 'string' ? payload.reason : 'clearance_request';
    delegateToModule('soma', reason, `Clearance request for ${activity}. Reason: ${reason}.`);
  });

  ActionHub.register('soma', 'update_biological_state', async ({ payload, updateGlobalSoul }) => {
    if (payload && typeof payload === 'object') {
      const patch: NeuralStateVectorPatch = { biological: {} };
      const cnsFatigue = safeNumber(payload.cnsFatigue);
      if (cnsFatigue !== undefined) {
        patch.biological!.cnsFatigue = cnsFatigue;
        patch.cnsFatigue = cnsFatigue;
      }
      const sleepQuality = safeNumber(payload.sleepQuality);
      if (sleepQuality !== undefined) {
        patch.biological!.sleepQuality = sleepQuality;
        patch.sleepQuality = sleepQuality;
      }
      const recoveryScore = safeNumber(payload.recoveryScore);
      if (recoveryScore !== undefined) patch.biological!.recoveryScore = recoveryScore;
      const hormonalContext = safeString(payload.hormonalContext);
      if (hormonalContext !== undefined) {
        patch.biological!.hormonalContext = hormonalContext;
        patch.hormonalContext = hormonalContext;
      }
      await updateGlobalSoul(patch);
    }
  });

  ActionHub.register('soma', 'update_recovery_score', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.recoveryScore);
    if (typeof score === 'number') {
      await updateGlobalSoul({ biological: { recoveryScore: score } });
    }
  });

  ActionHub.register('soma', 'update_hormonal_context', async ({ payload, updateGlobalSoul }) => {
    const context = safeString(payload.context ?? payload.hormonalContext);
    if (context !== undefined) {
      await updateGlobalSoul({
        hormonalContext: context,
        biological: { hormonalContext: context }
      });
    }
  });

  ActionHub.register('atlas', 'update_energy_wave', async ({ payload, updateGlobalSoul }) => {
    if (payload && typeof payload === 'object') {
      await updateGlobalSoul({
        cognitive: {
          energyBudget: safeNumber(payload.energyBudget),
          focusScore: safeNumber(payload.focusScore),
          activeLoad: safeNumber(payload.activeLoad),
          researchLoad: safeNumber(payload.researchLoad)
        }
      });
    }
  });

  ActionHub.register('atlas', 'flatten_schedule', async ({ moduleId, payload, updateGlobalSoul }) => {
    const nextLoad = safeNumber(payload?.activeLoad);
    if (typeof nextLoad === 'number') {
      await updateGlobalSoul({ cognitive: { activeLoad: nextLoad } });
    }
    Spine.emit({
      type: 'FLATTEN_ENERGY_WAVE',
      source: moduleId,
      domain: 'C',
      data: payload || {},
      cascadeDepth: 0,
      priority: 'alert'
    });
  });

  ActionHub.register('atlas', 'update_task_graph', async ({ payload, updateGlobalSoul }) => {
    const nextLoad = safeNumber(payload?.activeLoad);
    if (typeof nextLoad === 'number') {
      await updateGlobalSoul({ cognitive: { activeLoad: nextLoad } });
    }
  });

  ActionHub.register('therapy', 'update_emotional_state', async ({ payload, updateGlobalSoul }) => {
    if (!payload || typeof payload !== 'object') return;
    const patch: NeuralStateVectorPatch = { emotional: {} };
    const resilience = safeNumber(payload.emotionalResilience);
    if (resilience !== undefined) {
      patch.emotional!.emotionalResilience = resilience;
      patch.emotionalResilience = resilience;
    }
    const stressLoad = safeNumber(payload.stressLoad);
    if (stressLoad !== undefined) patch.emotional!.stressLoad = stressLoad;
    const moodTrend = safeString(payload.moodTrend);
    if (moodTrend !== undefined) patch.emotional!.moodTrend = moodTrend;
    const traumaMarkers = safeStringArray(payload.traumaMarkers);
    if (traumaMarkers !== undefined) {
      patch.emotional!.traumaMarkers = traumaMarkers;
      patch.traumaMarkers = traumaMarkers;
    }
    await updateGlobalSoul(patch);
  });

  ActionHub.register('atlas', 'update_energy_budget', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.energyBudget);
    if (typeof score === 'number') {
      await updateGlobalSoul({ cognitive: { energyBudget: score } });
    }
  });

  ActionHub.register('atlas', 'update_focus_score', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.focusScore);
    if (typeof score === 'number') {
      await updateGlobalSoul({ cognitive: { focusScore: score } });
    }
  });

  ActionHub.register('atlas', 'update_active_load', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.activeLoad);
    if (typeof score === 'number') {
      await updateGlobalSoul({ cognitive: { activeLoad: score } });
    }
  });

  ActionHub.register('scout', 'update_research_load', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.researchLoad);
    if (typeof score === 'number') {
      await updateGlobalSoul({ cognitive: { researchLoad: score } });
    }
  });

  ActionHub.register('ledger', 'update_resonance_roi', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.resonanceROI);
    if (typeof score === 'number') {
      await updateGlobalSoul({ resource: { resonanceROI: score } });
    }
  });

  ActionHub.register('orchestrator', 'sync_vitals', async ({ payload, updateGlobalSoul }) => {
    if (!payload || typeof payload !== 'object') return;
    const bio = payload.biological as Record<string, unknown> | undefined;
    const emo = payload.emotional as Record<string, unknown> | undefined;
    const cog = payload.cognitive as Record<string, unknown> | undefined;
    const res = payload.resource as Record<string, unknown> | undefined;

    const biological: Record<string, unknown> = {};
    const emotional: Record<string, unknown> = {};
    const cognitive: Record<string, unknown> = {};
    const resource: Record<string, unknown> = {};

    const setIfDefined = (target: Record<string, unknown>, field: string, value: unknown) => {
      if (value !== undefined) target[field] = value;
    };

    setIfDefined(biological, 'cnsFatigue', bio?.cnsFatigue ?? payload.cnsFatigue);
    setIfDefined(biological, 'sleepQuality', bio?.sleepQuality ?? payload.sleepQuality);
    setIfDefined(biological, 'recoveryScore', bio?.recoveryScore);
    setIfDefined(biological, 'hormonalContext', bio?.hormonalContext ?? payload.hormonalContext);

    setIfDefined(emotional, 'emotionalResilience', emo?.emotionalResilience ?? payload.emotionalResilience);
    setIfDefined(emotional, 'stressLoad', emo?.stressLoad);
    setIfDefined(emotional, 'moodTrend', emo?.moodTrend);
    const traumaMarkers = safeStringArray(emo?.traumaMarkers ?? payload.traumaMarkers);
    if (traumaMarkers !== undefined) {
      emotional.traumaMarkers = traumaMarkers;
    }

    setIfDefined(cognitive, 'energyBudget', cog?.energyBudget);
    setIfDefined(cognitive, 'focusScore', cog?.focusScore);
    setIfDefined(cognitive, 'activeLoad', cog?.activeLoad);
    setIfDefined(cognitive, 'researchLoad', cog?.researchLoad);

    setIfDefined(resource, 'financialFriction', res?.financialFriction);
    setIfDefined(resource, 'resonanceROI', res?.resonanceROI);

    const compactedPatch: NeuralStateVectorPatch = {
      ...(Object.keys(biological).length ? { biological: biological as NeuralStateVectorPatch['biological'] } : {}),
      ...(Object.keys(emotional).length ? { emotional: emotional as NeuralStateVectorPatch['emotional'] } : {}),
      ...(Object.keys(cognitive).length ? { cognitive: cognitive as NeuralStateVectorPatch['cognitive'] } : {}),
      ...(Object.keys(resource).length ? { resource: resource as NeuralStateVectorPatch['resource'] } : {}),
      ...(traumaMarkers !== undefined ? { traumaMarkers } : {})
    };

    await updateGlobalSoul(compactedPatch);
  });
  ActionHub.register('ledger', 'compute_resonance_roi', async ({ payload, updateGlobalSoul }) => {
    const friction = safeNumber(payload?.financialFriction);
    const roi = safeNumber(payload?.resonanceROI);
    await updateGlobalSoul({
      resource: { financialFriction: friction, resonanceROI: roi }
    });
  });

  ActionHub.register('ledger', 'update_financial_friction', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload?.score);
    if (typeof score === 'number') {
      await updateGlobalSoul({ resource: { financialFriction: score } });
    }
  });
}
