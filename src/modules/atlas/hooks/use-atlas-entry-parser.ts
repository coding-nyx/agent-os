/**
 * useAtlasEntryParser
 *
 * Deterministic Atlas entry parser used by QuickCaptureBar.
 *
 * It supports two ingestion semantics:
 *   - structured   → explicit cues like `goal:`, `due:tomorrow`, `priority:high`
 *   - unstructured → natural language cues like "call dentist tomorrow urgent"
 *
 * The parser returns both the structured entry preview and ingestion metadata so
 * Atlas can explain whether a result came from explicit field syntax or a
 * freeform inference pass.
 */

import { useCallback } from 'react';
import type { AtlasIngestionMetadata } from '@/lib/types';

export type RecurrenceRule = 'daily' | 'weekdays' | 'weekly' | 'monthly';
export type EnergyLevel = 'low' | 'medium' | 'high';
export type PriorityLevel = 'low' | 'medium' | 'high';

export interface ParsedEntry {
  type: 'task' | 'habit' | 'goal';
  title: string;
  dueDate?: string;
  recurrenceRule?: RecurrenceRule;
  energyLevel?: EnergyLevel;
  priority?: PriorityLevel;
  ingestion: AtlasIngestionMetadata;
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nextWeekday(targetDay: number): string {
  const now = new Date();
  const todayDay = now.getDay();
  const daysUntil = ((targetDay - todayDay + 7) % 7) || 7;
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

const TYPE_RULES: { pattern: RegExp; value: 'habit' | 'goal' }[] = [
  { pattern: /^(?:habit|h)[:\s]+/i, value: 'habit' },
  { pattern: /^(?:goal|g)[:\s]+/i, value: 'goal' },
];

interface DateRule {
  pattern: RegExp;
  extract: (match: RegExpMatchArray) => string;
}

const DATE_RULES: DateRule[] = [
  { pattern: /\bnext\s+week\b/i, extract: () => isoOffset(7) },
  { pattern: /\btomorrow\b/i, extract: () => isoOffset(1) },
  { pattern: /\btoday\b/i, extract: () => isoToday() },
  {
    pattern: /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    extract: (match) => {
      const day = WEEKDAY_NAMES.indexOf(match[1].toLowerCase());
      const now = new Date();
      const todayDay = now.getDay();
      const daysUntil = ((day - todayDay + 7) % 7) || 7;
      const result = new Date(now);
      result.setDate(now.getDate() + daysUntil + (daysUntil === 0 ? 7 : 0));
      return isoLocal(result);
    },
  },
  {
    pattern: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    extract: (match) => nextWeekday(WEEKDAY_NAMES.indexOf(match[1].toLowerCase())),
  },
];

const RECURRENCE_RULES: Array<{ pattern: RegExp; value: RecurrenceRule }> = [
  { pattern: /\bevery\s+weekday\b|\bweekdays\b/i, value: 'weekdays' },
  { pattern: /\bevery\s+(day|morning|night)\b|\bdaily\b/i, value: 'daily' },
  { pattern: /\bevery\s+week\b|\bweekly\b/i, value: 'weekly' },
  { pattern: /\bevery\s+month\b|\bmonthly\b/i, value: 'monthly' },
];

const ENERGY_RULES: Array<{ pattern: RegExp; value: EnergyLevel }> = [
  { pattern: /\bdeep[\s-]?focus\b|\bcomplex\b|\bheavy\b/i, value: 'high' },
  { pattern: /\bquick\b|\beasy\b|\blight\b|\b\d+\s*min(?:ute)?s?\b/i, value: 'low' },
];

const PRIORITY_RULES: Array<{ pattern: RegExp; value: PriorityLevel }> = [
  { pattern: /\burgent\b|\basap\b|!+$/i, value: 'high' },
  { pattern: /\bsomeday\b|\blow[\s-]?priority\b|\bwhenever\b/i, value: 'low' },
];

const STRUCTURED_TYPE_RULE = /\btype\s*:\s*(task|habit|goal)\b/i;
const STRUCTURED_DATE_RULE = /\bdue\s*:\s*([a-z0-9_-]+)\b/i;
const STRUCTURED_RECURRENCE_RULE = /\b(?:repeat|frequency|every)\s*:\s*(daily|weekdays|weekly|monthly)\b/i;
const STRUCTURED_ENERGY_RULE = /\benergy\s*:\s*(low|medium|high)\b/i;
const STRUCTURED_PRIORITY_RULE = /\bpriority\s*:\s*(low|medium|high)\b/i;

function parseStructuredDateToken(raw: string): string | undefined {
  const value = raw.trim().toLowerCase();

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value === 'today') return isoToday();
  if (value === 'tomorrow') return isoOffset(1);
  if (value === 'next-week') return isoOffset(7);
  if (value === 'nextweek') return isoOffset(7);
  if (WEEKDAY_NAMES.includes(value)) return nextWeekday(WEEKDAY_NAMES.indexOf(value));

  const synthetic = value.replace(/-/g, ' ');
  for (const rule of DATE_RULES) {
    const match = synthetic.match(rule.pattern);
    if (match) return rule.extract(match);
  }

  return undefined;
}

function removeMatchedSpan(source: string, match: RegExpMatchArray | null): string {
  if (!match || match.index === undefined) return source;
  return source.slice(0, match.index) + source.slice(match.index + match[0].length);
}

function buildIngestionMetadata(structuredCues: string[], inferredCues: string[]): AtlasIngestionMetadata {
  const mode = structuredCues.length > 0 ? 'structured' : 'unstructured';
  const cues = structuredCues.length > 0 ? structuredCues : inferredCues;
  const confidence = mode === 'structured'
    ? structuredCues.length >= 2 ? 0.96 : 0.9
    : inferredCues.length >= 2 ? 0.74 : 0.64;

  return {
    mode,
    confidence,
    cues,
    guidance:
      mode === 'structured'
        ? 'Atlas will respect these explicit fields on confirm.'
        : 'Atlas inferred this from freeform text. Add labels like due: or priority: for tighter control.',
  };
}

export function parseAtlasEntry(raw: string): ParsedEntry {
  let working = raw;
  const spansToRemove: Array<[number, number]> = [];
  const structuredCues: string[] = [];
  const inferredCues: string[] = [];

  let inferredType: 'task' | 'habit' | 'goal' | undefined;

  for (const rule of TYPE_RULES) {
    const match = working.match(rule.pattern);
    if (match && match.index !== undefined) {
      inferredType = rule.value;
      structuredCues.push(`prefix:${rule.value}`);
      working = removeMatchedSpan(working, match);
      break;
    }
  }

  const structuredTypeMatch = working.match(STRUCTURED_TYPE_RULE);
  if (structuredTypeMatch) {
    inferredType = structuredTypeMatch[1].toLowerCase() as ParsedEntry['type'];
    structuredCues.push(`type:${inferredType}`);
    working = removeMatchedSpan(working, structuredTypeMatch);
  }

  let dueDate: string | undefined;
  const structuredDateMatch = working.match(STRUCTURED_DATE_RULE);
  if (structuredDateMatch) {
    const parsed = parseStructuredDateToken(structuredDateMatch[1]);
    if (parsed) {
      dueDate = parsed;
      structuredCues.push(`due:${structuredDateMatch[1].toLowerCase()}`);
      working = removeMatchedSpan(working, structuredDateMatch);
    }
  }

  if (!dueDate) {
    let bestIndex = Infinity;
    let bestMatch: RegExpMatchArray | null = null;
    let bestRule: DateRule | null = null;

    for (const rule of DATE_RULES) {
      const match = working.match(rule.pattern);
      if (match && match.index !== undefined && match.index < bestIndex) {
        bestIndex = match.index;
        bestMatch = match;
        bestRule = rule;
      }
    }

    if (bestRule && bestMatch && bestMatch.index !== undefined) {
      dueDate = bestRule.extract(bestMatch);
      spansToRemove.push([bestMatch.index, bestMatch.index + bestMatch[0].length]);
      inferredCues.push('due:natural-language');
    }
  }

  let recurrenceRule: RecurrenceRule | undefined;
  const structuredRecurrenceMatch = working.match(STRUCTURED_RECURRENCE_RULE);
  if (structuredRecurrenceMatch) {
    recurrenceRule = structuredRecurrenceMatch[1].toLowerCase() as RecurrenceRule;
    structuredCues.push(`repeat:${recurrenceRule}`);
    working = removeMatchedSpan(working, structuredRecurrenceMatch);
  }

  if (!recurrenceRule) {
    for (const rule of RECURRENCE_RULES) {
      const match = working.match(rule.pattern);
      if (match && match.index !== undefined) {
        recurrenceRule = rule.value;
        spansToRemove.push([match.index, match.index + match[0].length]);
        inferredCues.push(`repeat:${rule.value}`);
        break;
      }
    }
  }

  let energyLevel: EnergyLevel | undefined;
  const structuredEnergyMatch = working.match(STRUCTURED_ENERGY_RULE);
  if (structuredEnergyMatch) {
    energyLevel = structuredEnergyMatch[1].toLowerCase() as EnergyLevel;
    structuredCues.push(`energy:${energyLevel}`);
    working = removeMatchedSpan(working, structuredEnergyMatch);
  }

  if (!energyLevel) {
    for (const rule of ENERGY_RULES) {
      const match = working.match(rule.pattern);
      if (match && match.index !== undefined) {
        energyLevel = rule.value;
        spansToRemove.push([match.index, match.index + match[0].length]);
        inferredCues.push(`energy:${rule.value}`);
        break;
      }
    }
  }

  let priority: PriorityLevel | undefined;
  const structuredPriorityMatch = working.match(STRUCTURED_PRIORITY_RULE);
  if (structuredPriorityMatch) {
    priority = structuredPriorityMatch[1].toLowerCase() as PriorityLevel;
    structuredCues.push(`priority:${priority}`);
    working = removeMatchedSpan(working, structuredPriorityMatch);
  }

  if (!priority) {
    for (const rule of PRIORITY_RULES) {
      const match = working.match(rule.pattern);
      if (match && match.index !== undefined) {
        priority = rule.value;
        spansToRemove.push([match.index, match.index + match[0].length]);
        inferredCues.push(`priority:${rule.value}`);
        break;
      }
    }
  }

  const sortedSpans = spansToRemove.sort((left, right) => right[0] - left[0]);
  let cleaned = working;
  for (const [start, end] of sortedSpans) {
    cleaned = cleaned.slice(0, start) + cleaned.slice(end);
  }

  const title = cleaned.replace(/\s{2,}/g, ' ').trim() || raw.trim();
  const type = inferredType || (recurrenceRule !== undefined ? 'habit' : 'task');

  return {
    type,
    title,
    dueDate,
    recurrenceRule,
    energyLevel,
    priority,
    ingestion: buildIngestionMetadata(structuredCues, inferredCues),
  };
}

export function useAtlasEntryParser(): { parse: (input: string) => ParsedEntry } {
  const parse = useCallback((input: string): ParsedEntry => parseAtlasEntry(input), []);
  return { parse };
}
