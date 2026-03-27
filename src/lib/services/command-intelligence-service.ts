import type {
  CommandCapability,
  CommandIntentType,
  ParsedCommandEnvelope,
  ParsedCommandIntent,
  ParsedCommandMention,
  ParsedCommandMentionDisposition,
  ParsedCommandRouteHint,
  ParsedCommandTimeReference,
} from '@/lib/contracts/command-intelligence';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';
import { OrchestrationCacheService } from './orchestration-cache-service';
import { OrchestrationRolloutService } from './orchestration-rollout-service';
import { buildLLMSystemPrompt, buildLLMUserPrompt } from './intent-prompt-builder';
import { IntentParseError } from './intent-parse-error';

type GenerateJSONFn = <T = unknown>(
  prompt: string,
  options?: { systemPrompt?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal; model?: string },
) => Promise<T>;

interface ParseOptions {
  sourceModuleId: string;
  now?: Date;
  timezone?: string;
}

interface IntentDraft {
  intentType: CommandIntentType;
  verb: string;
  mutatesState: boolean;
  confidence: number;
  capabilities: CommandCapability[];
  candidateModules: ModuleId[];
  routeHints: ParsedCommandRouteHint[];
  entities: ParsedCommandIntent['entities'];
}

const COMMAND_VERBS = /\b(plan|schedule|update|move|change|set|add|rest|remind|help|research|refactor|track|check|create|log|show|go|do|feel|need|want|make)\b/i;
const MENTIONABLE_MODULE_IDS: ModuleId[] = ['agnes', 'atlas', 'soma', 'titan', 'ledger', 'scout', 'forge'];
const KNOWN_INTENT_TYPES: CommandIntentType[] = [
  'plan_day',
  'schedule_item',
  'update_schedule',
  'recovery_day',
  'emotional_support',
  'fitness',
  'medical',
  'financial',
  'research',
  'technical',
  'general',
];
const KNOWN_CAPABILITIES: CommandCapability[] = [
  'daily-planning',
  'schedule-mutation',
  'reminder-management',
  'recovery-planning',
  'emotional-support',
  'fitness-planning',
  'medical-review',
  'financial-planning',
  'research',
  'technical-work',
  'general-orchestration',
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function splitIntoSegments(input: string): string[] {
  const normalized = normalizeWhitespace(input);
  const commaSegments = normalized
    .split(/\s*[;,]\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (commaSegments.length > 1) return commaSegments;

  // Split safely on conjunctions without requiring strict verb matches
  return normalized
    .split(/\s+(?:and|then)\s+/i)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function buildLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildLocalIsoDateTime(dateKey: string, time24: string): string {
  const [year, month, day] = dateKey.split('-').map((part) => parseInt(part, 10));
  const [hours, minutes] = time24.split(':').map((part) => parseInt(part, 10));
  const local = new Date(year, month - 1, day, hours, minutes, 0, 0);
  const offsetMinutes = -local.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const offsetHours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, '0');
  const offsetMins = String(Math.abs(offsetMinutes) % 60).padStart(2, '0');
  return `${dateKey}T${time24}:00${offsetSign}${offsetHours}:${offsetMins}`;
}

function parseTime24(segment: string): { raw: string; time24: string } | null {
  const compact = segment.match(/\bat\s+(\d{3,4})\b/i);
  if (compact) {
    const raw = compact[0];
    const digits = compact[1];
    const hours = digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2);
    const minutes = digits.length === 3 ? digits.slice(1) : digits.slice(2);
    const hh = parseInt(hours, 10);
    const mm = parseInt(minutes, 10);
    if (!Number.isNaN(hh) && !Number.isNaN(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return { raw, time24: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
    }
  }

  const standard = segment.match(/\bat\s+(\d{1,2}:\d{2})\b/i);
  if (!standard) return null;
  const [hours, minutes] = standard[1].split(':').map((part) => parseInt(part, 10));
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return { raw: standard[0], time24: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` };
}

function normalizeTimeText(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{3,4}$/.test(trimmed)) {
    const digits = trimmed;
    const hours = digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2);
    const minutes = digits.length === 3 ? digits.slice(1) : digits.slice(2);
    const hh = parseInt(hours, 10);
    const mm = parseInt(minutes, 10);
    if (!Number.isNaN(hh) && !Number.isNaN(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [hours, minutes] = trimmed.split(':').map((part) => parseInt(part, 10));
    if (!Number.isNaN(hours) && !Number.isNaN(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  return trimmed;
}

function normalizeDateText(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return undefined;
}

function parseTemporalReferences(segment: string, now: Date, timezone: string): ParsedCommandTimeReference[] {
  const refs: ParsedCommandTimeReference[] = [];
  const lower = segment.toLowerCase();
  let targetDateKey: string | undefined;

  if (/\btomorrow\b/.test(lower)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    targetDateKey = buildLocalDateKey(tomorrow);
    refs.push({
      raw: 'tomorrow',
      kind: 'date',
      timezone,
      isoDate: targetDateKey,
      relation: 'tomorrow',
    });
  }

  const timeMatch = parseTime24(segment);
  if (timeMatch) {
    refs.push({
      raw: timeMatch.raw,
      kind: targetDateKey ? 'datetime' : 'time',
      timezone,
      time24: timeMatch.time24,
      isoDate: targetDateKey,
      isoDateTime: targetDateKey ? buildLocalIsoDateTime(targetDateKey, timeMatch.time24) : undefined,
    });
  }

  return refs;
}

function extractTitle(segment: string): string | undefined {
  const match = segment.match(/\b(?:schedule|add|set)\s+(.+?)(?:\s+at\s+\d{1,4}|\s+at\s+\d{1,2}:\d{2}|\s+tomorrow|\s+today|$)/i);
  if (!match) return undefined;
  return match[1]
    .replace(/^(?:a|an|the)\s+/i, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildIntentDraft(segment: string): IntentDraft {
  const normalized = normalizeWhitespace(segment);
  const lower = normalized.toLowerCase();

  if (/plan my day|day plan|daily plan|plan tomorrow|plan .* tomorrow/.test(lower)) {
    return {
      intentType: 'plan_day',
      verb: 'plan',
      mutatesState: true,
      confidence: 0.9,
      capabilities: ['daily-planning'],
      candidateModules: ['atlas'],
      routeHints: [{ moduleId: 'atlas', confidence: 0.9, reason: 'daily planning intent', source: 'command_intelligence' }],
      entities: {},
    };
  }

  if (/\b(update|move|change|reschedule)\b/.test(lower) || (/\brest\b/.test(lower) && /\btomorrow\b/.test(lower))) {
    const routeHints: ParsedCommandRouteHint[] = [
      { moduleId: 'atlas', confidence: 0.86, reason: 'schedule update intent', source: 'command_intelligence' },
    ];
    const candidateModules: ModuleId[] = ['atlas'];
    const capabilities: CommandCapability[] = ['schedule-mutation'];

    if (/\brest\b/.test(lower) || /\b(exhausted|tired)\b/.test(lower)) {
      routeHints.push(
        { moduleId: 'soma', confidence: 0.74, reason: 'recovery context', source: 'command_intelligence' },
        { moduleId: 'agnes', confidence: 0.62, reason: 'rest framing support', source: 'command_intelligence' },
      );
      candidateModules.push('soma', 'agnes');
      capabilities.push('recovery-planning');
    }

    return {
      intentType: /\brest\b/.test(lower) ? 'recovery_day' : 'update_schedule',
      verb: /\b(update|move|change|reschedule)\b/.exec(lower)?.[1] ?? 'update',
      mutatesState: true,
      confidence: /\brest\b/.test(lower) ? 0.88 : 0.82,
      capabilities,
      candidateModules,
      routeHints,
      entities: { status: /\brest\b/.test(lower) ? 'rest' : undefined },
    };
  }

  if (/\b(schedule|add|set|create)\b/.test(lower) && (Boolean(parseTime24(segment)) || /\btomorrow\b/.test(lower))) {
    const title = extractTitle(normalized);
    return {
      intentType: 'schedule_item',
      verb: /\b(schedule|add|set|create)\b/.exec(lower)?.[1] ?? 'schedule',
      mutatesState: true,
      confidence: 0.87,
      capabilities: ['schedule-mutation', 'daily-planning'],
      candidateModules: ['atlas'],
      routeHints: [{ moduleId: 'atlas', confidence: 0.87, reason: 'scheduled planning item', source: 'command_intelligence' }],
      entities: { title },
    };
  }

  if (/\b(anxiety|emotion|feeling|therapy|relationship|depression|trauma|exhausted|tired|stressed|sad|overwhelmed|alone|lonely)\b/.test(lower) || /\b(feel|feeling)\b/.test(lower)) {
    return {
      intentType: 'emotional_support',
      verb: COMMAND_VERBS.exec(lower)?.[1] ?? 'support',
      mutatesState: false,
      confidence: 0.85,
      capabilities: ['emotional-support'],
      candidateModules: ['agnes'],
      routeHints: [{ moduleId: 'agnes', confidence: 0.85, reason: 'emotional support intent', source: 'command_intelligence' }],
      entities: {},
    };
  }

  if (/\b(workout|training|fitness|gym|exercise|lift|run|walk|cycle|swim|routine|program)\b/.test(lower)) {
    return {
      intentType: 'fitness',
      verb: COMMAND_VERBS.exec(lower)?.[1] ?? 'plan',
      mutatesState: true,
      confidence: 0.85,
      capabilities: ['fitness-planning'],
      candidateModules: ['titan'],
      routeHints: [{ moduleId: 'titan', confidence: 0.85, reason: 'fitness intent', source: 'command_intelligence' }],
      entities: {},
    };
  }

  if (/\b(bloodwork|biomarker|hrv|sleep score|recovery|medical|clearance|sick|ill|hurt|pain|ache|injury)\b/.test(lower)) {
    return {
      intentType: 'medical',
      verb: COMMAND_VERBS.exec(lower)?.[1] ?? 'check',
      mutatesState: false,
      confidence: 0.82,
      capabilities: ['medical-review'],
      candidateModules: ['soma'],
      routeHints: [{ moduleId: 'soma', confidence: 0.82, reason: 'medical review intent', source: 'command_intelligence' }],
      entities: {},
    };
  }

  if (/\b(budget|expense|spending|money|finance|debt|savings|pay)\b/.test(lower)) {
    return {
      intentType: 'financial',
      verb: COMMAND_VERBS.exec(lower)?.[1] ?? 'plan',
      mutatesState: true,
      confidence: 0.8,
      capabilities: ['financial-planning'],
      candidateModules: ['ledger'],
      routeHints: [{ moduleId: 'ledger', confidence: 0.8, reason: 'financial planning intent', source: 'command_intelligence' }],
      entities: {},
    };
  }

  if (/\b(research|verify|evidence|sources|fact-check|topic|learn)\b/.test(lower)) {
    return {
      intentType: 'research',
      verb: COMMAND_VERBS.exec(lower)?.[1] ?? 'research',
      mutatesState: false,
      confidence: 0.8,
      capabilities: ['research'],
      candidateModules: ['scout'],
      routeHints: [{ moduleId: 'scout', confidence: 0.8, reason: 'research intent', source: 'command_intelligence' }],
      entities: {},
    };
  }

  if (/\b(code|refactor|typescript|repository|github|bug|build|dev|programming)\b/.test(lower)) {
    return {
      intentType: 'technical',
      verb: COMMAND_VERBS.exec(lower)?.[1] ?? 'refactor',
      mutatesState: false,
      confidence: 0.8,
      capabilities: ['technical-work'],
      candidateModules: ['forge'],
      routeHints: [{ moduleId: 'forge', confidence: 0.8, reason: 'technical work intent', source: 'command_intelligence' }],
      entities: {},
    };
  }

  return {
    intentType: 'general',
    verb: COMMAND_VERBS.exec(lower)?.[1] ?? 'talk',
    mutatesState: false,
    confidence: 0.45,
    capabilities: ['general-orchestration'],
    candidateModules: ['nexus'],
    routeHints: [{ moduleId: 'nexus', confidence: 0.45, reason: 'fallback general intent', source: 'command_intelligence' }],
    entities: {},
  };
}

function dedupeRouteHints(routeHints: ParsedCommandRouteHint[]): ParsedCommandRouteHint[] {
  const byModule = new Map<ModuleId, ParsedCommandRouteHint>();
  for (const hint of routeHints) {
    const existing = byModule.get(hint.moduleId);
    if (!existing || hint.confidence > existing.confidence) {
      byModule.set(hint.moduleId, hint);
    }
  }

  return Array.from(byModule.values()).sort((left, right) => right.confidence - left.confidence);
}

function clampConfidence(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function normalizeIntentType(value: unknown): CommandIntentType | null {
  if (typeof value !== 'string') return null;
  return (KNOWN_INTENT_TYPES.includes(value as CommandIntentType) ? value as CommandIntentType : null);
}

function normalizeCapabilities(value: unknown, fallback: CommandCapability[]): CommandCapability[] {
  if (!Array.isArray(value)) return fallback;
  const filtered = value.filter((cap): cap is CommandCapability => KNOWN_CAPABILITIES.includes(cap as CommandCapability));
  return filtered.length > 0 ? filtered : fallback;
}

function normalizeModuleIds(value: unknown, fallback: ModuleId[]): ModuleId[] {
  if (!Array.isArray(value)) return fallback;
  const filtered = value.filter((moduleId): moduleId is ModuleId =>
    typeof moduleId === 'string' && moduleId in MODULE_MANIFEST
  );
  return filtered.length > 0 ? filtered : fallback;
}

function normalizeRouteHints(
  value: unknown,
  fallback: ParsedCommandRouteHint[],
): ParsedCommandRouteHint[] {
  if (!Array.isArray(value)) return fallback;
  const filtered = value
    .filter((hint) => hint && typeof hint === 'object')
    .map((hint) => {
      const moduleId = (hint as ParsedCommandRouteHint).moduleId;
      if (!moduleId || !(moduleId in MODULE_MANIFEST)) return null;
      return {
        moduleId,
        confidence: clampConfidence((hint as ParsedCommandRouteHint).confidence, 0.62),
        reason: typeof (hint as ParsedCommandRouteHint).reason === 'string'
          ? (hint as ParsedCommandRouteHint).reason
          : 'llm_hint',
        source: 'command_intelligence',
      } satisfies ParsedCommandRouteHint;
    })
    .filter((hint): hint is ParsedCommandRouteHint => Boolean(hint));
  return filtered.length > 0 ? filtered : fallback;
}

function defaultsForIntentType(intentType: CommandIntentType): IntentDraft {
  switch (intentType) {
    case 'plan_day':
      return {
        intentType,
        verb: 'plan',
        mutatesState: true,
        confidence: 0.9,
        capabilities: ['daily-planning'],
        candidateModules: ['atlas'],
        routeHints: [{ moduleId: 'atlas', confidence: 0.9, reason: 'daily planning intent', source: 'command_intelligence' }],
        entities: {},
      };
    case 'schedule_item':
      return {
        intentType,
        verb: 'schedule',
        mutatesState: true,
        confidence: 0.87,
        capabilities: ['schedule-mutation', 'daily-planning'],
        candidateModules: ['atlas'],
        routeHints: [{ moduleId: 'atlas', confidence: 0.87, reason: 'scheduled planning item', source: 'command_intelligence' }],
        entities: {},
      };
    case 'update_schedule':
      return {
        intentType,
        verb: 'update',
        mutatesState: true,
        confidence: 0.82,
        capabilities: ['schedule-mutation'],
        candidateModules: ['atlas'],
        routeHints: [{ moduleId: 'atlas', confidence: 0.86, reason: 'schedule update intent', source: 'command_intelligence' }],
        entities: {},
      };
    case 'recovery_day':
      return {
        intentType,
        verb: 'rest',
        mutatesState: true,
        confidence: 0.88,
        capabilities: ['schedule-mutation', 'recovery-planning'],
        candidateModules: ['atlas', 'soma', 'agnes'],
        routeHints: [
          { moduleId: 'atlas', confidence: 0.86, reason: 'schedule update intent', source: 'command_intelligence' },
          { moduleId: 'soma', confidence: 0.74, reason: 'recovery context', source: 'command_intelligence' },
          { moduleId: 'agnes', confidence: 0.62, reason: 'rest framing support', source: 'command_intelligence' },
        ],
        entities: { status: 'rest' },
      };
    case 'emotional_support':
      return {
        intentType,
        verb: 'support',
        mutatesState: false,
        confidence: 0.85,
        capabilities: ['emotional-support'],
        candidateModules: ['agnes'],
        routeHints: [{ moduleId: 'agnes', confidence: 0.85, reason: 'emotional support intent', source: 'command_intelligence' }],
        entities: {},
      };
    case 'fitness':
      return {
        intentType,
        verb: 'plan',
        mutatesState: true,
        confidence: 0.85,
        capabilities: ['fitness-planning'],
        candidateModules: ['titan'],
        routeHints: [{ moduleId: 'titan', confidence: 0.85, reason: 'fitness intent', source: 'command_intelligence' }],
        entities: {},
      };
    case 'medical':
      return {
        intentType,
        verb: 'check',
        mutatesState: false,
        confidence: 0.82,
        capabilities: ['medical-review'],
        candidateModules: ['soma'],
        routeHints: [{ moduleId: 'soma', confidence: 0.82, reason: 'medical review intent', source: 'command_intelligence' }],
        entities: {},
      };
    case 'financial':
      return {
        intentType,
        verb: 'plan',
        mutatesState: true,
        confidence: 0.8,
        capabilities: ['financial-planning'],
        candidateModules: ['ledger'],
        routeHints: [{ moduleId: 'ledger', confidence: 0.8, reason: 'financial planning intent', source: 'command_intelligence' }],
        entities: {},
      };
    case 'research':
      return {
        intentType,
        verb: 'research',
        mutatesState: false,
        confidence: 0.8,
        capabilities: ['research'],
        candidateModules: ['scout'],
        routeHints: [{ moduleId: 'scout', confidence: 0.8, reason: 'research intent', source: 'command_intelligence' }],
        entities: {},
      };
    case 'technical':
      return {
        intentType,
        verb: 'refactor',
        mutatesState: false,
        confidence: 0.8,
        capabilities: ['technical-work'],
        candidateModules: ['forge'],
        routeHints: [{ moduleId: 'forge', confidence: 0.8, reason: 'technical work intent', source: 'command_intelligence' }],
        entities: {},
      };
    case 'general':
    default:
      return {
        intentType: 'general',
        verb: 'talk',
        mutatesState: false,
        confidence: 0.45,
        capabilities: ['general-orchestration'],
        candidateModules: ['nexus'],
        routeHints: [{ moduleId: 'nexus', confidence: 0.45, reason: 'fallback general intent', source: 'command_intelligence' }],
        entities: {},
      };
  }
}

function buildTemporalFromEntities(
  rawSegment: string,
  entities: ParsedCommandIntent['entities'],
  timezone: string,
): ParsedCommandTimeReference[] {
  const refs: ParsedCommandTimeReference[] = [];
  const dateText = normalizeDateText(entities.dateText);
  const timeText = normalizeTimeText(entities.timeText);
  if (dateText) {
    refs.push({
      raw: /\btomorrow\b/i.test(rawSegment) ? 'tomorrow' : dateText,
      kind: 'date',
      timezone,
      isoDate: dateText,
      relation: /\btomorrow\b/i.test(rawSegment) ? 'tomorrow' : undefined,
    });
  }
  if (timeText) {
    const isoDateTime = dateText ? buildLocalIsoDateTime(dateText, timeText) : undefined;
    refs.push({
      raw: timeText,
      kind: dateText ? 'datetime' : 'time',
      timezone,
      time24: timeText,
      isoDate: dateText,
      isoDateTime,
    });
  }
  return refs;
}

function buildAmbiguityReasons(intents: ParsedCommandIntent[]): string[] {
  const reasons: string[] = [];
  if (intents.some((intent) => intent.intentType === 'general')) {
    reasons.push('One or more segments remained general and may need clarification.');
  }
  if (intents.some((intent) =>
    /\b(schedule|add|set|update|move|change|create)\b/i.test(intent.rawSegment) &&
    !intent.entities.dateText &&
    !intent.entities.timeText
  )) {
    reasons.push('A scheduling-style command did not include a specific time or date.');
  }
  return reasons;
}

function normalizeMentions(value: unknown, fallback: ParsedCommandMention[] | undefined): ParsedCommandMention[] | undefined {
  if (!Array.isArray(value)) return fallback;
  const mentions = value
    .filter((mention) => mention && typeof mention === 'object')
    .map((mention) => {
      const moduleId = (mention as ParsedCommandMention).moduleId;
      if (!moduleId || !(moduleId in MODULE_MANIFEST)) return null;
      const disposition = (mention as ParsedCommandMention).disposition;
      if (!['vocative', 'consultative', 'ownership'].includes(disposition)) return null;
      return {
        moduleId,
        raw: typeof (mention as ParsedCommandMention).raw === 'string'
          ? (mention as ParsedCommandMention).raw
          : String(moduleId),
        confidence: clampConfidence((mention as ParsedCommandMention).confidence, 0.62),
        disposition: disposition as ParsedCommandMentionDisposition,
      } satisfies ParsedCommandMention;
    })
    .filter((mention): mention is ParsedCommandMention => Boolean(mention));
  return mentions.length > 0 ? mentions : fallback;
}

function detectMentionDisposition(input: string, token: string): ParsedCommandMentionDisposition | null {
  const escaped = escapeRegex(token);

  if (new RegExp(`^(?:hey\\s+|hi\\s+|hello\\s+)?${escaped}\\s*[,:-]`, 'i').test(input)) {
    return 'vocative';
  }

  if (new RegExp(`\\b(?:ask|consult|include|loop in|bring in|check with|talk to|speak to)\\s+${escaped}\\b`, 'i').test(input)) {
    return 'consultative';
  }

  if (
    new RegExp(`\\b(?:delegate|route|handoff|transfer|switch)\\s+to\\s+${escaped}\\b`, 'i').test(input) ||
    new RegExp(`\\b${escaped}\\s+should\\s+handle\\b`, 'i').test(input) ||
    new RegExp(`\\blet\\s+${escaped}\\s+handle\\b`, 'i').test(input)
  ) {
    return 'ownership';
  }

  return null;
}

function detectMentions(input: string): ParsedCommandMention[] {
  const mentions = MENTIONABLE_MODULE_IDS.flatMap((moduleId) => {
    const token = MODULE_MANIFEST[moduleId]?.alias ?? moduleId;
    const disposition = detectMentionDisposition(input, token);
    if (!disposition) return [];

    const match = input.match(new RegExp(`\\b${escapeRegex(token)}\\b`, 'i'));
    return [{
      moduleId,
      raw: match?.[0] ?? token,
      confidence: disposition === 'ownership' ? 0.92 : disposition === 'vocative' ? 0.9 : 0.84,
      disposition,
    } satisfies ParsedCommandMention];
  });

  return mentions
    .sort((left, right) => input.toLowerCase().indexOf(left.raw.toLowerCase()) - input.toLowerCase().indexOf(right.raw.toLowerCase()))
    .filter((mention, index, all) => all.findIndex((candidate) => candidate.moduleId === mention.moduleId) === index);
}

export const CommandIntelligenceService = {
  parse(rawInput: string, options: ParseOptions): ParsedCommandEnvelope {
    const normalizedInput = normalizeWhitespace(rawInput);
    const now = options.now ?? new Date();
    const timezone = options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const cacheKey = [
      options.sourceModuleId,
      timezone,
      buildLocalDateKey(now),
      normalizedInput.toLowerCase(),
    ].join('|');

    const envelope: ParsedCommandEnvelope = OrchestrationCacheService.remember('command-parse', cacheKey, () => {
      const segments = splitIntoSegments(normalizedInput);
      const mentions = detectMentions(normalizedInput);

      const intents: ParsedCommandIntent[] = segments.map((segment, index) => {
        const temporal = parseTemporalReferences(segment, now, timezone);
        const draft = buildIntentDraft(segment);
        return {
          id: `intent-${index + 1}`,
          rawSegment: segment,
          intentType: draft.intentType,
          verb: draft.verb,
          mutatesState: draft.mutatesState,
          confidence: draft.confidence,
          capabilities: draft.capabilities,
          candidateModules: draft.candidateModules,
          routeHints: draft.routeHints,
          dependsOn: index > 0 ? [`intent-${index}`] : [],
          entities: {
            ...draft.entities,
            dateText: draft.entities.dateText ?? temporal.find((ref) => ref.isoDate)?.isoDate,
            timeText: draft.entities.timeText ?? temporal.find((ref) => ref.time24)?.time24,
          },
          temporal,
        };
      });

      const temporalReferences = intents.flatMap((intent) => intent.temporal);
      const sharedRouteHints = dedupeRouteHints(intents.flatMap((intent) => intent.routeHints));
      const mentionedModuleIds = mentions.map((mention) => mention.moduleId);
      const ambiguityReasons: string[] = [];

      if (intents.some((intent) => intent.intentType === 'general')) {
        ambiguityReasons.push('One or more segments remained general and may need clarification.');
      }

      if (intents.some((intent) => /\b(schedule|add|set|update|move|change|create)\b/i.test(intent.rawSegment) && !intent.entities.dateText && !intent.entities.timeText)) {
        ambiguityReasons.push('A scheduling-style command did not include a specific time or date.');
      }

      const confidence = intents.length > 0
        ? Number((intents.reduce((sum, intent) => sum + intent.confidence, 0) / intents.length).toFixed(2))
        : 0.45;

      return {
        rawInput,
        normalizedInput,
        parserVersion: 'phase1-v1',
        parserMode: 'phase1',
        sourceModuleId: options.sourceModuleId,
        generatedAt: now.toISOString(),
        timezone,
        confidence,
        intents,
        temporalReferences,
        sharedRouteHints,
        mentions,
        mentionedModuleIds,
        requiresClarification: ambiguityReasons.length > 0 && confidence < 0.7,
        ambiguityReasons,
      };
    });
    OrchestrationRolloutService.recordParsedCommand(envelope);
    return envelope;
  },

  async parseWithLLM(
    rawInput: string,
    options: ParseOptions & { generateJSON?: GenerateJSONFn; signal?: AbortSignal },
  ): Promise<ParsedCommandEnvelope> {
    const fallback = this.parse(rawInput, options);
    if (!options.generateJSON) return fallback;

    const normalizedInput = normalizeWhitespace(rawInput);
    const now = options.now ?? new Date();
    const timezone = options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

    const systemPrompt = buildLLMSystemPrompt();
    const prompt = buildLLMUserPrompt({ rawInput, timezone, now });

    let llm: {
      intents?: Array<Record<string, unknown>>;
      mentions?: Array<Record<string, unknown>>;
      confidence?: number;
      ambiguityReasons?: string[];
    };

    try {
      llm = await options.generateJSON<typeof llm>(prompt, {
        systemPrompt,
        temperature: 0.1,
        maxTokens: 600,
        signal: options.signal,
      });
    } catch (error) {
      console.warn('[CommandIntelligenceService] LLM parse failed, falling back to phase 1 parser:', error);
      return { ...fallback, parserMode: 'llm-fallback' as const };
    }

    try {
      const intentsRaw = Array.isArray(llm?.intents) ? llm.intents : [];
      if (intentsRaw.length === 0) return { ...fallback, parserMode: 'llm-fallback' as const };

      const intents: ParsedCommandIntent[] = intentsRaw.map((raw, index) => {
        const base = fallback.intents[index];
        const rawSegment = typeof raw.rawSegment === 'string' ? raw.rawSegment : base?.rawSegment ?? normalizedInput;
        const normalizedIntentType = normalizeIntentType(raw.intentType);
        const intentType = normalizedIntentType ?? base?.intentType ?? 'general';
        const defaults = defaultsForIntentType(intentType);
        const verb = typeof raw.verb === 'string' ? raw.verb : base?.verb ?? defaults.verb;
        const entities: ParsedCommandIntent['entities'] = {
          title: typeof raw.title === 'string'
            ? raw.title
            : typeof (raw as any).entities?.title === 'string'
              ? (raw as any).entities.title
              : base?.entities.title,
          status: typeof raw.status === 'string'
            ? raw.status
            : typeof (raw as any).entities?.status === 'string'
              ? (raw as any).entities.status
              : base?.entities.status,
          dateText: normalizeDateText(
            typeof raw.dateText === 'string'
              ? raw.dateText
              : typeof (raw as any).entities?.dateText === 'string'
                ? (raw as any).entities.dateText
                : base?.entities.dateText
          ),
          timeText: normalizeTimeText(
            typeof raw.timeText === 'string'
              ? raw.timeText
              : typeof (raw as any).entities?.timeText === 'string'
                ? (raw as any).entities.timeText
                : base?.entities.timeText
          ),
        };

        const capabilities = normalizeCapabilities((raw as any).capabilities, base?.capabilities ?? defaults.capabilities);
        const candidateModules = normalizeModuleIds((raw as any).candidateModules, base?.candidateModules ?? defaults.candidateModules);
        const routeHints = normalizeRouteHints((raw as any).routeHints, base?.routeHints ?? defaults.routeHints);

        const dependsOn = Array.isArray((raw as any).dependsOn)
          ? (raw as any).dependsOn.filter((id: unknown) => typeof id === 'string')
          : index > 0 ? [`intent-${index}`] : [];

        return {
          id: `intent-${index + 1}`,
          rawSegment,
          intentType,
          verb,
          mutatesState: typeof raw.mutatesState === 'boolean'
            ? raw.mutatesState
            : base?.mutatesState ?? defaults.mutatesState,
          confidence: clampConfidence(raw.confidence, base?.confidence ?? defaults.confidence),
          capabilities,
          candidateModules,
          routeHints,
          dependsOn,
          entities,
          temporal: buildTemporalFromEntities(rawSegment, entities, timezone),
        };
      });

      const temporalReferences = intents.flatMap((intent) => intent.temporal);
      const sharedRouteHints = dedupeRouteHints(intents.flatMap((intent) => intent.routeHints));
      const mentions = normalizeMentions(llm.mentions, fallback.mentions);
      const mentionedModuleIds = mentions?.map((mention) => mention.moduleId);
      const ambiguityReasons = Array.isArray(llm.ambiguityReasons) && llm.ambiguityReasons.length > 0
        ? llm.ambiguityReasons.filter((reason) => typeof reason === 'string')
        : buildAmbiguityReasons(intents);
      const confidence = clampConfidence(
        llm?.confidence,
        intents.reduce((sum, intent) => sum + intent.confidence, 0) / intents.length,
      );

      const envelope: ParsedCommandEnvelope = {
        rawInput,
        normalizedInput,
        parserVersion: 'llm-v1',
        parserMode: 'llm',
        sourceModuleId: options.sourceModuleId,
        generatedAt: now.toISOString(),
        timezone,
        confidence,
        intents,
        temporalReferences,
        sharedRouteHints,
        mentions,
        mentionedModuleIds,
        requiresClarification: ambiguityReasons.length > 0 && confidence < 0.7,
        ambiguityReasons,
      };

      OrchestrationRolloutService.recordParsedCommand(envelope);
      return envelope;
    } catch (error) {
      if (error instanceof IntentParseError) {
        return { ...fallback, parserMode: 'llm-fallback' as const };
      }
      throw new IntentParseError('normalization', 'Intent normalization failed after LLM response', error);
    }
  },
};
