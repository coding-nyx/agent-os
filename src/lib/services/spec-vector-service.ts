import type { NeuralStateVector } from '@/lib/types';
import type { SpecVectorKey } from '@/lib/contracts/orchestration';

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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampTenPoint(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(10, value));
}

function invertTenPoint(value: number | null | undefined): number | null {
  const clamped = clampTenPoint(value);
  return clamped === null ? null : 10 - clamped;
}

function average(values: Array<number | null | undefined>): number | null {
  const defined = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (defined.length === 0) return null;
  return defined.reduce((sum, value) => sum + value, 0) / defined.length;
}

function normalizeTenPoint(value: number | null | undefined): number | null {
  const clamped = clampTenPoint(value);
  return clamped === null ? null : clamp01(clamped / 10);
}

export function selectResilience(nsv: NeuralStateVector): number | null {
  return normalizeTenPoint(nsv.emotional.emotionalResilience);
}

export function selectBandwidth(nsv: NeuralStateVector): number | null {
  const composite = average([
    clampTenPoint(nsv.cognitive.energyBudget),
    clampTenPoint(nsv.cognitive.focusScore),
    invertTenPoint(nsv.cognitive.activeLoad),
    invertTenPoint(nsv.cognitive.planningLoad),
    invertTenPoint(nsv.planning.deadlinePressure),
  ]);
  return composite === null ? null : clamp01(composite / 10);
}

export function selectVitality(nsv: NeuralStateVector): number | null {
  const composite = average([
    invertTenPoint(nsv.biological.cnsFatigue),
    clampTenPoint(nsv.biological.sleepQuality),
    clampTenPoint(nsv.biological.recoveryScore),
  ]);
  return composite === null ? null : clamp01(composite / 10);
}

export function selectOutput(nsv: NeuralStateVector): number | null {
  const composite = average([
    clampTenPoint(nsv.biological.recoveryScore),
    invertTenPoint(nsv.biological.cnsFatigue),
    invertTenPoint(nsv.biological.aerobicLoad),
    clampTenPoint(nsv.cognitive.energyBudget),
  ]);
  return composite === null ? null : clamp01(composite / 10);
}

export function selectFriction(nsv: NeuralStateVector): number | null {
  return normalizeTenPoint(nsv.resource.financialFriction);
}

export function getSpecVectorSnapshot(nsv: NeuralStateVector): SpecVectorSnapshot {
  return {
    resilience: selectResilience(nsv),
    bandwidth: selectBandwidth(nsv),
    vitality: selectVitality(nsv),
    output: selectOutput(nsv),
    friction: selectFriction(nsv),
  };
}

export function getSpecVectorBreakdown(nsv: NeuralStateVector): SpecVectorBreakdown[] {
  return [
    {
      vector: 'resilience',
      value: selectResilience(nsv),
      inputs: [{ key: 'emotional.emotionalResilience', value: nsv.emotional.emotionalResilience ?? 0 }].filter(
        (entry) => typeof entry.value === 'number',
      ),
      notes: ['Directly mapped from the current emotional resilience metric.'],
    },
    {
      vector: 'bandwidth',
      value: selectBandwidth(nsv),
      inputs: [
        ['cognitive.energyBudget', nsv.cognitive.energyBudget],
        ['cognitive.focusScore', nsv.cognitive.focusScore],
        ['cognitive.activeLoad_inverted', invertTenPoint(nsv.cognitive.activeLoad)],
        ['cognitive.planningLoad_inverted', invertTenPoint(nsv.cognitive.planningLoad)],
        ['planning.deadlinePressure_inverted', invertTenPoint(nsv.planning.deadlinePressure)],
      ]
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
        .map(([key, value]) => ({ key, value })),
      notes: ['Bandwidth is derived from both cognitive and planning signals.'],
    },
    {
      vector: 'vitality',
      value: selectVitality(nsv),
      inputs: [
        ['biological.cnsFatigue_inverted', invertTenPoint(nsv.biological.cnsFatigue)],
        ['biological.sleepQuality', clampTenPoint(nsv.biological.sleepQuality)],
        ['biological.recoveryScore', clampTenPoint(nsv.biological.recoveryScore)],
      ]
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
        .map(([key, value]) => ({ key, value })),
      notes: ['Vitality is an aggregate alias over biological readiness, not a stored base field.'],
    },
    {
      vector: 'output',
      value: selectOutput(nsv),
      inputs: [
        ['biological.recoveryScore', clampTenPoint(nsv.biological.recoveryScore)],
        ['biological.cnsFatigue_inverted', invertTenPoint(nsv.biological.cnsFatigue)],
        ['biological.aerobicLoad_inverted', invertTenPoint(nsv.biological.aerobicLoad)],
        ['cognitive.energyBudget', clampTenPoint(nsv.cognitive.energyBudget)],
      ]
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
        .map(([key, value]) => ({ key, value })),
      notes: ['Output is currently a compatibility aggregate because the platform lacks a first-class output metric.'],
    },
    {
      vector: 'friction',
      value: selectFriction(nsv),
      inputs: [{ key: 'resource.financialFriction', value: nsv.resource.financialFriction ?? 0 }].filter(
        (entry) => typeof entry.value === 'number',
      ),
      notes: ['Directly mapped from the current financial friction metric.'],
    },
  ];
}
