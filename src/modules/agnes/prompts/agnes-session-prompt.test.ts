import { describe, expect, it } from 'vitest';
import { buildAgnesSessionPrompt } from './agnes-session-prompt';

describe('buildAgnesSessionPrompt', () => {
  it('adds mode-specific framing for casual chat', () => {
    const prompt = buildAgnesSessionPrompt(
      'BASE PROMPT',
      {
        identity: { name: 'Rowan', pronouns: 'they/them' },
      } as any,
      undefined,
      { engagementMode: 'casual' },
    );

    expect(prompt).toContain('Active mode: Casual Chat');
    expect(prompt).toContain('SUPPORTIVE THERAPY DIRECTIVE (Casual)');
  });

  it('adds continuity instructions when switching modes mid-session', () => {
    const prompt = buildAgnesSessionPrompt(
      'BASE PROMPT',
      {
        identity: { name: 'Avery', pronouns: 'she/her' },
      } as any,
      undefined,
      {
        engagementMode: 'deep',
        continuity: {
          previousMode: 'casual',
          messageCount: 6,
          recentTurns: [
            'user: I have been avoiding my brother’s texts.',
            'assistant: Part of you wants distance and part of you still feels pulled back in.',
          ],
        },
      },
    );

    expect(prompt).toContain('SESSION CONTINUITY');
    expect(prompt).toContain('The previous mode was Casual Chat');
    expect(prompt).toContain('Continue seamlessly from the existing thread');
    expect(prompt).toContain('user: I have been avoiding my brother’s texts.');
  });

  it('adapts somatic mode when body inquiry is disabled', () => {
    const prompt = buildAgnesSessionPrompt(
      'BASE PROMPT',
      {
        identity: { name: 'Taylor', pronouns: 'he/him' },
        somaticEnabled: false,
      } as any,
      undefined,
      { engagementMode: 'somatic' },
    );

    expect(prompt).toContain('Active mode: Somatic Mode');
    expect(prompt).toContain('SOMATIC MODE ADAPTATION');
    expect(prompt).toContain('without asking body-sensation questions');
  });
});
