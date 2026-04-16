import { GlobalProjection, CoreUserProfile, NeuralStateVector, NeuralStateVectorPatch, SoulWriteRequest } from '../types';
import { createDefaultNSV, normalizeNSV } from './nsv-service';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { getAraDataLayer } from '../data-layer/provider';
import { AraDataLayer } from '../data-layer';
import { Spine } from '../spine/spine-event-bus';
import { GlobalProjectionServiceJs } from '@cortex-logic';

const _gps = new GlobalProjectionServiceJs();

const COLLECTION = 'global_souls';
const SOUL_WRITE_COLLECTION = 'pending_soul_writes';

// ---------------------------------------------------------------------------
// Per-UID write queue
// Serialises all read-modify-write operations for a given user so that
// concurrent callers updating DIFFERENT NSV domains cannot clobber each other.
// ---------------------------------------------------------------------------
const _projectionWriteQueues = new Map<string, Promise<void>>();

function computeOverallWellness(nsv: NeuralStateVector): number {
  return _gps.computeOverallWellness(JSON.stringify(nsv));
}

function enqueueProjectionWrite(uid: string, fn: () => Promise<void>): Promise<void> {
  const prev = _projectionWriteQueues.get(uid) ?? Promise.resolve();
  // Chain the new write onto the tail of the queue.
  // If prev rejected (or fn itself threw), log the failure and attempt fn
  // once more so a transient failure does not permanently block subsequent
  // writes for this user.
  const next = prev.then(fn).catch((firstErr) => {
    console.error('[GlobalProjectionService] NSV write failed, retrying once:', firstErr);
    return fn();
  });
  _projectionWriteQueues.set(uid, next);
  return next;
}

function buildNSVUpdatePayload(updates: NeuralStateVectorPatch, timestamp: string): Record<string, unknown> {
  return JSON.parse(_gps.buildNSVUpdatePayload(JSON.stringify(updates), timestamp)) as Record<string, unknown>;
}

