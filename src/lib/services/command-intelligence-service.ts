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

const COMMAND_VERBS = /\b(plan|schedule|update|move|change|set|add|rest|remind|help|research|refactor|track|check)\b/i;
const MENTIONABLE_MODULE_IDS: ModuleId[] = ['agnes', 'atlas', 'soma', 'titan', 'ledger', 'scout', 'forge'];

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

  return normalized
    .split(/\s+(?:and|then)\s+(?=(?:plan|schedule|update|move|change|set|add|rest|remind|help|research|refactor|track|check)\b)/i)
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

    if (/\brest\b/.test(lower)) {
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

  if (/\b(schedule|add|set)\b/.test(lower) && (Boolean(parseTime24(segment)) || /\btomorrow\b/.test(lower))) {
    const title = extractTitle(normalized);
    return {
      intentType: 'schedule_item',
      verb: /\b(schedule|add|set)\b/.exec(lower)?.[1] ?? 'schedule',
      mutatesState: true,
      confidence: 0.87,
      capabilities: ['schedule-mutation', 'daily-planning'],
      candidateModules: ['atlas'],
      routeHints: [{ moduleId: 'atlas', confidence: 0.87, reason: 'scheduled planning item', source: 'command_intelligence' }],
      entities: { title },
    };
  }

  if (/\b(anxiety|emotion|feeling|therapy|relationship|depression|trauma)\b/.test(lower)) {
    return {
      intentType: 'emotional_support',
      verb: COMMAND_VERBS.exec(lower)?.[1] ?? 'support',
      mutatesState: false,
      confidence: 0.82,
      capabilities: ['emotional-support'],
      candidateModules: ['agnes'],
      routeHints: [{ moduleId: 'agnes', confidence: 0.82, reason: 'emotional support intent', source: 'command_intelligence' }],
      entities: {},
    };
  }

  if (/\b(workout|training|fitness|gym|exercise)\b/.test(lower)) {
    return {
      intentType: 'fitness',
      verb: COMMAND_VERBS.exec(lower)?.[1] ?? 'plan',
      mutatesState: true,
      confidence: 0.8,
      capabilities: ['fitness-planning'],
      candidateModules: ['titan'],
      routeHints: [{ moduleId: 'titan', confidence: 0.8, reason: 'fitness intent', source: 'command_intelligence' }],
      entities: {},
    };
  }

  if (/\b(bloodwork|biomarker|hrv|sleep score|recovery|medical|clearance)\b/.test(lower)) {
    return {
      intentType: 'medical',
      verb: COMMAND_VERBS.exec(lower)?.[1] ?? 'check',
      mutatesState: false,
      confidence: 0.78,
      capabilities: ['medical-review'],
      candidateModules: ['soma'],
      routeHints: [{ moduleId: 'soma', confidence: 0.78, reason: 'medical review intent', source: 'command_intelligence' }],
      entities: {},
    };
  }

  if (/\b(budget|expense|spending|money|finance|debt|savings)\b/.test(lower)) {
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

  if (/\b(research|verify|evidence|sources|fact-check|topic)\b/.test(lower)) {
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

  if (/\b(code|refactor|typescript|repository|github|bug|build)\b/.test(lower)) {
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

      if (intents.some((intent) => /\b(schedule|add|set|update|move|change)\b/i.test(intent.rawSegment) && !intent.entities.dateText && !intent.entities.timeText)) {
        ambiguityReasons.push('A scheduling-style command did not include a specific time or date.');
      }

      const confidence = intents.length > 0
        ? Number((intents.reduce((sum, intent) => sum + intent.confidence, 0) / intents.length).toFixed(2))
        : 0.45;

      return {
        rawInput,
        normalizedInput,
        parserVersion: 'phase1-v1',
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
};
