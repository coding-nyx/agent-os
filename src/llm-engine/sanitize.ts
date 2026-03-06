export type SanitizedContent = {
  publicText: string;
  internalText: string | null;
  isThinking: boolean;
};

const PROVIDER_CONTROL_PATTERNS = [
  /\[user interrupted\]/gi
];

export function stripProviderControlTokens(content: string): string {
  if (!content) return '';
  let next = content;
  for (const pattern of PROVIDER_CONTROL_PATTERNS) {
    next = next.replace(pattern, '');
  }
  return next;
}

export function isProviderControlOnly(content: string): boolean {
  if (!content) return false;
  let hasControlPattern = false;
  let next = content;
  for (const pattern of PROVIDER_CONTROL_PATTERNS) {
    if (content.match(pattern)) {
      hasControlPattern = true;
      next = next.replace(pattern, '');
    }
  }
  return hasControlPattern && next.trim().length === 0;
}

export function stripInternalTags(content: string): SanitizedContent {
  const normalized = stripProviderControlTokens(content);
  // 1. Extract thought content
  const thoughtMatch = normalized.match(/<thought>([\s\S]*?)<\/thought>/);
  const thoughtText = thoughtMatch ? thoughtMatch[1].trim() : '';
  
  // 2. Extract action content
  const actionMatches = [...normalized.matchAll(/<action type="([^"]+)">([\s\S]*?)<\/action>/gi)];
  const actionText = actionMatches.map(m => `[ACTION: ${m[1]}] ${m[2].trim()}`).join('\n');

  // 3. Extract tool call content (Special tags mentioned by user)
  const toolCallMatches = [...normalized.matchAll(/<tool_call_begin>([\s\S]*?)<tool_call_end>/gi)];
  const toolCallText = toolCallMatches.map(m => {
      const parts = m[1].split('<tool_sep>');
      return `[TOOL_CALL: ${parts[0].trim()}] ${parts[1]?.trim() || ''}`;
  }).join('\n');

  const rawToolCallMatches = [...normalized.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/gi)];
  const rawToolCallText = rawToolCallMatches
    .map(m => `[TOOL_CALL_RAW] ${m[1].trim()}`)
    .join('\n');

  // Check if currently thinking (open tag but no close tag)
  const isThinking = normalized.includes('<thought>') && !normalized.includes('</thought>');

  // Combine all internal context
  const internalParts = [thoughtText, actionText, toolCallText, rawToolCallText].filter(Boolean);
  const internalText = internalParts.length > 0 ? internalParts.join('\n\n') : null;

  // Aggressively clean public text of all tags - REPLACE WITH SPACE TO PREVENT WORD JOINING
  let publicText = normalized
    .replace(/<thought>[\s\S]*?<\/thought>/g, ' ')
    .replace(/<action[\s\S]*?<\/action>/g, ' ')
    .replace(/<tool_calls_begin>[\s\S]*?<tool_calls_end>/g, ' ')
    .replace(/<tool_call_begin>[\s\S]*?<tool_call_end>/g, ' ')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, ' ');

  // Remove any unclosed tags at the end (for streaming) - REPLACE WITH SPACE
  publicText = publicText
    .replace(/<thought>[\s\S]*/g, ' ')
    .replace(/<action[\s\S]*/g, ' ')
    .replace(/<tool_calls_begin>[\s\S]*/g, ' ')
    .replace(/<tool_call_begin>[\s\S]*/g, ' ')
    .replace(/<tool_call>[\s\S]*/g, ' ')
    .replace(/<(?:t(?:h(?:o(?:u(?:g(?:ht?)?)?)?)?)?|a(?:c(?:t(?:i(?:on?)?)?)?)?|tool_call(?:s_begin|_begin)?)$/i, '')
    .replace(/\s+/g, ' ') // Collapse multiple spaces to one
    .trim();

  return { publicText, internalText, isThinking };
}

export function sanitizeJsonPayload(content: string): string {
  if (!content) return '';
  
  // 1. Remove markdown code blocks if present
  let sanitized = content.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1');
  
  // 2. Remove common AI prefixes/suffixes like "Here is the JSON:" or "JSON update:"
  sanitized = sanitized.replace(/^(?:JSON|Payload|Update):\s*/i, '');

  // 3. Trim whitespace
  sanitized = sanitized.trim();

  // 4. Attempt to fix common JSON errors (trailing commas)
  // This is a simple regex fix for trailing commas in arrays and objects
  sanitized = sanitized
    .replace(/,\s*\]/g, ']')
    .replace(/,\s*\}/g, '}');
  
  return sanitized;
}
