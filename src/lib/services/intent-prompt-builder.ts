/**
 * LLM prompt builders for CommandIntelligenceService.
 *
 * Extracted from command-intelligence-service.ts for testability and clarity.
 * These functions construct the prompts sent to the LLM for intent parsing.
 */

function buildLocalDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export interface LLMPromptContext {
  rawInput: string;
  timezone: string;
  now: Date;
}

export function buildLLMSystemPrompt(): string {
  return [
    'You are a command-intelligence parser.',
    'Return ONLY valid JSON. No markdown, no commentary.',
    'Parse the user input into intents using the provided enums.',
    'Interpret times like "1200" as "12:00" even without the word "at".',
    'If the user says "tomorrow", use the provided date.',
    'Intent → module mapping: plan_day|schedule_item|update_schedule|recovery_day → atlas.',
    'fitness|workout|exercise|routine|training → titan.',
    'medical|health|symptom|clearance|biomarker → soma.',
    'financial|budget|expense|money → ledger.',
    'research|evidence|study → scout.',
    'code|refactor|technical → forge.',
    'emotional|anxiety|therapy|mental → agnes.',
    'anything unclear → nexus.',
    'NEVER default to atlas unless the intent is clearly scheduling or day-planning.',
    'mutatesState must be true ONLY for write/create/update/delete/log actions; false for queries, analysis, proposals, and general conversation.',
    'confidence must reflect actual certainty — use 0.85-0.95 for clear matches, 0.5-0.7 for ambiguous, 0.4 for unclear.',
    'entities should only include fields relevant to the detected intentType — do not include scheduling fields for non-scheduling intents.',
  ].join(' ');
}

export function buildLLMUserPrompt(ctx: LLMPromptContext): string {
  const todayKey = buildLocalDateKey(ctx.now);
  const tomorrow = new Date(ctx.now);
  tomorrow.setDate(ctx.now.getDate() + 1);
  const tomorrowKey = buildLocalDateKey(tomorrow);

  return [
    `Input: "${ctx.rawInput}"`,
    `Timezone: ${ctx.timezone}`,
    `Today: ${todayKey}`,
    `Tomorrow: ${tomorrowKey}`,
    'Output JSON shape:',
    '{',
    '  "intents": [',
    '    {',
    '      "rawSegment": "string",',
    '      "intentType": "one of: plan_day|schedule_item|update_schedule|recovery_day|emotional_support|fitness|medical|financial|research|technical|general",',
    '      "verb": "string",',
    '      "confidence": 0.85,',
    '      "mutatesState": false,',
    '      "capabilities": ["<capability>"],',
    `      "candidateModules": ["<module_id>"],`,
    `      "routeHints": [{"moduleId":"<module_id>","confidence":0.85,"reason":"...","source":"command_intelligence"}],`,
    '      "entities": {}',
    '    }',
    '  ],',
    `  "mentions": [{"moduleId":"<module_id>","raw":"ModuleName","confidence":0.85,"disposition":"vocative"}],`,
    '  "confidence": 0.85,',
    '  "ambiguityReasons": ["..."]',
    '}',
  ].join('\n');
}
