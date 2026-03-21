import { ActionHub } from '@/lib/actions/action-hub';
import { Spine } from '@/lib/spine/spine-event-bus';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import type { TitanProfile, Routine, BiomarkerRecord, MedicalImageAnalysis, SleepEntry, CycleEntry, CyclePhase, CycleType, WorkoutSession, ExerciseLog, ExerciseSet, PersonalRecord, CustomField, BodyWeightEntry, CardioSession, CardioSessionType, TitanWorkoutSet, TitanWorkoutLog } from '@/lib/types';
import { mergeTitanProfile, normalizeRoutines } from '../../utils';
import { normalizeTitanProfilePatch } from '../../onboarding/intake-accumulator';
import { loadTitanProfile, saveTitanProfile } from '../titan-profile-service';
import { ClearanceService } from '@/modules/soma/services/clearance-service';
import { SomaDataService } from '@/modules/soma/services/soma-data-service';
import { parseHealthReport, parseWorkoutLog, parseBiometricData } from '@/lib/actions/parsing-actions';
import { SomaTitanDelegationService } from '@/lib/services/soma-titan-delegation-service';
import type { ActionHandler } from '@/lib/actions/action-hub';

export type { ActionHandler };

export function parseNumericValue(value: unknown): number | string {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return 'unknown';
}

export async function loadProfile(userId?: string | null, encryptionKey?: CryptoKey | null) {
  return loadTitanProfile({ userId, encryptionKey });
}

export async function persistProfile(profile: TitanProfile, userId?: string | null, encryptionKey?: CryptoKey | null) {
  await saveTitanProfile(profile, { userId, encryptionKey });
}

export {
  ActionHub,
  Spine,
  GlobalProjectionService,
  mergeTitanProfile,
  normalizeRoutines,
  normalizeTitanProfilePatch,
  loadTitanProfile,
  saveTitanProfile,
  ClearanceService,
  SomaDataService,
  parseHealthReport,
  parseWorkoutLog,
  parseBiometricData,
  SomaTitanDelegationService,
};

export type {
  TitanProfile,
  Routine,
  BiomarkerRecord,
  MedicalImageAnalysis,
  SleepEntry,
  CycleEntry,
  CyclePhase,
  CycleType,
  WorkoutSession,
  ExerciseLog,
  ExerciseSet,
  PersonalRecord,
  CustomField,
  BodyWeightEntry,
  CardioSession,
  CardioSessionType,
  TitanWorkoutSet,
  TitanWorkoutLog,
};
