import { describe, expect, it } from 'vitest';
import { parseArgs, parseDocId } from '../../../../scripts/migrate-session-store-v2';

describe('migrate-session-store-v2 script helpers', () => {
  it('parses execute, user, and verbose flags', () => {
    const parsed = parseArgs(['--execute', '--user', 'u1', '--verbose']);
    expect(parsed).toEqual({
      execute: true,
      userId: 'u1',
      verbose: true,
    });
  });

  it('parses legacy doc ids with optional session id', () => {
    expect(parseDocId('uid_agnes')).toEqual({ uid: 'uid', moduleId: 'agnes', sessionId: undefined });
    expect(parseDocId('uid_agnes_s1')).toEqual({ uid: 'uid', moduleId: 'agnes', sessionId: 's1' });
    expect(parseDocId('uid_agnes_s_part')).toEqual({ uid: 'uid', moduleId: 'agnes', sessionId: 's_part' });
  });

  it('returns null for malformed doc ids', () => {
    expect(parseDocId('')).toBeNull();
    expect(parseDocId('uidonly')).toBeNull();
    expect(parseDocId('_agnes')).toBeNull();
  });
});
