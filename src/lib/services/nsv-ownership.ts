import { ModuleId } from '@/lib/module-manifest';
import { GlobalProjection, NeuralStateVector } from '@/lib/types';
import { normalizeNSV } from './nsv-service';
import { NsvOwnershipServiceJs } from '@cortex-logic';

const _ownership = new NsvOwnershipServiceJs();

export type NSVMetricPath =
  | 'biological.cnsFatigue'
  | 'biological.sleepQuality'
  | 'biological.recoveryScore'
  | 'biological.hormonalContext'
  | 'emotional.emotionalResilience'
  | 'emotional.stressLoad'
  | 'emotional.moodTrend'
  | 'emotional.traumaMarkers'
  | 'cognitive.energyBudget'
  | 'cognitive.focusScore'
  | 'cognitive.activeLoad'
  | 'cognitive.researchLoad'
  | 'cognitive.planningLoad'
  | 'cognitive.taskCompletionRate'
  | 'cognitive.interestDiversity'
  | 'planning.streakHealth'
  | 'planning.deadlinePressure'
  | 'planning.reflectionStreak'
  | 'planning.goalAlignment'
  | 'planning.habitMomentum'
  | 'resource.financialFriction'
  | 'resource.resonanceROI';

// NSV_OWNERSHIP is sourced from KMP NsvOwnershipService.WRITE_PERMISSIONS.
// This local copy is maintained for type-level NSVMetricPath[] compatibility;
// the authoritative data lives in cortex-logic.
export const NSV_OWNERSHIP: Record<ModuleId, NSVMetricPath[]> = Object.fromEntries(
  (['ara', 'agnes', 'titan', 'soma', 'ledger', 'atlas', 'scout', 'forge', 'bridge'] as ModuleId[]).map(
    (id) => [id, Array.from(_ownership.getWritableMetrics(id)) as NSVMetricPath[]]
  )
) as Record<ModuleId, NSVMetricPath[]>;

// NSV_READ_PERMISSIONS is sourced from KMP NsvOwnershipService.READ_PERMISSIONS.
// Consumed by formatNSVForModulePrompt() and enhanceContextForModule().
export const NSV_READ_PERMISSIONS: Record<ModuleId, NSVMetricPath[]> = Object.fromEntries(
  (['ara', 'agnes', 'titan', 'soma', 'ledger', 'atlas', 'scout', 'forge', 'bridge'] as ModuleId[]).map(
    (id) => [id, Array.from(_ownership.getReadableMetrics(id)) as NSVMetricPath[]]
  )
) as Record<ModuleId, NSVMetricPath[]>;

/**
 * Returns the primary owner of a metric (first module in OWNERSHIP that claims it).
 */
export function getMetricOwner(metric: NSVMetricPath): ModuleId {
  return _ownership.getMetricOwner(metric) as ModuleId;
}

/**
 * Returns all modules that claim ownership of a metric.
 */
export function getMetricOwners(metric: NSVMetricPath): ModuleId[] {
  return Array.from(_ownership.getMetricOwners(metric)) as ModuleId[];
}

/**
 * Checks if a module is the exclusive owner of a metric (no other modules claim it).
 */
export function isExclusiveOwner(moduleId: ModuleId, metric: NSVMetricPath): boolean {
  return _ownership.isExclusiveOwner(moduleId, metric);
}

/**
 * Checks if a module owns a metric (either exclusively or as co-owner).
 */
export function ownsMetric(moduleId: ModuleId, metric: NSVMetricPath): boolean {
  return _ownership.ownsMetric(moduleId, metric);
}

/**
 * Returns co-owned metrics from a patch that the module doesn't exclusively own.
 * These should go through the SOUL_WRITE_REQUESTED validation path.
 */
export function getCoOwnedMetricsInPatch(
  moduleId: ModuleId,
  patch: Record<string, Record<string, unknown>>
): NSVMetricPath[] {
  return Array.from(_ownership.getCoOwnedMetricsInPatch(moduleId, JSON.stringify(patch))) as NSVMetricPath[];
}

// Sourced from KMP NsvOwnershipService.DERIVED_METRICS.
export const NSV_DERIVED_METRICS: NSVMetricPath[] =
  Array.from(_ownership.getDerivedMetrics()) as NSVMetricPath[];

// Calibration prompts are now sourced from KMP.
// Use getCalibrationPrompt(metric) for individual lookups.
export function getCalibrationPrompt(metric: NSVMetricPath): string {
  return _ownership.getCalibrationPrompt(metric);
}

export function buildCalibrationPrompt(moduleId: ModuleId): string {
  return _ownership.buildCalibrationPrompt(moduleId);
}

export function filterNSVForModule(
  nsv: NeuralStateVector | null | undefined,
  moduleId: ModuleId
): NeuralStateVector {
  const normalized = normalizeNSV(nsv);
  const filtered = JSON.parse(_ownership.filterNsvForModule(JSON.stringify(normalized), moduleId));
  return normalizeNSV(filtered);
}

export function filterGlobalSoulForModule(
  projection: GlobalProjection | null,
  moduleId: ModuleId
): GlobalProjection | null {
  if (!projection) return null;
  return {
    ...projection,
    crossFunctionalState: filterNSVForModule(projection.crossFunctionalState, moduleId)
  };
}

export function getMetricValue(nsv: NeuralStateVector | null | undefined, path: NSVMetricPath): unknown {
  if (!nsv) return undefined;
  const [root, leaf] = path.split('.') as [keyof NeuralStateVector, string];
  const rootVal = (nsv as unknown as Record<string, unknown>)[root];
  if (!rootVal || typeof rootVal !== 'object') return undefined;
  return (rootVal as Record<string, unknown>)[leaf];
}

export function getUncalibratedOwnedMetrics(nsv: NeuralStateVector | null | undefined, moduleId: ModuleId): NSVMetricPath[] {
  if (!nsv) return NSV_OWNERSHIP[moduleId] ?? [];
  const owned = NSV_OWNERSHIP[moduleId] ?? [];
  return owned.filter((metric) => {
    const value = getMetricValue(nsv, metric);
    return value === null || value === undefined;
  });
}

export function isMetricStale(lastUpdated: string | undefined, thresholdDays: number): boolean {
  return _ownership.isMetricStale(lastUpdated ?? null, thresholdDays, Date.now());
}
