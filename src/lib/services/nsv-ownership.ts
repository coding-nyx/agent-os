import { ModuleId } from '@/lib/module-manifest';
import { NeuralStateVector } from '@/lib/types';

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
  | 'resource.financialFriction'
  | 'resource.resonanceROI';

export const NSV_OWNERSHIP: Record<ModuleId, NSVMetricPath[]> = {
  orchestrator: [],
  therapy: ['emotional.emotionalResilience', 'emotional.stressLoad', 'emotional.moodTrend', 'emotional.traumaMarkers'],
  trainer: ['biological.cnsFatigue', 'biological.sleepQuality'],
  soma: ['biological.recoveryScore', 'biological.hormonalContext'],
  ledger: ['resource.financialFriction', 'resource.resonanceROI'],
  atlas: ['cognitive.energyBudget', 'cognitive.focusScore', 'cognitive.activeLoad'],
  scout: ['cognitive.researchLoad'],
  forge: [],
  pulse: [],
  bridge: []
};

export function getMetricOwner(metric: NSVMetricPath): ModuleId {
  const entry = Object.entries(NSV_OWNERSHIP).find(([, metrics]) => metrics.includes(metric));
  return (entry?.[0] as ModuleId) || 'orchestrator';
}

export const NSV_DERIVED_METRICS: NSVMetricPath[] = [
  'cognitive.activeLoad',
  'cognitive.researchLoad'
];

export const NSV_CALIBRATION_PROMPTS: Record<NSVMetricPath, string> = {
  'biological.cnsFatigue': 'On a 0-10 scale, how fatigued does your CNS feel right now?',
  'biological.sleepQuality': 'How would you rate your last sleep quality from 0-10?',
  'biological.recoveryScore': 'What is your current recovery score (0-10) if you have one?',
  'biological.hormonalContext': 'Any notable hormonal context or cycle phase to note right now?',
  'emotional.emotionalResilience': 'On a 0-10 scale, how resilient do you feel today?',
  'emotional.stressLoad': 'On a 0-10 scale, how elevated is your stress load?',
  'emotional.moodTrend': 'What is your current mood trend (e.g., stable, improving, declining)?',
  'emotional.traumaMarkers': 'Any trauma markers or triggers to log, or should I mark none for now?',
  'cognitive.energyBudget': 'What is your current energy budget (0-10)?',
  'cognitive.focusScore': 'How would you rate your focus today (0-10)?',
  'cognitive.activeLoad': 'How heavy is your task load right now (0-10)?',
  'cognitive.researchLoad': 'How intense is your research load right now (0-10)?',
  'resource.financialFriction': 'How much financial friction do you feel right now (0-10)?',
  'resource.resonanceROI': 'What is your current resonance ROI (0-1 or percentage)?'
};

export function buildCalibrationPrompt(moduleId: ModuleId): string {
  const owned = NSV_OWNERSHIP[moduleId] ?? [];
  if (owned.length === 0) {
    return 'Calibration required. Share any missing vital metrics for this domain.';
  }
  const lines = owned.map((metric) => `- ${NSV_CALIBRATION_PROMPTS[metric] ?? metric}`);
  return ['Calibration required. Please provide:', ...lines].join('\n');
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
  if (!lastUpdated) return true;
  const stamp = new Date(lastUpdated).getTime();
  if (Number.isNaN(stamp)) return true;
  const ageMs = Date.now() - stamp;
  return ageMs > thresholdDays * 24 * 60 * 60 * 1000;
}
