export type SanitizedContent = {
  publicText: string;
  internalText: string | null;
  isThinking: boolean;
};

export function stripInternalTags(content: string): SanitizedContent {
  // 1. Extract thought content
  const thoughtMatch = content.match(/<thought>([\s\S]*?)<\/thought>/);
  const thoughtText = thoughtMatch ? thoughtMatch[1].trim() : '';
  
  // 2. Extract action content
  const actionMatches = [...content.matchAll(/<action type="([^"]+)">([\s\S]*?)<\/action>/gi)];
  const actionText = actionMatches.map(m => `[ACTION: ${m[1]}] ${m[2].trim()}`).join('\n');

  // 3. Extract tool call content (Special tags mentioned by user)
  const toolCallMatches = [...content.matchAll(/<tool_call_begin>([\s\S]*?)<tool_call_end>/gi)];
  const toolCallText = toolCallMatches.map(m => {
      const parts = m[1].split('<tool_sep>');
      return `[TOOL_CALL: ${parts[0].trim()}] ${parts[1]?.trim() || ''}`;
  }).join('\n');

  // Check if currently thinking (open tag but no close tag)
  const isThinking = content.includes('<thought>') && !content.includes('</thought>');

  // Combine all internal context
  const internalParts = [thoughtText, actionText, toolCallText].filter(Boolean);
  const internalText = internalParts.length > 0 ? internalParts.join('\n\n') : null;

  // Aggressively clean public text of all tags
  let publicText = content
    .replace(/<thought>[\s\S]*?<\/thought>/g, '')
    .replace(/<action[\s\S]*?<\/action>/g, '')
    .replace(/<tool_calls_begin>[\s\S]*?<tool_calls_end>/g, '')
    .replace(/<tool_call_begin>[\s\S]*?<tool_call_end>/g, '');

  // Remove any unclosed tags at the end (for streaming)
  publicText = publicText
    .replace(/<thought>[\s\S]*/g, '')
    .replace(/<action[\s\S]*/g, '')
    .replace(/<tool_calls_begin>[\s\S]*/g, '')
    .replace(/<tool_call_begin>[\s\S]*/g, '')
    .trim();

  return { publicText, internalText, isThinking };
}

export function sanitizeJsonPayload(content: string): string {
  if (!content) return '';
  
  // Remove markdown code blocks if present (e.g. ```json ... ``` or ``` ...)
  let sanitized = content.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
}
