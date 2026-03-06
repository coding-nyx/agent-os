import { ActionHub } from './action-hub';
import { Spine } from '../spine/spine-event-bus';
import { CoreProfileService } from '../services/core-profile-service';
import { NexusRoutingService } from '../services/nexus-routing-service';
import { EpisodicMemoryService } from '../services/episodic-memory-service';
import { SemanticMemoryService } from '../services/semantic-memory-service';

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
          const route = NexusRoutingService.getRoute(payload.moduleId as any);
          if (route) navigateTo(route);
        }
      }
    },

    broadcast_spine_event: ({ moduleId, payload }) => {
      const eventType = typeof payload.type === 'string' ? payload.type : 'VITAL_UPDATED';
      Spine.emit({
        type: eventType as any,
        source: moduleId,
        domain: payload.domain || 'system',
        data: payload.data || payload,
        cascadeDepth: 0,
        priority: payload.priority || 'info'
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
        const consultPrompt = `You are ${moduleName}, a specialist agent in the AGNES system. ` +
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
      const patch: Record<string, any> = {};
      if (typeof payload.preferredName === 'string') patch.preferredName = payload.preferredName.trim();
      if (typeof payload.pronouns === 'string') patch.pronouns = payload.pronouns.trim();
      if (typeof payload.genderIdentity === 'string') patch.genderIdentity = payload.genderIdentity.trim();
      if (typeof payload.occupation === 'string') patch.occupation = payload.occupation.trim();
      if (typeof payload.age === 'number' && Number.isFinite(payload.age)) patch.age = Math.round(payload.age);
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
      const patch: Record<string, any> = {};
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
      await updateGlobalSoul({ emotional: { stressLoad: score } as any });
    }
  });

  ActionHub.register('therapy', 'update_mood_trend', async ({ payload, updateGlobalSoul }) => {
    const trend = safeString(payload.trend ?? payload.moodTrend);
    if (trend !== undefined) {
      await updateGlobalSoul({ emotional: { moodTrend: trend } as any });
    }
  });

  ActionHub.register('therapy', 'update_trauma_markers', async ({ payload, updateGlobalSoul }) => {
    const markers = safeStringArray(payload.markers ?? payload.traumaMarkers);
    if (markers !== undefined) {
      await updateGlobalSoul({ emotional: { traumaMarkers: markers } as any, traumaMarkers: markers });
    }
  });

  ActionHub.register('trainer', 'update_cns_fatigue', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score);
    if (typeof score === 'number') {
      await updateGlobalSoul({
        cnsFatigue: score,
        biological: { cnsFatigue: score } as any
      });
    }
  });

  ActionHub.register('trainer', 'update_sleep_quality', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score);
    if (typeof score === 'number') {
      await updateGlobalSoul({
        sleepQuality: score,
        biological: { sleepQuality: score } as any
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
      const patch: any = { biological: {} };
      if (safeNumber(payload.cnsFatigue) !== undefined) {
        patch.biological.cnsFatigue = payload.cnsFatigue;
        patch.cnsFatigue = payload.cnsFatigue;
      }
      if (safeNumber(payload.sleepQuality) !== undefined) {
        patch.biological.sleepQuality = payload.sleepQuality;
        patch.sleepQuality = payload.sleepQuality;
      }
      if (safeNumber(payload.recoveryScore) !== undefined) patch.biological.recoveryScore = payload.recoveryScore;
      if (safeString(payload.hormonalContext) !== undefined) {
        patch.biological.hormonalContext = payload.hormonalContext;
        patch.hormonalContext = payload.hormonalContext;
      }
      await updateGlobalSoul(patch);
    }
  });

  ActionHub.register('soma', 'update_recovery_score', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.recoveryScore);
    if (typeof score === 'number') {
      await updateGlobalSoul({ biological: { recoveryScore: score } as any });
    }
  });

  ActionHub.register('soma', 'update_hormonal_context', async ({ payload, updateGlobalSoul }) => {
    const context = safeString(payload.context ?? payload.hormonalContext);
    if (context !== undefined) {
      await updateGlobalSoul({
        hormonalContext: context,
        biological: { hormonalContext: context } as any
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
    const patch: any = { emotional: {} };
    if (safeNumber(payload.emotionalResilience) !== undefined) {
      patch.emotional.emotionalResilience = payload.emotionalResilience;
      patch.emotionalResilience = payload.emotionalResilience;
    }
    if (safeNumber(payload.stressLoad) !== undefined) patch.emotional.stressLoad = payload.stressLoad;
    if (safeString(payload.moodTrend) !== undefined) patch.emotional.moodTrend = payload.moodTrend;
    const traumaMarkers = safeStringArray(payload.traumaMarkers);
    if (traumaMarkers !== undefined) {
      patch.emotional.traumaMarkers = traumaMarkers;
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
    const patch: any = { biological: {}, emotional: {}, cognitive: {}, resource: {} };
    const setIfDefined = (key: string, value: any) => {
      if (value === undefined) return;
      if (key.startsWith('biological.')) patch.biological[key.split('.')[1]] = value;
      if (key.startsWith('emotional.')) patch.emotional[key.split('.')[1]] = value;
      if (key.startsWith('cognitive.')) patch.cognitive[key.split('.')[1]] = value;
      if (key.startsWith('resource.')) patch.resource[key.split('.')[1]] = value;
    };

    setIfDefined('biological.cnsFatigue', payload.biological?.cnsFatigue ?? payload.cnsFatigue);
    setIfDefined('biological.sleepQuality', payload.biological?.sleepQuality ?? payload.sleepQuality);
    setIfDefined('biological.recoveryScore', payload.biological?.recoveryScore);
    setIfDefined('biological.hormonalContext', payload.biological?.hormonalContext ?? payload.hormonalContext);

    setIfDefined('emotional.emotionalResilience', payload.emotional?.emotionalResilience ?? payload.emotionalResilience);
    setIfDefined('emotional.stressLoad', payload.emotional?.stressLoad);
    setIfDefined('emotional.moodTrend', payload.emotional?.moodTrend);
    const traumaMarkers = safeStringArray(payload.emotional?.traumaMarkers ?? payload.traumaMarkers);
    if (traumaMarkers !== undefined) {
      patch.emotional.traumaMarkers = traumaMarkers;
      patch.traumaMarkers = traumaMarkers;
    }

    setIfDefined('cognitive.energyBudget', payload.cognitive?.energyBudget);
    setIfDefined('cognitive.focusScore', payload.cognitive?.focusScore);
    setIfDefined('cognitive.activeLoad', payload.cognitive?.activeLoad);
    setIfDefined('cognitive.researchLoad', payload.cognitive?.researchLoad);

    setIfDefined('resource.financialFriction', payload.resource?.financialFriction);
    setIfDefined('resource.resonanceROI', payload.resource?.resonanceROI);

    const compactedPatch = {
      ...patch,
      biological: Object.keys(patch.biological).length ? patch.biological : undefined,
      emotional: Object.keys(patch.emotional).length ? patch.emotional : undefined,
      cognitive: Object.keys(patch.cognitive).length ? patch.cognitive : undefined,
      resource: Object.keys(patch.resource).length ? patch.resource : undefined
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
