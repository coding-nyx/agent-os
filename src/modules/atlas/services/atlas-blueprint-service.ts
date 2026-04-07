/**
 * AtlasBlueprintService — delegates all capacity blueprint computation to KMP AtlasBlueprintServiceJs.
 *
 * All exported TypeScript types and interfaces are preserved for UI consumers.
 */

import { AtlasBlueprintServiceJs } from '@cortex-logic';
import type {
  AtlasCapacityBlueprint,
  AtlasIngestionMode,
  AtlasProfile,
  AtlasReviewBlueprint,
  AtlasGoal,
  AtlasTask,
  GlobalProjection,
} from '@/lib/types';

type ReviewInput = {
  profile: AtlasProfile | null;
  soul: GlobalProjection | null;
  now?: Date;
};

export type CapacityProjection = {
  capacity: number;
  headroom: number;
  overflowTasks: number;
  summary: string;
};

export type DailyCapacityEstimate = {
  totalCapacity: number;
  committedEnergy: number;
  availableEnergy: number;
  dayOfWeek: number;
};

const _svc = new AtlasBlueprintServiceJs();

export function inferAtlasDocumentIngestionMode(confidence: number): AtlasIngestionMode {
  return _svc.inferIngestionMode(confidence) as AtlasIngestionMode;
}

export function projectAtlasCapacityBlueprint(
  blueprint: AtlasCapacityBlueprint,
  capacityPct: number,
): CapacityProjection {
  return JSON.parse(_svc.projectCapacityBlueprint(JSON.stringify(blueprint), capacityPct)) as CapacityProjection;
}

export function computeAtlasReviewBlueprint(input: ReviewInput): AtlasReviewBlueprint {
  return JSON.parse(
    _svc.computeReviewBlueprint(
      JSON.stringify(input.profile),
      JSON.stringify(input.soul),
      (input.now ?? new Date()).toISOString(),
    ),
  ) as AtlasReviewBlueprint;
}

export function computeQuickCapacitySnapshot(
  profile: AtlasProfile | null,
  soul: GlobalProjection | null,
): AtlasCapacityBlueprint | null {
  const result = _svc.computeQuickSnapshot(
    JSON.stringify(profile ?? null),
    JSON.stringify(soul ?? null),
  ) as string;
  return result === 'null' ? null : (JSON.parse(result) as AtlasCapacityBlueprint);
}

export function computeDailyCapacity(
  profile: AtlasProfile | null,
  soul: GlobalProjection | null,
  targetDate: string,
): DailyCapacityEstimate {
  return JSON.parse(
    _svc.computeDailyCapacity(
      JSON.stringify(profile ?? null),
      JSON.stringify(soul ?? null),
      targetDate,
    ),
  ) as DailyCapacityEstimate;
}

export function computeDeadlinePressureScore(
  tasks: AtlasTask[],
  goals: AtlasGoal[],
  taskCompletionRate?: number,
): number {
  return _svc.computeDeadlinePressureScore(
    JSON.stringify(tasks),
    JSON.stringify(goals),
    taskCompletionRate ?? 0.5,
  ) as number;
}

export const AtlasBlueprintService = {
  computeReviewBlueprint: computeAtlasReviewBlueprint,
  projectAtCapacityPct: projectAtlasCapacityBlueprint,
  inferDocumentIngestionMode: inferAtlasDocumentIngestionMode,
  computeQuickCapacitySnapshot,
  computeDailyCapacity,
};
