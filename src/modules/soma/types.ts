// --- Soma Module Types (Sovereign Data Layer — Path C+ Phase 1) ---
//
// SomaProfile owns all medical/health data independently of TitanProfile.
// During the dual-write phase both types coexist; TitanProfile is NOT modified.

import type {
  BiomarkerRecord,
  ClearanceRecord,
  LabSummaryRecord,
  MedicalImageAnalysis,
  SomaProfile as CoreSomaProfile,
  AgentReview,
  VitalReading,
  PhysicalAssessment,
} from '@/lib/types';

// Re-export sub-types for downstream consumers that import from soma/types
export type { BiomarkerRecord, ClearanceRecord, LabSummaryRecord, MedicalImageAnalysis, AgentReview, VitalReading, PhysicalAssessment };

export type SomaProfile = CoreSomaProfile;

/**
 * Read-only cross-module view of Soma health data.
 * Consumed by Titan, Agnes, Atlas, etc. via SomaDataService (future).
 * Intentionally a strict subset — no IDs, no encryption envelope.
 */
export interface SomaHealthSnapshot {
  readonly knownConditions: readonly string[];
  readonly medications: readonly string[];
  readonly allergies: readonly string[];
  readonly biomarkers: readonly BiomarkerRecord[];
  readonly labSummaries: readonly LabSummaryRecord[];
  readonly clearances: readonly ClearanceRecord[];
  readonly medicalImageAnalyses: readonly MedicalImageAnalysis[];
  readonly medicalSummary?: string;
  readonly medicalOnboardingComplete?: boolean;
  /** ISO-8601 timestamp of the snapshot source */
  readonly snapshotAt: string;
}

/**
 * Input payload for computing Soma readiness scores.
 * Used by readiness algorithms and Spine event emitters.
 */
export interface SomaReadinessInput {
  clearances: ClearanceRecord[];
  biomarkers: BiomarkerRecord[];
  knownConditions: string[];
  medications: string[];
  /** Optional recent sleep hours for fatigue weighting */
  recentSleepHours?: number;
  /** Optional CNS fatigue score from NSV */
  cnsFatigue?: number | null;
}
