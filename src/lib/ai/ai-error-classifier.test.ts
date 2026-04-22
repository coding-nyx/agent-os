import { describe, it, expect } from 'vitest';
import { classifyAiError, ConsecutiveFailureTracker } from './ai-error-classifier';

describe('classifyAiError', () => {
  it('classifies AbortError as transient', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(classifyAiError(err).kind).toBe('transient');
  });

  it('classifies network errors as transient', () => {
    expect(classifyAiError(new Error('Failed to fetch')).kind).toBe('transient');
    expect(classifyAiError(new Error('ECONNRESET')).kind).toBe('transient');
    expect(classifyAiError(new Error('network request failed')).kind).toBe('transient');
    expect(classifyAiError(new Error('timed out')).kind).toBe('transient');
  });

  it('classifies mid-stream parse failures as transient', () => {
    expect(classifyAiError(new Error('Unexpected end of JSON input')).kind).toBe('transient');
    expect(classifyAiError(new Error('stream closed unexpectedly')).kind).toBe('transient');
  });

  it('classifies 5xx and 429/408 HTTP errors as transient', () => {
    expect(classifyAiError(new Error('upstream 503 service unavailable')).kind).toBe('transient');
    expect(classifyAiError(new Error('HTTP 500 internal server error')).kind).toBe('transient');
    expect(classifyAiError(new Error('got 429 rate-limited')).kind).toBe('transient');
    expect(classifyAiError(new Error('HTTP 408 request timeout')).kind).toBe('transient');
  });

  it('classifies 401/403 as user_actionable', () => {
    // 401 hits the OpenRouter auth matcher first (which is also user_actionable)
    expect(classifyAiError(new Error('HTTP 401 invalid api key')).kind).toBe('user_actionable');
    expect(classifyAiError(new Error('HTTP 403 forbidden')).kind).toBe('user_actionable');
  });

  it('classifies OpenRouter auth failures as user_actionable', () => {
    expect(classifyAiError(new Error('Missing authentication header')).kind).toBe('user_actionable');
    expect(classifyAiError(new Error('unauthorized')).kind).toBe('user_actionable');
  });

  it('classifies quota/payment errors as user_actionable', () => {
    expect(classifyAiError(new Error('insufficient credit on account')).kind).toBe('user_actionable');
    expect(classifyAiError(new Error('payment required')).kind).toBe('user_actionable');
    expect(classifyAiError(new Error('quota exceeded')).kind).toBe('user_actionable');
  });

  it('classifies content policy rejections as user_actionable', () => {
    expect(classifyAiError(new Error('Content policy violation')).kind).toBe('user_actionable');
    expect(classifyAiError(new Error('provider blocked the request')).kind).toBe('user_actionable');
  });

  it('classifies unknown errors as fatal', () => {
    expect(classifyAiError(new Error('something totally unexpected happened')).kind).toBe('fatal');
  });

  it('handles non-Error throwables', () => {
    expect(classifyAiError('Failed to fetch').kind).toBe('transient');
    expect(classifyAiError(null).kind).toBe('fatal');
    expect(classifyAiError(undefined).kind).toBe('fatal');
  });
});

describe('ConsecutiveFailureTracker', () => {
  it('escalates after threshold consecutive transient failures', () => {
    const t = new ConsecutiveFailureTracker(3);
    expect(t.recordTransient('ara')).toBe(false); // 1
    expect(t.recordTransient('ara')).toBe(false); // 2
    expect(t.recordTransient('ara')).toBe(true);  // 3 — escalate
  });

  it('resets count after escalation', () => {
    const t = new ConsecutiveFailureTracker(3);
    t.recordTransient('ara');
    t.recordTransient('ara');
    t.recordTransient('ara'); // escalates
    expect(t.count('ara')).toBe(0);
    expect(t.recordTransient('ara')).toBe(false); // back to 1
  });

  it('tracks scopes independently', () => {
    const t = new ConsecutiveFailureTracker(3);
    t.recordTransient('ara');
    t.recordTransient('ara');
    expect(t.recordTransient('titan')).toBe(false);
    expect(t.count('ara')).toBe(2);
    expect(t.count('titan')).toBe(1);
  });

  it('reset() clears a scope without affecting others', () => {
    const t = new ConsecutiveFailureTracker(3);
    t.recordTransient('ara');
    t.recordTransient('titan');
    t.reset('ara');
    expect(t.count('ara')).toBe(0);
    expect(t.count('titan')).toBe(1);
  });
});
