import { z } from 'zod';

// --- NSV (Neural State Vector) ---

export const BiologicalStateSchema = z.object({
  cnsFatigue: z.number().nullable(),
  sleepQuality: z.number().nullable(),
  recoveryScore: z.number().nullable().optional(),
  hormonalContext: z.string().nullable().optional(),
  weight: z.number().nullable().optional(),
  bodyFatPct: z.number().nullable().optional(),
  aerobicLoad: z.number().nullable().optional(),
  heartRate: z.number().nullable().optional(),
  hrv: z.number().nullable().optional(),
  readinessScore: z.number().nullable().optional(),
  lastSessionTimestamp: z.number().nullable().optional(),
});

export const EmotionalStateSchema = z.object({
  emotionalResilience: z.number().nullable(),
  stressLoad: z.number().nullable().optional(),
  moodTrend: z.string().nullable().optional(),
  traumaMarkers: z.array(z.string()).nullable().optional(),
});

export const CognitiveStateSchema = z.object({
  energyBudget: z.number().nullable().optional(),
  focusScore: z.number().nullable().optional(),
  activeLoad: z.number().nullable().optional(),
  researchLoad: z.number().nullable().optional(),
  planningLoad: z.number().nullable().optional(),
  taskCompletionRate: z.number().nullable().optional(),
});

export const PlanningStateSchema = z.object({
  streakHealth: z.number().nullable().optional(),
  deadlinePressure: z.number().nullable().optional(),
  reflectionStreak: z.number().optional(),
});

export const ResourceStateSchema = z.object({
  financialFriction: z.number().nullable().optional(),
  resonanceROI: z.number().nullable().optional(),
});

export const NeuralStateVectorSchema = z.object({
  biological: BiologicalStateSchema,
  emotional: EmotionalStateSchema,
  cognitive: CognitiveStateSchema,
  planning: PlanningStateSchema,
  resource: ResourceStateSchema,
  version: z.number(),
  lastUpdated: z.record(z.string(), z.string()),
});

// --- Module Profiles ---

/** Titan / TrainerProfile */
export const TrainerProfileSchema = z.object({
  onboardingComplete: z.boolean(),
  summary: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).passthrough();

/** Atlas / AtlasProfile */
export const AtlasProfileSchema = z.object({
  onboardingComplete: z.boolean(),
  summary: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).passthrough();

/** Ledger / LedgerIntakeProfile */
export const LedgerProfileSchema = z.object({
  onboardingComplete: z.boolean(),
  currency: z.string(),
  monthlyIncome: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).passthrough();

/** Soma / SomaProfile */
export const SomaProfileSchema = z.object({
  onboardingComplete: z.boolean().optional(),
  knownConditions: z.array(z.string()),
  medications: z.array(z.string()),
  allergies: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
}).passthrough();

export const PROFILE_SCHEMAS: Record<string, z.ZodSchema> = {
  nsv: NeuralStateVectorSchema,
  titan_profile: TrainerProfileSchema,
  atlas_profile: AtlasProfileSchema,
  ledger_profile: LedgerProfileSchema,
  soma_profile: SomaProfileSchema,
};

// --- Validator Utility ---

export function validateAndReportDrift(key: string, data: unknown): unknown {
  const schema = PROFILE_SCHEMAS[key];
  if (!schema) return data;

  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(`[CortexBridge] Type drift detected in ${key}:`, result.error.format());
    // In production, we still return the data to avoid breaking the app,
    // but the console warning identifies the need for a sync with KMP.
    return data;
  }
  return result.data;
}
