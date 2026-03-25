import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExtractedDataItem } from '@/core/diagnosis/types';

// ─── Mock titan-profile-service ──────────────────────────────────────────────

const mockProfile = {
  labSummaries: [] as unknown[],
  knownConditions: [] as string[],
  medications: [] as string[],
  allergies: [] as string[],
  medicalImageAnalyses: [] as unknown[],
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockLoadTitanProfile = vi.fn().mockResolvedValue({ ...mockProfile });
const mockSaveTitanProfile = vi.fn().mockResolvedValue(undefined);

vi.mock('../services/titan-profile-service', () => ({
  loadTitanProfile: (...args: unknown[]) => mockLoadTitanProfile(...args),
  saveTitanProfile: (...args: unknown[]) => mockSaveTitanProfile(...args),
}));

// ─── Mock soma-titan-delegation-service ──────────────────────────────────────

const mockCommitBiomarker = vi.fn().mockResolvedValue({ id: 'bio-1' });
const mockIssueClearance = vi.fn().mockResolvedValue({ id: 'cl-1' });

vi.mock('@/lib/services/soma-titan-delegation-service', () => ({
  SomaTitanDelegationService: {
    commitBiomarker: (...args: unknown[]) => mockCommitBiomarker(...args),
    issueClearance: (...args: unknown[]) => mockIssueClearance(...args),
  },
}));

// ─── Import SUT after mocks ───────────────────────────────────────────────────

const { mergeTitanDiagnosisData } = await import('./titan-diagnosis-merge');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeItem(type: string, data: Record<string, unknown>): ExtractedDataItem {
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    type,
    label: type,
    data,
    source: 'test',
    extractedAt: '2026-01-15T10:00:00.000Z',
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('mergeTitanDiagnosisData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadTitanProfile.mockResolvedValue({ ...mockProfile });
    mockSaveTitanProfile.mockResolvedValue(undefined);
    mockCommitBiomarker.mockResolvedValue({ id: 'bio-1' });
    mockIssueClearance.mockResolvedValue({ id: 'cl-1' });
  });

  // ── Profile not found ───────────────────────────────────────────────────

  it('returns early without saving when no profile is found', async () => {
    mockLoadTitanProfile.mockResolvedValueOnce(null);
    await mergeTitanDiagnosisData('user-1', [makeItem('lab_summary', { panel: 'CBC' })]);
    expect(mockSaveTitanProfile).not.toHaveBeenCalled();
  });

  // ── lab_summary ─────────────────────────────────────────────────────────

  it('appends a lab_summary to the TitanProfile', async () => {
    const item = makeItem('lab_summary', {
      panel: 'CBC',
      findings: ['WBC 5.2', 'RBC 4.8'],
      flags: ['Hemoglobin borderline low'],
    });

    await mergeTitanDiagnosisData('user-1', [item], {} as CryptoKey);

    expect(mockSaveTitanProfile).toHaveBeenCalledTimes(1);
    const savedProfile = mockSaveTitanProfile.mock.calls[0][0];
    expect(savedProfile.labSummaries).toHaveLength(1);
    expect(savedProfile.labSummaries[0].panel).toBe('CBC');
    expect(savedProfile.labSummaries[0].findings).toEqual(['WBC 5.2', 'RBC 4.8']);
    expect(savedProfile.labSummaries[0].flags).toEqual(['Hemoglobin borderline low']);
  });

  // ── condition ───────────────────────────────────────────────────────────

  it('adds a condition to knownConditions without duplicates', async () => {
    mockLoadTitanProfile.mockResolvedValue({
      ...mockProfile,
      knownConditions: ['Hypertension'],
    });

    const items = [
      makeItem('condition', { condition: 'Type 2 Diabetes' }),
      makeItem('condition', { condition: 'Hypertension' }), // duplicate — should be ignored
    ];

    await mergeTitanDiagnosisData('user-1', items, {} as CryptoKey);

    const savedProfile = mockSaveTitanProfile.mock.calls[0][0];
    expect(savedProfile.knownConditions).toContain('Type 2 Diabetes');
    expect(savedProfile.knownConditions.filter((c: string) => c === 'Hypertension')).toHaveLength(1);
  });

  // ── medication ──────────────────────────────────────────────────────────

  it('adds medication without duplicating existing entries', async () => {
    mockLoadTitanProfile.mockResolvedValue({
      ...mockProfile,
      medications: ['Metformin'],
    });

    await mergeTitanDiagnosisData('user-1', [
      makeItem('medication', { medication: 'Lisinopril' }),
      makeItem('medication', { medication: 'Metformin' }), // duplicate
    ], {} as CryptoKey);

    const savedProfile = mockSaveTitanProfile.mock.calls[0][0];
    expect(savedProfile.medications).toContain('Lisinopril');
    expect(savedProfile.medications.filter((m: string) => m === 'Metformin')).toHaveLength(1);
  });

  // ── allergy ─────────────────────────────────────────────────────────────

  it('adds allergy without duplicating', async () => {
    await mergeTitanDiagnosisData('user-1', [
      makeItem('allergy', { allergy: 'Penicillin' }),
    ], {} as CryptoKey);

    const savedProfile = mockSaveTitanProfile.mock.calls[0][0];
    expect(savedProfile.allergies).toContain('Penicillin');
  });

  // ── biomarker delegation ─────────────────────────────────────────────────

  it('delegates biomarker to SomaTitanDelegationService', async () => {
    const item = makeItem('biomarker', {
      name: 'glucose',
      value: 95,
      unit: 'mg/dL',
      source: 'lab',
    });

    await mergeTitanDiagnosisData('user-1', [item], {} as CryptoKey);

    expect(mockCommitBiomarker).toHaveBeenCalledTimes(1);
    expect(mockCommitBiomarker.mock.calls[0][0].payload.name).toBe('glucose');
    expect(mockCommitBiomarker.mock.calls[0][0].payload.value).toBe(95);
  });

  // ── clearance delegation ─────────────────────────────────────────────────

  it('delegates clearance to SomaTitanDelegationService', async () => {
    const item = makeItem('clearance', {
      activity: 'high_intensity',
      status: 'granted',
      reason: 'All clear',
    });

    await mergeTitanDiagnosisData('user-1', [item], {} as CryptoKey);

    expect(mockIssueClearance).toHaveBeenCalledTimes(1);
    expect(mockIssueClearance.mock.calls[0][0].payload.activity).toBe('high_intensity');
    expect(mockIssueClearance.mock.calls[0][0].payload.status).toBe('granted');
  });

  // ── medical_image_analysis ─────────────────────────────────────────────

  it('normalizes and appends a medical_image_analysis', async () => {
    const item = makeItem('medical_image_analysis', {
      reportType: 'x_ray',
      biomarkers: [{ name: 'bone_density', value: 1.2 }],
      clinicalFlags: [{ flag: 'mild osteopenia', severity: 'mild' }],
    });

    await mergeTitanDiagnosisData('user-1', [item], {} as CryptoKey);

    const savedProfile = mockSaveTitanProfile.mock.calls[0][0];
    expect(savedProfile.medicalImageAnalyses).toHaveLength(1);
    expect(savedProfile.medicalImageAnalyses[0].reportType).toBe('x_ray');
    expect(savedProfile.medicalImageAnalyses[0].biomarkerCount).toBe(1);
    expect(savedProfile.medicalImageAnalyses[0].clinicalFlags).toHaveLength(1);
    expect(savedProfile.medicalImageAnalyses[0].clinicalFlags[0].flag).toBe('mild osteopenia');
  });

  // ── Recoverable delegation failures (P3-9) ──────────────────────────────

  it('saves non-delegated items even when biomarker delegation fails', async () => {
    mockCommitBiomarker.mockRejectedValueOnce(new Error('Soma unreachable'));

    const items = [
      makeItem('biomarker', { name: 'hrv', value: 62, unit: 'ms' }),
      makeItem('lab_summary', { panel: 'Lipids', findings: ['LDL 120'] }),
      makeItem('condition', { condition: 'Hyperlipidemia' }),
    ];

    // Should NOT throw — delegation failures are now recoverable
    await expect(
      mergeTitanDiagnosisData('user-1', items, {} as CryptoKey)
    ).resolves.toBeUndefined();

    // Profile WAS saved (non-delegated items persisted)
    expect(mockSaveTitanProfile).toHaveBeenCalledTimes(1);
    const savedProfile = mockSaveTitanProfile.mock.calls[0][0];
    expect(savedProfile.labSummaries).toHaveLength(1);
    expect(savedProfile.knownConditions).toContain('Hyperlipidemia');
  });

  it('saves non-delegated items even when clearance delegation fails', async () => {
    mockIssueClearance.mockRejectedValueOnce(new Error('Soma write timeout'));

    const items = [
      makeItem('clearance', { activity: 'high_intensity', status: 'granted' }),
      makeItem('allergy', { allergy: 'Sulfa' }),
    ];

    await expect(
      mergeTitanDiagnosisData('user-1', items, {} as CryptoKey)
    ).resolves.toBeUndefined();

    expect(mockSaveTitanProfile).toHaveBeenCalledTimes(1);
    const savedProfile = mockSaveTitanProfile.mock.calls[0][0];
    expect(savedProfile.allergies).toContain('Sulfa');
  });

  it('successfully saves when all delegations succeed', async () => {
    const items = [
      makeItem('biomarker', { name: 'glucose', value: 95 }),
      makeItem('clearance', { activity: 'low_intensity', status: 'granted' }),
      makeItem('lab_summary', { panel: 'CBC', findings: [] }),
    ];

    await mergeTitanDiagnosisData('user-1', items, {} as CryptoKey);

    expect(mockCommitBiomarker).toHaveBeenCalledTimes(1);
    expect(mockIssueClearance).toHaveBeenCalledTimes(1);
    expect(mockSaveTitanProfile).toHaveBeenCalledTimes(1);
  });

  // ── updatedAt is stamped ────────────────────────────────────────────────

  it('sets updatedAt on save', async () => {
    await mergeTitanDiagnosisData('user-1', [
      makeItem('condition', { condition: 'Asthma' }),
    ], {} as CryptoKey);

    const savedProfile = mockSaveTitanProfile.mock.calls[0][0];
    expect(savedProfile.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
    expect(new Date(savedProfile.updatedAt).getTime()).toBeGreaterThan(0);
  });
});
