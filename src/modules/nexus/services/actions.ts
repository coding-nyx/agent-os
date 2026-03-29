/**
 * Orchestrator-specific action handlers.
 *
 * Registration order: registerOrchestratorActions() is called in main.tsx BEFORE
 * registerCoreActions(). Only the 2 handlers unique to Nexus are registered here
 * (navigate_to_module, create_module_handoff). All shared action keys
 * (broadcast_spine_event, sync_vitals, update_global_identity, sync_personality_provision)
 * are registered exclusively by registerCoreActions() to avoid duplicate registrations.
 * See HANDLER_PRECEDENCE in core-handlers.ts for the full ordering contract.
 */

import { ActionHub } from '@/lib/actions/action-hub';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { NexusRoutingService } from '@/lib/services/nexus-routing-service';
import type { ModuleId } from '@/lib/module-manifest';

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

}
