/**
 * quick-log-parser.ts — Natural language workout entry parser.
 *
 * Parses free-text like "3x5 squat @100kg, 3x8 bench @80" into structured
 * ParsedEntry objects, resolving exercise names against the EXERCISE_LIBRARY.
 *
 * Grammar:
 *   input    ::= entry ("," entry)*
 *   entry    ::= (setspec WS)? exercise (WS setspec)? (WS weight)?
 *   setspec  ::= NUMBER "x" NUMBER   e.g. "3x5", "3×5"
 *   exercise ::= WORD+
 *   weight   ::= "@"? NUMBER unit?
 *   unit     ::= "kg" | "lbs" | "lb"
 *
 * Design notes:
 *  - Runs entirely client-side in < 10ms for typical inputs.
 *  - No regex mega-pattern — uses a small token-based state machine for
 *    readability and maintainability.
 *  - Normalises exercise names against library aliases (case-insensitive).
 *  - Gracefully degrades: partial entries are allowed; confidence is surfaced
 *    to the caller so the UI can warn the user.
 */

import { EXERCISE_LIBRARY } from '../data/exercise-library';
import { calculateE1RM, getBestE1RM } from './e1rm';
import type { PersonalRecord } from '../types';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ParsedEntry {
  /** Original raw substring for this entry, e.g. "3x5 squat @100kg" */
  raw: string;
  /** Normalised display name (library name or verbatim if unresolved) */
  exerciseName: string;
  /** Library exercise ID, null if not found */
  exerciseId: string | null;
  /** Number of sets — defaults to 1 */
  sets: number;
  /** Number of reps — null if not specified */
  reps: number | null;
  /** Weight — null if not specified (bodyweight / unspecified) */
  weight: number | null;
  /** Weight unit — defaults to 'kg' */
  unit: 'kg' | 'lbs';
  /** True if exercise name could not be resolved against the library */
  isNew: boolean;
  /**
   * Parsing confidence level:
   * - 'high'   — all fields resolved (exercise + sets + reps + weight)
   * - 'medium' — exercise resolved, some fields missing
   * - 'low'    — exercise not resolved or critical parse failure
   */
  parseConfidence: 'high' | 'medium' | 'low';
  /**
   * True when the candidate e1RM exceeds the stored PR.
   * Set by the caller via isPRCandidate(); starts false.
   */
  isPR: boolean;
  /**
   * Delta between candidate e1RM and stored PR e1RM, in kg.
   * Null when isPR is false or no prior PR exists.
   */
  prDelta: number | null;
}

export type QuickLogParseResult = {
  entries: ParsedEntry[];
  /** True if at least one entry has parseConfidence 'low' */
  hasLowConfidence: boolean;
  /** True if the entire input produced zero usable entries */
  isEmpty: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Tokenise a single entry substring into lowercased words/numbers/symbols. */
function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Try to resolve an exercise name against the EXERCISE_LIBRARY.
 * Attempts: exact name → alias exact → partial name → reverse partial.
 */
function resolveExercise(query: string): { id: string; name: string } | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;

  // 1. Exact name
  const exact = EXERCISE_LIBRARY.find(e => e.name.toLowerCase() === q);
  if (exact) return { id: exact.id, name: exact.name };

  // 2. Alias exact
  const byAlias = EXERCISE_LIBRARY.find(
    e => (e.aliases ?? []).some(a => a.toLowerCase() === q),
  );
  if (byAlias) return { id: byAlias.id, name: byAlias.name };

  // 3. Library name contains query
  const partial = EXERCISE_LIBRARY.find(e => e.name.toLowerCase().includes(q));
  if (partial) return { id: partial.id, name: partial.name };

  // 4. Any alias contains query
  const byAliasPartial = EXERCISE_LIBRARY.find(
    e => (e.aliases ?? []).some(a => a.toLowerCase().includes(q)),
  );
  if (byAliasPartial) return { id: byAliasPartial.id, name: byAliasPartial.name };

  // 5. Query contains library name
  const reverse = EXERCISE_LIBRARY.find(e => q.includes(e.name.toLowerCase()));
  if (reverse) return { id: reverse.id, name: reverse.name };

  return null;
}

/** Parse a "NxN" or "N×N" set-spec token. Returns null if no match. */
function parseSetSpec(token: string): { sets: number; reps: number } | null {
  const match = token.match(/^(\d+)[x×](\d+)$/i);
  if (!match) return null;
  const sets = parseInt(match[1], 10);
  const reps = parseInt(match[2], 10);
  if (sets < 1 || reps < 1 || sets > 99 || reps > 999) return null;
  return { sets, reps };
}

/** Parse a weight token like "@100kg", "100", "80lbs". Returns null if no match. */
function parseWeight(token: string): { weight: number; unit: 'kg' | 'lbs' } | null {
  const cleaned = token.replace(/^@/, '');
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(kg|lbs?)?$/i);
  if (!match) return null;
  const weight = parseFloat(match[1]);
  if (isNaN(weight) || weight < 0 || weight > 9999) return null;
  const unit: 'kg' | 'lbs' = /lbs?/i.test(match[2] ?? '') ? 'lbs' : 'kg';
  return { weight, unit };
}

/**
 * Parse a single comma-separated entry like "3x5 squat @100kg".
 *
 * Strategy:
 *  1. Scan tokens left-to-right.
 *  2. If a token looks like a set-spec (NxN), treat it as sets×reps.
 *  3. If a token looks like a weight (@N / Nkg / Nlbs), treat it as weight.
 *  4. Remaining tokens form the exercise name.
 */
