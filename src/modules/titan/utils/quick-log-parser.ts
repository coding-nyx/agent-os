/**
 * quick-log-parser.ts — Bridge to @cortex-logic QuickLogParserJs.
 *
 * Delegates all parsing logic to the KMP implementation. Public types and
 * export names are preserved verbatim so no callers need to change.
 */

import { QuickLogParserJs } from '@cortex-logic';
import type { PersonalRecord } from '../types';

const _service = new QuickLogParserJs();

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ParsedEntry {
  raw: string;
  exerciseName: string;
  exerciseId: string | null;
  sets: number;
  reps: number | null;
  weight: number | null;
  unit: 'kg' | 'lbs';
  isNew: boolean;
  parseConfidence: 'high' | 'medium' | 'low';
  isPR: boolean;
  prDelta: number | null;
}

export type QuickLogParseResult = {
  entries: ParsedEntry[];
  hasLowConfidence: boolean;
  isEmpty: boolean;
};

// ─── Bridge functions ─────────────────────────────────────────────────────────

export function parseQuickLogInput(input: string): QuickLogParseResult {
  return JSON.parse(_service.parseQuickLogInput(input)) as QuickLogParseResult;
}

export function annotatePRs(
  entries: ParsedEntry[],
  personalRecords: PersonalRecord[] | undefined,
): ParsedEntry[] {
  const result = _service.annotatePRs(
    JSON.stringify(entries),
    personalRecords !== undefined ? JSON.stringify(personalRecords) : JSON.stringify([]),
  );
  return JSON.parse(result) as ParsedEntry[];
}

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
  const result = _service.buildHistorySuggestion(JSON.stringify(recentSessions), maxLength);
  return result === null || result === '' || result === 'null'
    ? null
    : (JSON.parse(result) as { text: string; date: string });
}
