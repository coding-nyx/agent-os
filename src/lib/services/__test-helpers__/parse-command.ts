import { CommandIntelligenceServiceJs } from '@cortex-logic';
import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';

const _parser = new CommandIntelligenceServiceJs();

interface ParseOptions {
  sourceModuleId: string;
  now?: Date;
  timezone?: string;
}

export function parseCommand(rawInput: string, options: ParseOptions): ParsedCommandEnvelope {
  const nowIso = (options.now ?? new Date()).toISOString().slice(0, 10);
  const timezone = options.timezone ?? 'UTC';
  return JSON.parse(_parser.parse(rawInput, options.sourceModuleId, nowIso, timezone)) as ParsedCommandEnvelope;
}
