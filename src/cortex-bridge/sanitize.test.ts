import { describe, it, expect } from 'vitest';
import {
  stripProviderControlTokens,
  isProviderControlOnly,
  stripInternalTags,
  sanitizeJsonPayload,
} from './sanitize';

describe('stripProviderControlTokens', () => {
  it('strips [user interrupted]', () => {
    expect(stripProviderControlTokens('Hello [user interrupted] world')).toBe('Hello  world');
  });

  it('is case-insensitive', () => {
    expect(stripProviderControlTokens('[USER INTERRUPTED]')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(stripProviderControlTokens('')).toBe('');
  });

  it('leaves clean text untouched', () => {
    expect(stripProviderControlTokens('Hello world')).toBe('Hello world');
  });
});

describe('isProviderControlOnly', () => {
  it('returns true when content is only a control token', () => {
    expect(isProviderControlOnly('[user interrupted]')).toBe(true);
  });

  it('returns true for control token with whitespace', () => {
    expect(isProviderControlOnly('  [user interrupted]  ')).toBe(true);
  });

  it('returns false when there is user content alongside the token', () => {
    expect(isProviderControlOnly('[user interrupted] and then more')).toBe(false);
  });

  it('returns false for clean text', () => {
    expect(isProviderControlOnly('just normal text')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isProviderControlOnly('')).toBe(false);
  });
});

describe('stripInternalTags', () => {
  it('strips <thought> tags and returns them as internal text', () => {
    const result = stripInternalTags('<thought>inner reasoning</thought>visible text');
    expect(result.publicText).toBe('visible text');
    expect(result.internalText).toContain('inner reasoning');
    expect(result.isThinking).toBe(false);
  });

  it('detects open (streaming) thought tag as isThinking', () => {
    const result = stripInternalTags('<thought>still thinking...');
    expect(result.isThinking).toBe(true);
    expect(result.publicText).toBe('');
  });

  it('strips <action> tags', () => {
    const result = stripInternalTags('Hello <action type="update_nsv">{"key":1}</action> world');
    expect(result.publicText).toBe('Hello world');
    expect(result.internalText).toContain('[ACTION: update_nsv]');
  });

  it('strips bracketed action tags', () => {
    const result = stripInternalTags('Hello [action type="delegate_to_module"]{ "moduleId": "agnes" } world');
    expect(result.publicText).toBe('Hello world');
    expect(result.internalText).toContain('[ACTION: delegate_to_module]');
  });

  it('strips <tool_call_begin>…<tool_call_end> tags', () => {
    const result = stripInternalTags('<tool_call_begin>search<tool_sep>query text<tool_call_end>Public');
    expect(result.publicText).toBe('Public');
    expect(result.internalText).toContain('[TOOL_CALL: search]');
  });

  it('strips <tool_call>…</tool_call> tags', () => {
    const result = stripInternalTags('<tool_call>raw call data</tool_call>Visible');
    expect(result.publicText).toBe('Visible');
    expect(result.internalText).toContain('[TOOL_CALL_RAW]');
  });

  it('returns null internalText when no internal tags', () => {
    const result = stripInternalTags('Plain text only');
    expect(result.publicText).toBe('Plain text only');
    expect(result.internalText).toBeNull();
  });

  it('handles mixed content correctly', () => {
    const input = '<thought>think</thought>Hello<action type="x">data</action>World';
    const result = stripInternalTags(input);
    expect(result.publicText).toBe('Hello World');
    expect(result.internalText).toContain('think');
    expect(result.internalText).toContain('[ACTION: x]');
  });
});

describe('sanitizeJsonPayload', () => {
  it('strips markdown code fences', () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(sanitizeJsonPayload(input)).toBe('{"key": "value"}');
  });

  it('strips code fences without json tag', () => {
    const input = '```\n{"a":1}\n```';
    expect(sanitizeJsonPayload(input)).toBe('{"a":1}');
  });

  it('removes AI prefixes like "JSON:"', () => {
    expect(sanitizeJsonPayload('JSON: {"a":1}')).toBe('{"a":1}');
    expect(sanitizeJsonPayload('Payload: {"a":1}')).toBe('{"a":1}');
  });

  it('fixes trailing commas in arrays', () => {
    expect(sanitizeJsonPayload('[1, 2, 3, ]')).toBe('[1, 2, 3]');
  });

  it('fixes trailing commas in objects', () => {
    expect(sanitizeJsonPayload('{"a": 1, "b": 2, }')).toBe('{"a": 1, "b": 2}');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeJsonPayload('')).toBe('');
  });
});
