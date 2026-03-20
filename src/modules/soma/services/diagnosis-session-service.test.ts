import { describe, expect, it } from 'vitest';

import {
  getDiagnosisAnalysisTimeoutMs,
  isStorageObjectNotFoundError,
} from './diagnosis-session-utils';

describe('getDiagnosisAnalysisTimeoutMs', () => {
  it('uses the longest timeout for image uploads', () => {
    const file = new File(['image'], 'xray.png', { type: 'image/png' });
    expect(getDiagnosisAnalysisTimeoutMs(file)).toBe(120_000);
  });

  it('uses an extended timeout for pdf uploads', () => {
    const file = new File(['pdf'], 'report.pdf', { type: 'application/pdf' });
    expect(getDiagnosisAnalysisTimeoutMs(file)).toBe(90_000);
  });

  it('uses the default timeout for other uploads', () => {
    const file = new File(['txt'], 'note.txt', { type: 'text/plain' });
    expect(getDiagnosisAnalysisTimeoutMs(file)).toBe(60_000);
  });
});

describe('isStorageObjectNotFoundError', () => {
  it('detects Firebase storage object-not-found errors', () => {
    expect(isStorageObjectNotFoundError({ code: 'storage/object-not-found' })).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isStorageObjectNotFoundError({ code: 'storage/unauthorized' })).toBe(false);
    expect(isStorageObjectNotFoundError(new Error('boom'))).toBe(false);
    expect(isStorageObjectNotFoundError(null)).toBe(false);
  });
});
