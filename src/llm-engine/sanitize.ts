export type SanitizedContent = {
  publicText: string;
  internalText: string | null;
  isThinking: boolean;
  isActing: boolean;
  currentActionType: string | null;
};

export type StripOptions = {
  retainSpacings?: boolean;
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

const TECHNICAL_FILLER_PATTERNS = [
  /^(?:Query(?:\s+Module)?|Searching(?:\s+Memory)?|Delegating(?:\s+to\s+module)?|Consulting(?:\s+module)?|Proposing(?:\s+reminder)?)\.?\s*/i,
];

export function stripTechnicalFiller(text: string): string {
  if (!text) return '';
  let next = text.trim();
  for (const pattern of TECHNICAL_FILLER_PATTERNS) {
    next = next.replace(pattern, '');
  }
  return next;
}

export function stripInternalTags(content: string, options: StripOptions = {}): SanitizedContent {
  const normalized = stripProviderControlTokens(content);

  // 1. Extract thought content — handles <thought> (custom), <think>/<thinking> (model-native, e.g. DeepSeek, Grok)
  //    Also handles cross-matched tags (e.g. model opens with <thinking> but closes with </thought>)
  const thoughtMatch = normalized.match(/<thought>([\s\S]*?)<\/thought>/)
    ?? normalized.match(/<thinking>([\s\S]*?)<\/thinking>/)
    ?? normalized.match(/<think>([\s\S]*?)<\/think>/)
    ?? normalized.match(/<thinking>([\s\S]*?)<\/thought>/)
    ?? normalized.match(/<thought>([\s\S]*?)<\/thinking>/)
    ?? normalized.match(/<think>([\s\S]*?)<\/thought>/)
    ?? normalized.match(/<thought>([\s\S]*?)<\/think>/);
  const thoughtText = thoughtMatch ? thoughtMatch[1].trim() : '';

  // 2. Extract action content — \s+ tolerates extra whitespace between tag name and attribute
  const actionMatches = [...normalized.matchAll(/<action\s+type=["']?([^"'\s>]+)["']?>([\s\S]*?)<\/action>/gi)];
  const actionText = actionMatches.map(m => `[ACTION: ${m[1]}] ${m[2].trim()}`).join('\n');
  const bracketActionMatches = [...normalized.matchAll(/\[action\s+type=["']?([a-z_]+)["']?\]\s*(\{[\s\S]*?\})/gi)];
  const bracketActionText = bracketActionMatches.map(m => `[ACTION: ${m[1]}] ${m[2].trim()}`).join('\n');

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

  // Check if currently thinking — open tag present but no closing tag yet (streaming)
  // Any thought closer (</thought>, </think>, </thinking>) is treated as valid regardless of opener
  const hasThoughtOpener = normalized.includes('<thought>') || normalized.includes('<think>') || normalized.includes('<thinking>');
  const hasThoughtCloser = normalized.includes('</thought>') || normalized.includes('</think>') || normalized.includes('</thinking>');
  const isThinking = hasThoughtOpener && !hasThoughtCloser;

  // Check if currently acting — <action type="..."> present but no </action> yet
  const actionOpenMatch = normalized.match(/<action\s+type=["']?([^"'\s>]+)["']?>[\s\S]*$/i);
  const isActing = actionOpenMatch !== null && !normalized.toLowerCase().includes('</action>', actionOpenMatch.index);
  const currentActionType = actionOpenMatch ? actionOpenMatch[1] : null;

  // Combine all internal context
  const internalParts = [thoughtText, actionText, bracketActionText, toolCallText, rawToolCallText].filter(Boolean);
  const internalText = internalParts.length > 0 ? internalParts.join('\n\n') : null;

  // Aggressively clean public text of all internal tags.
  // Replace with a single space so surrounding user-visible tokens don't fuse
  // together (e.g. "Hello<action>..</action>World" -> "Hello World").
  let publicText = normalized
    .replace(/<(?:thought|think|thinking)>[\s\S]*?<\/(?:thought|think|thinking)>/g, ' ')
    .replace(/<action[\s\S]*?<\/action>/g, ' ')
    .replace(/\[action\s+type=["']?[a-z_]+["']?\]\s*\{[\s\S]*?\}/gi, ' ')
    .replace(/<tool_calls_begin>[\s\S]*?<tool_calls_end>/g, ' ')
    .replace(/<tool_call_begin>[\s\S]*?<tool_call_end>/g, ' ')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, ' ');

  // Remove any unclosed tags at the end (for streaming)
  if (!hasThoughtCloser) {
    publicText = publicText
      .replace(/<thought>[\s\S]*/g, '')
      .replace(/<think>[\s\S]*/g, '')
      .replace(/<thinking>[\s\S]*/g, '');
  }
  publicText = publicText
    .replace(/<action[\s\S]*/g, '')
    .replace(/<tool_calls_begin>[\s\S]*/g, '')
    .replace(/<tool_call_begin>[\s\S]*/g, '')
    .replace(/<tool_call>[\s\S]*/g, '')
    .replace(/<(?:t(?:h(?:o(?:u(?:g(?:ht?)?)?)?|i(?:n(?:k(?:ing?)?)?)?)?)?|a(?:c(?:t(?:i(?:on?)?)?)?)?|tool_call(?:s_begin|_begin)?)$/i, '');

  if (!options.retainSpacings) {
    publicText = publicText.replace(/\s+/g, ' '); // Collapse multiple spaces to one
    publicText = publicText.trim();
  } else {
    // During streaming we want to keep leading/trailing spaces for immediate feedback
    // but we still want to collapse excessive newlines to prevent UI jumps.
    // 1. Remove leading whitespace (prevents ghost space if model starts with tag)
    publicText = publicText.replace(/^\s+/, '');
    // 2. Collapse 3+ consecutive newlines into exactly 2 newlines
    publicText = publicText.replace(/\n{3,}/g, '\n\n');
  }

  // 5. Post-process public text
  publicText = stripTechnicalFiller(publicText);

  return { publicText, internalText, isThinking, isActing, currentActionType };
}

/**
 * Strips an incomplete XML/HTML tag from the END of a streaming chunk.
 *
 * When a chunk boundary falls inside a tag (e.g. the stream delivers `<`,
 * `<th`, `<think`, or `<action type="fo`) before the closing `>` has
 * arrived, the raw `<...` fragment must be withheld from the UI until the
 * tag is complete. This prevents raw angle-bracket artefacts flickering
 * during streaming.
 *
 * Only the trailing incomplete tag is removed; all complete tags and
 * regular text content are left untouched.
 *
 * @example
 *   stripPartialLeadingTag("Hello world <")        // "Hello world "
 *   stripPartialLeadingTag("Hello world <br")      // "Hello world "
 *   stripPartialLeadingTag("Hello world <br>")     // "Hello world <br>"  (complete — unchanged)
 *   stripPartialLeadingTag("Hello world")          // "Hello world"       (no tag — unchanged)
 */
export function stripPartialLeadingTag(text: string): string {
  return text.replace(/<[^>]*$/, '');
}

export function sanitizeJsonPayload(content: string): string {
  if (!content) return '';
  
  // 1. Remove markdown code blocks if present
  let sanitized = content.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1');
  
  // 2. Remove common AI prefixes/suffixes like "Here is the JSON:" or "JSON update:"
  sanitized = sanitized.replace(/^(?:JSON|Payload|Update):\s*/i, '');

  // 3. Trim whitespace
  sanitized = sanitized.trim();

  // 4. Extract just the JSON object/array if there's trailing prose
  const jsonMatch = sanitized.match(/^(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    sanitized = jsonMatch[1];
  }

  // 5. Attempt to fix common JSON errors (trailing commas)
  // Only apply structural repairs if the JSON is already invalid
  try {
    JSON.parse(sanitized);
    return sanitized; // already valid — don't mutate
  } catch {
    sanitized = sanitized
      .replace(/,\s*\]/g, ']')
      .replace(/,\s*\}/g, '}');
  }

  return sanitized;
}
