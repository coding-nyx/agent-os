import { ModuleId } from '@/lib/module-manifest';
import { GlobalProjection, NeuralStateVector } from '@/lib/types';
import { createDefaultNSV, normalizeNSV } from './nsv-service';

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
  | 'resource.financialFriction'
  | 'resource.resonanceROI';

export const NSV_OWNERSHIP: Record<ModuleId, NSVMetricPath[]> = {
  orchestrator: [],
  agnes: ['emotional.emotionalResilience', 'emotional.stressLoad', 'emotional.moodTrend', 'emotional.traumaMarkers'],
  titan: ['biological.cnsFatigue', 'biological.sleepQuality', 'biological.recoveryScore', 'biological.hormonalContext'],
  soma: [],
  ledger: ['resource.financialFriction', 'resource.resonanceROI'],
  atlas: ['cognitive.energyBudget', 'cognitive.focusScore', 'cognitive.activeLoad', 'cognitive.planningLoad', 'cognitive.taskCompletionRate', 'planning.streakHealth', 'planning.deadlinePressure'],
  scout: ['cognitive.researchLoad', 'cognitive.interestDiversity'],
  forge: [],
  documents: [],
  bridge: []
};

/**
 * NSV_READ_PERMISSIONS defines which NSV fields each module's LLM system prompt receives.
 *
 * Principle: minimum viable context.
 * - Nexus (orchestrator) reads ALL fields for cross-domain synthesis.
 * - Clinical fields (traumaMarkers) go ONLY to Agnes — the sole module with therapeutic mandate.
 * - Biological context (hormonalContext) goes to clinically relevant modules only.
 * - Financial data goes to Ledger + Atlas (cognitive overhead) + Agnes (therapy relevance).
 * - Forge receives cognitive performance signals only — it is a productivity tool, not wellness.
 *
 * This matrix is consumed by `formatNSVForModulePrompt()` in nsv-service.ts and
 * `enhanceContextForModule()` in global-soul-context.tsx.
 */
export const NSV_READ_PERMISSIONS: Record<ModuleId, NSVMetricPath[]> = {
  orchestrator: [
    // Full read — Nexus synthesises across all domains
    'biological.cnsFatigue',
    'biological.sleepQuality',
    'biological.recoveryScore',
    'biological.hormonalContext',
    'emotional.emotionalResilience',
    'emotional.stressLoad',
    'emotional.moodTrend',
    'emotional.traumaMarkers',
    'cognitive.energyBudget',
    'cognitive.focusScore',
    'cognitive.activeLoad',
    'cognitive.researchLoad',
    'cognitive.planningLoad',
    'cognitive.taskCompletionRate',
    'cognitive.interestDiversity',
    'planning.streakHealth',
    'planning.deadlinePressure',
    'resource.financialFriction',
    'resource.resonanceROI'
  ],
  agnes: [
    // Emotional primary domain + bio signals that affect psychology
    // NOTE: Agnes is the ONLY module that receives traumaMarkers
    'biological.cnsFatigue',          // fatigue narrows emotional bandwidth
    'biological.sleepQuality',        // sleep quality is therapy-critical
    'biological.hormonalContext',     // hormonal cycles amplify emotional experiences
    'emotional.emotionalResilience',  // primary domain
    'emotional.stressLoad',           // primary domain
    'emotional.moodTrend',            // primary domain
    'emotional.traumaMarkers',        // CLINICAL EXCLUSIVE — Agnes only
    'cognitive.energyBudget',         // capacity for deep emotional processing
    'cognitive.activeLoad',           // current burden that therapy must work around
    'planning.streakHealth',          // streak breaks can trigger emotional distress
    'resource.financialFriction'      // financial stress IS a therapy entry point
  ],
  titan: [
    // Physical performance — needs bio capacity + emotional signals for intensity decisions
    'biological.cnsFatigue',          // primary domain
    'biological.sleepQuality',        // primary domain
    'biological.recoveryScore',       // absorbed from Soma
    'biological.hormonalContext',     // absorbed from Soma
    'emotional.emotionalResilience',  // low resilience → reduce training intensity
    'emotional.stressLoad',           // high stress → recovery takes priority
    'emotional.moodTrend',            // absorbed from Soma reads — mood affects recovery
    'cognitive.energyBudget'          // total energy available for physical output
  ],
  soma: [],
  atlas: [
    // Cognitive planner — needs broad picture to schedule intelligently
    // Does NOT receive traumaMarkers — scheduling is not a clinical activity
    'biological.cnsFatigue',          // schedule intensity calibration
    'biological.sleepQuality',        // morning task feasibility
    'biological.recoveryScore',       // recovery window scheduling
    'emotional.emotionalResilience',  // task difficulty adjustment
    'emotional.stressLoad',           // buffer scheduling
    'emotional.moodTrend',            // pacing decisions
    'cognitive.energyBudget',         // primary domain
    'cognitive.focusScore',           // primary domain
    'cognitive.activeLoad',           // primary domain
    'cognitive.researchLoad',         // total cognitive load computation
    'cognitive.planningLoad',         // primary domain
    'cognitive.taskCompletionRate',   // habit/completion tracking
    'planning.streakHealth',          // primary domain — habit streak management
    'planning.deadlinePressure',      // primary domain — deadline urgency
    'resource.financialFriction'      // financial friction adds hidden cognitive load (~2pts)
  ],
  scout: [
    // Research intelligence — lean context, cognitively-focused
    'biological.cnsFatigue',          // research capacity signal
    'cognitive.energyBudget',         // reading/learning capacity
    'cognitive.focusScore',           // deep research feasibility
    'cognitive.researchLoad',         // primary domain
    'cognitive.interestDiversity',    // primary domain — breadth of research interests
    'emotional.moodTrend'             // curiosity/engagement calibration
  ],
  ledger: [
    // Financial intelligence — resource domain + stress/energy for decision quality
    'resource.financialFriction',     // primary domain
    'resource.resonanceROI',          // primary domain
    'cognitive.energyBudget',         // decision fatigue affects financial choices
    'emotional.stressLoad'            // financial stress correlation
  ],
  forge: [
    // Productivity / code execution — cognitive performance signals only
    // Forge is cross-product: no emotional, hormonal, or financial data
    'biological.cnsFatigue',          // decision quality in code
    'biological.sleepQuality',        // cognitive sharpness
    'cognitive.energyBudget',         // coding session capacity
    'cognitive.focusScore',           // deep work feasibility
    'cognitive.activeLoad'            // parallel task burden
  ],
  documents: [],
  bridge: []   // Bridge is a connectivity layer — no LLM
};

