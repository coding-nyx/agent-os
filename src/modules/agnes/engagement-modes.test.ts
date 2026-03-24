import { describe, expect, it, vi } from 'vitest';
import {
  buildAgnesPromptContinuity,
  DEFAULT_AGNES_ENGAGEMENT_MODE,
  loadGuestAgnesPreferredMode,
  resolvePersistentAgnesMode,
  saveGuestAgnesPreferredMode,
} from './engagement-modes';

describe('agnes engagement modes', () => {
  it('normalizes impromptu out of persistent defaults', () => {
    expect(resolvePersistentAgnesMode('impromptu')).toBe(DEFAULT_AGNES_ENGAGEMENT_MODE);
    expect(resolvePersistentAgnesMode('casual')).toBe('casual');
    expect(resolvePersistentAgnesMode('unknown')).toBe(DEFAULT_AGNES_ENGAGEMENT_MODE);
  });

  it('persists and restores guest preferred mode', () => {
    const getItem = vi.fn(() => 'somatic');
    const setItem = vi.fn();

    saveGuestAgnesPreferredMode('somatic', { setItem });

    expect(setItem).toHaveBeenCalledWith('nexus_agnes_preferred_mode_guest', 'somatic');
    expect(loadGuestAgnesPreferredMode({ getItem })).toBe('somatic');
  });

  it('builds a continuity snapshot from recent session turns', () => {
    const continuity = buildAgnesPromptContinuity([
      { role: 'assistant', content: 'We can stay with what feels most alive right now.' },
      { role: 'user', content: 'I keep feeling tense before every meeting.' },
      { role: 'assistant', content: 'Let’s notice that tension carefully.' },
    ], 'casual');

    expect(continuity).toEqual({
      previousMode: 'casual',
      messageCount: 3,
      recentTurns: [
        'assistant: We can stay with what feels most alive right now.',
        'user: I keep feeling tense before every meeting.',
        'assistant: Let’s notice that tension carefully.',
      ],
    });
  });
});
