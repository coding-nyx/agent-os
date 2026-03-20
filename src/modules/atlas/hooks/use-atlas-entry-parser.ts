/**
 * useAtlasEntryParser
 *
 * Pattern-first NLP parser for the QuickCaptureBar.
 * No LLM required — uses deterministic regex rules to extract:
 *   - Due date  ("tomorrow", "friday", "next week", …)
 *   - Recurrence ("every day", "daily", "weekly", …)
 *   - Energy level ("quick", "deep focus", "easy", …)
 *   - Priority ("urgent", "asap", "!", "someday", …)
 *   - Entry type: 'habit' when a recurrence word is detected, 'goal' for prefixes, else 'task'
 *
 * The hook returns a stable `parse` function (memoised with useCallback so it
 * is safe to list as a dependency in callers).
 *
 * Complexity: O(k) where k = number of regex rules (constant ≈ 30 patterns).
 */

import { useCallback } from 'react';

// ─── Public types ─────────────────────────────────────────────────────────────

export type RecurrenceRule = 'daily' | 'weekdays' | 'weekly' | 'monthly';
export type EnergyLevel   = 'low' | 'medium' | 'high';
export type PriorityLevel = 'low' | 'medium' | 'high';

export interface ParsedEntry {
  /** Inferred entry kind. Defaults to 'task' if no cues match. */
  type: 'task' | 'habit' | 'goal';
  /** Cleaned title with all matched tokens stripped. */
  title: string;
  /** YYYY-MM-DD, present when a date token was matched. */
  dueDate?: string;
  /** Recurrence cadence, present when a recurrence token was matched. */
  recurrenceRule?: RecurrenceRule;
  /** Normalised energy level extracted from natural-language cues. */
  energyLevel?: EnergyLevel;
  /** Normalised priority level extracted from natural-language cues. */
  priority?: PriorityLevel;
}

// ─── Internal date helpers ─────────────────────────────────────────────────────

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Returns a local YYYY-MM-DD string for a given Date (avoids UTC-offset date shift). */
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns an ISO YYYY-MM-DD string for the next occurrence of a weekday (≥ tomorrow). */
function nextWeekday(targetDay: number): string {
  const now = new Date();
  const todayDay = now.getDay();
  const daysUntil = ((targetDay - todayDay + 7) % 7) || 7; // at least 1 day ahead
  const result = new Date(now);
  result.setDate(now.getDate() + daysUntil);
  return isoLocal(result);
}

function isoToday(): string {
  return isoLocal(new Date());
}

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoLocal(d);
}

// ─── Rule tables ──────────────────────────────────────────────────────────────

/** Explicit type prefixes (e.g. "habit: run", "goal: publish book") */
const TYPE_RULES: { pattern: RegExp; value: 'habit' | 'goal' }[] = [
  { pattern: /^(?:habit|h)[:\s]+/i, value: 'habit' },
  { pattern: /^(?:goal|g)[:\s]+/i,  value: 'goal' },
];

/**
 * Date extraction rules.
 * Each rule: { pattern, extract } where extract receives the RegExp match and
 * returns an ISO date string (YYYY-MM-DD).
 */
interface DateRule {
  pattern: RegExp;
  extract: (match: RegExpMatchArray) => string;
}

const DATE_RULES: DateRule[] = [
  {
    // "next week"
    pattern: /\bnext\s+week\b/i,
    extract: () => isoOffset(7)
  },
  {
    // "tomorrow"
    pattern: /\btomorrow\b/i,
    extract: () => isoOffset(1)
  },
  {
    // "today"
    pattern: /\btoday\b/i,
    extract: () => isoToday()
  },
  {
    // "next monday" / "next friday" / etc.
    pattern: /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    extract: (m) => {
      const day = WEEKDAY_NAMES.indexOf(m[1].toLowerCase());
      // "next X" = next occurrence strictly after this week's occurrence
      const now = new Date();
      const todayDay = now.getDay();
      const daysUntil = ((day - todayDay + 7) % 7) || 7;
      // Add another week only when "next X" is today (daysUntil===7 after the ||7 fallback
      // handles same-day; daysUntil===0 would mean today, so we push to next occurrence).
      // "next friday" from Wednesday (daysUntil=2) → 9 days, NOT 16.
      const result = new Date(now);
      result.setDate(now.getDate() + daysUntil + (daysUntil === 0 ? 7 : 0));
      return isoLocal(result);
    }
  },
  {
    // plain weekday name: "friday", "monday", etc.
    pattern: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    extract: (m) => nextWeekday(WEEKDAY_NAMES.indexOf(m[1].toLowerCase()))
  }
];

/** Recurrence rules — order matters: more-specific patterns first. */
interface RecurrenceRuleEntry {
  pattern: RegExp;
  value: RecurrenceRule;
}

const RECURRENCE_RULES: RecurrenceRuleEntry[] = [
  { pattern: /\bevery\s+weekday\b|\bweekdays\b/i,  value: 'weekdays' },
  { pattern: /\bevery\s+(day|morning|night)\b|\bdaily\b/i, value: 'daily' },
  { pattern: /\bevery\s+week\b|\bweekly\b/i,        value: 'weekly'   },
  { pattern: /\bevery\s+month\b|\bmonthly\b/i,      value: 'monthly'  }
];

