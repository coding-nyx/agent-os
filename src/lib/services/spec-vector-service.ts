/**
 * Spec vector calculations — thin bridge over cortex-logic's SpecVectorCalculatorJs.
 *
 * All five composite vectors (resilience, bandwidth, vitality, output, friction)
 * are computed in KMP commonMain (SpecVectorCalculator.kt) so both Agnes and
 * nexus-android produce identical values from the same NeuralStateVector.
 *
 * Public API is unchanged: callers pass a plain TS NeuralStateVector and receive
 * plain JS objects. The JSON string round-trip is contained here.
 */

import type { NeuralStateVector } from '@/lib/types';
import type { SpecVectorKey } from '@/lib/contracts/orchestration';
import { NeuralStateVectorJs, SpecVectorCalculatorJs } from '@cortex-logic';

const calculator = new SpecVectorCalculatorJs();

function toNsvJs(nsv: NeuralStateVector): NeuralStateVectorJs {
  return new NeuralStateVectorJs(JSON.stringify(nsv));
}

export interface SpecVectorSnapshot {
  resilience: number | null;
  bandwidth: number | null;
  vitality: number | null;
  output: number | null;
  friction: number | null;
}

export interface SpecVectorBreakdown {
  vector: SpecVectorKey;
  value: number | null;
  inputs: Array<{ key: string; value: number }>;
  notes: string[];
}

export function selectResilience(nsv: NeuralStateVector): number | null {
  return calculator.selectResilience(toNsvJs(nsv)) ?? null;
}

export function selectBandwidth(nsv: NeuralStateVector): number | null {
  return calculator.selectBandwidth(toNsvJs(nsv)) ?? null;
}

export function selectVitality(nsv: NeuralStateVector): number | null {
  return calculator.selectVitality(toNsvJs(nsv)) ?? null;
}

export function selectOutput(nsv: NeuralStateVector): number | null {
  return calculator.selectOutput(toNsvJs(nsv)) ?? null;
}

export function selectFriction(nsv: NeuralStateVector): number | null {
  return calculator.selectFriction(toNsvJs(nsv)) ?? null;
}

export function getSpecVectorSnapshot(nsv: NeuralStateVector): SpecVectorSnapshot {
  const snap = calculator.getSnapshot(toNsvJs(nsv));
  return {
    resilience: snap.resilience ?? null,
    bandwidth: snap.bandwidth ?? null,
    vitality: snap.vitality ?? null,
    output: snap.output ?? null,
    friction: snap.friction ?? null,
  };
}

export function getSpecVectorBreakdown(nsv: NeuralStateVector): SpecVectorBreakdown[] {
  return Array.from(calculator.getBreakdown(toNsvJs(nsv))).map((bd) => ({
    vector: bd.vector as SpecVectorKey,
    value: bd.value ?? null,
    inputs: Array.from(bd.inputs).map((entry) => ({ key: entry.key, value: entry.value })),
    notes: Array.from(bd.notes),
  }));
}
