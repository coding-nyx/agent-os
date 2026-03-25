import type { ModuleId } from '@/lib/module-manifest';

export type CommandCapability =
  | 'daily-planning'
  | 'schedule-mutation'
  | 'reminder-management'
  | 'recovery-planning'
  | 'emotional-support'
  | 'fitness-planning'
  | 'medical-review'
  | 'financial-planning'
  | 'research'
  | 'research-enrichment'
  | 'technical-work'
  | 'general-orchestration';

export type CommandIntentType =
  | 'plan_day'
  | 'schedule_item'
  | 'update_schedule'
  | 'recovery_day'
  | 'emotional_support'
  | 'fitness'
  | 'medical'
  | 'financial'
  | 'research'
  | 'technical'
  | 'general';

export interface ParsedCommandTimeReference {
  raw: string;
  kind: 'date' | 'time' | 'datetime';
  timezone: string;
  isoDate?: string;
  isoDateTime?: string;
  time24?: string;
  relation?: 'tomorrow';
}

export interface ParsedCommandEntities {
  title?: string;
  status?: string;
  dateText?: string;
  timeText?: string;
}

export interface ParsedCommandRouteHint {
  moduleId: ModuleId;
  confidence: number;
  reason: string;
  source: 'command_intelligence';
}

export type ParsedCommandMentionDisposition = 'vocative' | 'consultative' | 'ownership';

export interface ParsedCommandMention {
  moduleId: ModuleId;
  raw: string;
  confidence: number;
  disposition: ParsedCommandMentionDisposition;
}

export interface ParsedCommandIntent {
  id: string;
  rawSegment: string;
  intentType: CommandIntentType;
  verb: string;
  mutatesState: boolean;
  confidence: number;
  capabilities: CommandCapability[];
  candidateModules: ModuleId[];
  routeHints: ParsedCommandRouteHint[];
  dependsOn: string[];
  entities: ParsedCommandEntities;
  temporal: ParsedCommandTimeReference[];
}

export interface ParsedCommandEnvelope {
  rawInput: string;
  normalizedInput: string;
  parserVersion: 'phase1-v1' | 'llm-v1';
  sourceModuleId: string;
  generatedAt: string;
  timezone: string;
  confidence: number;
  intents: ParsedCommandIntent[];
  temporalReferences: ParsedCommandTimeReference[];
  sharedRouteHints: ParsedCommandRouteHint[];
  mentions?: ParsedCommandMention[];
  mentionedModuleIds?: ModuleId[];
  requiresClarification: boolean;
  ambiguityReasons: string[];
}
