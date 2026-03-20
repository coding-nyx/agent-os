import type { TitanRecoveryBodyRegion, TitanRecoveryType } from '@/lib/types';

export interface RecoveryTemplate {
  id: string;
  type: TitanRecoveryType;
  label: string;
  description: string;
  suggestedDurationDays: number;
  steps: string[];
}

const baseTemplates: Record<TitanRecoveryType, RecoveryTemplate> = {
  rest: {
    id: 'rest-core',
    type: 'rest',
    label: 'Complete Rest',
    description: 'Focus on sleep, nutrition, and reducing load.',
    suggestedDurationDays: 5,
    steps: [
      'Prioritize 8–9 hours of sleep and consistent sleep timing.',
      'Keep daily activity light (short walks, gentle mobility only).',
      'Hydrate and maintain protein intake to support recovery.',
      'Avoid heavy training or high-intensity intervals.'
    ]
  },
  active: {
    id: 'active-core',
    type: 'active',
    label: 'Active Recovery',
    description: 'Low-intensity work to improve circulation and readiness.',
    suggestedDurationDays: 5,
    steps: [
      'Do 20–40 minutes of zone-2 cardio or brisk walking.',
      'Mobility flow 10–15 minutes focusing on hips/shoulders/spine.',
      'Light bodyweight or banded activation work (RPE ≤ 5).',
      'Keep total volume under 50% of normal training.'
    ]
  },
  rehab: {
    id: 'rehab-core',
    type: 'rehab',
    label: 'Rehab Protocol',
    description: 'Structured rehab flow with progressive loading.',
    suggestedDurationDays: 14,
    steps: [
      'Limit aggravating movement patterns.',
      'Perform pain-free range of motion and isometrics.',
      'Progress to light eccentrics if tolerated.',
      'Reassess daily before increasing load.'
    ]
  },
  deload: {
    id: 'deload-core',
    type: 'deload',
    label: 'Reduced Load (Deload)',
    description: 'Maintain training pattern while lowering intensity.',
    suggestedDurationDays: 7,
    steps: [
      'Reduce volume to 50–60% of normal.',
      'Keep intensity moderate, avoid max effort.',
      'Emphasize technique and tempo control.',
      'Schedule extra rest day mid-week.'
    ]
  }
};

const rehabByRegion: Record<TitanRecoveryBodyRegion, RecoveryTemplate> = {
  knee: {
    id: 'rehab-knee',
    type: 'rehab',
    label: 'Knee Rehab',
    description: 'Quad/hip stability + pain-free ROM progression.',
    suggestedDurationDays: 21,
    steps: [
      'Isometric quad holds (30–45s) and glute bridges.',
      'Pain-free knee ROM drills (heel slides, terminal knee extension).',
      'Progress to step-ups and split squats if tolerated.',
      'Avoid deep flexion under load until pain resolves.'
    ]
  },
  shoulder: {
    id: 'rehab-shoulder',
    type: 'rehab',
    label: 'Shoulder Rehab',
    description: 'Rotator cuff + scapular stability emphasis.',
    suggestedDurationDays: 21,
    steps: [
      'Scapular retraction and external rotation isometrics.',
      'Light banded rotations and face pulls.',
      'Progress to controlled overhead range of motion.',
      'Avoid heavy pressing until pain-free.'
    ]
  },
  back: {
    id: 'rehab-back',
    type: 'rehab',
    label: 'Back Rehab',
    description: 'Core stability and hip hinge re-patterning.',
    suggestedDurationDays: 21,
    steps: [
      'McGill Big 3 (bird dog, side plank, curl-up).',
      'Hip hinge drills with neutral spine.',
      'Light reverse hypers or glute bridges if tolerated.',
      'Avoid high-load spinal compression.'
    ]
  },
  hip: {
    id: 'rehab-hip',
    type: 'rehab',
    label: 'Hip Rehab',
    description: 'Glute med activation + mobility.',
    suggestedDurationDays: 14,
    steps: [
      'Clamshells and lateral band walks.',
      'Hip mobility: 90/90 flows and gentle stretches.',
      'Progress to step-ups or split squats as tolerated.',
      'Avoid deep flexion under heavy load.'
    ]
  },
  ankle: {
    id: 'rehab-ankle',
    type: 'rehab',
    label: 'Ankle Rehab',
    description: 'Mobility + stability work.',
    suggestedDurationDays: 14,
    steps: [
      'Ankle mobility (knee-over-toe drills).',
      'Single-leg balance and calf raises.',
      'Progress to controlled plyo only if pain-free.',
      'Avoid high-impact jumps early.'
    ]
  },
  wrist: {
    id: 'rehab-wrist',
    type: 'rehab',
    label: 'Wrist Rehab',
    description: 'Tendon-friendly loading and mobility.',
    suggestedDurationDays: 14,
    steps: [
      'Wrist flexion/extension isometrics.',
      'Gentle mobility through pain-free range.',
      'Progress to light grip work if tolerated.',
      'Avoid heavy pressing and loaded extensions.'
    ]
  },
  neck: {
    id: 'rehab-neck',
    type: 'rehab',
    label: 'Neck Rehab',
    description: 'Posture + cervical stability.',
    suggestedDurationDays: 14,
    steps: [
      'Chin tucks and deep neck flexor holds.',
      'Gentle cervical mobility (no end-range pain).',
      'Upper back mobility to reduce load.',
      'Avoid heavy axial compression.'
    ]
  },
  other: {
    id: 'rehab-general',
    type: 'rehab',
    label: 'General Rehab',
    description: 'Pain-free movement progression.',
    suggestedDurationDays: 14,
    steps: [
      'Identify pain-free movement ranges.',
      'Isometrics and light tempo control.',
      'Progress gradually to full ROM.',
      'Stop if pain exceeds mild discomfort.'
    ]
  }
};

export function getRecoveryTemplate(
  type: TitanRecoveryType,
  bodyRegion?: TitanRecoveryBodyRegion
): RecoveryTemplate {
  if (type === 'rehab' && bodyRegion) {
    return rehabByRegion[bodyRegion] ?? rehabByRegion.other;
  }
  return baseTemplates[type];
}

export const RECOVERY_TEMPLATE_LABELS: Record<TitanRecoveryType, string> = {
  rest: 'Complete Rest',
  active: 'Active Recovery',
  rehab: 'Rehab Protocol',
  deload: 'Reduced Load'
};