function parseEntry(raw: string): ParsedEntry {
  const tokens = tokenize(raw);

  let sets: number | null = null;
  let reps: number | null = null;
  let weight: number | null = null;
  let unit: 'kg' | 'lbs' = 'kg';
  const nameTokens: string[] = [];

  for (const token of tokens) {
    // Try set-spec first (higher specificity)
    if (sets === null && reps === null) {
      const ss = parseSetSpec(token);
      if (ss) {
        sets = ss.sets;
        reps = ss.reps;
        continue;
      }
    }

    // Try weight (starts with @ OR ends with kg/lbs OR is a bare number that
    // came after an exercise name)
    if (weight === null && (token.startsWith('@') || /kg|lbs?$/i.test(token))) {
      const wt = parseWeight(token);
      if (wt) {
        weight = wt.weight;
        unit = wt.unit;
        continue;
      }
    }

    // Otherwise treat as part of the exercise name
    nameTokens.push(token);
  }

  // Late pass: if last name-token is a bare number and weight is still null,
  // treat it as the weight (e.g. "squat 100" where there's no unit suffix).
  if (weight === null && nameTokens.length > 1) {
    const lastToken = nameTokens[nameTokens.length - 1];
    const maybeWeight = parseWeight(lastToken);
    if (maybeWeight) {
      weight = maybeWeight.weight;
      unit = maybeWeight.unit;
      nameTokens.pop();
    }
  }

  const rawExerciseName = nameTokens.join(' ').trim();
  const resolved = resolveExercise(rawExerciseName);

  const exerciseName = resolved?.name ?? rawExerciseName;
  const exerciseId = resolved?.id ?? null;
  const isNew = resolved === null;

  // Confidence scoring
  let parseConfidence: ParsedEntry['parseConfidence'];
  if (!rawExerciseName) {
    parseConfidence = 'low';
  } else if (isNew || (reps === null && weight === null)) {
    parseConfidence = isNew ? 'low' : 'medium';
  } else if (reps !== null && weight !== null) {
    parseConfidence = 'high';
  } else {
    parseConfidence = 'medium';
  }

  return {
    raw,
    exerciseName,
    exerciseId,
    sets: sets ?? 1,
    reps,
    weight,
    unit,
    isNew,
    parseConfidence,
    isPR: false,
    prDelta: null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a full quick-log input string into structured entries.
 *
 * @param input  Raw user input, e.g. "3x5 squat @100kg, 3x8 bench @80"
 * @returns      Parsed entries with confidence levels and isEmpty flag.
 */
export function parseQuickLogInput(input: string): QuickLogParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { entries: [], hasLowConfidence: false, isEmpty: true };
  }

  // Split on commas (but not decimal points — "100.5" must not split)
  const rawEntries = trimmed
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const entries = rawEntries.map(parseEntry);
  const hasLowConfidence = entries.some(e => e.parseConfidence === 'low');
  const isEmpty = entries.length === 0;

  return { entries, hasLowConfidence, isEmpty };
}

/**
 * Annotate parsed entries with PR status.
 *
 * Must be called after parseQuickLogInput() once personalRecords are available.
 * Mutates entries in place (returns the same array for convenience).
 *
 * @param entries          ParsedEntry[] from parseQuickLogInput()
 * @param personalRecords  All stored PRs — may be undefined if not yet loaded.
 * @returns                The same entries array, with isPR and prDelta populated.
 */
export function annotatePRs(
  entries: ParsedEntry[],
  personalRecords: PersonalRecord[] | undefined,
): ParsedEntry[] {
  // If records haven't loaded yet, withhold all PR badges (avoid false positives).
  if (!personalRecords) return entries;

  for (const entry of entries) {
    if (!entry.exerciseId || entry.weight === null || entry.reps === null) {
      continue;
    }
    const candidateE1RM = calculateE1RM(entry.weight, entry.reps);
    const storedBest = getBestE1RM(personalRecords, entry.exerciseId);

    if (storedBest === null || candidateE1RM > storedBest) {
      entry.isPR = true;
      entry.prDelta = storedBest !== null ? Math.round((candidateE1RM - storedBest) * 10) / 10 : null;
    }
  }

  return entries;
}

/**
 * Build a history-suggestion string from the most recent WorkoutSession
 * that contains exercises matching any of the provided library IDs.
 *
 * Returns null if no relevant history is found.
 *
 * @param recentSessions  Sessions from TitanProfile, ordered newest-first.
 * @param maxLength       Cap summary at this many characters (default 60).
 */
export function buildHistorySuggestion(
  recentSessions: Array<{
    date: string;
    exercises: Array<{
      exerciseName: string;
      sets: Array<{ weight?: number; repsCompleted?: number; completed?: boolean }>;
    }>;
  }>,
  maxLength = 60,
): { text: string; date: string } | null {
  if (!recentSessions.length) return null;

  const latest = recentSessions[0];
  const parts: string[] = [];

  for (const ex of latest.exercises) {
    const completedSets = ex.sets.filter(s => s.completed);
    if (!completedSets.length) continue;

    // Derive a typical set (first completed set)
    const firstSet = completedSets[0];
    const weight = firstSet.weight;
    const reps = firstSet.repsCompleted;
    const count = completedSets.length;

    if (weight && reps) {
      parts.push(`${count}×${reps} @${weight}kg`);
    } else if (reps) {
      parts.push(`${count}×${reps}`);
    }
  }

  if (!parts.length) return null;

  let text = parts.join(', ');
  if (text.length > maxLength) {
    text = text.slice(0, maxLength - 1) + '…';
  }

  return { text, date: latest.date };
}
