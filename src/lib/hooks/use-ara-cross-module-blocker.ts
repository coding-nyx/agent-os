import { useMemo, useSyncExternalStore } from 'react';
import { Spine } from '@/lib/spine/spine-event-bus';
import { HUB_MODULE_ORDER, type ModuleId } from '@/lib/module-manifest';
import type { SpineEvent } from '@/lib/types';
import { isDelegationCompletionSignal, parseDelegationTarget } from '@/lib/spine/flow-contracts';
import { DelegationTrackingServiceJs } from '@cortex-logic';

// ── Module-level singleton ───────────────────────────────────────────────────
// One service instance shared across all hook consumers; state is global to the
// page (just like the previous useState inside useEffect was per-mount but only
// had one mount in practice).

const _service = DelegationTrackingServiceJs
  ? new (DelegationTrackingServiceJs as new () => InstanceType<typeof DelegationTrackingServiceJs>)()
  : null;

// ── Helpers ──────────────────────────────────────────────────────────────────

const isHubModule = (s: unknown): s is ModuleId =>
  typeof s === 'string' && (HUB_MODULE_ORDER as readonly string[]).includes(s);

// ── Spine → service wiring ───────────────────────────────────────────────────
// Subscriptions live at module scope so they fire even before any component
// mounts, and survive unmounts/remounts.

if (_service) {
  // Proposal lifecycle
  Spine.on('ROUTING_PROPOSED',  (e: SpineEvent) => { if (e.target) _service.addProposed(e.target); });
  Spine.on('ROUTING_ACCEPTED',  (e: SpineEvent) => { if (e.target) _service.acceptProposal(e.target); });
  Spine.on('ROUTING_DISMISSED', (e: SpineEvent) => { if (e.target) _service.dismissProposal(e.target); });

  // Non-proposal delegations (module-to-module handoffs, ActionHub, etc.)
  Spine.on('MODULE_DELEGATED', (e: SpineEvent) => {
    if (e.source !== 'ara') return; // only track ara-originated delegations
    if (isDelegationCompletionSignal(e)) {
      if (isHubModule(e.source)) _service.removePending(e.source);
      return;
    }
    const targetId = parseDelegationTarget(e);
    if (targetId) _service.addPending(targetId);
  });

  // Completion signals from the target module doing actual work
  Spine.on('MODULE_PROFILE_UPDATED', (e: SpineEvent) => {
    if (isHubModule(e.source)) _service.removePending(e.source);
  });
  Spine.on('VITAL_UPDATED', (e: SpineEvent) => {
    if (isHubModule(e.source)) _service.removePending(e.source);
  });
  Spine.on('AI_LINK_FAILURE', (e: SpineEvent) => {
    if (isHubModule(e.source)) _service.removePending(e.source);
  });

  // TTL pruning — skip when both maps are empty to avoid unnecessary KMP calls
  window.setInterval(() => {
    const snap = _cachedSnapshot;
    if (Object.keys(snap.proposed).length === 0 && Object.keys(snap.pending).length === 0) return;
    _service.pruneExpired();
  }, 1_000);
}

// ── Snapshot shape ───────────────────────────────────────────────────────────

interface DelegationSnapshot {
  proposed: Record<string, number>;
  pending: Record<string, number>;
  isBusy: boolean;
}

const EMPTY_SNAPSHOT: DelegationSnapshot = { proposed: {}, pending: {}, isBusy: false };

function parseSnapshot(json: string): DelegationSnapshot {
  try { return JSON.parse(json) as DelegationSnapshot; } catch { return EMPTY_SNAPSHOT; }
}

// ── useSyncExternalStore subscription ────────────────────────────────────────

let _cachedSnapshot = EMPTY_SNAPSHOT;

function subscribe(callback: () => void): () => void {
  if (!_service) return () => {};
  const task = _service.observeState((json: string) => {
    _cachedSnapshot = parseSnapshot(json);
    callback();
  });
  return () => task.cancel();
}

function getSnapshot(): DelegationSnapshot {
  return _cachedSnapshot;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Tracks which modules are currently awaiting a delegation response from Ara.
 *
 * **isCrossModuleBusy** is true only when at least one actual in-flight delegation
 * exists (pending). Routing *proposals* awaiting user decision do not count — they
 * live in the `proposed` set and are dropped when the user dismisses the banner
 * or the 8s TTL fires.
 *
 * This fixes the "stuck at SAVING" bug where clicking "Stay Here" left an orphan
 * pending entry until the 10-min TTL, because the previous implementation treated
 * a proposal and a dispatch identically.
 */
export function useAraCrossModuleBlocker() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT);

  return useMemo(() => ({
    isCrossModuleBusy: snapshot.isBusy,
    pendingTargets: Object.keys(snapshot.pending) as ModuleId[],
  }), [snapshot]);
}
