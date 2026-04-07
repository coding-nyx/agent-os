/**
 * NSV Service — thin bridge over cortex-logic's NsvServiceJs.
 *
 * Core algorithms (normalize, merge, format) live in KMP commonMain so both
 * Agnes and nexus-android produce identical results. This bridge adapts the
 * JSON boundary to typed TypeScript objects.
 *
 * Type coercion (e.g. string-in-numeric-field from corrupted Firestore data)
 * is handled inside KMP's NsvService.normalize() via coerceField(), and all
 * JS facade deserializers use coerceInputValues=true. The TS layer only needs
 * try/catch safety nets to prevent uncaught exceptions from crashing components.
 */

import { NeuralStateVector, NeuralStateVectorPatch } from '@/lib/types';
import { NsvServiceJs } from '@cortex-logic';

const _nsv = new NsvServiceJs();

export function createDefaultNSV(): NeuralStateVector {
  return JSON.parse(_nsv.createDefault()) as NeuralStateVector;
}

export function normalizeNSV(input?: Partial<NeuralStateVector> | null): NeuralStateVector {
  if (!input) return createDefaultNSV();
  try {
    return JSON.parse(_nsv.normalize(JSON.stringify(input))) as NeuralStateVector;
  } catch (err) {
    console.error('[NSV] normalizeNSV: KMP deserialization failed, returning default NSV', err);
    return createDefaultNSV();
  }
}

export function mergeNSV(
  current: NeuralStateVector | null | undefined,
  updates: Partial<NeuralStateVector>
): NeuralStateVector {
  try {
    return JSON.parse(
      _nsv.merge(JSON.stringify(current ?? {}), JSON.stringify(updates))
    ) as NeuralStateVector;
  } catch (err) {
    console.error('[NSV] mergeNSV: KMP deserialization failed, returning normalized current', err);
    return normalizeNSV(current);
  }
}

export function mergeNSVPatch(
  base: NeuralStateVectorPatch,
  updates: NeuralStateVectorPatch
): NeuralStateVectorPatch {
  try {
    return JSON.parse(_nsv.mergePatches(JSON.stringify(base), JSON.stringify(updates))) as NeuralStateVectorPatch;
  } catch (err) {
    console.error('[NSV] mergeNSVPatch: KMP deserialization failed, returning base patch', err);
    return base;
  }
}

export function formatNSVForPrompt(nsv: NeuralStateVector): string {
  try {
    return _nsv.formatForPrompt(JSON.stringify(nsv));
  } catch (err) {
    console.error('[NSV] formatNSVForPrompt: KMP failed, returning empty string', err);
    return '';
  }
}

export function formatNSVForModulePrompt(
  nsv: NeuralStateVector,
  allowedPaths: string[]
): string {
  try {
    return _nsv.formatForModulePrompt(
      JSON.stringify(nsv),
      JSON.stringify(allowedPaths),
    );
  } catch (err) {
    console.error('[NSV] formatNSVForModulePrompt: KMP failed, returning empty string', err);
    return '';
  }
}

export function formatNSVForAtlasPlanner(nsv: NeuralStateVector): string {
  try {
    return _nsv.formatForAtlasPlanner(JSON.stringify(nsv));
  } catch (err) {
    console.error('[NSV] formatNSVForAtlasPlanner: KMP failed, returning empty string', err);
    return '';
  }
}