export const GlobalProjectionService = {
  async getProjection(
    uid: string,
    dataLayer: AraDataLayer = getAraDataLayer(),
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
    dataLayer: AraDataLayer = getAraDataLayer(),
  ): Promise<GlobalProjection | null> {
    if (!profile?.uid) {
      console.warn('syncFromProfile called with no profile UID');
      return null;
    }

    // Robustness: Handle partially initialized profiles
    const provision = profile.agentPersonalityProvision || {
      orchestratorAlias: 'Ara',
      moduleAliases: {
        agnes: 'Agnes',
        titan: 'Titan',
        ledger: 'Ledger',
        atlas: 'Atlas',
        scout: 'Scout',
        forge: 'Forge'
      },
      agentGenders: {
        orchestrator: 'female',
        agnes: 'female',
        titan: 'non-binary',
        ledger: 'female',
        atlas: 'female',
        scout: 'female',
        forge: 'female'
      }
    };

    const manifestDefaults = Object.values(MODULE_MANIFEST).reduce<Record<string, string>>((acc, module) => {
      if (module.hasPage) acc[module.id] = module.alias;
      return acc;
    }, {});

    const displayNames: Record<string, string> = {
      ara: provision.orchestratorAlias,
      ...manifestDefaults,
      ...provision.moduleAliases
    };

    const agentGenders: Record<string, any> = {
      ...provision.agentGenders
    };

    // Load existing projection to preserve crossFunctionalState if it exists
    let existing: GlobalProjection | null = null;
    try {
      existing = await this.getProjection(profile.uid, dataLayer);
    } catch (err) {
      // If we can't load the existing projection, we skip syncing for now
      // to avoid potentially overwriting with incomplete data during network issues.
      return null;
    }

    // Skip write if the profile-derived fields haven't changed.
    if (existing) {
      const existingNames = JSON.stringify(existing.displayNames || {});
      const nextNames = JSON.stringify(displayNames || {});
      const existingGenders = JSON.stringify(existing.agentGenders || {});
      const nextGenders = JSON.stringify(agentGenders || {});
      
      if (existingNames === nextNames && existingGenders === nextGenders) {
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
    dataLayer: AraDataLayer = getAraDataLayer(),
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
    dataLayer: AraDataLayer = getAraDataLayer(),
    soulWriteOptions?: {
      /**
       * Module ID of the domain-authoritative agent to route the write through.
       * When provided the write is NOT committed immediately — instead a
       * `SoulWriteRequest` is persisted to `pending_soul_writes/{uid}/{requestId}`
       * and a `SOUL_WRITE_REQUESTED` Spine event is emitted for the owning agent
       * to approve or reject.
       */
      validateWith?: string;
      /** Human-readable justification for the write, surfaced to the owning agent. */
      reason?: string;
      /** Requesting module ID — defaults to 'system' when omitted. */
      requestedBy?: string;
    },
  ): Promise<void> {
    if (!uid) return;

    // --- Validated (deferred) write path ---
    if (soulWriteOptions?.validateWith) {
      const { validateWith, reason = '', requestedBy = 'system' } = soulWriteOptions;

      // Derive a compact dot-notation field description from the patch keys.
      const field = Object.entries(updates)
        .flatMap(([domain, domainUpdates]) =>
          typeof domainUpdates === 'object' && domainUpdates !== null
            ? Object.keys(domainUpdates as object).map((k) => `${domain}.${k}`)
            : [`${domain}`],
        )
        .join(', ');

      const requestId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      const soulWriteRequest: SoulWriteRequest = {
        id: requestId,
        moduleId: validateWith,
        field,
        value: updates,
        requestedBy,
        reason,
        status: 'pending',
        createdAt,
      };

      try {
        // Persist the pending request for the owning agent to review.
        await dataLayer.setDocument(
          `users/${uid}/${SOUL_WRITE_COLLECTION}`,
          requestId,
          soulWriteRequest as unknown as Record<string, unknown>,
        );

        // Notify the Spine so the owning agent (validateWith) can act.
        Spine.publish({
          type: 'SOUL_WRITE_REQUESTED',
          source: requestedBy,
          domain: 'system',
          priority: 'info',
          data: soulWriteRequest as unknown as Record<string, unknown>,
        });
      } catch (error) {
        console.error('[GlobalProjectionService] Failed to queue soul write request:', error);
      }

      // Do NOT commit the direct write — return and wait for approval.
      return;
    }

    // --- Direct (immediate) write path — backwards-compatible ---
    // Enqueue so that concurrent callers for the same uid are serialised:
    // each read-then-write runs to completion before the next one starts,
    // preventing a later getDocument from reading stale data and overwriting
    // updates committed by a concurrent caller.
    return enqueueProjectionWrite(uid, async () => {
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
      next.overallWellnessScore = computeOverallWellness(next.crossFunctionalState);

      try {
        await dataLayer.setDocument(COLLECTION, uid, next);
      } catch (error) {
        console.error('[GlobalProjectionService] Failed to update cross-functional state:', error);
        // Re-throw so the queue's retry mechanism can attempt the write once more.
        throw error;
      }
    });
  },

  /**
   * Approves a pending SoulWriteRequest.
   *
   * 1. Reads the request from `pending_soul_writes/{userId}/{requestId}`.
   * 2. Commits the NSV patch to the global soul.
   * 3. Updates the request status to 'approved' in the store.
   * 4. Emits `SOUL_WRITE_APPROVED` on the Spine.
   *
   * Throws if the request does not exist or is not in 'pending' state.
   */
  async approveSoulWrite(
    requestId: string,
    userId: string,
    dataLayer: AraDataLayer = getAraDataLayer(),
  ): Promise<void> {
    if (!requestId || !userId) {
      throw new Error('[GlobalProjectionService] approveSoulWrite: requestId and userId are required');
    }

    const request = await dataLayer.getDocument<SoulWriteRequest>(
      `users/${userId}/${SOUL_WRITE_COLLECTION}`,
      requestId,
    );

    if (!request) {
      throw new Error(
        `[GlobalProjectionService] approveSoulWrite: request "${requestId}" not found`,
      );
    }

    if (request.status !== 'pending') {
      throw new Error(
        `[GlobalProjectionService] approveSoulWrite: request "${requestId}" is already "${request.status}"`,
      );
    }

    // Commit the deferred NSV write — call the direct (non-validated) path.
    await this.updateCrossFunctionalState(
      userId,
      request.value as NeuralStateVectorPatch,
      dataLayer,
      /* no validateWith — direct write */
    );

    // Persist the approval status.
    const approved: SoulWriteRequest = { ...request, status: 'approved' };
    await dataLayer.setDocument(
      `users/${userId}/${SOUL_WRITE_COLLECTION}`,
      requestId,
      approved as unknown as Record<string, unknown>,
    );

    Spine.publish({
      type: 'SOUL_WRITE_APPROVED',
      source: request.moduleId,
      domain: 'system',
      priority: 'info',
      data: approved as unknown as Record<string, unknown>,
    });
  },

  /**
   * Rejects a pending SoulWriteRequest.
   *
   * 1. Reads the request from `pending_soul_writes/{userId}/{requestId}`.
   * 2. Updates the request status to 'rejected' — NSV is NOT modified.
   * 3. Emits `SOUL_WRITE_REJECTED` on the Spine.
   *
   * Throws if the request does not exist or is not in 'pending' state.
   */
  async rejectSoulWrite(
    requestId: string,
    userId: string,
    dataLayer: AraDataLayer = getAraDataLayer(),
  ): Promise<void> {
    if (!requestId || !userId) {
      throw new Error('[GlobalProjectionService] rejectSoulWrite: requestId and userId are required');
    }

    const request = await dataLayer.getDocument<SoulWriteRequest>(
      `users/${userId}/${SOUL_WRITE_COLLECTION}`,
      requestId,
    );

    if (!request) {
      throw new Error(
        `[GlobalProjectionService] rejectSoulWrite: request "${requestId}" not found`,
      );
    }

    if (request.status !== 'pending') {
      throw new Error(
        `[GlobalProjectionService] rejectSoulWrite: request "${requestId}" is already "${request.status}"`,
      );
    }

    const rejected: SoulWriteRequest = { ...request, status: 'rejected' };
    await dataLayer.setDocument(
      `users/${userId}/${SOUL_WRITE_COLLECTION}`,
      requestId,
      rejected as unknown as Record<string, unknown>,
    );

    Spine.publish({
      type: 'SOUL_WRITE_REJECTED',
      source: request.moduleId,
      domain: 'system',
      priority: 'info',
      data: rejected as unknown as Record<string, unknown>,
    });
  },
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
