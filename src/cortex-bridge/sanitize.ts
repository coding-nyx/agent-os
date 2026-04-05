/**
 * LLM output sanitizer — backed by cortex-logic KMP module.
 *
 * All exports maintain the same API shape as the prior TypeScript implementation
 * so call sites require no changes. The cortex-logic module must be built first:
 *   ./gradlew :cortex-logic:jsProductionLibraryDistribution
 */
import { LlmSanitizerJs, ExtractedMutation } from '@cortex-logic';

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

export type { ExtractedMutation };

const _sanitizer = new LlmSanitizerJs();

const ACTION_TAG_REGEX = /<action\b([^>]*)>([\s\S]*?)<\/action>/gi;
const BRACKET_ACTION_REGEX = /\[action\b([^\]]*)\]\s*({[\s\S]*?})(?=\s|$)/gi;
const TOOL_CALL_SEGMENT_REGEX = /<tool_call_begin>([\s\S]*?)<tool_call_end>/gi;
const TOOL_CALL_RAW_REGEX = /<tool_call>([\s\S]*?)<\/tool_call>/gi;

export function stripProviderControlTokens(content: string): string {
  if (!content) return '';
  return _sanitizer.stripProviderControlTokens(content);
}

export function isProviderControlOnly(content: string): boolean {
  if (!content) return false;
  return _sanitizer.isProviderControlOnly(content);
}

export function stripTechnicalFiller(text: string): string {
  if (!text) return '';
  return _sanitizer.stripTechnicalFiller(text);
}

export function stripInternalTags(content: string, options: StripOptions = {}): SanitizedContent {
  const directives: string[] = [];
  let normalized = content;

  normalized = normalized.replace(ACTION_TAG_REGEX, (_match, attrs) => {
    const typeMatch = String(attrs ?? '').match(/type\s*=\s*["']([^"']+)["']/i);
    const actionType = typeMatch?.[1] ?? 'unknown';
    directives.push(`[ACTION: ${actionType}]`);
    return ' ';
  });

  normalized = normalized.replace(BRACKET_ACTION_REGEX, (_match, attrs) => {
    const typeMatch = String(attrs ?? '').match(/type\s*=\s*["']([^"']+)["']/i);
    const actionType = typeMatch?.[1] ?? 'unknown';
    directives.push(`[ACTION: ${actionType}]`);
    return ' ';
  });

  normalized = normalized.replace(TOOL_CALL_SEGMENT_REGEX, (_match, body) => {
    const name = String(body ?? '').split('<tool_sep>')[0]?.trim();
    directives.push(`[TOOL_CALL: ${name || 'unknown'}]`);
    return ' ';
  });

  normalized = normalized.replace(TOOL_CALL_RAW_REGEX, () => {
    directives.push('[TOOL_CALL_RAW]');
    return ' ';
  });

  const r = _sanitizer.sanitize(normalized, options.retainSpacings ?? false);
  const internalParts = [r.internalThoughts, ...directives]
    .map((part) => (part ?? '').trim())
    .filter(Boolean);

  return {
    publicText: r.publicText,
    internalText: internalParts.length > 0 ? internalParts.join('\n') : null,
    isThinking: r.isThinking,
    isActing: r.isActing || directives.some((d) => d.startsWith('[ACTION:')),
    currentActionType: r.currentActionType ?? null,
  };
}

/**
 * Strips an incomplete XML/HTML tag from the END of a streaming chunk.
 */
export function stripPartialLeadingTag(text: string): string {
  return _sanitizer.stripPartialLeadingTag(text);
}

/**
 * Extracts all <mutation> tags from LLM output.
 * Format: <mutation vector="RESILIENCE" delta="-0.15"/>
 */
export function parseMutations(content: string): ExtractedMutation[] {
  return Array.from(_sanitizer.parseMutations(content));
}

/**
 * Strips <mutation> tags from the public text (internal directives, not user-facing).
 */
export function stripMutationTags(content: string): string {
  return _sanitizer.stripMutationTags(content);
}

export function sanitizeJsonPayload(content: string): string {
  if (!content) return '';
  return _sanitizer.sanitizeJsonPayload(content);
}
