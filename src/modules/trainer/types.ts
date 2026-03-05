import { Routine, Supplement } from '@/lib/types';

export type TrainerPrivacyLevel = 'basic' | 'complete';
export type TrainerTrackingLevel = 'standard' | 'indepth';

export interface TrainerNutritionProfile {
  dietNotes?: string;
  supplements?: Supplement[];
  macroEstimate?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    source: 'estimate' | 'user';
  };
}

export interface TrainerActivityProfile {
  activityLevel?: 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
  workoutsPerWeek?: number;
  dayToDayNotes?: string;
  sleepHours?: number;
  recoveryNotes?: string;
  intimateContextNotes?: string;
}

export interface TrainerHistoryProfile {
  yearsTraining?: number;
  injuries?: string[];
  goals?: string[];
  bodyGoals?: string;
  existingRoutine?: boolean;
}

export interface TrainerProfile {
  onboardingComplete: boolean;
  privacyLevel: TrainerPrivacyLevel;
  trackingLevel: TrainerTrackingLevel;
  nutrition: TrainerNutritionProfile;
  activity: TrainerActivityProfile;
  history: TrainerHistoryProfile;
  summary: string;
  routines: Routine[];
  createdAt: string;
  updatedAt: string;
}