/** Energy level rules — more-specific patterns first. */
interface EnergyRuleEntry {
  pattern: RegExp;
  value: EnergyLevel;
}

const ENERGY_RULES: EnergyRuleEntry[] = [
  { pattern: /\bdeep[\s-]?focus\b|\bcomplex\b|\bheavy\b/i, value: 'high' },
  { pattern: /\bquick\b|\beasy\b|\blight\b|\b\d+\s*min(?:ute)?s?\b/i, value: 'low' }
];

/** Priority rules — more-specific patterns first. */
interface PriorityRuleEntry {
  pattern: RegExp;
  value: PriorityLevel;
}

const PRIORITY_RULES: PriorityRuleEntry[] = [
  { pattern: /\burgent\b|\basap\b|!+$/i, value: 'high' },
  { pattern: /\bsomeday\b|\blow[\s-]?priority\b|\bwhenever\b/i, value: 'low' }
];

// ─── Core parse function ───────────────────────────────────────────────────────

/**
 * Parses a free-text entry into a structured ParsedEntry.
 *
 * Algorithm:
 * 1. Apply each category's rule list in order; record first match + span.
 * 2. Remove all matched spans from the input string.
 * 3. Trim and normalise the remainder into the title.
 * 4. Infer entry type: 'habit' if a recurrenceRule was found, 'goal' for prefixes, 'task' otherwise.
 *
 * @param raw - The raw user input string.
 * @returns A ParsedEntry; title will be the raw input (trimmed) if no tokens match.
 */
export function parseAtlasEntry(raw: string): ParsedEntry {
  let working = raw;
  const spansToRemove: Array<[number, number]> = [];

  // ── Explicit Type Prefix ──────────────────────────────────────────────────
  let inferredType: 'task' | 'habit' | 'goal' | undefined;
  for (const rule of TYPE_RULES) {
    const m = working.match(rule.pattern);
    if (m && m.index !== undefined) {
      inferredType = rule.value;
      spansToRemove.push([m.index, m.index + m[0].length]);
      // Update working string immediately to avoid other rules matching against the prefix
      working = working.slice(0, m.index) + working.slice(m.index + m[0].length);
      break;
    }
  }

  // ── Date ──────────────────────────────────────────────────────────────────
  // Use leftmost-wins: collect all matching rules with their match positions,
  // then pick the one whose match starts earliest in the string.
  let dueDate: string | undefined;
  {
    let bestIndex = Infinity;
    let bestMatch: RegExpMatchArray | null = null;
    let bestRule: DateRule | null = null;
    for (const rule of DATE_RULES) {
      const m = working.match(rule.pattern);
      if (m && m.index !== undefined && m.index < bestIndex) {
        bestIndex = m.index;
        bestMatch = m;
        bestRule = rule;
      }
    }
    if (bestRule && bestMatch && bestMatch.index !== undefined) {
      dueDate = bestRule.extract(bestMatch);
      spansToRemove.push([bestMatch.index, bestMatch.index + bestMatch[0].length]);
    }
  }

  // ── Recurrence ────────────────────────────────────────────────────────────
  let recurrenceRule: RecurrenceRule | undefined;
  for (const rule of RECURRENCE_RULES) {
    const m = working.match(rule.pattern);
    if (m && m.index !== undefined) {
      recurrenceRule = rule.value;
      spansToRemove.push([m.index, m.index + m[0].length]);
      break;
    }
  }

  // ── Energy ────────────────────────────────────────────────────────────────
  let energyLevel: EnergyLevel | undefined;
  for (const rule of ENERGY_RULES) {
    const m = working.match(rule.pattern);
    if (m && m.index !== undefined) {
      energyLevel = rule.value;
      spansToRemove.push([m.index, m.index + m[0].length]);
      break;
    }
  }

  // ── Priority ──────────────────────────────────────────────────────────────
  let priority: PriorityLevel | undefined;
  for (const rule of PRIORITY_RULES) {
    const m = working.match(rule.pattern);
    if (m && m.index !== undefined) {
      priority = rule.value;
      spansToRemove.push([m.index, m.index + m[0].length]);
      break;
    }
  }

  // ── Strip matched spans and derive clean title ────────────────────────────
  // Sort spans by start index descending so removal doesn't shift indices.
  const sortedSpans = spansToRemove.sort((a, b) => b[0] - a[0]);
  let cleaned = working;
  for (const [start, end] of sortedSpans) {
    cleaned = cleaned.slice(0, start) + cleaned.slice(end);
  }
  const title = cleaned.replace(/\s{2,}/g, ' ').trim() || raw.trim();

  // Final Type Inference Logic
  const type = inferredType || (recurrenceRule !== undefined ? 'habit' : 'task');

  return {
    type,
    title,
    dueDate,
    recurrenceRule,
    energyLevel,
    priority
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/** Returns a stable `parse` callback wrapping `parseAtlasEntry`. */
export function useAtlasEntryParser(): { parse: (input: string) => ParsedEntry } {
  const parse = useCallback((input: string): ParsedEntry => parseAtlasEntry(input), []);
  return { parse };
}
