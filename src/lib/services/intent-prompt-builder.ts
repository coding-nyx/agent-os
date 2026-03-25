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
    '      "confidence": 0.0,',
    '      "mutatesState": true,',
    '      "capabilities": ["daily-planning"],',
    '      "candidateModules": ["atlas"],',
    '      "routeHints": [{"moduleId":"atlas","confidence":0.8,"reason":"...","source":"command_intelligence"}],',
    '      "entities": {"title":"...", "status":"...", "dateText":"YYYY-MM-DD", "timeText":"HH:mm"}',
    '    }',
    '  ],',
    '  "mentions": [{"moduleId":"atlas","raw":"Atlas","confidence":0.8,"disposition":"vocative"}],',
    '  "confidence": 0.0,',
    '  "ambiguityReasons": ["..."]',
    '}',
  ].join('\n');
}
