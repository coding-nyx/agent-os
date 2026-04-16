/**
 * Orchestrator-specific action handlers.
 *
 * Registration order: registerOrchestratorActions() is called in main.tsx BEFORE
 * registerCoreActions(). Only the 2 handlers unique to Ara are registered here
 * (navigate_to_module, create_module_handoff). All shared action keys
 * (broadcast_spine_event, sync_vitals, update_global_identity, sync_personality_provision)
 * are registered exclusively by registerCoreActions() to avoid duplicate registrations.
 * See HANDLER_PRECEDENCE in core-handlers.ts for the full ordering contract.
 */

import { ActionHub } from '@/lib/actions/action-hub';
import { AraHandoffService } from '@/lib/services/ara-handoff-service';
import { AraRoutingService } from '@/lib/services/ara-routing-service';
import { AraLogger } from '@/lib/ara-logger';
import type { ModuleId } from '@/lib/module-manifest';

let registered = false;

export function registerOrchestratorActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerProvider('ara', {
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
  ActionHub.register('ara', 'navigate_to_module', ({ payload, navigateTo, orchestration }) => {
    const moduleId = typeof payload?.moduleId === 'string'
      ? (payload.moduleId as ModuleId)
      : null;
    if (!moduleId || !navigateTo) return;

    // Don't route in early session turns — let context build first
    const turnCount = (orchestration as any)?.turnCount ?? 0;
    if (turnCount < 3) {
      AraLogger.warn('ActionHub', `[ActionHub] Routing suggestion for "${moduleId}" suppressed — session too early (turn ${turnCount})`);
      return;
    }

    const route = AraRoutingService.getRoute(moduleId);
    if (route) navigateTo(route);
  });

  /**
   * create_module_handoff
   * Persist a handoff entry so that the target module can pick up context on
   * the user's next visit — WITHOUT immediately navigating away from Ara.
   * Emits MODULE_DELEGATED on the Spine so interested listeners can react.
   *
   * Payload: { moduleId: string; content: string; reason?: string }
   */
  ActionHub.register('ara', 'create_module_handoff', ({ payload, emitSpineEvent }) => {
    const moduleId = typeof payload?.moduleId === 'string' ? payload.moduleId : null;
    const content = typeof payload?.content === 'string' ? payload.content : '';
    const reason = typeof payload?.reason === 'string' ? payload.reason : 'Prepared by Ara';

    if (!moduleId || !content.trim()) return;

    AraHandoffService.store({
      moduleId,
      type: 'delegate',
      content,
      reason,
      sourceModuleId: 'ara',
      createdAt: new Date().toISOString(),
    });

    emitSpineEvent('MODULE_DELEGATED', {
      targetModule: moduleId,
      context: content,
      reason,
      source: 'ara',
    });
  });

}
