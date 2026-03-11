import type { Exercise } from '../types';

export const EXERCISE_LIBRARY: Exercise[] = [
  // Compound lower
  { id: 'squat', name: 'Barbell Back Squat', muscleGroups: ['quads', 'glutes', 'hamstrings', 'core'], category: 'compound', equipment: ['barbell'], aliases: ['squat', 'back squat'] },
  { id: 'deadlift', name: 'Deadlift', muscleGroups: ['back', 'glutes', 'hamstrings', 'traps'], category: 'compound', equipment: ['barbell'], aliases: ['dead lift'] },
  { id: 'rdl', name: 'Romanian Deadlift', muscleGroups: ['hamstrings', 'glutes', 'back'], category: 'compound', equipment: ['barbell'], aliases: ['rdl', 'stiff leg deadlift'] },
  { id: 'leg_press', name: 'Leg Press', muscleGroups: ['quads', 'glutes'], category: 'compound', equipment: ['machine'], aliases: [] },
  { id: 'lunge', name: 'Lunge', muscleGroups: ['quads', 'glutes', 'hamstrings'], category: 'compound', equipment: ['bodyweight', 'dumbbell'], aliases: ['lunges'] },
  // Compound upper push
  { id: 'bench_press', name: 'Barbell Bench Press', muscleGroups: ['chest', 'shoulders', 'triceps'], category: 'compound', equipment: ['barbell'], aliases: ['bench', 'bench press'] },
  { id: 'incline_bench', name: 'Incline Bench Press', muscleGroups: ['chest', 'shoulders', 'triceps'], category: 'compound', equipment: ['barbell', 'dumbbell'], aliases: ['incline bench'] },
  { id: 'ohp', name: 'Overhead Press', muscleGroups: ['shoulders', 'triceps', 'traps'], category: 'compound', equipment: ['barbell'], aliases: ['ohp', 'military press', 'shoulder press'] },
  { id: 'dips', name: 'Dips', muscleGroups: ['chest', 'triceps', 'shoulders'], category: 'compound', equipment: ['bodyweight'], aliases: [] },
  { id: 'push_up', name: 'Push-Up', muscleGroups: ['chest', 'shoulders', 'triceps', 'core'], category: 'compound', equipment: ['bodyweight'], aliases: ['pushup', 'push up'] },
  // Compound upper pull
  { id: 'pull_up', name: 'Pull-Up', muscleGroups: ['lats', 'biceps', 'traps'], category: 'compound', equipment: ['bodyweight'], aliases: ['pullup', 'chin-up', 'chinup'] },
  { id: 'barbell_row', name: 'Barbell Row', muscleGroups: ['back', 'biceps', 'lats'], category: 'compound', equipment: ['barbell'], aliases: ['bent over row', 'bb row'] },
  { id: 'cable_row', name: 'Seated Cable Row', muscleGroups: ['back', 'biceps', 'lats'], category: 'compound', equipment: ['cable'], aliases: ['cable row'] },
  { id: 'lat_pulldown', name: 'Lat Pulldown', muscleGroups: ['lats', 'biceps'], category: 'compound', equipment: ['cable'], aliases: ['pulldown'] },
  // Isolation
  { id: 'bicep_curl', name: 'Bicep Curl', muscleGroups: ['biceps', 'forearms'], category: 'isolation', equipment: ['dumbbell', 'barbell'], aliases: ['curl', 'curls'] },
  { id: 'tricep_pushdown', name: 'Tricep Pushdown', muscleGroups: ['triceps'], category: 'isolation', equipment: ['cable'], aliases: ['pushdown'] },
  { id: 'lateral_raise', name: 'Lateral Raise', muscleGroups: ['shoulders'], category: 'isolation', equipment: ['dumbbell'], aliases: ['side raise', 'side lateral'] },
  { id: 'face_pull', name: 'Face Pull', muscleGroups: ['shoulders', 'traps'], category: 'isolation', equipment: ['cable'], aliases: [] },
  { id: 'leg_curl', name: 'Leg Curl', muscleGroups: ['hamstrings'], category: 'isolation', equipment: ['machine'], aliases: ['hamstring curl'] },
  { id: 'leg_extension', name: 'Leg Extension', muscleGroups: ['quads'], category: 'isolation', equipment: ['machine'], aliases: [] },
  { id: 'calf_raise', name: 'Calf Raise', muscleGroups: ['calves'], category: 'isolation', equipment: ['machine', 'bodyweight'], aliases: ['calf raises'] },
  { id: 'chest_fly', name: 'Cable Chest Fly', muscleGroups: ['chest'], category: 'isolation', equipment: ['cable'], aliases: ['fly', 'cable fly', 'cable crossover'] },
  // Core
  { id: 'plank', name: 'Plank', muscleGroups: ['core'], category: 'mobility', equipment: ['bodyweight'], aliases: [] },
  { id: 'ab_wheel', name: 'Ab Wheel Rollout', muscleGroups: ['core'], category: 'isolation', equipment: ['ab wheel'], aliases: ['rollout'] },
  { id: 'hanging_leg_raise', name: 'Hanging Leg Raise', muscleGroups: ['core'], category: 'isolation', equipment: ['bodyweight'], aliases: ['leg raise'] },
  // Cardio
  { id: 'run', name: 'Running', muscleGroups: ['cardio'], category: 'cardio', equipment: ['bodyweight'], aliases: ['run', 'jog', 'treadmill'] },
  { id: 'row_machine', name: 'Rowing Machine', muscleGroups: ['full_body', 'cardio'], category: 'cardio', equipment: ['machine'], aliases: ['rowing', 'rower'] },
  { id: 'cycling', name: 'Cycling', muscleGroups: ['cardio'], category: 'cardio', equipment: ['machine', 'outdoor'], aliases: ['bike', 'cycle'] },
  // Mobility
  { id: 'hip_flexor_stretch', name: 'Hip Flexor Stretch', muscleGroups: ['glutes', 'core'], category: 'mobility', equipment: ['bodyweight'], aliases: [] },
  { id: 'shoulder_dislocate', name: 'Shoulder Dislocate', muscleGroups: ['shoulders'], category: 'mobility', equipment: ['band', 'dowel'], aliases: [] },
];

/**
 * Find the first exercise whose name or aliases contain `query` (case-insensitive).
 * Returns `undefined` when no match is found.
 */
export function findExercise(query: string): Exercise | undefined {
  const q = query.toLowerCase().trim();
  return EXERCISE_LIBRARY.find(
    e =>
      e.name.toLowerCase().includes(q) ||
      (e.aliases ?? []).some(a => a.toLowerCase().includes(q)),
  );
}

/**
 * Return up to `limit` exercises matching `query` by name or alias.
 * When `query` is empty, returns the first `limit` entries.
 *
 * Time complexity: O(n × m) where n = library size (30) and m = avg alias count. Effectively O(1).
 */
export function searchExercises(query: string, limit = 5): Exercise[] {
  if (!query.trim()) return EXERCISE_LIBRARY.slice(0, limit);
  const q = query.toLowerCase().trim();
  return EXERCISE_LIBRARY.filter(
    e =>
      e.name.toLowerCase().includes(q) ||
      (e.aliases ?? []).some(a => a.toLowerCase().includes(q)),
  ).slice(0, limit);
}
