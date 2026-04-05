/**
 * NSV Service — thin bridge over cortex-logic's NsvServiceJs.
 *
 * Core algorithms (normalize, merge, format) live in KMP commonMain so both
 * Agnes and nexus-android produce identical results. This bridge adapts the
 * JSON boundary to typed TypeScript objects.
 */

import { NeuralStateVector, NeuralStateVectorPatch } from '@/lib/types';
import { NsvServiceJs } from '@cortex-logic';

const _nsv = new NsvServiceJs();

export function createDefaultNSV(): NeuralStateVector {
  return JSON.parse(_nsv.createDefault()) as NeuralStateVector;
}

export function normalizeNSV(input?: Partial<NeuralStateVector> | null): NeuralStateVector {
  if (!input) return createDefaultNSV();
  return JSON.parse(_nsv.normalize(JSON.stringify(input))) as NeuralStateVector;
}

export function mergeNSV(
  current: NeuralStateVector | null | undefined,
  updates: Partial<NeuralStateVector>
): NeuralStateVector {
  return JSON.parse(
    _nsv.merge(JSON.stringify(current ?? {}), JSON.stringify(updates))
  ) as NeuralStateVector;
}

export function mergeNSVPatch(
  base: NeuralStateVectorPatch,
  updates: NeuralStateVectorPatch
): NeuralStateVectorPatch {
  return JSON.parse(_nsv.mergePatches(JSON.stringify(base), JSON.stringify(updates))) as NeuralStateVectorPatch;
}

export function formatNSVForPrompt(nsv: NeuralStateVector): string {
  return _nsv.formatForPrompt(JSON.stringify(nsv));
}

export function formatNSVForModulePrompt(
  nsv: NeuralStateVector,
  allowedPaths: string[]
): string {
  return _nsv.formatForModulePrompt(JSON.stringify(nsv), JSON.stringify(allowedPaths));
}

export function formatNSVForAtlasPlanner(nsv: NeuralStateVector): string {
  return _nsv.formatForAtlasPlanner(JSON.stringify(nsv));
}
