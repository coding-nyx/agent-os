/**
 * Titan module — exercise identity & workout tracking types.
 *
 * These types are scoped to the titan module. They are structurally compatible
 * with (but distinct from) the lib/types workout types so that exercise-library
 * components can use strong, granular muscle-group unions without polluting the
 * global type namespace.
 */

export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'
  | 'forearms' | 'core' | 'glutes' | 'quads' | 'hamstrings'
  | 'calves' | 'traps' | 'lats' | 'full_body' | 'cardio';

export type ExerciseCategory = 'compound' | 'isolation' | 'cardio' | 'mobility';

export type Exercise = {
  id: string;
  name: string;
  muscleGroups: MuscleGroup[];
  category: ExerciseCategory;
  equipment: string[];           // e.g. ['barbell'], ['bodyweight'], ['dumbbell','cable']
  aliases?: string[];            // alternate names for search
};

export type PersonalRecord = {
  exerciseId: string;
  weight: number;                // kg
  reps: number;
  e1RM: number;                  // Epley formula: weight * (1 + reps / 30)
  date: string;                  // ISO date string
};

export type WorkoutSet = {
  exerciseId: string;
  weight: number;
  reps: number;
  rir?: number;                  // reps in reserve (optional)
  notes?: string;
};

export type WorkoutLog = {
  id: string;
  date: string;                  // ISO date string
  sets: WorkoutSet[];
  durationMinutes?: number;
  notes?: string;
};