export function getMetricOwner(metric: NSVMetricPath): ModuleId {
  const entry = Object.entries(NSV_OWNERSHIP).find(([, metrics]) => metrics.includes(metric));
  return (entry?.[0] as ModuleId) || 'orchestrator';
}

export const NSV_DERIVED_METRICS: NSVMetricPath[] = [
  'cognitive.activeLoad',
  'cognitive.researchLoad',
  'cognitive.planningLoad',
  'cognitive.taskCompletionRate',
  'cognitive.interestDiversity',
  'planning.streakHealth',
  'planning.deadlinePressure',
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
  'cognitive.planningLoad': 'How many open, uncommitted tasks or plans do you have in your head right now (0-10)?',
  'cognitive.taskCompletionRate': 'Roughly what fraction of tasks you planned this week did you complete (0.0–1.0)?',
  'cognitive.interestDiversity': 'How broad are your active research interests right now (0-10, low = hyperfocused on one thing)?',
  'planning.streakHealth': 'How well are you maintaining your daily habits and streaks (0-10)?',
  'planning.deadlinePressure': 'How much deadline pressure do you feel right now (0-10)?',
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

export function filterNSVForModule(
  nsv: NeuralStateVector | null | undefined,
  moduleId: ModuleId
): NeuralStateVector {
  const allowedPaths = NSV_READ_PERMISSIONS[moduleId] ?? [];
  const allowed = new Set<NSVMetricPath>(allowedPaths);

  // If nothing is allowed for the module, return an empty/default NSV to avoid leaking data.
  if (allowed.size === 0) {
    return createDefaultNSV();
  }

  const source = normalizeNSV(nsv);
  const filtered: any = {
    biological: {},
    emotional: {},
    cognitive: {},
    planning: {},
    resource: {},
    lastUpdated: {}
  };

  const copyMetric = (path: NSVMetricPath) => {
    const [root, leaf] = path.split('.') as [keyof NeuralStateVector, string];
    const rootVal = (source as Record<string, any>)[root];
    if (!rootVal || typeof rootVal !== 'object') return;
    const value = rootVal[leaf];
    if (value === undefined) return;
    if (!(filtered as Record<string, any>)[root]) {
      (filtered as Record<string, any>)[root] = {};
    }
    (filtered as Record<string, any>)[root][leaf] = value;
  };

  allowed.forEach(copyMetric);

  filtered.lastUpdated = Object.entries(source.lastUpdated || {}).reduce<Record<string, string>>(
    (acc, [metric, stamp]) => {
      if (allowed.has(metric as NSVMetricPath)) {
        acc[metric] = stamp;
      }
      return acc;
    },
    {}
  );

  // normalizeNSV merges defaults and binds legacy aliases without reintroducing redacted fields.
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
  if (!lastUpdated) return true;
  const stamp = new Date(lastUpdated).getTime();
  if (Number.isNaN(stamp)) return true;
  const ageMs = Date.now() - stamp;
  return ageMs > thresholdDays * 24 * 60 * 60 * 1000;
}
