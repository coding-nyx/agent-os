/**
 * SoulAuthorityGuard
 *
 * Guards Global Soul (NSV / crossFunctionalState) writes by verifying that the
 * requesting module holds ownership authority over the NSV domain being written.
 *
 * Authority is derived from NSV_OWNERSHIP in nsv-ownership.ts — the single source
 * of truth for which module owns each metric path.
 *
 * Rules:
 *   - A module may only write paths it owns according to NSV_OWNERSHIP.
 *   - The 'orchestrator' is a special super-authority: it may write any path.
 *   - Modules with an empty ownership list (scout, forge, soma, bridge)
 *     cannot write any NSV fields directly.
 *
 * Examples:
 *   SoulAuthorityGuard.canWrite('agnes', 'emotional.traumaMarkers')  → true
 *   SoulAuthorityGuard.canWrite('titan', 'emotional.traumaMarkers')  → false
 *   SoulAuthorityGuard.canWrite('forge', 'cognitive.focusScore')     → false
 *   SoulAuthorityGuard.canWrite('orchestrator', 'biological.cnsFatigue') → true
 */

import { ModuleId } from '@/lib/module-manifest';
import { NSV_OWNERSHIP, NSVMetricPath } from './nsv-ownership';

/** Error thrown when a module attempts an unauthorized NSV write. */
export class SoulAuthorityError extends Error {
  readonly moduleId: ModuleId;
  readonly nsvPath: NSVMetricPath;
  readonly authoritativeModule: ModuleId;

  constructor(moduleId: ModuleId, nsvPath: NSVMetricPath, authoritativeModule: ModuleId) {
    super(
      `[SoulAuthorityGuard] Module '${moduleId}' is not authorized to write '${nsvPath}'. ` +
      `Authority belongs to '${authoritativeModule}'.`
    );
    this.name = 'SoulAuthorityError';
    this.moduleId = moduleId;
    this.nsvPath = nsvPath;
    this.authoritativeModule = authoritativeModule;
  }
}

/**
 * Resolve which module holds write authority for a given NSV path.
 * Falls back to 'orchestrator' for paths not found in any module's ownership list
 * (which should not occur with a well-maintained NSV_OWNERSHIP map).
 */
function resolveAuthority(nsvPath: NSVMetricPath): ModuleId {
  for (const [moduleId, paths] of Object.entries(NSV_OWNERSHIP)) {
    if ((paths as NSVMetricPath[]).includes(nsvPath)) {
      return moduleId as ModuleId;
    }
  }
  // Unknown path — default to orchestrator as fallback authority
  return 'orchestrator';
}

export const SoulAuthorityGuard = {
  /**
   * Returns true if `moduleId` is authorized to write `nsvPath`.
   *
   * The orchestrator is always authorized.
   * All other modules must appear in NSV_OWNERSHIP[moduleId] for the given path.
   */
  canWrite(moduleId: ModuleId, nsvPath: NSVMetricPath): boolean {
    // Orchestrator has super-authority over all NSV paths
    if (moduleId === 'orchestrator') return true;

    const ownedPaths = NSV_OWNERSHIP[moduleId] ?? [];
    return (ownedPaths as NSVMetricPath[]).includes(nsvPath);
  },

  /**
   * Throws a `SoulAuthorityError` if `moduleId` is not authorized to write `nsvPath`.
   * Use this at write boundaries to enforce the authority contract at runtime.
   */
  assertCanWrite(moduleId: ModuleId, nsvPath: NSVMetricPath): void {
    if (!SoulAuthorityGuard.canWrite(moduleId, nsvPath)) {
      const authority = resolveAuthority(nsvPath);
      throw new SoulAuthorityError(moduleId, nsvPath, authority);
    }
  },

  /**
   * Returns the module ID that holds write authority over `nsvPath`.
   * Returns 'orchestrator' for unrecognized paths.
   */
  getAuthoritativeModule(nsvPath: NSVMetricPath): ModuleId {
    return resolveAuthority(nsvPath);
  },

  /**
   * Validates an entire patch object before it is applied to the NSV.
   * Returns a list of unauthorized paths (empty array means the patch is clean).
   *
   * Use this to validate a full NeuralStateVectorPatch before calling
   * GlobalProjectionService.updateCrossFunctionalState().
   */
  auditPatch(
    moduleId: ModuleId,
    patch: Partial<Record<NSVMetricPath, unknown>>
  ): Array<{ path: NSVMetricPath; authority: ModuleId }> {
    const violations: Array<{ path: NSVMetricPath; authority: ModuleId }> = [];

    for (const path of Object.keys(patch) as NSVMetricPath[]) {
      if (!SoulAuthorityGuard.canWrite(moduleId, path)) {
        violations.push({ path, authority: resolveAuthority(path) });
      }
    }

    return violations;
  }
} as const;
