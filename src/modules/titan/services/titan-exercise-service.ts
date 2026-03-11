import exerciseLibrary from '../data/exercise-library.json';

export interface ExerciseLibraryEntry {
  id: string;
  name: string;
  aliases: string[];
  category: 'compound' | 'isolation' | 'cardio' | 'mobility' | 'olympic';
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  movementPattern: 'push' | 'pull' | 'hinge' | 'squat' | 'carry' | 'rotation' | 'cardio' | 'isolation';
}

const library = exerciseLibrary as ExerciseLibraryEntry[];

/**
 * Computes trigram similarity between two strings, normalized to [0, 1].
 *
 * Uses Dice coefficient over character trigrams:
 *   similarity = (2 × |intersection|) / (|trigrams(a)| + |trigrams(b)|)
 *
 * Time complexity: O(|a| + |b|) for trigram generation + O(min(|a|,|b|)) for set intersection.
 */
function trigramSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;

  const trigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    const padded = `  ${s}  `;
    for (let i = 0; i < padded.length - 2; i++) {
      set.add(padded.slice(i, i + 3));
    }
    return set;
  };

  const ta = trigrams(na);
  const tb = trigrams(nb);

  let intersection = 0;
  for (const t of ta) {
    if (tb.has(t)) intersection++;
  }

  return (2 * intersection) / (ta.size + tb.size);
}

/**
 * Find the best matching exercise in the library for a free-text name.
 *
 * Scores the query against each entry's canonical name and all aliases using
 * trigram similarity, returning the highest-scoring entry above the 0.3 threshold.
 *
 * Time complexity: O(E × A × L) where E = number of entries, A = average aliases
 * per entry, L = average string length.
 *
 * @param name - Free-text exercise name to match (e.g. "back squat", "rdl")
 * @returns Best-matching ExerciseLibraryEntry, or null if no match exceeds threshold
 */
export function matchExerciseName(name: string): ExerciseLibraryEntry | null {
  if (!name) return null;

  let best: ExerciseLibraryEntry | null = null;
  let bestScore = 0.3; // minimum threshold — scores below this are treated as no-match

  for (const entry of library) {
    const candidates = [entry.name, ...entry.aliases];
    for (const candidate of candidates) {
      const score = trigramSimilarity(name, candidate);
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
  }

  return best;
}

/**
 * Return all exercises that target the given muscle group (primary or secondary).
 *
 * Matching is case-insensitive substring: "quad" matches "quadriceps".
 *
 * Time complexity: O(E × (P + S)) where P/S are average primary/secondary muscle counts.
 *
 * @param muscle - Muscle name or partial name to search for
 * @returns Array of matching ExerciseLibraryEntry items (may be empty)
 */
export function getExercisesByMuscle(muscle: string): ExerciseLibraryEntry[] {
  const m = muscle.toLowerCase();
  return library.filter(
    (e) =>
      e.primaryMuscles.some((pm) => pm.toLowerCase().includes(m)) ||
      e.secondaryMuscles.some((sm) => sm.toLowerCase().includes(m)),
  );
}

/**
 * Return all exercises that use the given equipment type.
 *
 * Matching is case-insensitive substring: "bar" matches "barbell".
 *
 * Time complexity: O(E × Q) where Q is the average equipment count per entry.
 *
 * @param equipment - Equipment name or partial name to search for
 * @returns Array of matching ExerciseLibraryEntry items (may be empty)
 */
export function getExercisesByEquipment(equipment: string): ExerciseLibraryEntry[] {
  const eq = equipment.toLowerCase();
  return library.filter((e) =>
    e.equipment.some((eq2) => eq2.toLowerCase().includes(eq)),
  );
}
