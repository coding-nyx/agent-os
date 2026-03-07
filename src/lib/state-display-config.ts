import type { SpineEventType } from '@/lib/types';
import type { StatusTone } from '@/modules/hub/constants';
import type { NSVMetricPath } from '@/lib/services/nsv-ownership';
import {
  Heart,
  Brain,
  Sparkles,
  Waves
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Domain Pillar Configuration
// Centralizes the mapping from NSV domains to user-facing pillar language.
// ---------------------------------------------------------------------------

export interface DomainPillarConfig {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;       // Tailwind color name (e.g. 'emerald')
  metrics: NSVMetricPath[];
  words: Record<StatusTone, string>;
  owners: string[];           // Module IDs that own metrics in this domain
  /** Some metrics are inverse (high = bad), list them here */
  invertedMetrics: NSVMetricPath[];
}

export const DOMAIN_PILLARS: Record<string, DomainPillarConfig> = {
  biological: {
    label: 'Body',
    icon: Heart,
    accentColor: 'emerald',
    metrics: ['biological.recoveryScore', 'biological.sleepQuality', 'biological.cnsFatigue'],
    words: { good: 'Strong', warn: 'Tired', bad: 'Drained', neutral: '—' },
    owners: ['soma', 'titan'],
    invertedMetrics: ['biological.cnsFatigue']
  },
  cognitive: {
    label: 'Mind',
    icon: Brain,
    accentColor: 'sky',
    metrics: ['cognitive.energyBudget', 'cognitive.focusScore', 'cognitive.activeLoad'],
    words: { good: 'Sharp', warn: 'Foggy', bad: 'Overloaded', neutral: '—' },
    owners: ['atlas'],
    invertedMetrics: ['cognitive.activeLoad']
  },
  emotional: {
    label: 'Heart',
    icon: Sparkles,
    accentColor: 'indigo',
    metrics: ['emotional.emotionalResilience', 'emotional.stressLoad'],
    words: { good: 'Resilient', warn: 'Tender', bad: 'Low', neutral: '—' },
    owners: ['agnes'],
    invertedMetrics: ['emotional.stressLoad']
  },
  resource: {
    label: 'Flow',
    icon: Waves,
    accentColor: 'cyan',
    metrics: ['resource.financialFriction', 'resource.resonanceROI'],
    words: { good: 'Aligned', warn: 'Friction', bad: 'Stressed', neutral: '—' },
    owners: ['ledger'],
    invertedMetrics: ['resource.financialFriction']
  }
} as const;

export const DOMAIN_ORDER = ['biological', 'cognitive', 'emotional', 'resource'] as const;

// ---------------------------------------------------------------------------
// Spine Event Display Names
// Translate technical event types into user-facing language.
// ---------------------------------------------------------------------------

export const EVENT_DISPLAY_NAMES: Record<SpineEventType, string> = {
  VITAL_UPDATED: 'Vitals synced',
  REDUCE_TRAINING_LOAD: 'Training load reduced',
  BLOCK_HIGH_INTENSITY: 'High intensity blocked',
  FLATTEN_ENERGY_WAVE: 'Schedule lightened',
  RECOVERY_AVAILABLE: 'Recovery window opened',
  BURNOUT_WARNING: 'Burnout risk detected',
  CLEARANCE_DENIED: 'Activity clearance denied',
  CLEARANCE_GRANTED: 'Activity cleared',
  COGNITIVE_OVERLOAD: 'Cognitive overload detected',
  SECURITY_POLICY_UPDATED: 'Security settings updated',
  FINANCIAL_STRESS: 'Financial stress flagged',
  MEDICAL_ALERT: 'Medical alert',
  DRAFT_PROPOSED: 'Suggestion proposed',
  DRAFT_APPROVED: 'Suggestion approved',
  DRAFT_DISMISSED: 'Suggestion dismissed',
  SESSION_STARTED: 'Session started',
  SESSION_ENDED: 'Session ended',
  MODULE_DELEGATED: 'Handed off to another module'
};

// ---------------------------------------------------------------------------
// Composite Score Helpers
// ---------------------------------------------------------------------------

import { getMetricValue } from '@/lib/services/nsv-ownership';
import type { NeuralStateVector } from '@/lib/types';
import type { TrendDirection } from '@/core/components/TrendArrow';

/**
 * Computes a composite word-state and tone for a given domain pillar.
 * Inverted metrics (where high = bad) are flipped before averaging.
 */
export function computePillarState(
  nsv: NeuralStateVector | null | undefined,
  domain: string
): { word: string; tone: StatusTone; average: number | null } {
  const pillar = DOMAIN_PILLARS[domain];
  if (!pillar || !nsv) {
    return { word: pillar?.words.neutral ?? '—', tone: 'neutral', average: null };
  }

  const values: number[] = [];

  for (const metricPath of pillar.metrics) {
    const raw = getMetricValue(nsv, metricPath);
    if (typeof raw !== 'number' || Number.isNaN(raw)) continue;

    const isInverted = pillar.invertedMetrics.includes(metricPath);
    values.push(isInverted ? 10 - raw : raw);
  }

  if (values.length === 0) {
    return { word: pillar.words.neutral, tone: 'neutral', average: null };
  }

  const average = values.reduce((a, b) => a + b, 0) / values.length;

  let tone: StatusTone;
  if (average >= 7) tone = 'good';
  else if (average >= 4) tone = 'warn';
  else tone = 'bad';

  return { word: pillar.words[tone], tone, average };
}

// ---------------------------------------------------------------------------
// Brief Sentence Templates
// ---------------------------------------------------------------------------

interface BriefContext {
  name: string;
  pillars: Record<string, { tone: StatusTone; trend: TrendDirection }>;
  moduleNames: Record<string, string>;
}

export function generateBriefSentence(ctx: BriefContext): string {
  const { name, pillars, moduleNames } = ctx;
  const agnesName = moduleNames.agnes || 'Agnes';
  const atlasName = moduleNames.atlas || 'Atlas';
  const somaName = moduleNames.soma || 'Soma';

  const bodyTone = pillars.biological?.tone ?? 'neutral';
  const heartTone = pillars.emotional?.tone ?? 'neutral';
  const mindTone = pillars.cognitive?.tone ?? 'neutral';

  // All calibrated
  const allNeutral = Object.values(pillars).every(p => p.tone === 'neutral');
  if (allNeutral) {
    return `Some of your vitals haven't been calibrated yet. Chat with your modules to sync up.`;
  }

  // Burnout risk
  if (bodyTone === 'bad' && heartTone === 'bad') {
    return `Fatigue is high and resilience is low. Your modules have coordinated to protect your energy. Please rest, ${name}.`;
  }

  // Body good, heart struggling
  if (bodyTone === 'good' && heartTone === 'bad') {
    return `Your body is recovering well, but emotional resilience dipped. ${agnesName} noticed — she's here if you want to talk.`;
  }

  // Body bad
  if (bodyTone === 'bad') {
    return `You're in recovery mode. ${somaName} is monitoring your bounce-back. Go easy today.`;
  }

  // Mind overloaded
  if (mindTone === 'bad') {
    return `Energy is running low today. ${atlasName} has prioritized only your essential tasks.`;
  }

  // All good
  if (bodyTone === 'good' && heartTone === 'good' && mindTone === 'good') {
    return `Everything is looking good today, ${name}. All systems are stable.`;
  }

  // Mild caution
  return `You're holding steady, ${name}. Keep an eye on anything flagged below.`;
}
