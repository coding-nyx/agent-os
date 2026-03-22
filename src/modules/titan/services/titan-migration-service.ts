/**
 * Titan Profile Migration Service
 *
 * Handles migration of deprecated fields to their canonical locations:
 * - Biomarker fields → SomaProfile (Phase 2: Q2 2026)
 * - workoutLogs → workoutSessions (Phase 2: Q4 2026)
 *
 * Run migrations at profile load time or via scheduled job.
 *
 * @module titan-migration-service
 */

import type { TitanProfile, SomaProfile, BiomarkerRecord, WorkoutSession } from '@/lib/types';

// ---------------------------------------------------------------------------
// Migration Status
// ---------------------------------------------------------------------------

export interface MigrationStatus {
  biomarkersMigrated: number;
  clearancesMigrated: number;
  workoutLogsMigrated: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Biomarker Migration (Titan → Soma)
// ---------------------------------------------------------------------------

/**
 * Checks if there are biomarkers in TitanProfile that should be in SomaProfile.
 * Returns biomarkers that exist in Titan but not in Soma.
 */
export function findUnmigratedBiomarkers(
  titanProfile: TitanProfile,
  somaProfile: SomaProfile | null
): BiomarkerRecord[] {
  const titanBiomarkers = titanProfile.biomarkers ?? [];
  if (titanBiomarkers.length === 0) return [];

  const somaBiomarkerIds = new Set(
    (somaProfile?.biomarkers ?? []).map((b) => b.id)
  );

  return titanBiomarkers.filter((b) => !somaBiomarkerIds.has(b.id));
}

/**
 * Returns true if the TitanProfile has deprecated medical fields that should
 * be migrated to SomaProfile.
 */
export function needsMedicalMigration(titanProfile: TitanProfile): boolean {
  return (
    (titanProfile.biomarkers?.length ?? 0) > 0 ||
    (titanProfile.labSummaries?.length ?? 0) > 0 ||
    (titanProfile.clearances?.length ?? 0) > 0 ||
    (titanProfile.medicalImageAnalyses?.length ?? 0) > 0 ||
    (titanProfile.knownConditions?.length ?? 0) > 0 ||
    (titanProfile.medications?.length ?? 0) > 0 ||
    (titanProfile.allergies?.length ?? 0) > 0
  );
}

// ---------------------------------------------------------------------------
// Workout Log Migration (workoutLogs → workoutSessions)
// ---------------------------------------------------------------------------

/**
 * Checks if there are workoutLogs that should be consolidated into workoutSessions.
 * Returns workout logs that don't have a corresponding session.
 */
export function findUnmigratedWorkoutLogs(
  titanProfile: TitanProfile
): { logIndex: number; date: string }[] {
  const workoutLogs = titanProfile.workoutLogs ?? [];
  if (workoutLogs.length === 0) return [];

  const sessionDates = new Set(
    (titanProfile.workoutSessions ?? []).map((s) => s.date)
  );

  return workoutLogs
    .map((log, index) => ({
      logIndex: index,
      date: log.date,
    }))
    .filter((item) => !sessionDates.has(item.date));
}

/**
 * Returns true if the TitanProfile has workout logs that should be migrated.
 */
export function needsWorkoutMigration(titanProfile: TitanProfile): boolean {
  return (titanProfile.workoutLogs?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Migration Summary
// ---------------------------------------------------------------------------

/**
 * Generates a migration summary for a TitanProfile.
 * Useful for displaying migration status in UI or logs.
 */
export function getMigrationSummary(
  titanProfile: TitanProfile,
  somaProfile: SomaProfile | null
): {
  needsMedicalMigration: boolean;
  needsWorkoutMigration: boolean;
  unmigratedBiomarkers: number;
  unmigratedWorkoutLogs: number;
  deprecatedFieldsInUse: string[];
} {
  const deprecatedFieldsInUse: string[] = [];

  if ((titanProfile.biomarkers?.length ?? 0) > 0) deprecatedFieldsInUse.push('biomarkers');
  if ((titanProfile.labSummaries?.length ?? 0) > 0) deprecatedFieldsInUse.push('labSummaries');
  if ((titanProfile.clearances?.length ?? 0) > 0) deprecatedFieldsInUse.push('clearances');
  if ((titanProfile.medicalImageAnalyses?.length ?? 0) > 0) deprecatedFieldsInUse.push('medicalImageAnalyses');
  if ((titanProfile.knownConditions?.length ?? 0) > 0) deprecatedFieldsInUse.push('knownConditions');
  if ((titanProfile.medications?.length ?? 0) > 0) deprecatedFieldsInUse.push('medications');
  if ((titanProfile.allergies?.length ?? 0) > 0) deprecatedFieldsInUse.push('allergies');
  if (titanProfile.medicalSummary) deprecatedFieldsInUse.push('medicalSummary');
  if ((titanProfile.workoutLogs?.length ?? 0) > 0) deprecatedFieldsInUse.push('workoutLogs');

  return {
    needsMedicalMigration: needsMedicalMigration(titanProfile),
    needsWorkoutMigration: needsWorkoutMigration(titanProfile),
    unmigratedBiomarkers: findUnmigratedBiomarkers(titanProfile, somaProfile).length,
    unmigratedWorkoutLogs: findUnmigratedWorkoutLogs(titanProfile).length,
    deprecatedFieldsInUse,
  };
}

// ---------------------------------------------------------------------------
// Read Helpers (Prefer Canonical Location)
// ---------------------------------------------------------------------------

/**
 * Gets biomarkers from the canonical location (SomaProfile), falling back to
 * TitanProfile for unmigrated data.
 */
export function getBiomarkers(
  titanProfile: TitanProfile,
  somaProfile: SomaProfile | null
): BiomarkerRecord[] {
  // Prefer Soma as source of truth
  if (somaProfile?.biomarkers?.length) {
    return somaProfile.biomarkers;
  }
  // Fall back to Titan for legacy data
  return titanProfile.biomarkers ?? [];
}

/**
 * Gets workout sessions from the canonical location, merging workoutLogs if needed.
 * In Phase 2, this will only read from workoutSessions.
 */
export function getWorkoutSessions(titanProfile: TitanProfile): WorkoutSession[] {
  // Primary source: workoutSessions
  return titanProfile.workoutSessions ?? [];
  // Note: workoutLogs contains different structure (per-exercise, not per-session)
  // Full migration requires schema normalization — deferred to dedicated sprint
}
