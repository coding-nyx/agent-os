/**
 * Orchestrator-specific action handlers.
 *
 * Registration order matters: registerOrchestratorActions() is called in main.tsx
 * BEFORE registerCoreActions(). This means:
 *   - The 4 shared handlers below (broadcast_spine_event, sync_vitals,
 *     update_global_identity, sync_personality_provision) are registered first,
 *     then overwritten by registerCoreActions() with their more robust versions.
 *   - The 2 unique handlers (navigate_to_module, create_module_handoff) are NOT
 *     present in core-handlers and survive as the sole implementation.
 *
 * The 4 shared handlers are intentionally kept here as typed, functional fallbacks
 * that document the AI-facing contract and provide a safe baseline if the core
 * registration order ever changes.
 */

import { ActionHub } from '@/lib/actions/action-hub';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { NexusRoutingService } from '@/lib/services/nexus-routing-service';
import type { ModuleId } from '@/lib/module-manifest';
import type { SpineEventType, NeuralStateVectorPatch, AgentPersonalityProvision } from '@/lib/types';
import { CoreProfileService } from '@/lib/services/core-profile-service';

let registered = false;

export function registerOrchestratorActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerProvider('nexus', {
    capabilities: ['general-orchestration', 'reminder-management'],
    latencyTier: 'fast',
  });

  /**
   * navigate_to_module
   * Lightweight routing: navigate to a module's page without creating a
   * delegation handoff or transferring context. Use when the user's intent is
   * purely navigational (no data/context to pass forward).
   *
   * Payload: { moduleId: string }
   */
  ActionHub.register('nexus', 'navigate_to_module', ({ payload, navigateTo }) => {
    const moduleId = typeof payload?.moduleId === 'string'
      ? (payload.moduleId as ModuleId)
      : null;
    if (!moduleId || !navigateTo) return;

    const route = NexusRoutingService.getRoute(moduleId);
    if (route) navigateTo(route);
  });

  /**
   * create_module_handoff
   * Persist a handoff entry so that the target module can pick up context on
   * the user's next visit — WITHOUT immediately navigating away from Nexus.
   * Emits MODULE_DELEGATED on the Spine so interested listeners can react.
   *
   * Payload: { moduleId: string; content: string; reason?: string }
   */
  ActionHub.register('nexus', 'create_module_handoff', ({ payload, emitSpineEvent }) => {
    const moduleId = typeof payload?.moduleId === 'string' ? payload.moduleId : null;
    const content = typeof payload?.content === 'string' ? payload.content : '';
    const reason = typeof payload?.reason === 'string' ? payload.reason : 'Prepared by Nexus';

    if (!moduleId || !content.trim()) return;

    NexusHandoffService.store({
      moduleId,
      type: 'delegate',
      content,
      reason,
      sourceModuleId: 'nexus',
      createdAt: new Date().toISOString(),
    });

    emitSpineEvent('MODULE_DELEGATED', {
      targetModule: moduleId,
      context: content,
      reason,
      source: 'nexus',
    });
  });

  /**
   * broadcast_spine_event
   * AI-accessible Spine publisher — restricted to a safe subset of event types.
   * The 'normal' priority from LLM payloads is remapped to the valid 'info' tier.
   *
   * NOTE: registerCoreActions() registers an expanded version (24+ types) that
   * overwrites this at runtime. This is retained as the typed AI-facing contract.
   *
   * Payload: { type: string, domain?: string, priority?: string, data?: object }
   */
  ActionHub.register('nexus', 'broadcast_spine_event', ({ payload, emitSpineEvent }) => {
    const ALLOWED_TYPES: SpineEventType[] = [
      'VITAL_UPDATED',
      'HEALTH_CONTEXT_STALE',
      'MODULE_DELEGATED',
      'COMPOUND_STRESS',
      'CRISIS_DETECTED',
      'COGNITIVE_OVERLOAD',
      'BURNOUT_WARNING',
    ];
    const rawType = typeof payload?.type === 'string' ? payload.type : '';
    if (!ALLOWED_TYPES.includes(rawType as SpineEventType)) {
      console.warn(`[broadcast_spine_event] Event type "${rawType}" not permitted from AI`);
      return;
    }
    // Map 'normal' (from LLM) to the valid 'info' tier; pass others through.
    const PRIORITY_REMAP: Record<string, 'info' | 'alert' | 'critical'> = {
      info: 'info', normal: 'info', alert: 'alert', critical: 'critical',
    };
    const resolvedPriority =
      PRIORITY_REMAP[typeof payload?.priority === 'string' ? payload.priority : 'info'] ?? 'info';
    const data =
      typeof payload?.data === 'object' && payload.data !== null
        ? (payload.data as Record<string, unknown>)
        : {};
    emitSpineEvent(rawType as SpineEventType, { ...data, priority: resolvedPriority });
  });

  /**
   * sync_vitals
   * AI-accessible NSV patch — applies a NeuralStateVectorPatch to the global soul.
   *
   * NOTE: registerCoreActions() registers a hardened version (staleness guard +
   * reason validation) that overwrites this at runtime.
   *
   * Payload: { patch: Partial<NeuralStateVector> }
   */
  ActionHub.register('nexus', 'sync_vitals', async ({ payload, updateGlobalSoul, emitSpineEvent }) => {
    const patch = payload?.patch as NeuralStateVectorPatch | undefined;
    if (!patch || typeof patch !== 'object') return;
    await updateGlobalSoul(patch);
    emitSpineEvent('VITAL_UPDATED', { patch: patch as unknown as Record<string, unknown> });
  });

  /**
   * update_global_identity
   * Updates core profile identity fields (name, pronouns, occupation, etc.).
   * Only a safe allow-listed subset of fields is accepted from AI payloads.
   *
   * NOTE: registerCoreActions() registers an equivalent version that overwrites
   * this at runtime. Both target CoreProfileService.updateProfile().
   *
   * Payload: { preferredName?, pronouns?, occupation?, age?, genderIdentity?, timezone?, locale? }
   */
  ActionHub.register('nexus', 'update_global_identity', async ({ userId, payload }) => {
    if (!userId || !payload || typeof payload !== 'object') return;
    const ALLOWED_FIELDS = [
      'preferredName', 'pronouns', 'occupation', 'age',
      'genderIdentity', 'timezone', 'locale',
    ] as const;
    const safe: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if ((payload as Record<string, unknown>)[key] !== undefined) {
        safe[key] = (payload as Record<string, unknown>)[key];
      }
    }
    if (Object.keys(safe).length === 0) return;
    await CoreProfileService.updateProfile(userId, safe as Parameters<typeof CoreProfileService.updateProfile>[1]);
  });

  /**
   * sync_personality_provision
   * Updates the agent personality provision (aliases, genders, persona overlays).
   *
   * NOTE: registerCoreActions() registers an equivalent version that overwrites
   * this at runtime. Both target CoreProfileService.updatePersonality().
   *
   * Payload: { provision: Partial<AgentPersonalityProvision> }
   */
  ActionHub.register('nexus', 'sync_personality_provision', async ({ userId, payload }) => {
    if (!userId || !payload || typeof payload !== 'object') return;
    const provision = (
      typeof (payload as Record<string, unknown>).provision === 'object' &&
      (payload as Record<string, unknown>).provision !== null
        ? (payload as Record<string, unknown>).provision
        : payload
    ) as Partial<AgentPersonalityProvision>;
    if (!provision || typeof provision !== 'object') return;
    const safe: Partial<AgentPersonalityProvision> = {};
    if (typeof provision.orchestratorAlias === 'string') safe.orchestratorAlias = provision.orchestratorAlias.trim();
    if (provision.moduleAliases && typeof provision.moduleAliases === 'object') safe.moduleAliases = provision.moduleAliases;
    if (provision.agentGenders && typeof provision.agentGenders === 'object') safe.agentGenders = provision.agentGenders;
    if (provision.personaOverlays && typeof provision.personaOverlays === 'object') safe.personaOverlays = provision.personaOverlays;
    if (Object.keys(safe).length === 0) return;
    await CoreProfileService.updatePersonality(userId, safe);
  });
}
